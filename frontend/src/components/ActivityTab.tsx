import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, Activity } from '../api/client';
import { PlotlyChart } from './PlotlyChart';
import { THEMES, ThemeName, SPORT_COLORS } from '../theme/colors';
import {
  Flame, Clock, MapPin, Heart, Gauge, Mountain, Zap, Navigation,
  Activity as ActivityIcon, Filter, Award, Dumbbell, TrendingUp,
  Route, HeartPulse, ChevronRight, BarChart3, Info
} from 'lucide-react';

interface ActivityTabProps {
  startDate?: string;
  endDate?: string;
  theme: ThemeName;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

function formatDistance(meters: number | null): string | null {
  if (!meters || meters < 10) return null;
  const km = meters / 1000;
  return km >= 1 ? `${km.toFixed(2)} km` : `${Math.round(meters)} m`;
}

function formatPace(speedMs: number | null): string | null {
  if (!speedMs || speedMs <= 0) return null;
  const secPerKm = 1000 / speedMs;
  const mins = Math.floor(secPerKm / 60);
  const secs = Math.floor(secPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, '0')} /km`;
}

function formatSpeed(speedMs: number | null): string | null {
  if (!speedMs || speedMs <= 0) return null;
  return `${(speedMs * 3.6).toFixed(1)} km/h`;
}

const SPORT_ICONS: Record<string, React.ReactNode> = {
  running: <Route size={15} />,
  cycling: <Gauge size={15} />,
  hiking: <Mountain size={15} />,
  swimming: <Navigation size={15} />,
  strength: <Dumbbell size={15} />,
  hiit: <Zap size={15} />,
  cardio: <HeartPulse size={15} />,
  walking: <ActivityIcon size={15} />,
  yoga: <Award size={15} />,
  rowing: <TrendingUp size={15} />,
};

function getIntensityLabel(avgHr: number, maxHr = 190): string {
  const pct = avgHr / maxHr;
  if (pct >= 0.9) return 'Max Effort';
  if (pct >= 0.8) return 'Hard';
  if (pct >= 0.7) return 'Moderate';
  if (pct >= 0.6) return 'Aerobic';
  return 'Easy';
}

function getIntensityColor(avgHr: number, maxHr = 190): string {
  const pct = avgHr / maxHr;
  if (pct >= 0.9) return '#EF4444';
  if (pct >= 0.8) return '#F97316';
  if (pct >= 0.7) return '#F59E0B';
  if (pct >= 0.6) return '#10B981';
  return '#38BDF8';
}

// ── HR Zone Bar ───────────────────────────────────────────────────────────────

function HrZoneBar({ avgHr, maxHr = 190 }: { avgHr: number; maxHr?: number }) {
  const pct = Math.min(100, Math.round((avgHr / maxHr) * 100));
  const color = getIntensityColor(avgHr, maxHr);
  const label = getIntensityLabel(avgHr, maxHr);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        <span>Cardiovascular Load</span>
        <span style={{ color, fontWeight: 600 }}>{label} — {pct}% max HR</span>
      </div>
      <div style={{ width: '100%', height: '7px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
        {/* Zone gradient background */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(90deg, #38BDF8 0%, #10B981 35%, #F59E0B 65%, #F97316 85%, #EF4444 100%)',
          opacity: 0.25,
        }} />
        <div style={{
          width: `${pct}%`, height: '100%',
          background: `linear-gradient(90deg, #38BDF8 0%, #10B981 35%, #F59E0B 65%, ${color} 100%)`,
          borderRadius: '4px',
          transition: 'width 0.6s ease',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-subtle)' }}>
        {['Z1', 'Z2', 'Z3', 'Z4', 'Z5'].map((z, i) => (
          <span key={z} style={{ opacity: pct > i * 20 ? 1 : 0.4, fontWeight: 500 }}>{z}</span>
        ))}
      </div>
    </div>
  );
}

// ── Route / Map Panel ─────────────────────────────────────────────────────────

