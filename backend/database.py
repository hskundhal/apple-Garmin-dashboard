"""SQLite database for unified health & activity storage."""

from __future__ import annotations

import sqlite3
from datetime import date, datetime
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "health.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS metric (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    source      TEXT NOT NULL,          -- 'garmin' | 'apple_health'
    metric_type TEXT NOT NULL,          -- 'resting_hr', 'hrv', 'vo2max', 'steps', etc.
    date        TEXT NOT NULL,          -- ISO date YYYY-MM-DD
    value       REAL NOT NULL,
    unit        TEXT NOT NULL,
    timestamp   TEXT,                   -- ISO datetime (nullable)
    is_demo     INTEGER DEFAULT 0,
    UNIQUE(source, metric_type, date)
);

CREATE TABLE IF NOT EXISTS activity (
    id                  TEXT PRIMARY KEY,   -- 'garmin:<id>' or 'apple:<id>'
    source              TEXT NOT NULL,
    activity_name       TEXT,
    activity_type       TEXT NOT NULL,      -- normalized: running, cycling, swimming, etc.
    sport_type          TEXT,               -- raw provider type
    start_time          TEXT NOT NULL,      -- ISO datetime UTC
    duration_seconds    REAL NOT NULL,
    distance_meters     REAL,
    calories            REAL,
    avg_hr              REAL,
    max_hr              REAL,
    avg_speed           REAL,              -- m/s
    max_speed           REAL,
    elevation_gain      REAL,
    elevation_loss      REAL,
    avg_cadence         REAL,
    avg_power           REAL,
    created_at          TEXT NOT NULL,
    is_demo             INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sleep_session (
    id              TEXT PRIMARY KEY,
    source          TEXT NOT NULL,
    calendar_date   TEXT NOT NULL,          -- ISO date
    sleep_start     TEXT,                   -- ISO datetime
    sleep_end       TEXT,
    total_sleep_sec REAL,
    deep_sleep_sec  REAL,
    light_sleep_sec REAL,
    rem_sleep_sec   REAL,
    awake_sec       REAL,
    overall_score   REAL,
    avg_hr          REAL,
    avg_hrv         REAL,
    created_at      TEXT NOT NULL,
    is_demo         INTEGER DEFAULT 0,
    UNIQUE(source, calendar_date)
);

CREATE TABLE IF NOT EXISTS sleep_stage (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL REFERENCES sleep_session(id),
    stage           TEXT NOT NULL,          -- 'deep','light','rem','awake'
    start_time      TEXT NOT NULL,
    end_time        TEXT NOT NULL,
    duration_sec    REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS garmin_credentials (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    email       TEXT NOT NULL,
    password    TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_state (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    source      TEXT NOT NULL,
    last_sync   TEXT,
    status      TEXT DEFAULT 'idle'
);

CREATE INDEX IF NOT EXISTS idx_metric_type_date ON metric(metric_type, date);
CREATE INDEX IF NOT EXISTS idx_metric_source ON metric(source);
CREATE INDEX IF NOT EXISTS idx_activity_type ON activity(activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_start ON activity(start_time);
CREATE INDEX IF NOT EXISTS idx_sleep_date ON sleep_session(calendar_date);
"""

def get_db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def init_db() -> None:
    conn = get_db()
    conn.executescript(SCHEMA)
    conn.close()

def upsert_metric(conn: sqlite3.Connection, source: str, metric_type: str,
                   day: date, value: float, unit: str,
                   timestamp: datetime | None = None,
                   is_demo: int = 0) -> None:
    conn.execute("""
        INSERT INTO metric (source, metric_type, date, value, unit, timestamp, is_demo)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source, metric_type, date)
        DO UPDATE SET value=excluded.value, unit=excluded.unit,
                      timestamp=excluded.timestamp, is_demo=excluded.is_demo
    """, (source, metric_type, day.isoformat(), value, unit,
          timestamp.isoformat() if timestamp else None, is_demo))

def upsert_activity(conn: sqlite3.Connection, **kw) -> None:
    if "is_demo" not in kw:
        kw["is_demo"] = 0
    conn.execute("""
        INSERT INTO activity (id, source, activity_name, activity_type, sport_type,
            start_time, duration_seconds, distance_meters, calories,
            avg_hr, max_hr, avg_speed, max_speed, elevation_gain, elevation_loss,
            avg_cadence, avg_power, created_at, is_demo)
        VALUES (:id, :source, :activity_name, :activity_type, :sport_type,
            :start_time, :duration_seconds, :distance_meters, :calories,
            :avg_hr, :max_hr, :avg_speed, :max_speed, :elevation_gain, :elevation_loss,
            :avg_cadence, :avg_power, :created_at, :is_demo)
        ON CONFLICT(id) DO UPDATE SET
            activity_name=excluded.activity_name, duration_seconds=excluded.duration_seconds,
            distance_meters=excluded.distance_meters, calories=excluded.calories,
            avg_hr=excluded.avg_hr, max_hr=excluded.max_hr,
            avg_speed=excluded.avg_speed, max_speed=excluded.max_speed,
            elevation_gain=excluded.elevation_gain, elevation_loss=excluded.elevation_loss,
            avg_cadence=excluded.avg_cadence, avg_power=excluded.avg_power,
            is_demo=excluded.is_demo
    """, kw)

def upsert_sleep_session(conn: sqlite3.Connection, **kw) -> str:
    if "is_demo" not in kw:
        kw["is_demo"] = 0
    conn.execute("""
        INSERT INTO sleep_session (id, source, calendar_date, sleep_start, sleep_end,
            total_sleep_sec, deep_sleep_sec, light_sleep_sec, rem_sleep_sec, awake_sec,
            overall_score, avg_hr, avg_hrv, created_at, is_demo)
        VALUES (:id, :source, :calendar_date, :sleep_start, :sleep_end,
            :total_sleep_sec, :deep_sleep_sec, :light_sleep_sec, :rem_sleep_sec, :awake_sec,
            :overall_score, :avg_hr, :avg_hrv, :created_at, :is_demo)
        ON CONFLICT(source, calendar_date) DO UPDATE SET
            sleep_start=excluded.sleep_start, sleep_end=excluded.sleep_end,
            total_sleep_sec=excluded.total_sleep_sec,
            deep_sleep_sec=excluded.deep_sleep_sec, light_sleep_sec=excluded.light_sleep_sec,
            rem_sleep_sec=excluded.rem_sleep_sec, awake_sec=excluded.awake_sec,
            overall_score=excluded.overall_score, avg_hr=excluded.avg_hr, avg_hrv=excluded.avg_hrv,
            is_demo=excluded.is_demo
    """, kw)
    cur = conn.execute("SELECT id FROM sleep_session WHERE source=? AND calendar_date=?", (kw["source"], kw["calendar_date"]))
    row = cur.fetchone()
    return row[0] if row else kw["id"]

def insert_sleep_stage(conn: sqlite3.Connection, session_id: str,
                        stage: str, start: str, end: str, dur: float) -> None:
    conn.execute("""
        INSERT INTO sleep_stage (session_id, stage, start_time, end_time, duration_sec)
        VALUES (?, ?, ?, ?, ?)
    """, (session_id, stage, start, end, dur))

def get_metrics(conn: sqlite3.Connection, metric_type: str,
                start: date, end: date, source: str | None = None) -> list[dict]:
    sql = "SELECT * FROM metric WHERE metric_type=? AND date>=? AND date<=?"
    params: list = [metric_type, start.isoformat(), end.isoformat()]
    if source:
        sql += " AND source=?"
        params.append(source)
    sql += " ORDER BY date"
    return [dict(r) for r in conn.execute(sql, params).fetchall()]

def get_activities(conn: sqlite3.Connection, activity_type: str | None = None,
                   start: date | None = None, end: date | None = None) -> list[dict]:
    sql = "SELECT * FROM activity WHERE 1=1"
    params: list = []
    if activity_type and activity_type != "all":
        sql += " AND activity_type=?"
        params.append(activity_type)
    if start:
        sql += " AND date(start_time)>=?"
        params.append(start.isoformat())
    if end:
        sql += " AND date(start_time)<=?"
        params.append(end.isoformat())
    sql += " ORDER BY start_time DESC"
    return [dict(r) for r in conn.execute(sql, params).fetchall()]

def get_sleep_sessions(conn: sqlite3.Connection, start: date, end: date) -> list[dict]:
    return [dict(r) for r in conn.execute(
        "SELECT * FROM sleep_session WHERE calendar_date>=? AND calendar_date<=? ORDER BY calendar_date",
        (start.isoformat(), end.isoformat())
    ).fetchall()]

def get_sleep_stages(conn: sqlite3.Connection, session_id: str) -> list[dict]:
    return [dict(r) for r in conn.execute(
        "SELECT * FROM sleep_stage WHERE session_id=? ORDER BY start_time",
        (session_id,)
    ).fetchall()]

def get_date_bounds(conn: sqlite3.Connection) -> tuple[str, str]:
    row = conn.execute("SELECT MIN(date), MAX(date) FROM metric").fetchone()
    if row and row[0]:
        return row[0], row[1]
    row2 = conn.execute("SELECT MIN(date(start_time)), MAX(date(start_time)) FROM activity").fetchone()
    if row2 and row2[0]:
        return row2[0], row2[1]
    today = date.today().isoformat()
    return today, today

def get_activity_types(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute(
        "SELECT DISTINCT activity_type FROM activity ORDER BY activity_type"
    ).fetchall()
    return [r[0] for r in rows]

def get_sources(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute(
        "SELECT DISTINCT source FROM metric UNION SELECT DISTINCT source FROM activity"
    ).fetchall()
    return [r[0] for r in rows]

def clear_demo_data(conn: sqlite3.Connection) -> int:
    """Remove all records marked as demo."""
    cur1 = conn.execute("DELETE FROM metric WHERE is_demo = 1")
    cur2 = conn.execute("DELETE FROM activity WHERE is_demo = 1")
    conn.execute("DELETE FROM sleep_stage WHERE session_id IN (SELECT id FROM sleep_session WHERE is_demo = 1)")
    cur3 = conn.execute("DELETE FROM sleep_session WHERE is_demo = 1")
    conn.commit()
    return cur1.rowcount + cur2.rowcount + cur3.rowcount

def is_demo_active(conn: sqlite3.Connection) -> bool:
    """Check if demo data is present."""
    row = conn.execute("SELECT 1 FROM metric WHERE is_demo = 1 LIMIT 1").fetchone()
    if row:
        return True
    row = conn.execute("SELECT 1 FROM activity WHERE is_demo = 1 LIMIT 1").fetchone()
    return bool(row)

def has_real_data(conn: sqlite3.Connection) -> bool:
    """Check if real (non-demo) user data exists from Apple Health or Garmin."""
    row = conn.execute("SELECT 1 FROM metric WHERE is_demo = 0 LIMIT 1").fetchone()
    if row:
        return True
    row = conn.execute("SELECT 1 FROM activity WHERE is_demo = 0 LIMIT 1").fetchone()
    if row:
        return True
    row = conn.execute("SELECT 1 FROM sleep_session WHERE is_demo = 0 LIMIT 1").fetchone()
    return bool(row)
