"""Plotly chart aggregations adapted from apple-health-dashboard using SQLite storage."""

from __future__ import annotations

import math
from datetime import date, datetime, timedelta
from typing import Any
import pandas as pd

from .database import get_metrics, get_sleep_sessions

VO2_BANDS = {
    "male": [
        ("Superior", 51.1, 60.0),
        ("Excellent", 43.9, 51.1),
        ("Good", 36.7, 43.9),
        ("Below Good", 20.0, 36.7),
    ],
    "female": [
        ("Superior", 44.2, 55.0),
        ("Excellent", 37.8, 44.2),
        ("Good", 30.2, 37.8),
        ("Below Good", 20.0, 30.2),
    ],
}

THEME_COLORS = {
    "dark": {
        "bg": "rgba(0,0,0,0)",
        "card": "#111827",
        "border": "#1E293B",
        "text": "#F8FAFC",
        "tick": "#94A3B8",
        "grid": "rgba(255, 255, 255, 0.05)",
        "accent": "#38BDF8",
        "accent2": "#F43F5E",
        "hrv": "#818CF8",
        "dot": "#475569",
        "deep": "#1E40AF",
        "light": "#38BDF8",
        "rem": "#818CF8",
        "awake": "#475569",
    },
    "light": {
        "bg": "rgba(0,0,0,0)",
        "card": "#FFFFFF",
        "border": "#E2E8F0",
        "text": "#0F172A",
        "tick": "#64748B",
        "grid": "rgba(15, 23, 42, 0.06)",
        "accent": "#0284C7",
        "accent2": "#E11D48",
        "hrv": "#6366F1",
        "dot": "#CBD5E1",
        "deep": "#1E3A8A",
        "light": "#0284C7",
        "rem": "#6366F1",
        "awake": "#94A3B8",
    },
}

def _layout(theme: str = "dark", height: int = 300, **overrides) -> dict:
    t = THEME_COLORS.get(theme, THEME_COLORS["dark"])
    axis = {
        "gridcolor": t["grid"],
        "zerolinecolor": t["grid"],
        "linecolor": "rgba(0,0,0,0)",
        "tickfont": {"size": 10, "color": t["tick"]},
    }
    base = {
        "paper_bgcolor": t["bg"],
        "plot_bgcolor": t["bg"],
        "font": {"family": "'Plus Jakarta Sans', system-ui, sans-serif", "color": t["tick"], "size": 11},
        "height": height,
        "margin": {"l": 48, "r": 24, "t": 28, "b": 38},
        "xaxis": axis,
        "yaxis": dict(axis),
        "showlegend": False,
        "hovermode": "closest",
        "hoverlabel": {
            "bgcolor": "rgba(15,23,42,0.95)" if theme == "dark" else "rgba(255,255,255,0.97)",
            "bordercolor": t["accent"],
            "font": {"family": "'Plus Jakarta Sans', system-ui, sans-serif", "size": 13, "color": t["text"]},
            "namelength": -1,
        },
    }
    base.update(overrides)
    return base

def _safe(v):
    return [None if (isinstance(x, float) and (math.isnan(x) or math.isinf(x))) else x for x in v]

def _hour_str(h: float, short: bool = False) -> str:
    if h < 0:
        h += 24
    hour = int(h) % 24
    minute = int((h % 1) * 60)
    p = "AM" if hour < 12 else "PM"
    dh = hour % 12 or 12
    if short:
        return f"{dh} {p}" if minute == 0 else f"{dh}:{minute:02d} {p}"
    return f"{dh}:{minute:02d} {p}"


