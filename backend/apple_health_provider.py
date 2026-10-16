"""Apple Health XML import provider — adapted from apple-health-dashboard + Athlytics."""

from __future__ import annotations

import logging
import zipfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator

from lxml import etree

from .database import (
    get_db, upsert_metric, upsert_activity, upsert_sleep_session,
    insert_sleep_stage,
)

logger = logging.getLogger(__name__)

APPLE_HEALTH_TS_FMT = "%Y-%m-%d %H:%M:%S %z"

# HealthKit record type → (metric_type, unit, aggregation)
HK_QUANTITY_MAP = {
    "HKQuantityTypeIdentifierRestingHeartRate": ("resting_hr", "bpm", "mean"),
    "HKQuantityTypeIdentifierHeartRate": ("heart_rate", "bpm", "mean"),
    "HKQuantityTypeIdentifierHeartRateVariabilitySDNN": ("hrv", "ms", "mean"),
    "HKQuantityTypeIdentifierWalkingHeartRateAverage": ("walking_hr", "bpm", "mean"),
    "HKQuantityTypeIdentifierHeartRateRecoveryOneMinute": ("hr_recovery", "bpm", "mean"),
    "HKQuantityTypeIdentifierVO2Max": ("vo2max", "ml/kg/min", "mean"),
    "HKQuantityTypeIdentifierBodyMass": ("weight", "kg", "mean"),
    "HKQuantityTypeIdentifierOxygenSaturation": ("spo2", "percent", "mean"),
    "HKQuantityTypeIdentifierRespiratoryRate": ("respiration", "breaths/min", "mean"),
    "HKQuantityTypeIdentifierStepCount": ("steps", "count", "sum"),
    "HKQuantityTypeIdentifierActiveEnergyBurned": ("active_energy", "kcal", "sum"),
    "HKQuantityTypeIdentifierAppleExerciseTime": ("exercise_minutes", "min", "sum"),
    "HKQuantityTypeIdentifierAppleStandTime": ("stand_hours", "hr", "sum"),
    "HKQuantityTypeIdentifierAppleWalkingSteadiness": ("walking_steadiness", "percent", "mean"),
    "HKQuantityTypeIdentifierAppleSleepingWristTemperature": ("wrist_temp", "degC", "mean"),
}

# Workout type mapping
HK_WORKOUT_MAP = {
    "HKWorkoutActivityTypeRunning": "running",
    "HKWorkoutActivityTypeCycling": "cycling",
    "HKWorkoutActivityTypeSwimming": "swimming",
    "HKWorkoutActivityTypeWalking": "walking",
    "HKWorkoutActivityTypeHiking": "hiking",
    "HKWorkoutActivityTypeFunctionalStrengthTraining": "strength",
    "HKWorkoutActivityTypeTraditionalStrengthTraining": "strength",
    "HKWorkoutActivityTypeHighIntensityIntervalTraining": "hiit",
    "HKWorkoutActivityTypeYoga": "yoga",
    "HKWorkoutActivityTypePilates": "yoga",
    "HKWorkoutActivityTypeElliptical": "cardio",
    "HKWorkoutActivityTypeCoreTraining": "strength",
    "HKWorkoutActivityTypeCrossTraining": "cardio",
    "HKWorkoutActivityTypeMixedCardio": "cardio",
    "HKWorkoutActivityTypeDance": "cardio",
    "HKWorkoutActivityTypeStairClimbing": "cardio",
    "HKWorkoutActivityTypeRowing": "rowing",
}

SLEEP_ASLEEP_VALUES = {
    "HKCategoryValueSleepAnalysisAsleepCore",
    "HKCategoryValueSleepAnalysisAsleepDeep",
    "HKCategoryValueSleepAnalysisAsleepREM",
    "HKCategoryValueSleepAnalysisAsleepUnspecified",
    "HKCategoryValueSleepAnalysisAsleep",
}

SLEEP_STAGE_MAP = {
    "HKCategoryValueSleepAnalysisAsleepCore": "light",
    "HKCategoryValueSleepAnalysisAsleepDeep": "deep",
    "HKCategoryValueSleepAnalysisAsleepREM": "rem",
    "HKCategoryValueSleepAnalysisAsleepUnspecified": "light",
    "HKCategoryValueSleepAnalysisAsleep": "light",
    "HKCategoryValueSleepAnalysisAwake": "awake",
    "HKCategoryValueSleepAnalysisInBed": "awake",
}


