"""FastAPI server — unified health & activity dashboard API."""

from __future__ import annotations

import json
import logging
import threading
from datetime import date, timedelta
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .database import (
    get_db, init_db, get_date_bounds, get_metrics, get_activities,
    get_activity_types, get_sleep_sessions, get_sleep_stages, get_sources,
    has_real_data, clear_demo_data,
)

logger = logging.getLogger(__name__)

PROFILE_PATH = Path(__file__).resolve().parent.parent / "profile.json"
EXPORT_DIR = Path(__file__).resolve().parent.parent / "apple_health_export"

app = FastAPI(title="Health & Activity Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_sync_status = {"running": False, "message": "", "progress": 0, "needs_mfa": False}
_pending_garmin = {}


def _read_profile() -> dict:
    try:
        return json.loads(PROFILE_PATH.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {"display_name": "", "gender": "male"}


class ProfileBody(BaseModel):
    display_name: str = ""
    gender: Literal["male", "female"] = "male"


class GarminMFABody(BaseModel):
    mfa_code: str

class GarminCredentials(BaseModel):
    email: str
    password: str
    mfa_code: str | None = None


@app.on_event("startup")
def startup():
    init_db()


@app.get("/api/meta")
def meta():
    conn = get_db()
    try:
        min_d, max_d = get_date_bounds(conn)
        sources = get_sources(conn)
        activity_types = get_activity_types(conn)
        return {
            "min_date": min_d,
            "max_date": max_d,
            "sources": sources,
            "activity_types": activity_types,
            "profile": _read_profile(),
            "has_real_data": has_real_data(conn),
        }
    finally:
        conn.close()


@app.post("/api/profile")
def save_profile(body: ProfileBody):
    data = body.model_dump()
    PROFILE_PATH.write_text(json.dumps(data, indent=2) + "\n")
    return data


@app.get("/api/heart-timeline")
def heart_timeline(
    start: date = Query(...),
    end: date = Query(...),
):
    conn = get_db()
    try:
        rhr = get_metrics(conn, "resting_hr", start, end)
        hrv = get_metrics(conn, "hrv", start, end)
        hr = get_metrics(conn, "heart_rate", start, end)
        walking_hr = get_metrics(conn, "walking_hr", start, end)
        hr_recovery = get_metrics(conn, "hr_recovery", start, end)
        return {
            "resting_hr": rhr,
            "hrv": hrv,
            "heart_rate": hr,
            "walking_hr": walking_hr,
            "hr_recovery": hr_recovery,
        }
    finally:
        conn.close()


@app.get("/api/sleep-timeline")
def sleep_timeline(
    start: date = Query(...),
    end: date = Query(...),
):
    conn = get_db()
    try:
        sessions = get_sleep_sessions(conn, start, end)
        result = []
        for s in sessions:
            stages = get_sleep_stages(conn, s["id"])
            result.append({**s, "stages": stages})
        return {"sessions": result}
    finally:
        conn.close()


@app.get("/api/metrics/{metric_type}")
def metric_timeline(
    metric_type: str,
    start: date = Query(...),
    end: date = Query(...),
    source: str | None = Query(None),
):
    conn = get_db()
    try:
        data = get_metrics(conn, metric_type, start, end, source)
        return {"data": data, "metric_type": metric_type}
    finally:
        conn.close()


@app.get("/api/health-summary")
def health_summary(
    start: date = Query(...),
    end: date = Query(...),
):
    conn = get_db()
    try:
        def _avg(mt):
            rows = get_metrics(conn, mt, start, end)
            vals = [r["value"] for r in rows if r["value"] is not None]
            return round(sum(vals) / len(vals), 1) if vals else None

        def _total(mt):
            rows = get_metrics(conn, mt, start, end)
            vals = [r["value"] for r in rows if r["value"] is not None]
            return round(sum(vals)) if vals else None

        sessions = get_sleep_sessions(conn, start, end)
        sleep_vals = [s["total_sleep_sec"] for s in sessions if s["total_sleep_sec"]]
        avg_sleep = round(sum(sleep_vals) / len(sleep_vals) / 3600, 1) if sleep_vals else None

        res = {
            "avg_resting_hr": _avg("resting_hr"),
            "avg_hrv": _avg("hrv"),
            "avg_normal_hr": _avg("heart_rate"),
            "avg_walking_hr": _avg("walking_hr"),
            "avg_hr_recovery": _avg("hr_recovery"),
            "avg_vo2max": _avg("vo2max"),
            "total_steps": _total("steps"),
            "avg_sleep_hours": avg_sleep,
            "total_active_energy": _total("active_energy"),
            "total_exercise_min": _total("exercise_minutes"),
            "period_days": (end - start).days + 1,
        }
        return res
    finally:
        conn.close()


@app.get("/api/activities")
def activities_list(
    activity_type: str | None = Query(None),
    start: date | None = Query(None),
    end: date | None = Query(None),
    limit: int = Query(200),
):
    conn = get_db()
    try:
        acts = get_activities(conn, activity_type, start, end)
        types = get_activity_types(conn)
        return {"activities": acts[:limit], "types": types}
    finally:
        conn.close()


@app.get("/api/activity-summary")
def activity_summary(
    activity_type: str | None = Query(None),
    start: date | None = Query(None),
    end: date | None = Query(None),
):
    conn = get_db()
    try:
        acts = get_activities(conn, activity_type, start, end)
        total_count = len(acts)
        total_dur = sum(a["duration_seconds"] or 0 for a in acts)
        total_dist = sum(a["distance_meters"] or 0 for a in acts)
        total_cal = sum(a["calories"] or 0 for a in acts)
        hr_vals = [a["avg_hr"] for a in acts if a["avg_hr"]]
        avg_hr = round(sum(hr_vals) / len(hr_vals), 1) if hr_vals else None

        tc: dict[str, int] = {}
        td: dict[str, float] = {}
        for a in acts:
            t = a["activity_type"]
            tc[t] = tc.get(t, 0) + 1
            td[t] = td.get(t, 0) + (a["duration_seconds"] or 0)

        return {
            "total_count": total_count,
            "total_duration_sec": total_dur,
            "total_distance_m": total_dist,
            "total_calories": total_cal,
            "avg_hr": avg_hr,
            "type_breakdown": [
                {"type": k, "count": tc[k], "duration_sec": td[k]}
                for k in sorted(tc, key=lambda x: tc[x], reverse=True)
            ],
        }
    finally:
        conn.close()


@app.post("/api/import/apple-health")
async def import_apple_health_upload(file: UploadFile = File(...)):
    if _sync_status["running"]:
        return {"error": "A sync is already running"}

    import tempfile, shutil
    tmp = Path(tempfile.mkdtemp()) / file.filename
    with tmp.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    def _run():
        _sync_status["running"] = True
        _sync_status["message"] = "Extracting export.xml..."
        try:
            from .apple_health_provider import extract_export_xml, import_apple_health
            xml_path = extract_export_xml(tmp, EXPORT_DIR)
            _sync_status["message"] = "Parsing health data..."

            def progress(n):
                _sync_status["progress"] = n
                _sync_status["message"] = f"Parsed {n:,} records..."

            result = import_apple_health(xml_path, progress_cb=progress)
            _sync_status["message"] = f"Done! {result['records']:,} records, {result['workouts']} workouts."
        except Exception as e:
            logger.exception("Apple Health import failed")
            _sync_status["message"] = f"Error: {e}"
        finally:
            _sync_status["running"] = False
            tmp.unlink(missing_ok=True)

    threading.Thread(target=_run, daemon=True).start()
    return {"status": "started"}


@app.post("/api/import/apple-health-path")
def import_apple_health_path(zip_path: str = Query(...)):
    if _sync_status["running"]:
        return {"error": "A sync is already running"}

    path = Path(zip_path).expanduser()
    if not path.exists():
        return {"error": f"File not found: {path}"}

    def _run():
        _sync_status["running"] = True
        _sync_status["message"] = "Extracting export.xml..."
        try:
            from .apple_health_provider import extract_export_xml, import_apple_health
            c = get_db()
            try:
                clear_demo_data(c)
            finally:
                c.close()
            xml_path = extract_export_xml(path, EXPORT_DIR)
            _sync_status["message"] = "Parsing health data..."

            def progress(n):
                _sync_status["progress"] = n
                _sync_status["message"] = f"Parsed {n:,} records..."

            result = import_apple_health(xml_path, progress_cb=progress)
            _sync_status["message"] = f"Done! {result['records']:,} records, {result['workouts']} workouts."
        except Exception as e:
            logger.exception("Apple Health import failed")
            _sync_status["message"] = f"Error: {e}"
        finally:
            _sync_status["running"] = False

    threading.Thread(target=_run, daemon=True).start()
    return {"status": "started"}


@app.post("/api/sync/garmin")
def sync_garmin(creds: GarminCredentials, days: int = Query(30)):
    if _sync_status["running"]:
        return {"error": "A sync is already running"}

    def _run():
        _sync_status["running"] = True
        _sync_status["needs_mfa"] = False
        _sync_status["message"] = "Connecting to Garmin..."
        try:
            c = get_db()
            try:
                clear_demo_data(c)
            finally:
                c.close()
            from .garmin_provider import GarminProvider, GarminMFARequiredError, TOKEN_DIR

            # If MFA code was passed directly with credentials and we have a pending client
            if creds.mfa_code and _pending_garmin.get("client"):
                client = _pending_garmin["client"]
                _sync_status["message"] = "Verifying security passcode..."
                client.resume_login({}, creds.mfa_code.strip())
                client.client.dump(str(TOKEN_DIR))
                _sync_status["message"] = "Passcode verified! Syncing data..."
                provider = GarminProvider(creds.email, "", client=client)
                result = provider.full_sync(days_back=days)
                _sync_status["message"] = f"Done! {result}"
                _pending_garmin.clear()
                return

            provider = GarminProvider(creds.email, creds.password)
            try:
                _sync_status["message"] = "Authenticating with Garmin..."
                provider.login()
                _sync_status["message"] = "Connected! Syncing Garmin metrics & activities..."
                result = provider.full_sync(days_back=days)
                _sync_status["message"] = f"Done! {result}"
            except GarminMFARequiredError as mfa_err:
                _pending_garmin["client"] = mfa_err.client
                _pending_garmin["days"] = days
                _pending_garmin["email"] = creds.email
                _sync_status["needs_mfa"] = True
                _sync_status["message"] = "Garmin sent a security verification code to your email. Enter passcode below."
                return
        except Exception as e:
            logger.exception("Garmin sync failed")
            _sync_status["message"] = f"Error: {e}"
        finally:
            if not _sync_status.get("needs_mfa"):
                _sync_status["running"] = False

    threading.Thread(target=_run, daemon=True).start()
    return {"status": "started"}


@app.post("/api/sync/garmin/mfa")
def sync_garmin_mfa(body: GarminMFABody):
    client = _pending_garmin.get("client")
    if not client:
        return {"error": "No pending Garmin MFA session found. Please enter your credentials and try again."}

    days = _pending_garmin.get("days", 30)
    email = _pending_garmin.get("email", "")

    def _run_mfa():
        _sync_status["running"] = True
        _sync_status["needs_mfa"] = False
        _sync_status["message"] = "Verifying security passcode..."
        try:
            from .garmin_provider import GarminProvider, TOKEN_DIR
            TOKEN_DIR.mkdir(parents=True, exist_ok=True)
            client.resume_login({}, body.mfa_code.strip())
            client.client.dump(str(TOKEN_DIR))
            _sync_status["message"] = "Passcode verified! Syncing Garmin metrics, activities & sleep..."
            provider = GarminProvider(email, "", client=client)
            result = provider.full_sync(days_back=days)
            _sync_status["message"] = f"Done! {result}"
        except Exception as e:
            logger.exception("Garmin MFA verification failed")
            _sync_status["message"] = f"MFA Error: {e}"
        finally:
            _sync_status["running"] = False
            _pending_garmin.clear()

    threading.Thread(target=_run_mfa, daemon=True).start()
    return {"status": "mfa_submitted"}


@app.get("/api/sync/status")
def sync_status():
    return _sync_status


@app.post("/api/seed")
def seed_endpoint(days: int = Query(45)):
    from .seed import seed_demo_data
    seed_demo_data(days=days)
    return {"status": "ok", "message": f"Seeded {days} days of data"}

from .apple_aggregations import (
    get_vo2, get_rhr_hrv_weekly, get_sleep_stages_weekly,
    get_sleep_duration_trend, get_sleep_consistency, get_wrist_temp,
)

@app.get("/api/vo2")
def vo2_endpoint(
    start: date = Query(...),
    end: date = Query(...),
    gender: str = Query("male"),
    theme: str = Query("dark"),
):
    conn = get_db()
    try:
        data = get_vo2(conn, start, end, gender, theme)
        return data or {"traces": [], "layout": {}}
    finally:
        conn.close()


@app.get("/api/rhr-hrv")
def rhr_hrv_endpoint(
    start: date = Query(...),
    end: date = Query(...),
    theme: str = Query("dark"),
):
    conn = get_db()
    try:
        data = get_rhr_hrv_weekly(conn, start, end, theme)
        return data or {"traces": [], "layout": {}}
    finally:
        conn.close()


@app.get("/api/sleep-stages")
def sleep_stages_endpoint(
    start: date = Query(...),
    end: date = Query(...),
    theme: str = Query("dark"),
):
    conn = get_db()
    try:
        data = get_sleep_stages_weekly(conn, start, end, theme)
        return data or {"traces": [], "layout": {}}
    finally:
        conn.close()


@app.get("/api/sleep-duration")
def sleep_duration_endpoint(
    start: date = Query(...),
    end: date = Query(...),
    theme: str = Query("dark"),
):
    conn = get_db()
    try:
        data = get_sleep_duration_trend(conn, start, end, theme)
        return data or {"traces": [], "layout": {}}
    finally:
        conn.close()


@app.get("/api/sleep-consistency")
def sleep_consistency_endpoint(
    start: date = Query(...),
    end: date = Query(...),
    theme: str = Query("dark"),
):
    conn = get_db()
    try:
        data = get_sleep_consistency(conn, start, end, theme)
        return data or {"traces": [], "layout": {}}
    finally:
        conn.close()


@app.get("/api/wrist-temp")
def wrist_temp_endpoint(
    start: date = Query(...),
    end: date = Query(...),
    theme: str = Query("dark"),
):
    conn = get_db()
    try:
        data = get_wrist_temp(conn, start, end, theme)
        return data or {"traces": [], "layout": {}}
    finally:
        conn.close()

from .database import clear_demo_data, is_demo_active

@app.get("/api/demo/status")
def demo_status():
    conn = get_db()
    try:
        active = is_demo_active(conn)
        return {"enabled": active}
    finally:
        conn.close()


@app.post("/api/demo/toggle")
def demo_toggle(enable: bool = Query(...)):
    conn = get_db()
    try:
        if enable:
            from .seed import seed_demo_data
            seed_demo_data(days=45)
            return {"enabled": True, "message": "Demo data enabled."}
        else:
            deleted_count = clear_demo_data(conn)
            return {"enabled": False, "message": f"Demo data removed ({deleted_count} records cleared)."}
    finally:
        conn.close()


# ── Per-Activity HR Chart ───────────────────────────────────────────────────

# Activity-type based max HR multipliers (relative to daily avg HR)
_ACT_MAX_HR_FACTOR = {
    "running": 1.15,
    "cycling": 1.12,
    "hiking": 1.10,
    "hiit": 1.20,
    "cardio": 1.18,
    "swimming": 1.12,
    "rowing": 1.14,
    "strength": 1.08,
    "walking": 1.08,
}


@app.get("/api/activity/{activity_id}/hr-chart")
def activity_hr_chart(
    activity_id: str,
    theme: str = Query("dark"),
):
    """Return a Plotly HR profile chart for a specific activity.
    
    Uses the day's average heart_rate metric from the database (since Apple Health
    does not store per-activity HR in workout records).  Falls back to a graceful
    empty response when no data is available.
    """
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT id, activity_name, activity_type, start_time, duration_seconds,
                      avg_hr, max_hr
               FROM activity WHERE id = ?""",
            (activity_id,),
        )
        row = cur.fetchone()
        if not row:
            return {"traces": [], "layout": {}}

        act = dict(row)
        duration_sec = act.get("duration_seconds") or 0
        if duration_sec < 60:
            return {"traces": [], "layout": {}}

        # Use stored avg_hr first; fall back to the day's heart_rate metric
        avg_hr = act.get("avg_hr")
        max_hr = act.get("max_hr")
        date_str = (act.get("start_time") or "")[:10]

        if not avg_hr and date_str:
            cur.execute(
                "SELECT value FROM metric WHERE date=? AND metric_type='heart_rate' AND is_demo=0 LIMIT 1",
                (date_str,),
            )
            r = cur.fetchone()
            if r:
                avg_hr = r[0]

        # Also pull demo HR if enabled
        if not avg_hr and date_str:
            cur.execute(
                "SELECT value FROM metric WHERE date=? AND metric_type='heart_rate' LIMIT 1",
                (date_str,),
            )
            r = cur.fetchone()
            if r:
                avg_hr = r[0]

        if not avg_hr:
            return {"traces": [], "layout": {}}

        if not max_hr:
            factor = _ACT_MAX_HR_FACTOR.get(act.get("activity_type", ""), 1.12)
            max_hr = avg_hr * factor

    finally:
        conn.close()

    from .apple_aggregations import _build_hr_curve

    minutes = int(min(duration_sec / 60, 240))  # cap at 4 hours for display
    times, hr_vals = _build_hr_curve(minutes, avg_hr, max_hr)

    # Zone bands
    resting = 65
    zones = [
        ("Zone 1 (Recovery)",  resting, resting + (avg_hr - resting) * 0.5,  "rgba(56,189,248,0.07)"),
        ("Zone 2 (Aerobic)",   resting + (avg_hr - resting) * 0.5, avg_hr,   "rgba(16,185,129,0.07)"),
        ("Zone 3 (Threshold)", avg_hr, max_hr * 0.9,                         "rgba(245,158,11,0.07)"),
        ("Zone 4 (VO2Max)",    max_hr * 0.9, max_hr * 1.05,                  "rgba(244,63,94,0.07)"),
    ]

    text_color = "#94A3B8" if theme == "dark" else "#64748B"
    grid_color = "#1E293B" if theme == "dark" else "#E2E8F0"
    paper_bg = "rgba(0,0,0,0)"
    plot_bg = "rgba(0,0,0,0)"

    shapes = []
    for _, y0, y1, fc in zones:
        shapes.append({
            "type": "rect", "xref": "paper", "x0": 0, "x1": 1,
            "y0": max(resting, y0), "y1": min(max_hr * 1.05, y1),
            "fillcolor": fc, "layer": "below", "line": {"width": 0},
        })

    traces = [
        {
            "type": "scatter",
            "x": times,
            "y": hr_vals,
            "mode": "lines",
            "name": "Heart Rate",
            "line": {"color": "#F43F5E", "width": 2.5, "shape": "spline"},
            "fill": "tozeroy",
            "fillcolor": "rgba(244,63,94,0.08)",
            "hovertemplate": "%{x} min<br>%{y:.0f} bpm<extra></extra>",
        },
        # Avg HR reference line
        {
            "type": "scatter",
            "x": [times[0], times[-1]],
            "y": [round(avg_hr, 1), round(avg_hr, 1)],
            "mode": "lines",
            "name": f"Avg {round(avg_hr)} bpm",
            "line": {"color": "#F59E0B", "width": 1.5, "dash": "dot"},
            "hoverinfo": "skip",
        },
    ]

    layout = {
        "height": 220,
        "margin": {"l": 44, "r": 20, "t": 16, "b": 36},
        "paper_bgcolor": paper_bg,
        "plot_bgcolor": plot_bg,
        "font": {"color": text_color, "size": 11},
        "shapes": shapes,
        "xaxis": {
            "title": {"text": "Minutes", "font": {"size": 10}},
            "gridcolor": grid_color,
            "zerolinecolor": grid_color,
            "linecolor": "rgba(0,0,0,0)",
        },
        "yaxis": {
            "title": {"text": "BPM", "font": {"size": 10}},
            "gridcolor": grid_color,
            "zerolinecolor": grid_color,
            "linecolor": "rgba(0,0,0,0)",
            "range": [max(40, resting - 10), max_hr * 1.08],
        },
        "showlegend": True,
        "legend": {
            "orientation": "h", "y": 1.12, "x": 0,
            "font": {"size": 10, "color": text_color},
            "bgcolor": "rgba(0,0,0,0)",
        },
    }

    return {"traces": traces, "layout": layout}