# ── 1. VO2 Max Trend ────────────────────────────────────────────────────────
def get_vo2(conn, start: date, end: date, gender: str = "male", theme: str = "dark") -> dict | None:
    t = THEME_COLORS.get(theme, THEME_COLORS["dark"])
    records = get_metrics(conn, "vo2max", start, end)
    if not records:
        return None

    df = pd.DataFrame(records).sort_values("date")
    bands = VO2_BANDS.get(gender, VO2_BANDS["male"])

    shapes = [
        {
            "type": "rect", "xref": "paper", "x0": 0, "x1": 1,
            "y0": y0, "y1": y1, "fillcolor": t["text"], "opacity": 0.04,
            "layer": "below", "line": {"width": 0},
        }
        for _, y0, y1 in bands
    ]
    annotations = [
        {
            "x": 0.99, "xref": "paper", "xanchor": "right",
            "y": (y0 + y1) / 2, "text": label, "showarrow": False,
            "font": {"size": 9, "color": t["tick"]},
        }
        for label, y0, y1 in bands
    ]

    traces = [
        {
            "type": "scatter",
            "x": df["date"].tolist(),
            "y": _safe(df["value"]),
            "mode": "markers",
            "name": "VO2 Max",
            "marker": {"color": t["accent"], "size": 8, "opacity": 0.8, "symbol": "circle", "line": {"color": t["bg"], "width": 1}},
            "hovertemplate": "<b>VO2 Max</b><br>📅 %{x|%b %d, %Y}<br>🫁 <b>%{y:.1f} mL/min/kg</b><extra></extra>",
        }
    ]

    if len(df) > 5:
        df["rolling"] = df["value"].rolling(7, min_periods=2).mean()
        traces.append({
            "type": "scatter",
            "x": df["date"].tolist(),
            "y": _safe(df["rolling"]),
            "mode": "lines",
            "name": "Trend",
            "line": {"color": t["accent"], "width": 3, "shape": "spline", "smoothing": 1.3},
            "fill": "tozeroy",
            "fillcolor": f"rgba(56,189,248,0.06)",
            "hovertemplate": "<b>7-Day Trend</b><br>📅 %{x|%b %d, %Y}<br>🫁 <b>%{y:.1f} mL/min/kg</b><extra></extra>",
        })

    layout = _layout(theme, shapes=shapes, annotations=annotations)
    layout["yaxis"]["title"] = {"text": "mL/min/kg", "font": {"size": 10}}
    return {"traces": traces, "layout": layout}


# ── 2. Resting HR & HRV Weekly ──────────────────────────────────────────────
def get_rhr_hrv_weekly(conn, start: date, end: date, theme: str = "dark") -> dict | None:
    t = THEME_COLORS.get(theme, THEME_COLORS["dark"])
    rhr_rows = get_metrics(conn, "resting_hr", start, end)
    hrv_rows = get_metrics(conn, "hrv", start, end)
    if not rhr_rows and not hrv_rows:
        return None

    df_rhr = pd.DataFrame(rhr_rows) if rhr_rows else pd.DataFrame()
    df_hrv = pd.DataFrame(hrv_rows) if hrv_rows else pd.DataFrame()

    traces = []
    if not df_hrv.empty:
        df_hrv["week"] = pd.to_datetime(df_hrv["date"]).dt.to_period("W").dt.to_timestamp()
        hrv_w = df_hrv.groupby("week")["value"].mean()
        traces.append({
            "type": "scatter",
            "x": hrv_w.index.strftime("%Y-%m-%d").tolist(),
            "y": [round(v, 1) for v in hrv_w.values],
            "name": "HRV SDNN (ms)",
            "line": {"color": t["hrv"], "width": 2, "dash": "dot"},
            "opacity": 0.9,
            "yaxis": "y2",
            "hovertemplate": "<b>HRV SDNN</b><br>📅 %{x|%b %d, %Y}<br>💜 <b>%{y:.1f} ms</b><extra></extra>",
        })

    if not df_rhr.empty:
        df_rhr["week"] = pd.to_datetime(df_rhr["date"]).dt.to_period("W").dt.to_timestamp()
        rhr_w = df_rhr.groupby("week")["value"].mean()
        traces.append({
            "type": "scatter",
            "x": rhr_w.index.strftime("%Y-%m-%d").tolist(),
            "y": [round(v, 1) for v in rhr_w.values],
            "name": "Resting HR (bpm)",
            "line": {"color": t["accent2"], "width": 2.5, "shape": "spline"},
            "yaxis": "y",
            "hovertemplate": "<b>Resting HR</b><br>📅 %{x|%b %d, %Y}<br>❤️ <b>%{y:.1f} bpm</b><extra></extra>",
        })

    layout = _layout(theme, margin={"l": 44, "r": 44, "t": 24, "b": 36})
    layout["yaxis"]["title"] = {"text": "bpm", "font": {"size": 10}}
    layout["yaxis2"] = {
        "title": {"text": "HRV ms", "font": {"size": 10}},
        "overlaying": "y",
        "side": "right",
        "gridcolor": "rgba(0,0,0,0)",
        "zerolinecolor": "rgba(0,0,0,0)",
        "linecolor": "rgba(0,0,0,0)",
        "tickfont": {"size": 10, "color": t["tick"]},
    }
    return {"traces": traces, "layout": layout}