def _parse_ts(value: str) -> datetime:
    """Parse Apple Health timestamp to naive local wall-clock datetime."""
    # Format: "2024-11-03 01:30:00 -0700"
    try:
        aware = datetime.strptime(value, APPLE_HEALTH_TS_FMT)
        return aware.astimezone(timezone.utc).replace(tzinfo=None)
    except Exception:
        # Fallback if string is standard ISO
        return datetime.fromisoformat(value[:19])


def _local_date(value: str) -> date:
    """Calendar date in the source's own timezone."""
    try:
        return datetime.strptime(value, APPLE_HEALTH_TS_FMT).date()
    except Exception:
        return datetime.fromisoformat(value[:10]).date()


def _sleep_night_date(start_value: str) -> date:
    """Compute the sleep session's night by subtracting 12 hours from start time."""
    try:
        dt = datetime.strptime(start_value, APPLE_HEALTH_TS_FMT)
        return (dt - timedelta(hours=12)).date()
    except Exception:
        dt = datetime.fromisoformat(start_value[:19])
        return (dt - timedelta(hours=12)).date()


def extract_export_xml(zip_path: str | Path, dest_dir: str | Path) -> Path:
    """Extract export.xml from Apple Health zip or return path if already xml."""
    zip_path = Path(zip_path)
    if zip_path.suffix.lower() == '.xml':
        return zip_path
    dest_dir = Path(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)

    export_xml = dest_dir / "export.xml"
    if export_xml.exists():
        logger.info("export.xml already exists, skipping extraction")
        return export_xml

    with zipfile.ZipFile(zip_path) as zf:
        for name in zf.namelist():
            if name.endswith("export.xml"):
                data = zf.read(name)
                export_xml.write_bytes(data)
                logger.info(f"Extracted export.xml ({len(data) / 1024 / 1024:.1f} MB)")
                return export_xml

    raise FileNotFoundError("No export.xml found in zip file")


def import_apple_health(xml_path: str | Path, progress_cb=None) -> dict:
    """Stream-parse export.xml and import metrics, workouts, sleep into DB."""
    xml_path = Path(xml_path)
    conn = get_db()
    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()

    daily_values: dict[str, dict[date, list[float]]] = {}
    daily_units: dict[str, str] = {}
    daily_aggs: dict[str, str] = {}

    sleep_records: list[tuple] = []
    workout_count = 0
    record_count = 0

    context = etree.iterparse(str(xml_path), events=("end",), tag=("Record", "Workout", "CategorySample"))

    for event, elem in context:
        tag = elem.tag

        if tag in ("Record", "CategorySample"):
            rec_type = elem.get("type", "")

            # Check if this is a sleep record
            if rec_type == "HKCategoryTypeIdentifierSleepAnalysis":
                val = elem.get("value", "")
                st = elem.get("startDate", "")
                en = elem.get("endDate", "")
                if st and en:
                    sleep_records.append((val, st, en))
                    record_count += 1

            elif rec_type in HK_QUANTITY_MAP:
                metric_type, unit, agg = HK_QUANTITY_MAP[rec_type]
                try:
                    val_str = elem.get("value", "")
                    if val_str:
                        value = float(val_str)
                        start_str = elem.get("startDate", "")
                        if start_str:
                            day = _local_date(start_str)
                            daily_values.setdefault(metric_type, {}).setdefault(day, []).append(value)
                            daily_units[metric_type] = unit
                            daily_aggs[metric_type] = agg
                            record_count += 1
                except (ValueError, TypeError):
                    pass

        elif tag == "Workout":
            try:
                wtype = elem.get("workoutActivityType", "")
                activity_type = HK_WORKOUT_MAP.get(wtype, "other")
                start_str = elem.get("startDate", "")
                dur = float(elem.get("duration", 0)) * 60  # minutes → seconds

                distance = None
                energy = None
                for stat in elem.findall(".//WorkoutStatistics"):
                    stat_type = stat.get("type", "")
                    if "Distance" in stat_type:
                        distance = float(stat.get("sum", 0)) * 1000  # km → m
                    elif "EnergyBurned" in stat_type:
                        energy = float(stat.get("sum", 0))

                upsert_activity(conn,
                    id=f"apple:{start_str}",
                    source="apple_health",
                    activity_name=activity_type.replace("_", " ").title(),
                    activity_type=activity_type,
                    sport_type=wtype,
                    start_time=_parse_ts(start_str).isoformat() if start_str else "",
                    duration_seconds=dur,
                    distance_meters=distance,
                    calories=energy,
                    avg_hr=None, max_hr=None,
                    avg_speed=None, max_speed=None,
                    elevation_gain=None, elevation_loss=None,
                    avg_cadence=None, avg_power=None,
                    created_at=now,
                    is_demo=0,
                )
                workout_count += 1
            except Exception as e:
                logger.warning(f"Apple workout parse error: {e}")

        elem.clear()
        while elem.getprevious() is not None:
            del elem.getparent()[0]

        if progress_cb and record_count % 50000 == 0:
            progress_cb(record_count)

    # Store aggregated daily metrics
    for metric_type, by_day in daily_values.items():
        unit = daily_units[metric_type]
        agg = daily_aggs[metric_type]
        for day, values in by_day.items():
            if agg == "sum":
                final = sum(values)
            else:
                final = sum(values) / len(values)
            upsert_metric(conn, "apple_health", metric_type, day, final, unit, is_demo=0)

    conn.commit()

    # Process sleep records grouped by night
    _process_sleep_records(conn, sleep_records, now)

    conn.commit()
    conn.close()

    return {
        "records": record_count,
        "workouts": workout_count,
        "sleep_records": len(sleep_records),
        "metric_types": list(daily_values.keys()),
    }


