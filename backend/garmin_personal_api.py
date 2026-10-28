"""Garmin Connect Personal API provider — official passwordless sync using Personal API key."""

from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Callable

from .database import (
    get_db,
    save_garmin_api_key,
    upsert_activity,
    upsert_metric,
    upsert_sleep_session,
)

logger = logging.getLogger(__name__)

BASE_URL = "https://personal.connectapi.garmin.com"
TOKEN_ENDPOINT = f"{BASE_URL}/personalapitoken-service/personal-api/personal-api-key/token"

ACTIVITY_TYPE_MAP = {
    "running": "running",
    "trail_running": "running",
    "treadmill_running": "running",
    "cycling": "cycling",
    "road_biking": "cycling",
    "mountain_biking": "cycling",
    "indoor_cycling": "cycling",
    "virtual_ride": "cycling",
    "swimming": "swimming",
    "lap_swimming": "swimming",
    "open_water_swimming": "swimming",
    "walking": "walking",
    "casual_walking": "walking",
    "hiking": "hiking",
    "strength_training": "strength",
    "indoor_cardio": "cardio",
    "yoga": "yoga",
    "pilates": "yoga",
    "elliptical": "cardio",
    "stair_climbing": "cardio",
}


def _normalize_activity_type(raw: str) -> str:
    key = raw.lower().replace(" ", "_")
    return ACTIVITY_TYPE_MAP.get(key, "other")