# ── 3. Sleep Stages Weekly Stacked ──────────────────────────────────────────
def get_sleep_stages_weekly(conn, start: date, end: date, theme: str = "dark") -> dict | None:
    t = THEME_COLORS.get(theme, THEME_COLORS["dark"])
    sessions = get_sleep_sessions(conn, start, end)
    if not sessions:
        return None

    df = pd.DataFrame(sessions)
    df["week"] = pd.to_datetime(df["calendar_date"]).dt.to_period("W").dt.to_timestamp()

    # Convert seconds to hours
    for col in ["deep_sleep_sec", "light_sleep_sec", "rem_sleep_sec", "awake_sec"]:
        if col not in df.columns:
            df[col] = 0
        df[col] = df[col].fillna(0) / 3600

    weekly = df.groupby("week")[["deep_sleep_sec", "light_sleep_sec", "rem_sleep_sec", "awake_sec"]].mean()
    if weekly.empty:
        return None

    stage_map = [
        ("deep_sleep_sec", "Deep", t["deep"]),
        ("light_sleep_sec", "Core / Light", t["light"]),
        ("rem_sleep_sec", "REM", t["rem"]),
        ("awake_sec", "Awake", t["awake"]),
    ]

    traces = []
    x_weeks = weekly.index.strftime("%Y-%m-%d").tolist()
    for col, name, color in stage_map:
        traces.append({
            "type": "bar",
            "x": x_weeks,
            "y": [round(v, 2) for v in weekly[col]],
            "name": name,
            "marker": {"color": color},
            "hovertemplate": f"<b>{name}</b><br>📅 %{{x|%b %d, %Y}}<br>⏱️ <b>%{{y:.2f}} hrs</b><extra></extra>",
            "marker": {"opacity": 0.9, "line": {"color": "rgba(0,0,0,0.15)", "width": 0.5}},
        })

    layout = _layout(theme, barmode="stack", showlegend=True)
    layout["legend"] = {
        "orientation": "h",
        "y": 1.15,
        "x": 1,
        "xanchor": "right",
        "font": {"size": 10, "color": t["tick"]},
    }
    layout["yaxis"]["title"] = {"text": "Hrs / night", "font": {"size": 10}}
    return {"traces": traces, "layout": layout}


# ── 4. Sleep Duration Trend ─────────────────────────────────────────────────
def get_sleep_duration_trend(conn, start: date, end: date, theme: str = "dark") -> dict | None:
    t = THEME_COLORS.get(theme, THEME_COLORS["dark"])
    sessions = get_sleep_sessions(conn, start, end)
    if not sessions:
        return None

    df = pd.DataFrame(sessions).sort_values("calendar_date")
    df["hrs"] = df["total_sleep_sec"].fillna(0) / 3600
    df["rolling"] = df["hrs"].rolling(7, min_periods=1).mean()

    traces = [
        {
            "type": "scatter",
            "x": df["calendar_date"].tolist(),
            "y": [round(v, 2) for v in df["hrs"]],
            "mode": "markers",
            "name": "Nightly",
            "marker": {"size": 6, "opacity": 0.6, "color": t["accent"], "symbol": "circle"},
            "hovertemplate": "<b>Nightly Sleep</b><br>📅 %{x|%b %d, %Y}<br>🌙 <b>%{y:.2f} hrs</b><extra></extra>",
        },
        {
            "type": "scatter",
            "x": df["calendar_date"].tolist(),
            "y": [round(v, 2) for v in df["rolling"]],
            "mode": "lines",
            "name": "7-day avg",
            "line": {"color": t["accent"], "width": 3, "shape": "spline", "smoothing": 1.3},
            "fill": "tozeroy",
            "fillcolor": "rgba(56,189,248,0.07)",
            "hovertemplate": "<b>7-Day Avg Sleep</b><br>📅 %{x|%b %d, %Y}<br>🌙 <b>%{y:.2f} hrs</b><extra></extra>",
        },
        {
            "type": "scatter",
            "x": df["calendar_date"].tolist(),
            "y": [8.0] * len(df),
            "mode": "lines",
            "name": "Target (8h)",
            "line": {"color": "#10B981", "width": 1.5, "dash": "dot"},
            "hoverinfo": "skip",
        }
    ]

    layout = _layout(theme)
    layout["yaxis"]["title"] = {"text": "Hours", "font": {"size": 10}}
    return {"traces": traces, "layout": layout}