function RoutePanel({ activity }: { activity: Activity }) {
  const hasGps = activity.source === 'garmin'; // only Garmin may have GPS
  const sportColor = SPORT_COLORS[activity.activity_type] || '#38BDF8';

  // For now: Apple Health never exports GPS; Garmin would need map tiles
  return (
    <div style={{
      borderRadius: '14px',
      border: '1px solid var(--border)',
      overflow: 'hidden',
      position: 'relative',
      background: 'var(--card)',
      minHeight: '200px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {/* Decorative topographic-style background */}
      <svg width="100%" height="200" viewBox="0 0 600 200" style={{ position: 'absolute', top: 0, left: 0, opacity: 0.12 }} aria-hidden>
        <defs>
          <radialGradient id="mapGrad" cx="50%" cy="50%">
            <stop offset="0%" stopColor={sportColor} stopOpacity="0.8" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>
        {/* Topo rings */}
        {[180, 150, 120, 90, 60].map((r, i) => (
          <ellipse key={i} cx="300" cy="100" rx={r * 1.6} ry={r * 0.7}
            fill="none" stroke={sportColor} strokeWidth="1.5" opacity={0.5 - i * 0.08} />
        ))}
        {/* Simulated path */}
        <path d="M 80,130 C 150,90 200,120 270,80 S 380,110 450,70 S 530,90 560,85"
          fill="none" stroke={sportColor} strokeWidth="3" strokeLinecap="round"
          opacity="0.7" strokeDasharray="6 4" />
        <circle cx="80" cy="130" r="6" fill={sportColor} opacity="0.9" />
        <circle cx="560" cy="85" r="6" fill={sportColor} opacity="0.9" />
      </svg>

      {/* Content overlay */}
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '32px 24px' }}>
        <div style={{
          width: '44px', height: '44px', borderRadius: '50%',
          background: `${sportColor}20`, border: `2px solid ${sportColor}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 12px',
          color: sportColor,
        }}>
          <MapPin size={20} />
        </div>
        <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text)', marginBottom: '6px' }}>
          {hasGps ? 'Route Available' : 'GPS Route Not Available'}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '220px', lineHeight: 1.5 }}>
          {hasGps
            ? 'Garmin route data will be displayed here once map tiles are configured.'
            : 'Apple Health does not export GPS route data. Connect Garmin to see route maps.'}
        </div>
        {activity.distance_meters && activity.distance_meters > 100 && (
          <div style={{
            marginTop: '14px', display: 'flex', gap: '20px', justifyContent: 'center',
            fontSize: '0.85rem',
          }}>
            <span style={{ color: sportColor, fontWeight: 700 }}>
              {formatDistance(activity.distance_meters)}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>
              {formatDuration(activity.duration_seconds)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── HR Chart Panel ────────────────────────────────────────────────────────────

function HrChartPanel({ activity, theme }: { activity: Activity; theme: ThemeName }) {
  const { data: hrChart, isLoading } = useQuery({
    queryKey: ['activityHr', activity.id, theme],
    queryFn: () => api.getActivityHrChart(activity.id, theme),
    staleTime: Infinity,
  });

  const hasData = hrChart && hrChart.traces && hrChart.traces.length > 0;

  if (isLoading) {
    return (
      <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>Loading heart rate…</div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div style={{
        height: '180px', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '8px',
        color: 'var(--text-muted)', fontSize: '0.88rem',
        border: '1px dashed var(--border)', borderRadius: '10px',
      }}>
        <Heart size={28} opacity={0.4} />
        <span>No heart rate data recorded for this activity</span>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-subtle)' }}>
          Apple Watch or chest strap required during workout
        </span>
      </div>
    );
  }

  return (
    <PlotlyChart
      data={hrChart.traces}
      layout={{
        ...hrChart.layout,
        autosize: true,
      }}
      theme={theme}
      height={220}
    />
  );
}

// ── Stat Metric Block ─────────────────────────────────────────────────────────

function StatBlock({ label, value, unit, color }: {
  label: string; value: string | number | null; unit?: string; color?: string;
}) {
  if (!value && value !== 0) return null;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '4px',
      padding: '12px 14px',
      background: 'var(--bg)',
      borderRadius: '10px',
      border: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </span>
      <span style={{ fontSize: '1.2rem', fontWeight: 700, color: color || 'var(--text)', lineHeight: 1.1 }}>
        {value}{unit && <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-muted)', marginLeft: '3px' }}>{unit}</span>}
      </span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export const ActivityTab: React.FC<ActivityTabProps> = ({ startDate, endDate, theme }) => {
  const t = THEMES[theme];
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [detailView, setDetailView] = useState<'stats' | 'hr' | 'map'>('stats');

  const { data: metaData } = useQuery({
    queryKey: ['meta'],
    queryFn: () => api.getMeta(),
  });

  const { data: actData, isLoading } = useQuery({
    queryKey: ['activities', selectedType, startDate, endDate],
    queryFn: () => api.getActivities(selectedType, startDate, endDate),
  });

  const { data: summary } = useQuery({
    queryKey: ['activitySummary', selectedType, startDate, endDate],
    queryFn: () => api.getActivitySummary(selectedType, startDate, endDate),
  });

  const activities = actData?.activities || [];
  const activityTypes = metaData?.activity_types || [];

  const selectedActivity = useMemo(
    () => activities.find((a) => a.id === selectedActivityId) || activities[0] || null,
    [activities, selectedActivityId],
  );

  // Donut chart for type breakdown
  const breakdownChart = useMemo(() => {
    if (!summary?.type_breakdown?.length) return [];
    const labels = summary.type_breakdown.map((b) => b.type.charAt(0).toUpperCase() + b.type.slice(1));
    const values = summary.type_breakdown.map((b) => Math.round((b.duration_sec / 3600) * 10) / 10);
    const colors = summary.type_breakdown.map((b) => SPORT_COLORS[b.type] || '#64748B');
    return [{
      values, labels, type: 'pie', hole: 0.65,
      marker: { colors },
      textinfo: 'label+percent',
      hovertemplate: '<b>%{label}</b><br>%{value} hrs (%{percent})<extra></extra>',
    }];
  }, [summary]);

  // Monthly volume bar
  const volumeChart = useMemo(() => {
    if (!activities.length) return [];
    const byMonth: Record<string, Record<string, number>> = {};
    activities.forEach((a) => {
      const month = a.start_time.slice(0, 7);
      if (!byMonth[month]) byMonth[month] = {};
      byMonth[month][a.activity_type] = (byMonth[month][a.activity_type] || 0) + (a.duration_seconds / 60);
    });
    const months = Object.keys(byMonth).sort();
    const types = [...new Set(activities.map((a) => a.activity_type))];

    return types.map((type) => ({
      type: 'bar' as const,
      name: type.charAt(0).toUpperCase() + type.slice(1),
      x: months,
      y: months.map((m) => Math.round((byMonth[m]?.[type] || 0) * 10) / 10),
      marker: { color: SPORT_COLORS[type] || '#64748B', line: { width: 0 } },
      hovertemplate: `${type}: %{y} min<extra></extra>`,
    }));
  }, [activities]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* ── Overview KPI Banner ─────────────────────────────────────────── */}
      {summary && (
        <div className="hero-stats-banner">
          <div className="hero-stat-block">
            <span className="hero-stat-label">Total Sessions</span>
            <span className="hero-stat-val">{summary.total_count}</span>
          </div>
          <div className="hero-stat-block">
            <span className="hero-stat-label">Total Duration</span>
            <span className="hero-stat-val">{formatDuration(summary.total_duration_sec)}</span>
          </div>
          <div className="hero-stat-block">
            <span className="hero-stat-label">Total Distance</span>
            <span className="hero-stat-val">
              {summary.total_distance_m > 0 ? (summary.total_distance_m / 1000).toFixed(1) + ' km' : '—'}
            </span>
          </div>
          <div className="hero-stat-block">
            <span className="hero-stat-label">Calories Burned</span>
            <span className="hero-stat-val">{Math.round(summary.total_calories).toLocaleString()} kcal</span>
          </div>
          {summary.avg_hr && (
            <div className="hero-stat-block">
              <span className="hero-stat-label">Avg Heart Rate</span>
              <span className="hero-stat-val" style={{ color: '#F43F5E' }}>
                {Math.round(summary.avg_hr)} <span style={{ fontSize: '0.9rem' }}>bpm</span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Sport Type Filter ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Filter size={15} color="var(--text-muted)" />
        {['all', ...activityTypes].map((type) => {
          const isActive = selectedType === type;
          const color = SPORT_COLORS[type] || 'var(--accent)';
          return (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '0.85rem',
                fontWeight: isActive ? 600 : 500,
                background: isActive ? `${color}20` : 'var(--card)',
                color: isActive ? color : 'var(--text-muted)',
                border: `1px solid ${isActive ? color : 'var(--border)'}`,
                transition: 'all 0.15s ease',
                cursor: 'pointer',
              }}
            >
              {SPORT_ICONS[type] || <ActivityIcon size={13} />}
              {type === 'all' ? 'All Sports' : type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          );
        })}
      </div>

      {/* ── Two-Column Layout: List + Detail ───────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '340px 1fr',
        gap: '20px',
        alignItems: 'start',
      }}>

        {/* Left: Activity List */}
        <div className="chart-card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>
              Activities <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.88rem' }}>({activities.length})</span>
            </h2>
          </div>

          <div style={{ maxHeight: '650px', overflowY: 'auto' }}>
            {isLoading && (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
            )}
            {!isLoading && activities.length === 0 && (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No activities in selected range.
              </div>
            )}
            {activities.map((act) => {
              const isSelected = act.id === (selectedActivity?.id);
              const sportColor = SPORT_COLORS[act.activity_type] || '#64748B';
              const dateStr = new Date(act.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              const timeStr = new Date(act.start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

              return (
                <div
                  key={act.id}
                  id={`activity-${act.id}`}
                  onClick={() => { setSelectedActivityId(act.id); setDetailView('stats'); }}
                  style={{
                    padding: '12px 16px',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border)',
                    background: isSelected ? `${sportColor}10` : 'transparent',
                    borderLeft: isSelected ? `3px solid ${sportColor}` : '3px solid transparent',
                    transition: 'all 0.15s ease',
                    display: 'flex', alignItems: 'center', gap: '12px',
                  }}
                >
                  {/* Sport icon badge */}
                  <div style={{
                    width: '34px', height: '34px', flexShrink: 0,
                    borderRadius: '10px',
                    background: `${sportColor}20`,
                    border: `1px solid ${sportColor}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: sportColor,
                  }}>
                    {SPORT_ICONS[act.activity_type] || <ActivityIcon size={14} />}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {act.activity_name || (act.activity_type.charAt(0).toUpperCase() + act.activity_type.slice(1))}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', gap: '8px' }}>
                      <span>{dateStr} {timeStr}</span>
                      <span style={{ color: sportColor }}>•</span>
                      <span>{formatDuration(act.duration_seconds)}</span>
                      {act.distance_meters && act.distance_meters > 100 && (
                        <><span style={{ color: sportColor }}>•</span><span>{formatDistance(act.distance_meters)}</span></>
                      )}
                    </div>
                  </div>

                  <ChevronRight size={14} color="var(--text-subtle)" />
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Activity Detail Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {selectedActivity ? (
            <>
              {/* Activity Header Card */}
              <div className="chart-card">
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span className={`badge ${selectedActivity.source === 'garmin' ? 'badge-garmin' : 'badge-apple'}`}>
                        {selectedActivity.source === 'garmin' ? 'Garmin Connect' : 'Apple Health'}
                      </span>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        {new Date(selectedActivity.start_time).toLocaleDateString('en-US', {
                          weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
                        })} · {new Date(selectedActivity.start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                      {selectedActivity.activity_name || (selectedActivity.activity_type.charAt(0).toUpperCase() + selectedActivity.activity_type.slice(1))}
                    </h2>
                  </div>

                  {/* Sport Icon Large */}
                  <div style={{
                    width: '52px', height: '52px', flexShrink: 0,
                    borderRadius: '14px',
                    background: `${SPORT_COLORS[selectedActivity.activity_type] || '#64748B'}20`,
                    border: `1px solid ${SPORT_COLORS[selectedActivity.activity_type] || '#64748B'}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: SPORT_COLORS[selectedActivity.activity_type] || '#64748B',
                  }}>
                    <div style={{ transform: 'scale(1.5)' }}>
                      {SPORT_ICONS[selectedActivity.activity_type] || <ActivityIcon size={20} />}
                    </div>
                  </div>
                </div>

                {/* Core Stats Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
                  <StatBlock label="Duration" value={formatDuration(selectedActivity.duration_seconds)} />
                  {selectedActivity.distance_meters && selectedActivity.distance_meters > 10 && (
                    <StatBlock label="Distance" value={formatDistance(selectedActivity.distance_meters)} />
                  )}
                  {selectedActivity.avg_speed && (
                    <StatBlock
                      label={['running', 'walking', 'hiking'].includes(selectedActivity.activity_type) ? 'Avg Pace' : 'Avg Speed'}
                      value={
                        ['running', 'walking', 'hiking'].includes(selectedActivity.activity_type)
                          ? formatPace(selectedActivity.avg_speed)
                          : formatSpeed(selectedActivity.avg_speed)
                      }
                    />
                  )}
                  {selectedActivity.avg_hr && (
                    <StatBlock label="Avg Heart Rate" value={Math.round(selectedActivity.avg_hr)} unit="bpm" color="#F43F5E" />
                  )}
                  {selectedActivity.max_hr && (
                    <StatBlock label="Max Heart Rate" value={Math.round(selectedActivity.max_hr)} unit="bpm" color="#EF4444" />
                  )}
                  {selectedActivity.calories && selectedActivity.calories > 0 && (
                    <StatBlock label="Calories" value={Math.round(selectedActivity.calories)} unit="kcal" color="#F59E0B" />
                  )}
                  {selectedActivity.elevation_gain != null && (
                    <StatBlock label="Elevation Gain" value={Math.round(selectedActivity.elevation_gain)} unit="m" color="#10B981" />
                  )}
                  {selectedActivity.avg_cadence && (
                    <StatBlock label="Avg Cadence" value={Math.round(selectedActivity.avg_cadence)} unit="spm" />
                  )}
                  {selectedActivity.avg_power && (
                    <StatBlock label="Avg Power" value={Math.round(selectedActivity.avg_power)} unit="W" color="#8B5CF6" />
                  )}
                </div>

                {/* HR Zone bar if we have HR */}
                {selectedActivity.avg_hr && (
                  <div style={{ marginTop: '14px' }}>
                    <HrZoneBar avgHr={selectedActivity.avg_hr} maxHr={selectedActivity.max_hr || 190} />
                  </div>
                )}
              </div>

              {/* Detail View Toggle */}
              <div style={{
                display: 'flex', gap: '6px',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '4px',
                width: 'fit-content',
              }}>
                {([
                  { id: 'stats', label: 'Analytics', icon: <BarChart3 size={14} /> },
                  { id: 'hr', label: 'Heart Rate', icon: <HeartPulse size={14} /> },
                  { id: 'map', label: 'Route Map', icon: <MapPin size={14} /> },
                ] as const).map(({ id, label, icon }) => (
                  <button
                    key={id}
                    onClick={() => setDetailView(id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '7px 16px',
                      borderRadius: '9px',
                      fontSize: '0.85rem',
                      fontWeight: detailView === id ? 700 : 500,
                      color: detailView === id ? '#fff' : 'var(--text-muted)',
                      background: detailView === id ? 'var(--accent-blue)' : 'transparent',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {icon}{label}
                  </button>
                ))}
              </div>

              {/* Detail View Content */}
              {detailView === 'stats' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {/* Training Volume Donut */}
                  <div className="chart-card">
                    <div className="chart-header">
                      <div className="chart-title-group">
                        <h2>Volume by Sport</h2>
                        <p className="chart-subtitle">Hours in selected range</p>
                      </div>
                    </div>
                    {breakdownChart.length > 0 ? (
                      <PlotlyChart
                        data={breakdownChart}
                        layout={{
                          showlegend: true,
                          legend: { orientation: 'h', x: 0, y: -0.15, font: { size: 11 } },
                          margin: { l: 10, r: 10, t: 10, b: 10 },
                        }}
                        theme={theme}
                        height={220}
                      />
                    ) : (
                      <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                        No data
                      </div>
                    )}
                  </div>

                  {/* Monthly volume bar */}
                  <div className="chart-card">
                    <div className="chart-header">
                      <div className="chart-title-group">
                        <h2>Monthly Volume</h2>
                        <p className="chart-subtitle">Minutes per month by sport</p>
                      </div>
                    </div>
                    {volumeChart.length > 0 ? (
                      <PlotlyChart
                        data={volumeChart}
                        layout={{
                          barmode: 'stack',
                          showlegend: false,
                          margin: { l: 40, r: 10, t: 10, b: 36 },
                          bargap: 0.3,
                          xaxis: { tickfont: { size: 10 } },
                          yaxis: { title: { text: 'Minutes', font: { size: 10 } } },
                        }}
                        theme={theme}
                        height={220}
                      />
                    ) : (
                      <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                        No data
                      </div>
                    )}
                  </div>
                </div>
              )}

              {detailView === 'hr' && (
                <div className="chart-card">
                  <div className="chart-header">
                    <div className="chart-title-group">
                      <h2>Heart Rate Profile</h2>
                      <p className="chart-subtitle">
                        Estimated HR curve based on day's average
                        <span style={{ marginLeft: '6px', opacity: 0.7 }}>
                          <Info size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
                          {' '}Model derived — Apple Health stores daily HR averages, not per-activity streams
                        </span>
                      </p>
                    </div>
                  </div>
                  <HrChartPanel activity={selectedActivity} theme={theme} />
                </div>
              )}

              {detailView === 'map' && (
                <div className="chart-card">
                  <div className="chart-header">
                    <div className="chart-title-group">
                      <h2>Route Map</h2>
                      <p className="chart-subtitle">GPS route visualization</p>
                    </div>
                  </div>
                  <RoutePanel activity={selectedActivity} />
                </div>
              )}
            </>
          ) : (
            <div className="chart-card" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '300px', textAlign: 'center' }}>
              <ActivityIcon size={48} color="var(--text-subtle)" style={{ marginBottom: '12px', opacity: 0.4 }} />
              <p style={{ color: 'var(--text-muted)' }}>Select an activity from the left to view details.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