class GarminPersonalApiProvider:
    def __init__(self, api_key: str):
        self.api_key = api_key.strip()
        self._access_token: str | None = None
        self._token_expires_at: float = 0.0

    def get_token(self) -> str:
        """Exchange the Personal API key for a short-lived Bearer JWT token."""
        if self._access_token and time.time() < self._token_expires_at - 120:
            return self._access_token

        req = urllib.request.Request(
            TOKEN_ENDPOINT,
            data=b"",
            headers={
                "Authorization": f"ApiKey {self.api_key}",
                "User-Agent": "HealthActivityDashboard/1.0",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                token = resp.read().decode("utf-8").strip()
                self._access_token = token
                # Tokens usually last 24h (86400s); renew after 20h
                self._token_expires_at = time.time() + (20 * 3600)
                return token
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")
            logger.error(f"Failed to authenticate Garmin Personal API key: {e.code} {err_body}")
            raise ValueError(f"Garmin Personal API authentication failed ({e.code}): Check that your API key is correct and active.") from e
        except Exception as e:
            logger.error(f"Connection error to Garmin Personal API: {e}")
            raise ConnectionError(f"Could not connect to Garmin Personal API: {e}") from e

    def _request_json(self, url: str, retries: int = 2) -> dict | list | None:
        token = self.get_token()
        for attempt in range(retries + 1):
            req = urllib.request.Request(
                url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/json",
                    "User-Agent": "HealthActivityDashboard/1.0",
                },
            )
            try:
                with urllib.request.urlopen(req, timeout=20) as resp:
                    raw = resp.read().decode("utf-8")
                    if not raw.strip():
                        return None
                    return json.loads(raw)
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    return None
                if e.code == 401 and attempt < retries:
                    # Token might have expired, invalidate and retry
                    self._access_token = None
                    token = self.get_token()
                    continue
                if e.code == 429 and attempt < retries:
                    time.sleep(2 ** (attempt + 1))
                    continue
                err_body = e.read().decode("utf-8", errors="replace")
                logger.warning(f"Garmin API error for {url}: {e.code} {err_body}")
                return None
            except Exception as e:
                if attempt < retries:
                    time.sleep(1)
                    continue
                logger.warning(f"Garmin API request failed for {url}: {e}")
                return None
        return None

    def sync_activities(self, limit: int = 200) -> int:
        """Fetch all activities and upsert into database."""
        conn = get_db()
        count = 0
        batch_size = 50
        offset = 0
        now_iso = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()

        while offset < limit:
            url = f"{BASE_URL}/activitylist-service/activities/search/activities?start={offset}&limit={batch_size}"
            items = self._request_json(url)
            if not items or not isinstance(items, list):
                break

            for raw in items:
                aid = str(raw.get("activityId", ""))
                if not aid:
                    continue
                raw_type = raw.get("activityType", {}).get("typeKey", "other")
                start_local = raw.get("startTimeLocal", "")
                dur = raw.get("duration", 0)

                upsert_activity(
                    conn,
                    id=f"garmin:{aid}",
                    source="garmin",
                    activity_name=raw.get("activityName", raw_type),
                    activity_type=_normalize_activity_type(raw_type),
                    sport_type=raw_type,
                    start_time=start_local,
                    duration_seconds=float(dur) if dur else 0,
                    distance_meters=raw.get("distance"),
                    calories=raw.get("calories"),
                    avg_hr=raw.get("averageHR"),
                    max_hr=raw.get("maxHR"),
                    avg_speed=raw.get("averageSpeed"),
                    max_speed=raw.get("maxSpeed"),
                    elevation_gain=raw.get("elevationGain"),
                    elevation_loss=raw.get("elevationLoss"),
                    avg_cadence=raw.get("averageRunningCadenceInStepsPerMinute"),
                    avg_power=raw.get("avgPower"),
                    created_at=now_iso,
                )
                count += 1

            if len(items) < batch_size:
                break
            offset += len(items)

        conn.commit()
        conn.close()
        return count

    def sync_daily_summaries(self, start_date: date, end_date: date) -> dict[str, int]:
        """Fetch daily health summaries (steps, resting HR, active calories, exercise min) in chunks."""
        conn = get_db()
        counts: dict[str, int] = {}
        cur_start = start_date

        while cur_start <= end_date:
            cur_end = min(cur_start + timedelta(days=25), end_date)
            url = f"{BASE_URL}/usersummary-service/v2/dailysummaries?startDate={cur_start.isoformat()}&endDate={cur_end.isoformat()}"
            res = self._request_json(url)

            if res and isinstance(res, dict) and "data" in res:
                for day_data in res["data"]:
                    cal_date_str = day_data.get("calendarDate")
                    if not cal_date_str:
                        continue
                    try:
                        d = date.fromisoformat(cal_date_str)
                    except ValueError:
                        continue

                    # Steps
                    steps = day_data.get("movement", {}).get("steps", {}).get("value")
                    if steps is not None:
                        upsert_metric(conn, "garmin", "steps", d, float(steps), "count")
                        counts["steps"] = counts.get("steps", 0) + 1

                    # Resting Heart Rate
                    rhr = day_data.get("heartRate", {}).get("restingValue")
                    if rhr is not None and rhr > 0:
                        upsert_metric(conn, "garmin", "resting_hr", d, float(rhr), "bpm")
                        counts["resting_hr"] = counts.get("resting_hr", 0) + 1

                    # Active Calories
                    active_cal = day_data.get("calories", {}).get("burnedActive")
                    if active_cal is not None:
                        upsert_metric(conn, "garmin", "active_energy", d, float(active_cal), "kcal")
                        counts["active_energy"] = counts.get("active_energy", 0) + 1

                    # Exercise / Intensity Minutes
                    intensity = day_data.get("intensityMinutes", {})
                    mod = intensity.get("moderate", 0) or 0
                    vig = intensity.get("vigorous", 0) or 0
                    total_exercise = mod + (vig * 2)
                    if total_exercise > 0:
                        upsert_metric(conn, "garmin", "exercise_minutes", d, float(total_exercise), "min")
                        counts["exercise_minutes"] = counts.get("exercise_minutes", 0) + 1

            cur_start = cur_end + timedelta(days=1)

        conn.commit()
        conn.close()
        return counts

    def sync_sleep(self, start_date: date, end_date: date) -> int:
        """Fetch sleep summaries and upsert sleep sessions."""
        conn = get_db()
        count = 0
        now_iso = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
        cur_start = start_date

        while cur_start <= end_date:
            cur_end = min(cur_start + timedelta(days=25), end_date)
            url = f"{BASE_URL}/sleep-service/sleep/dailySleepSummariesByDate?startDate={cur_start.isoformat()}&endDate={cur_end.isoformat()}"
            res = self._request_json(url)

            if res and isinstance(res, list):
                for s in res:
                    cal_date_str = s.get("calendarDate")
                    sleep_sec = s.get("sleepTimeSeconds")
                    if not cal_date_str or sleep_sec is None:
                        continue

                    # Start and end timestamps
                    start_ts = s.get("sleepStartTimestampLocal") or s.get("sleepStartTimestampGMT")
                    end_ts = s.get("sleepEndTimestampLocal") or s.get("sleepEndTimestampGMT")
                    start_dt_str = datetime.fromtimestamp(start_ts / 1000).isoformat() if start_ts else None
                    end_dt_str = datetime.fromtimestamp(end_ts / 1000).isoformat() if end_ts else None

                    # Score if present
                    overall_score = None
                    scores = s.get("sleepScores")
                    if isinstance(scores, dict):
                        overall_score = scores.get("overall", {}).get("value")

                    upsert_sleep_session(
                        conn,
                        id=f"garmin:sleep:{cal_date_str}",
                        source="garmin",
                        calendar_date=cal_date_str,
                        sleep_start=start_dt_str,
                        sleep_end=end_dt_str,
                        total_sleep_sec=float(sleep_sec),
                        deep_sleep_sec=float(s.get("deepSleepSeconds") or 0),
                        light_sleep_sec=float(s.get("lightSleepSeconds") or 0),
                        rem_sleep_sec=float(s.get("remSleepSeconds") or 0),
                        awake_sec=float(s.get("awakeSleepSeconds") or 0),
                        overall_score=float(overall_score) if overall_score is not None else None,
                        avg_hr=float(s.get("avgHeartRate")) if s.get("avgHeartRate") else None,
                        avg_hrv=None,
                        created_at=now_iso,
                    )
                    count += 1

            cur_start = cur_end + timedelta(days=1)

        conn.commit()
        conn.close()
        return count

    def sync_hrv(self, start_date: date, end_date: date) -> int:
        """Fetch daily HRV summaries and upsert into metrics."""
        conn = get_db()
        count = 0
        cur_start = start_date

        while cur_start <= end_date:
            cur_end = min(cur_start + timedelta(days=25), end_date)
            url = f"{BASE_URL}/hrv-service/hrv/daily/{cur_start.isoformat()}/{cur_end.isoformat()}"
            res = self._request_json(url)

            if res and isinstance(res, dict) and "hrvSummaries" in res:
                for h in res["hrvSummaries"]:
                    cal_date_str = h.get("calendarDate")
                    if not cal_date_str:
                        continue
                    val = h.get("lastNightAvg") or h.get("weeklyAvg")
                    if val and val > 0:
                        try:
                            d = date.fromisoformat(cal_date_str)
                            upsert_metric(conn, "garmin", "hrv", d, float(val), "ms")
                            count += 1
                        except ValueError:
                            pass

            cur_start = cur_end + timedelta(days=1)

        conn.commit()
        conn.close()
        return count

    def full_sync(
        self,
        days_back: int = 0,
        progress_cb: Callable[[str], None] | None = None,
    ) -> dict:
        """Perform a complete sync of activities, daily metrics, sleep, and HRV."""
        conn = get_db()
        save_garmin_api_key(conn, self.api_key)
        conn.close()

        # Save to local file as well for persistence
        key_file = Path(__file__).resolve().parent.parent / "data" / ".garmin_api_key"
        try:
            key_file.parent.mkdir(parents=True, exist_ok=True)
            key_file.write_text(self.api_key.strip())
        except Exception:
            pass

        end = date.today()
        # If days_back == 0, sync from account inception (or default to 1 year back)
        if days_back <= 0:
            start = end - timedelta(days=365)
        else:
            start = end - timedelta(days=days_back)

        summary = {}

        if progress_cb:
            progress_cb("Syncing Garmin activities...")
        act_count = self.sync_activities(limit=500)
        summary["activities"] = act_count

        if progress_cb:
            progress_cb("Syncing daily health metrics (steps, RHR, calories)...")
        metric_counts = self.sync_daily_summaries(start, end)
        summary["metrics"] = metric_counts

        if progress_cb:
            progress_cb("Syncing sleep sessions & architecture...")
        sleep_count = self.sync_sleep(start, end)
        summary["sleep_sessions"] = sleep_count

        if progress_cb:
            progress_cb("Syncing heart rate variability (HRV)...")
        hrv_count = self.sync_hrv(start, end)
        summary["hrv_records"] = hrv_count

        return summary

