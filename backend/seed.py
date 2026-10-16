"""Seed sample combined Apple Health + Garmin data for instant local testing."""

import random
from datetime import date, datetime, timedelta, timezone
from backend.database import (
    get_db, init_db, upsert_metric, upsert_activity,
    upsert_sleep_session, insert_sleep_stage
)

def seed_demo_data(days: int = 45):
    init_db()
    conn = get_db()
    today = date.today()
    now_str = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()

    print(f"Seeding {days} days of sample Apple Health and Garmin data (is_demo=1)...")

    base_rhr_garmin = 54
    base_rhr_apple = 53
    base_hrv_garmin = 58
    base_hrv_apple = 62
    base_normal_hr = 72
    base_walking_hr = 98
    base_vo2 = 47.5
    base_wrist_temp = 36.2

    activities_sample = [
        ("running", "Morning Run", 3200, 5200, 380, 152, 174, 3.1, 4.2, 45, 40, 168, None, "garmin"),
        ("cycling", "Afternoon Ride", 4500, 22000, 560, 138, 165, 6.8, 11.2, 180, 175, 82, 195, "garmin"),
        ("running", "Tempo 5K", 1450, 5000, 360, 164, 182, 3.45, 4.5, 30, 25, 172, None, "apple_health"),
        ("walking", "Evening Walk", 2400, 2900, 150, 102, 118, 1.2, 1.6, 15, 15, 110, None, "apple_health"),
        ("strength", "Full Body Strength", 2700, None, 290, 125, 158, None, None, None, None, None, None, "garmin"),
        ("swimming", "Morning Swim", 1800, 1200, 240, 134, 155, 0.7, 0.9, None, None, None, None, "apple_health"),
        ("hiking", "Weekend Trail Hike", 7200, 8500, 680, 128, 160, 1.18, 2.1, 350, 340, 105, None, "garmin"),
        ("yoga", "Recovery Flow", 1800, None, 95, 88, 105, None, None, None, None, None, None, "apple_health"),
    ]

    for d in range(days, 0, -1):
        cur_date = today - timedelta(days=d)
        cur_iso = cur_date.isoformat()

        garmin_rhr = round(base_rhr_garmin + random.uniform(-4, 5), 1)
        apple_rhr = round(base_rhr_apple + random.uniform(-4, 5), 1)
        garmin_hrv = round(base_hrv_garmin + random.uniform(-10, 12), 1)
        apple_hrv = round(base_hrv_apple + random.uniform(-12, 14), 1)
        norm_hr = round(base_normal_hr + random.uniform(-6, 8), 1)
        walk_hr = round(base_walking_hr + random.uniform(-8, 9), 1)
        rec_hr = round(random.uniform(22, 38), 1)
        vo2 = round(base_vo2 + (days - d) * 0.04 + random.uniform(-0.2, 0.2), 1)
        steps_garmin = random.randint(7500, 14500)
        active_kcal = random.randint(450, 850)
        ex_min = random.randint(25, 75)
        wtemp = round(base_wrist_temp + random.uniform(-0.4, 0.45), 2)

        # Upsert heart & biometric metrics
        upsert_metric(conn, "garmin", "resting_hr", cur_date, garmin_rhr, "bpm", is_demo=1)
        upsert_metric(conn, "apple_health", "resting_hr", cur_date, apple_rhr, "bpm", is_demo=1)
        upsert_metric(conn, "garmin", "hrv", cur_date, garmin_hrv, "ms", is_demo=1)
        upsert_metric(conn, "apple_health", "hrv", cur_date, apple_hrv, "ms", is_demo=1)
        upsert_metric(conn, "apple_health", "heart_rate", cur_date, norm_hr, "bpm", is_demo=1)
        upsert_metric(conn, "garmin", "heart_rate", cur_date, norm_hr + random.uniform(-1, 1), "bpm", is_demo=1)
        upsert_metric(conn, "apple_health", "walking_hr", cur_date, walk_hr, "bpm", is_demo=1)
        upsert_metric(conn, "apple_health", "hr_recovery", cur_date, rec_hr, "bpm", is_demo=1)
        upsert_metric(conn, "apple_health", "vo2max", cur_date, vo2, "ml/kg/min", is_demo=1)
        upsert_metric(conn, "garmin", "vo2max", cur_date, vo2, "ml/kg/min", is_demo=1)
        upsert_metric(conn, "garmin", "steps", cur_date, steps_garmin, "count", is_demo=1)
        upsert_metric(conn, "apple_health", "active_energy", cur_date, active_kcal, "kcal", is_demo=1)
        upsert_metric(conn, "apple_health", "exercise_minutes", cur_date, ex_min, "min", is_demo=1)
        upsert_metric(conn, "apple_health", "wrist_temp", cur_date, wtemp, "degC", is_demo=1)

        total_sleep_h = random.uniform(6.2, 8.5)
        total_sec = total_sleep_h * 3600
        deep_sec = total_sec * random.uniform(0.15, 0.22)
        rem_sec = total_sec * random.uniform(0.18, 0.25)
        light_sec = total_sec - deep_sec - rem_sec
        awake_sec = random.uniform(900, 2400)
        sleep_score = int(min(98, max(55, 65 + (total_sleep_h - 6) * 12 + random.uniform(-5, 8))))

        sleep_start_dt = datetime.combine(cur_date - timedelta(days=1), datetime.min.time()).replace(hour=23, minute=random.randint(0, 50))
        sleep_end_dt = sleep_start_dt + timedelta(seconds=total_sec + awake_sec)

        src = "garmin" if d % 2 == 0 else "apple_health"
        session_id = f"demo:{src}:{cur_iso}"

        upsert_sleep_session(
            conn,
            id=session_id,
            source=src,
            calendar_date=cur_iso,
            sleep_start=sleep_start_dt.isoformat(),
            sleep_end=sleep_end_dt.isoformat(),
            total_sleep_sec=total_sec,
            deep_sleep_sec=deep_sec,
            light_sleep_sec=light_sec,
            rem_sleep_sec=rem_sec,
            awake_sec=awake_sec,
            overall_score=sleep_score,
            avg_hr=round(garmin_rhr - 4, 1),
            avg_hrv=round(garmin_hrv + 5, 1),
            created_at=now_str,
            is_demo=1
        )

        t_ptr = sleep_start_dt
        stages = ["light", "deep", "rem", "light", "deep", "rem", "awake", "light"]
        stage_dur = (total_sec + awake_sec) / len(stages)
        for st in stages:
            st_end = t_ptr + timedelta(seconds=stage_dur)
            insert_sleep_stage(conn, session_id, st, t_ptr.isoformat(), st_end.isoformat(), stage_dur)
            t_ptr = st_end

        if random.random() > 0.35:
            act = random.choice(activities_sample)
            act_id = f"demo:{act[13]}:{cur_iso}-{random.randint(1000, 9999)}"
            act_start = datetime.combine(cur_date, datetime.min.time()).replace(hour=random.choice([7, 8, 17, 18]), minute=random.randint(0, 55))
            upsert_activity(
                conn,
                id=act_id,
                source=act[13],
                activity_name=f"{act[1]}",
                activity_type=act[0],
                sport_type=act[0],
                start_time=act_start.isoformat(),
                duration_seconds=act[2] * random.uniform(0.85, 1.15),
                distance_meters=act[3] * random.uniform(0.9, 1.1) if act[3] else None,
                calories=act[4] * random.uniform(0.85, 1.15),
                avg_hr=act[5] + random.randint(-4, 4) if act[5] else None,
                max_hr=act[6] + random.randint(-4, 5) if act[6] else None,
                avg_speed=act[7] if act[7] else None,
                max_speed=act[8] if act[8] else None,
                elevation_gain=act[9] if act[9] else None,
                elevation_loss=act[10] if act[10] else None,
                avg_cadence=act[11] if act[11] else None,
                avg_power=act[12] if act[12] else None,
                created_at=now_str,
                is_demo=1
            )

    conn.commit()
    conn.close()
    print("✓ Full demo dataset generated with all HR types and sleep architectures.")

if __name__ == "__main__":
    seed_demo_data()