def _process_sleep_records(conn, records: list[tuple], now: str) -> None:
    """Group sleep records by night (startDate - 12h) to match Apple Health architecture."""
    nights: dict[date, list[tuple]] = {}
    for value, start_str, end_str in records:
        try:
            night_day = _sleep_night_date(start_str)
            nights.setdefault(night_day, []).append((value, start_str, end_str))
        except Exception:
            continue

    for night_date, segments in nights.items():
        session_id = f"apple:{night_date.isoformat()}"
        total_sleep_sec = 0
        deep_sec = 0
        light_sec = 0
        rem_sec = 0
        awake_sec = 0
        earliest_start = None
        latest_end = None
        parsed_stages = []

        for value, start_str, end_str in segments:
            try:
                start_dt = _parse_ts(start_str)
                end_dt = _parse_ts(end_str)
                dur = (end_dt - start_dt).total_seconds()
                if dur <= 0:
                    continue

                stage = SLEEP_STAGE_MAP.get(value, "awake")

                if earliest_start is None or start_dt < earliest_start:
                    earliest_start = start_dt
                if latest_end is None or end_dt > latest_end:
                    latest_end = end_dt

                if value in SLEEP_ASLEEP_VALUES:
                    total_sleep_sec += dur
                    if stage == "deep":
                        deep_sec += dur
                    elif stage == "rem":
                        rem_sec += dur
                    else:
                        light_sec += dur
                else:
                    awake_sec += dur

                parsed_stages.append((stage, start_dt.isoformat(), end_dt.isoformat(), dur))
            except Exception:
                continue

        if total_sleep_sec > 0 or awake_sec > 0:
            upsert_sleep_session(conn,
                id=session_id,
                source="apple_health",
                calendar_date=night_date.isoformat(),
                sleep_start=earliest_start.isoformat() if earliest_start else None,
                sleep_end=latest_end.isoformat() if latest_end else None,
                total_sleep_sec=total_sleep_sec,
                deep_sleep_sec=deep_sec,
                light_sleep_sec=light_sec,
                rem_sleep_sec=rem_sec,
                awake_sec=awake_sec,
                overall_score=None,
                avg_hr=None,
                avg_hrv=None,
                created_at=now,
                is_demo=0,
            )
            conn.execute("DELETE FROM sleep_stage WHERE session_id=?", (session_id,))
            for st, st_start, st_end, s_dur in parsed_stages:
                insert_sleep_stage(conn, session_id, st, st_start, st_end, s_dur)