# ── 5. Sleep Consistency (Bedtime & Wake time) ──────────────────────────────
def get_sleep_consistency(conn, start: date, end: date, theme: str = "dark") -> dict | None:
    t = THEME_COLORS.get(theme, THEME_COLORS["dark"])
    sessions = get_sleep_sessions(conn, start, end)
    if not sessions:
        return None

    rows = []
    for s in sessions:
        if s.get("sleep_start") and s.get("sleep_end"):
            try:
                st = datetime.fromisoformat(s["sleep_start"].replace("Z", "+00:00"))
                en = datetime.fromisoformat(s["sleep_end"].replace("Z", "+00:00"))
                b_hour = st.hour + st.minute / 60
                w_hour = en.hour + en.minute / 60
                b_adj = b_hour - 24 if b_hour >= 18 else b_hour
                rows.append({"date": s["calendar_date"], "bed_adj": b_adj, "wake": w_hour})
            except Exception:
                continue

    if not rows:
        return None

    df = pd.DataFrame(rows).sort_values("date")
    df["bed_roll"] = df["bed_adj"].rolling(7, min_periods=1).mean()
    df["wake_roll"] = df["wake"].rolling(7, min_periods=1).mean()

    df["bed_label"] = df["bed_adj"].apply(_hour_str)
    df["wake_label"] = df["wake"].apply(_hour_str)

    bed_ticks = list(range(-6, 7, 2))
    bed_labels = [_hour_str(h, short=True) for h in bed_ticks]
    wake_ticks = list(range(4, 14, 2))
    wake_labels = [_hour_str(h, short=True) for h in wake_ticks]

    dates = df["date"].tolist()
    wake_color = "#38BDF8"

    traces = [
        {
            "type": "scatter",
            "x": dates,
            "y": _safe(df["bed_adj"]),
            "mode": "markers",
            "marker": {"size": 4, "opacity": 0.45, "color": t["accent2"]},
            "name": "Bedtime",
            "text": df["bed_label"].tolist(),
            "hovertemplate": "%{x}<br>Bedtime: %{text}<extra></extra>",
            "xaxis": "x",
            "yaxis": "y",
        },
        {
            "type": "scatter",
            "x": dates,
            "y": _safe(df["bed_roll"]),
            "mode": "lines",
            "line": {"color": t["accent2"], "width": 2, "shape": "spline"},
            "name": "Bedtime trend",
            "hoverinfo": "skip",
            "xaxis": "x",
            "yaxis": "y",
        },
        {
            "type": "scatter",
            "x": dates,
            "y": _safe(df["wake"]),
            "mode": "markers",
            "marker": {"size": 4, "opacity": 0.45, "color": wake_color},
            "name": "Wake Time",
            "text": df["wake_label"].tolist(),
            "hovertemplate": "%{x}<br>Wake: %{text}<extra></extra>",
            "xaxis": "x2",
            "yaxis": "y2",
        },
        {
            "type": "scatter",
            "x": dates,
            "y": _safe(df["wake_roll"]),
            "mode": "lines",
            "line": {"color": wake_color, "width": 2, "shape": "spline"},
            "name": "Wake trend",
            "hoverinfo": "skip",
            "xaxis": "x2",
            "yaxis": "y2",
        },
    ]

    layout = _layout(
        theme,
        grid={"rows": 1, "columns": 2, "pattern": "independent"},
        margin={"l": 44, "r": 44, "t": 28, "b": 36},
        xaxis={"domain": [0, 0.46], "gridcolor": t["grid"], "tickfont": {"size": 9, "color": t["tick"]}},
        yaxis={
            "tickvals": bed_ticks,
            "ticktext": bed_labels,
            "range": [-6, 6],
            "domain": [0, 1],
            "gridcolor": t["grid"],
            "tickfont": {"size": 9, "color": t["tick"]},
        },
        xaxis2={"domain": [0.54, 1], "anchor": "y2", "gridcolor": t["grid"], "tickfont": {"size": 9, "color": t["tick"]}},
        yaxis2={
            "tickvals": wake_ticks,
            "ticktext": wake_labels,
            "range": [4, 14],
            "side": "right",
            "domain": [0, 1],
            "anchor": "x2",
            "gridcolor": t["grid"],
            "tickfont": {"size": 9, "color": t["tick"]},
        },
        annotations=[
            {"text": "Bedtime (PM/AM)", "x": 0.22, "xref": "paper", "y": 1.1, "yref": "paper", "showarrow": False, "font": {"size": 11, "color": t["tick"]}},
            {"text": "Wake Time (AM)", "x": 0.78, "xref": "paper", "y": 1.1, "yref": "paper", "showarrow": False, "font": {"size": 11, "color": t["tick"]}},
        ],
    )
    return {"traces": traces, "layout": layout}


