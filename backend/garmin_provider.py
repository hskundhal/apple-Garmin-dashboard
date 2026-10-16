"""Garmin Connect live sync provider — adapted from Athlytics."""

from __future__ import annotations

import logging
import time as time_module
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

from garminconnect import (
    Garmin,
    GarminConnectAuthenticationError,
    GarminConnectTooManyRequestsError,
)

from .database import (
    get_db, upsert_metric, upsert_activity, upsert_sleep_session,
    insert_sleep_stage,
)

logger = logging.getLogger(__name__)

TOKEN_DIR = Path(__file__).resolve().parent.parent / ".garmin_tokens"

ACTIVITY_TYPE_MAP = {
    "running": "running", "trail_running": "running", "treadmill_running": "running",
    "cycling": "cycling", "road_biking": "cycling", "mountain_biking": "cycling",
    "indoor_cycling": "cycling", "virtual_ride": "cycling",
    "swimming": "swimming", "lap_swimming": "swimming", "open_water_swimming": "swimming",
    "walking": "walking", "casual_walking": "walking",
    "hiking": "hiking",
    "strength_training": "strength", "indoor_cardio": "cardio",
    "yoga": "yoga", "pilates": "yoga",
    "elliptical": "cardio", "stair_climbing": "cardio",
}

STAGE_CODE = {0.0: "deep", 1.0: "light", 2.0: "rem", 3.0: "awake"}


def _normalize_activity_type(raw: str) -> str:
    key = raw.lower().replace(" ", "_")
    return ACTIVITY_TYPE_MAP.get(key, "other")


class GarminProvider:
    def __init__(self, email: str, password: str):
        self.email = email
        self.password = password
        self._client: Garmin | None = None

    def _login(self) -> Garmin:
        if self._client:
            return self._client
        TOKEN_DIR.mkdir(parents=True, exist_ok=True)
        client = Garmin(self.email, self.password)
        try:
            client.login(tokenstore=str(TOKEN_DIR))
        except Exception:
            client.login()
            client.garth.dump(str(TOKEN_DIR))
        self._client = client
        return client

    def _call(self, method, *args, retries=2, **kwargs):
        for attempt in range(retries + 1):
            try:
                client = self._login()
                return getattr(client, method)(*args, **kwargs)
            except GarminConnectTooManyRequestsError:
                if attempt < retries:
                    time_module.sleep(2 ** attempt)
                else:
                    raise
            except GarminConnectAuthenticationError:
                self._client = None
                if attempt < retries:
                    continue
                raise

    def sync_metrics(self, days_back: int = 30) -> dict:
        """Sync daily metrics from Garmin: resting_hr, hrv, vo2max, steps, etc."""
        conn = get_db()
        end = date.today()
        start = end - timedelta(days=days_back)
        counts = {}

        # Resting HR
        try:
            for day_offset in range(days_back + 1):
                day = start + timedelta(days=day_offset)
                raw = self._call("get_rhr_day", day.isoformat())
                if raw and isinstance(raw, dict):
                    rhr_values = raw.get("allMetrics", {}).get("metricsMap", {}).get("WELLNESS_RESTING_HEART_RATE", [])
                    for entry in rhr_values:
                        if entry.get("value"):
                            upsert_metric(conn, "garmin", "resting_hr",
                                         day, float(entry["value"]), "bpm")
                            counts["resting_hr"] = counts.get("resting_hr", 0) + 1
        except Exception as e:
            logger.warning(f"Garmin resting_hr sync error: {e}")

        # HRV
        try:
            for day_offset in range(days_back + 1):
                day = start + timedelta(days=day_offset)
                raw = self._call("get_hrv_data", day.isoformat())
                if raw and isinstance(raw, dict):
                    summary = raw.get("hrvSummary", {})
                    val = summary.get("weeklyAvg") or summary.get("lastNightAvg")
                    if val and val > 0:
                        upsert_metric(conn, "garmin", "hrv", day, float(val), "ms")
                        counts["hrv"] = counts.get("hrv", 0) + 1
        except Exception as e:
            logger.warning(f"Garmin HRV sync error: {e}")

        # Steps
        try:
            raw = self._call("get_daily_steps", start.isoformat(), end.isoformat())
            if raw:
                for entry in raw:
                    cal_date = entry.get("calendarDate")
                    steps = entry.get("totalSteps")
                    if cal_date and steps:
                        day = date.fromisoformat(cal_date)
                        upsert_metric(conn, "garmin", "steps", day, float(steps), "count")
                        counts["steps"] = counts.get("steps", 0) + 1
        except Exception as e:
            logger.warning(f"Garmin steps sync error: {e}")

        # VO2 Max
        try:
            raw = self._call("get_max_metrics", end.isoformat())
            if raw and isinstance(raw, dict):
                generic = raw.get("generic", {})
                vo2 = generic.get("vo2MaxPreciseValue") or generic.get("vo2MaxValue")
                if vo2 and vo2 > 0:
                    upsert_metric(conn, "garmin", "vo2max", end, float(vo2), "ml/kg/min")
                    counts["vo2max"] = 1
        except Exception as e:
            logger.warning(f"Garmin VO2 sync error: {e}")

        conn.commit()
        conn.close()
        return counts

    def sync_activities(self, limit: int = 100) -> int:
        """Sync recent activities from Garmin Connect."""
        conn = get_db()
        raw_activities = self._call("get_activities", 0, limit) or []
        count = 0
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        for raw in raw_activities:
            aid = str(raw.get("activityId", ""))
            if not aid:
                continue
            raw_type = raw.get("activityType", {}).get("typeKey", "other")
            start_local = raw.get("startTimeLocal", "")
            dur = raw.get("duration", 0)

            upsert_activity(conn,
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
                created_at=now.isoformat(),
            )
            count += 1

        conn.commit()
        conn.close()
        return count

    def sync_sleep(self, days_back: int = 30) -> int:
        """Sync sleep data from Garmin Connect."""
        conn = get_db()
        end = date.today()
        start = end - timedelta(days=days_back)
        count = 0
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        for day_offset in range(days_back + 1):
            day = start + timedelta(days=day_offset)
            try:
                raw = self._call("get_sleep_data", day.isoformat())
                if not raw:
                    continue
                daily = raw.get("dailySleepDTO", {})
                if not daily:
                    continue

                session_id = f"garmin:{day.isoformat()}"
                start_ms = daily.get("sleepStartTimestampGMT")
                end_ms = daily.get("sleepEndTimestampGMT")

                upsert_sleep_session(conn,
                    id=session_id,
                    source="garmin",
                    calendar_date=day.isoformat(),
                    sleep_start=datetime.fromtimestamp(start_ms / 1000, tz=timezone.utc).isoformat() if start_ms else None,
                    sleep_end=datetime.fromtimestamp(end_ms / 1000, tz=timezone.utc).isoformat() if end_ms else None,
                    total_sleep_sec=daily.get("sleepTimeSeconds"),
                    deep_sleep_sec=daily.get("deepSleepSeconds"),
                    light_sleep_sec=daily.get("lightSleepSeconds"),
                    rem_sleep_sec=daily.get("remSleepSeconds"),
                    awake_sec=daily.get("awakeSleepSeconds"),
                    overall_score=daily.get("sleepScores", {}).get("overall", {}).get("value") if daily.get("sleepScores") else None,
                    avg_hr=daily.get("averageHeartRate"),
                    avg_hrv=daily.get("averageOvernightHrv") or raw.get("restingHeartRate"),
                    created_at=now.isoformat(),
                )

                # Sleep stages
                conn.execute("DELETE FROM sleep_stage WHERE session_id=?", (session_id,))
                for level in (raw.get("sleepLevels") or []):
                    stage_val = level.get("activityLevel")
                    stage_name = STAGE_CODE.get(float(stage_val), "awake") if stage_val is not None else "awake"
                    s_start = level.get("startGMT", "")
                    s_end = level.get("endGMT", "")
                    dur = (datetime.fromisoformat(s_end) - datetime.fromisoformat(s_start)).total_seconds() if s_start and s_end else 0
                    insert_sleep_stage(conn, session_id, stage_name, s_start, s_end, dur)

                count += 1
            except Exception as e:
                logger.warning(f"Garmin sleep sync error for {day}: {e}")

        conn.commit()
        conn.close()
        return count

    def full_sync(self, days_back: int = 30) -> dict:
        """Run a complete sync of metrics, activities, and sleep."""
        results = {}
        results["metrics"] = self.sync_metrics(days_back)
        results["activities"] = self.sync_activities()
        results["sleep_nights"] = self.sync_sleep(days_back)
        return results