# ── 6. Sleeping Wrist Temperature ───────────────────────────────────────────
def get_wrist_temp(conn, start: date, end: date, theme: str = "dark") -> dict | None:
    t = THEME_COLORS.get(theme, THEME_COLORS["dark"])
    records = get_metrics(conn, "wrist_temp", start, end)
    if not records:
        return None

    df = pd.DataFrame(records).sort_values("date")
    df["rolling"] = df["value"].rolling(7, min_periods=1).mean()

    traces = [
        {
            "type": "scatter",
            "x": df["date"].tolist(),
            "y": [round(v, 2) for v in df["value"]],
            "mode": "markers",
            "name": "Nightly Temp",
            "marker": {"color": t["accent2"], "size": 6, "opacity": 0.65, "symbol": "circle"},
            "hovertemplate": "<b>Wrist Temp</b><br>📅 %{x|%b %d, %Y}<br>🌡️ <b>%{y:.2f} °C</b><extra></extra>",
        },
        {
            "type": "scatter",
            "x": df["date"].tolist(),
            "y": [round(v, 2) for v in df["rolling"]],
            "mode": "lines",
            "name": "7-day avg",
            "line": {"color": t["accent2"], "width": 2.5, "shape": "spline"},
            "hovertemplate": "<b>7-Day Avg Temp</b><br>📅 %{x|%b %d, %Y}<br>🌡️ <b>%{y:.2f} °C</b><extra></extra>",
            "fill": "tozeroy",
            "fillcolor": "rgba(244,63,94,0.06)",
        },
    ]

    layout = _layout(theme)
    layout["yaxis"]["title"] = {"text": "°C", "font": {"size": 10}}
    return {"traces": traces, "layout": layout}


# ── Heart Rate Curve Builder ────────────────────────────────────────────────

def _build_hr_curve(minutes: int, avg_hr: float, max_hr: float) -> tuple[list, list]:
    """Generate a realistic HR profile for a workout of given duration.
    
    Uses a physiological model:
    - Warmup: ramp from resting (~65 bpm) to avg over first ~10% of duration
    - Sustained: oscillate around avg_hr (± 5-8%), with a peak at ~60% mark
    - Cooldown: drop from avg toward resting over last ~15%
    
    Returns (time_labels_list, hr_values_list).
    """
    import math, random

    resting = 65.0
    warmup_mins = max(3, int(minutes * 0.10))
    cooldown_mins = max(3, int(minutes * 0.15))
    sustain_mins = minutes - warmup_mins - cooldown_mins

    times = []
    hrs = []

    rng = random.Random(42)  # deterministic seed for consistent shape

    # Warmup ramp
    for i in range(warmup_mins):
        t = i
        frac = i / max(1, warmup_mins - 1)
        hr = resting + (avg_hr - resting) * (frac ** 0.6)
        hr += rng.uniform(-2, 2)
        times.append(t)
        hrs.append(round(hr, 1))

    # Sustained effort with natural drift and a peak
    peak_offset = int(sustain_mins * 0.55)
    for i in range(sustain_mins):
        t = warmup_mins + i
        # Base oscillation
        wave = math.sin(i / max(1, sustain_mins) * math.pi * 3) * 4
        # Gradual cardiac drift upward ~5%
        drift = avg_hr * 0.05 * (i / max(1, sustain_mins))
        # Peak bump
        peak_dist = abs(i - peak_offset)
        peak_bump = max(0, (max_hr - avg_hr) * 0.5 * math.exp(-peak_dist / max(1, sustain_mins * 0.12)))
        hr = avg_hr + drift + wave + peak_bump + rng.uniform(-3, 3)
        hr = max(avg_hr * 0.85, min(max_hr, hr))
        times.append(t)
        hrs.append(round(hr, 1))

    # Cooldown
    last_hr = hrs[-1] if hrs else avg_hr
    for i in range(cooldown_mins):
        t = warmup_mins + sustain_mins + i
        frac = (i + 1) / cooldown_mins
        hr = last_hr + (resting + 15 - last_hr) * frac
        hr += rng.uniform(-1.5, 1.5)
        times.append(t)
        hrs.append(round(hr, 1))

    return times, hrs
