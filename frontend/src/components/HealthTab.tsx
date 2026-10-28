import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, appleHealthApi, MetricEntry } from '../api/client';
import { KpiCard } from './KpiCard';
import { PlotlyChart } from './PlotlyChart';
import { THEMES, ThemeName } from '../theme/colors';
import {
  Heart, Moon, Zap, Activity as ActivityIcon, Flame, Footprints,
  Thermometer, Clock, Sparkles, Layers, TrendingDown, Footprints as WalkingIcon
} from 'lucide-react';

interface HealthTabProps {
  startDate: string;
  endDate: string;
  theme: ThemeName;
}

export const HealthTab: React.FC<HealthTabProps> = ({ startDate, endDate, theme }) => {
  const t = THEMES[theme];
  const [gender, setGender] = useState<'male' | 'female'>('male');

  // Unified summary KPIs
  const { data: summary } = useQuery({
    queryKey: ['healthSummary', startDate, endDate],
    queryFn: () => api.getHealthSummary(startDate, endDate),
  });

  // Dedicated Heart Timelines
  const { data: heartData, isLoading: loadingHeart } = useQuery({
    queryKey: ['heartTimeline', startDate, endDate],
    queryFn: () => api.getHeartTimeline(startDate, endDate),
  });

  // Apple Health Plotly Dashboards
  const { data: vo2Data, isLoading: loadingVo2 } = useQuery({
    queryKey: ['vo2', startDate, endDate, gender, theme],
    queryFn: () => appleHealthApi.getVo2(startDate, endDate, gender, theme),
  });

  const { data: sleepStagesData, isLoading: loadingStages } = useQuery({
    queryKey: ['sleepStages', startDate, endDate, theme],
    queryFn: () => appleHealthApi.getSleepStages(startDate, endDate, theme),
  });

  const { data: sleepDurationData, isLoading: loadingDuration } = useQuery({
    queryKey: ['sleepDuration', startDate, endDate, theme],
    queryFn: () => appleHealthApi.getSleepDuration(startDate, endDate, theme),
  });

  const { data: sleepConsistencyData, isLoading: loadingConsistency } = useQuery({
    queryKey: ['sleepConsistency', startDate, endDate, theme],
    queryFn: () => appleHealthApi.getSleepConsistency(startDate, endDate, theme),
  });

  const { data: wristTempData, isLoading: loadingWristTemp } = useQuery({
    queryKey: ['wristTemp', startDate, endDate, theme],
    queryFn: () => appleHealthApi.getWristTemp(startDate, endDate, theme),
  });

  // ── Data gap filling: create full date range, linearly interpolate missing values
  const fillDataGaps = (entries: MetricEntry[]): MetricEntry[] => {
    if (entries.length < 2) return entries;
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const startD = new Date(sorted[0].date);
    const endD = new Date(sorted[sorted.length - 1].date);
    const byDate = new Map(sorted.map((e) => [e.date, e]));
    const filled: MetricEntry[] = [];
    const cursor = new Date(startD);
    while (cursor <= endD) {
      const key = cursor.toISOString().slice(0, 10);
      if (byDate.has(key)) {
        filled.push(byDate.get(key)!);
      } else {
        // find nearest neighbours for linear interpolation
        const before = filled.filter((e) => e.date < key);
        const after = sorted.filter((e) => e.date > key);
        if (before.length > 0 && after.length > 0) {
          const bEntry = before[before.length - 1];
          const aEntry = after[0];
          const bDate = new Date(bEntry.date).getTime();
          const aDate = new Date(aEntry.date).getTime();
          const cDate = cursor.getTime();
          const frac = (cDate - bDate) / (aDate - bDate);
          const interp = bEntry.value + frac * (aEntry.value - bEntry.value);
          filled.push({ date: key, value: Math.round(interp * 10) / 10, source: bEntry.source, id: bEntry.id, metric_type: bEntry.metric_type, unit: bEntry.unit, timestamp: null });
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return filled;
  };

  // Helper to build rolling average
  const buildRollingAvg = (entries: MetricEntry[], windowSize = 7) => {
    if (entries.length < windowSize) return [];
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.map((entry, idx) => {
      const windowSlice = sorted.slice(Math.max(0, idx - windowSize + 1), idx + 1);
      const avg = windowSlice.reduce((acc, curr) => acc + curr.value, 0) / windowSlice.length;
      return { date: entry.date, value: Math.round(avg * 10) / 10 };
    });
  };

  // 1. Resting HR Traces
  const buildRhrTraces = () => {
    if (!heartData?.resting_hr) return [];
    const garmin = heartData.resting_hr.filter((r) => r.source === 'garmin');
    const apple = heartData.resting_hr.filter((r) => r.source === 'apple_health');
    const traces: any[] = [];

    if (garmin.length > 0) {
      const filled = fillDataGaps(garmin);
      traces.push({
        x: filled.map((r) => r.date),
        y: filled.map((r) => r.value),
        name: 'Garmin RHR',
        type: 'scatter',
        mode: 'lines+markers',
        connectgaps: true,
        line: { color: t.garminColor, width: 2, shape: 'spline', smoothing: 0.8 },
        marker: { size: 4, color: t.garminColor, opacity: 0.9, symbol: 'circle' },
        hovertemplate: '<b>Garmin RHR</b>  %{y:.0f} bpm<extra></extra>',
      });
    }

    if (apple.length > 0) {
      const filled = fillDataGaps(apple);
      traces.push({
        x: filled.map((r) => r.date),
        y: filled.map((r) => r.value),
        name: 'Apple RHR',
        type: 'scatter',
        mode: 'lines+markers',
        connectgaps: true,
        line: { color: t.appleColor, width: 2, dash: 'dot', shape: 'spline', smoothing: 0.8 },
        marker: { size: 4, color: t.appleColor, opacity: 0.9, symbol: 'circle' },
        hovertemplate: '<b>Apple RHR</b>  %{y:.0f} bpm<extra></extra>',
      });
    }

    const base = apple.length > 0 ? apple : garmin;
    const rolling = buildRollingAvg(fillDataGaps(base));
    if (rolling.length > 0) {
      traces.push({
        x: rolling.map((r) => r.date),
        y: rolling.map((r) => r.value),
        name: '7-Day Avg',
        type: 'scatter',
        mode: 'lines',
        connectgaps: true,
        line: { color: '#F59E0B', width: 2.5, shape: 'spline', smoothing: 1.3 },
        hovertemplate: '<b>7-Day Avg</b>  %{y:.1f} bpm<extra></extra>',
      });
    }

    return traces;
  };

  // 2. Normal / Ambient HR Traces
  const buildNormalHrTraces = () => {
    if (!heartData?.heart_rate) return [];
    const sorted = fillDataGaps(
      [...heartData.heart_rate].sort((a, b) => a.date.localeCompare(b.date))
    );
    const traces: any[] = [
      {
        x: sorted.map((r) => r.date),
        y: sorted.map((r) => r.value),
        name: 'Daily Avg HR',
        type: 'scatter',
        mode: 'markers',
        connectgaps: true,
        marker: { size: 5, color: t.heartColor, opacity: 0.55, symbol: 'circle' },
        hovertemplate: '<b>Daily Avg HR</b>  %{y:.0f} bpm<extra></extra>',
      },
    ];

    const rolling = buildRollingAvg(sorted);
    if (rolling.length > 0) {
      traces.push({
        x: rolling.map((r) => r.date),
        y: rolling.map((r) => r.value),
        name: '7-Day Baseline',
        type: 'scatter',
        mode: 'lines',
        connectgaps: true,
        line: { color: '#EC4899', width: 2.5, shape: 'spline', smoothing: 1.2 },
        fill: 'tonexty',
        fillcolor: 'rgba(236,72,153,0.06)',
        hovertemplate: '<b>7-Day Avg</b>  %{y:.1f} bpm<extra></extra>',
      });
    }
    return traces;
  };

  // 3. HRV SDNN Traces
  const buildHrvTraces = () => {
    if (!heartData?.hrv) return [];
    const sorted = [...heartData.hrv].sort((a, b) => a.date.localeCompare(b.date));
    const apple = fillDataGaps(sorted.filter((r) => r.source === 'apple_health'));
    const garmin = fillDataGaps(sorted.filter((r) => r.source === 'garmin'));
    const traces: any[] = [];

    // HRV healthy reference band 25–65 ms
    const allDates = sorted.map((r) => r.date);
    if (allDates.length > 0) {
      traces.push({
        x: [...allDates, ...allDates.slice().reverse()],
        y: [...allDates.map(() => 65), ...allDates.map(() => 25)],
        fill: 'toself',
        fillcolor: 'rgba(16,185,129,0.08)',
        line: { color: 'transparent' },
        name: 'Healthy Range',
        showlegend: true,
        hoverinfo: 'skip',
        type: 'scatter',
        mode: 'none',
      });
    }

    if (apple.length > 0) {
      traces.push({
        x: apple.map((r) => r.date),
        y: apple.map((r) => r.value),
        name: 'Apple HRV',
        type: 'scatter',
        mode: 'lines+markers',
        connectgaps: true,
        line: { color: t.hrvColor, width: 2, shape: 'spline', smoothing: 0.9 },
        marker: { size: 4, color: t.hrvColor, opacity: 0.9, symbol: 'circle' },
        hovertemplate: '<b>Apple HRV</b>  %{y:.1f} ms<extra></extra>',
      });
    }

    if (garmin.length > 0) {
      traces.push({
        x: garmin.map((r) => r.date),
        y: garmin.map((r) => r.value),
        name: 'Garmin HRV',
        type: 'scatter',
        mode: 'lines+markers',
        connectgaps: true,
        line: { color: '#06B6D4', width: 2, dash: 'dot', shape: 'spline', smoothing: 0.9 },
        marker: { size: 4, color: '#06B6D4', opacity: 0.9, symbol: 'diamond' },
        hovertemplate: '<b>Garmin HRV</b>  %{y:.1f} ms<extra></extra>',
      });
    }

    const bestSource = apple.length > 0 ? apple : garmin;
    const rolling = buildRollingAvg(bestSource);
    if (rolling.length > 0) {
      traces.push({
        x: rolling.map((r) => r.date),
        y: rolling.map((r) => r.value),
        name: '7-Day Trend',
        type: 'scatter',
        mode: 'lines',
        connectgaps: true,
        line: { color: '#F59E0B', width: 2.5, shape: 'spline', smoothing: 1.3 },
        hovertemplate: '<b>7-Day Avg</b>  %{y:.1f} ms<extra></extra>',
      });
    }

    return traces;
  };

  // 4. Walking HR & Recovery Traces
  const buildWalkingAndRecoveryTraces = () => {
    const traces: any[] = [];
    if (heartData?.walking_hr && heartData.walking_hr.length > 0) {
      const filled = fillDataGaps([...heartData.walking_hr].sort((a, b) => a.date.localeCompare(b.date)));
      traces.push({
        x: filled.map((r) => r.date),
        y: filled.map((r) => r.value),
        name: 'Walking HR',
        type: 'scatter',
        mode: 'lines+markers',
        connectgaps: true,
        line: { color: '#10B981', width: 2, shape: 'spline', smoothing: 0.9 },
        marker: { size: 4, color: '#10B981', opacity: 0.85 },
        hovertemplate: '<b>Walking HR</b>  %{y:.0f} bpm<extra></extra>',
        yaxis: 'y',
      });
    }

    if (heartData?.hr_recovery && heartData.hr_recovery.length > 0) {
      const filled = fillDataGaps([...heartData.hr_recovery].sort((a, b) => a.date.localeCompare(b.date)));
      traces.push({
        x: filled.map((r) => r.date),
        y: filled.map((r) => r.value),
        name: '1-Min Recovery',
        type: 'scatter',
        mode: 'lines+markers',
        connectgaps: true,
        line: { color: '#F59E0B', width: 2, dash: 'dot', shape: 'spline', smoothing: 0.9 },
        marker: { size: 4, color: '#F59E0B', opacity: 0.85, symbol: 'triangle-up' },
        hovertemplate: '<b>Recovery Drop</b>  %{y:.0f} bpm<extra></extra>',
        yaxis: 'y2',
      });
    }
    return traces;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
      {/* KPI Cards Row */}
      <div className="kpi-grid">
        <KpiCard
          title="Resting Heart Rate"
          value={summary?.avg_resting_hr ?? null}
          unit="bpm"
          subtext="Nocturnal baseline"
          color="#F43F5E"
          icon={<Heart size={18} />}
        />
        <KpiCard
          title="Normal Heart Rate"
          value={summary?.avg_normal_hr ?? null}
          unit="bpm"
          subtext="Ambient daily average"
          color="#EC4899"
          icon={<Heart size={18} />}
        />
        <KpiCard
          title="Heart Rate Variability"
          value={summary?.avg_hrv ?? null}
          unit="ms"
          subtext="Autonomic recovery (SDNN)"
          color="#818CF8"
          icon={<ActivityIcon size={18} />}
        />
        <KpiCard
          title="Walking HR Average"
          value={summary?.avg_walking_hr ?? null}
          unit="bpm"
          subtext="Steady-state load"
          color="#10B981"
          icon={<WalkingIcon size={18} />}
        />
        <KpiCard
          title="Cardio Fitness (VO2 Max)"
          value={summary?.avg_vo2max ?? null}
          unit="ml/kg/min"
          subtext="Aerobic capacity"
          color="#38BDF8"
          icon={<Zap size={18} />}
        />
        <KpiCard
          title="Average Sleep"
          value={summary?.avg_sleep_hours ?? null}
          unit="hrs / night"
          subtext="Sleep duration"
          color="#60A5FA"
          icon={<Moon size={18} />}
        />
      </div>

      {/* ── Section 1: Separate Heart Timelines ───────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="section-title-banner">
          <h3>
            <Heart size={20} color="#F43F5E" />
            Dedicated Heart Timelines
          </h3>
          <span className="section-tag">Resting, Normal, HRV & Recovery</span>
        </div>

        <div className="grid-2col">
          {/* Timeline 1: Resting Heart Rate */}
          <div className="chart-card">
            <div className="chart-header">
              <div className="chart-title-group">
                <h2>
                  <Heart size={18} color="#F43F5E" />
                  Resting Heart Rate Timeline
                </h2>
                <p className="chart-subtitle">
                  Daily resting heart rate comparing Apple Health and Garmin Connect baselines.
                </p>
              </div>
              <div className="chart-controls">
                <span className="badge badge-garmin">Garmin</span>
                <span className="badge badge-apple">Apple</span>
              </div>
            </div>
            {buildRhrTraces().length > 0 ? (
              <PlotlyChart
                data={buildRhrTraces()}
                layout={{
                  yaxis: { title: { text: 'bpm', font: { size: 10 } }, rangemode: 'normal' },
                }}
                theme={theme}
                height={248}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                {loadingHeart ? 'Loading Resting HR...' : 'No Resting Heart Rate data recorded.'}
              </div>
            )}
          </div>

          {/* Timeline 2: Normal / Continuous Heart Rate */}
          <div className="chart-card">
            <div className="chart-header">
              <div className="chart-title-group">
                <h2>
                  <Heart size={18} color="#EC4899" />
                  Normal / Daytime Heart Rate Timeline
                </h2>
                <p className="chart-subtitle">
                  Ambient daily daytime heart rate measurements and 7-day average baseline.
                </p>
              </div>
            </div>
            {buildNormalHrTraces().length > 0 ? (
              <PlotlyChart
                data={buildNormalHrTraces()}
                layout={{
                  yaxis: { title: { text: 'bpm', font: { size: 10 } }, rangemode: 'normal' },
                }}
                theme={theme}
                height={248}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                {loadingHeart ? 'Loading Normal HR...' : 'No daytime heart rate records found.'}
              </div>
            )}
          </div>

          {/* Timeline 3: Heart Rate Variability (HRV) */}
          <div className="chart-card">
            <div className="chart-header">
              <div className="chart-title-group">
                <h2>
                  <ActivityIcon size={18} color="#818CF8" />
                  Heart Rate Variability (HRV) Timeline
                </h2>
                <p className="chart-subtitle">
                  Nocturnal and recovery HRV SDNN (ms) tracking autonomic nervous system balance.
                </p>
              </div>
            </div>
            {buildHrvTraces().length > 0 ? (
              <PlotlyChart
                data={buildHrvTraces()}
                layout={{
                  yaxis: { title: { text: 'HRV SDNN (ms)', font: { size: 10 } }, rangemode: 'normal' },
                }}
                theme={theme}
                height={248}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                {loadingHeart ? 'Loading HRV...' : 'No HRV measurements available.'}
              </div>
            )}
          </div>

          {/* Timeline 4: Walking Heart Rate & Recovery */}
          <div className="chart-card">
            <div className="chart-header">
              <div className="chart-title-group">
                <h2>
                  <WalkingIcon size={18} color="#10B981" />
                  Walking HR & Heart Rate Recovery
                </h2>
                <p className="chart-subtitle">
                  Walking cardiovascular efficiency and 1-minute post-exercise recovery rate.
                </p>
              </div>
            </div>
            {buildWalkingAndRecoveryTraces().length > 0 ? (
              <PlotlyChart
                data={buildWalkingAndRecoveryTraces()}
                layout={{
                  yaxis: { title: { text: 'Walking HR (bpm)', font: { size: 10 } }, rangemode: 'normal' },
                  yaxis2: {
                    title: { text: 'Recovery (bpm)', font: { size: 10 } },
                    overlaying: 'y',
                    side: 'right',
                    showgrid: false,
                    rangemode: 'normal',
                  },
                }}
                theme={theme}
                height={248}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                {loadingHeart ? 'Loading Walking HR...' : 'No walking HR or recovery records found.'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 2: Cardio Fitness & Sleep Architecture ────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="section-title-banner">
          <h3>
            <Moon size={20} color="#38BDF8" />
            Cardio Fitness & Sleep Architecture Dashboards
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="section-tag">Apple Health Analytics</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                className={`preset-btn ${gender === 'male' ? 'active' : ''}`}
                onClick={() => setGender('male')}
              >
                Male Zones
              </button>
              <button
                className={`preset-btn ${gender === 'female' ? 'active' : ''}`}
                onClick={() => setGender('female')}
              >
                Female Zones
              </button>
            </div>
          </div>
        </div>

        <div className="grid-2col">
          {/* VO2 Max Trend */}
          <div className="chart-card">
            <div className="chart-header">
              <div className="chart-title-group">
                <h2>
                  <Zap size={18} color="#38BDF8" />
                  VO2 Max Trend & Fitness Classifications
                </h2>
                <p className="chart-subtitle">
                  Aerobic cardio fitness relative to Apple Health population zones.
                </p>
              </div>
            </div>
            {vo2Data && vo2Data.traces && vo2Data.traces.length > 0 ? (
              <PlotlyChart
                data={vo2Data.traces}
                layout={vo2Data.layout}
                theme={theme}
                height={256}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                {loadingVo2 ? 'Loading VO2 Max...' : 'No VO2 Max recorded for this period.'}
              </div>
            )}
          </div>

          {/* Sleep Stages Weekly */}
          <div className="chart-card">
            <div className="chart-header">
              <div className="chart-title-group">
                <h2>
                  <Layers size={18} color="#818CF8" />
                  Sleep Stages — Weekly Breakdown
                </h2>
                <p className="chart-subtitle">
                  Weekly distribution of Deep, Core/Light, REM, and Awake hours per night.
                </p>
              </div>
            </div>
            {sleepStagesData && sleepStagesData.traces && sleepStagesData.traces.length > 0 ? (
              <PlotlyChart
                data={sleepStagesData.traces}
                layout={sleepStagesData.layout}
                theme={theme}
                height={256}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                {loadingStages ? 'Loading Sleep Stages...' : 'No sleep stages data for this period.'}
              </div>
            )}
          </div>

          {/* Sleep Duration Trend */}
          <div className="chart-card">
            <div className="chart-header">
              <div className="chart-title-group">
                <h2>
                  <Clock size={18} color="#38BDF8" />
                  Sleep Duration Trend
                </h2>
                <p className="chart-subtitle">
                  Nightly duration with 7-day rolling trendline and 8-hour target baseline.
                </p>
              </div>
            </div>
            {sleepDurationData && sleepDurationData.traces && sleepDurationData.traces.length > 0 ? (
              <PlotlyChart
                data={sleepDurationData.traces}
                layout={sleepDurationData.layout}
                theme={theme}
                height={256}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                {loadingDuration ? 'Loading Sleep Duration...' : 'No sleep duration recorded.'}
              </div>
            )}
          </div>

          {/* Sleep Consistency */}
          <div className="chart-card">
            <div className="chart-header">
              <div className="chart-title-group">
                <h2>
                  <Sparkles size={18} color="#F59E0B" />
                  Sleep Consistency (Circadian Rhythm)
                </h2>
                <p className="chart-subtitle">
                  Bedtime and Wake-up timing consistency with 7-day trajectory.
                </p>
              </div>
            </div>
            {sleepConsistencyData && sleepConsistencyData.traces && sleepConsistencyData.traces.length > 0 ? (
              <PlotlyChart
                data={sleepConsistencyData.traces}
                layout={sleepConsistencyData.layout}
                theme={theme}
                height={256}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                {loadingConsistency ? 'Loading Sleep Consistency...' : 'No sleep schedule data found.'}
              </div>
            )}
          </div>

          {/* Sleeping Wrist Temperature */}
          <div className="chart-card" style={{ gridColumn: 'span 2' }}>
            <div className="chart-header">
              <div className="chart-title-group">
                <h2>
                  <Thermometer size={18} color="#F43F5E" />
                  Sleeping Wrist Temperature
                </h2>
                <p className="chart-subtitle">
                  Apple Watch nocturnal temperature baseline tracking (°C).
                </p>
              </div>
            </div>
            {wristTempData && wristTempData.traces && wristTempData.traces.length > 0 ? (
              <PlotlyChart
                data={wristTempData.traces}
                layout={wristTempData.layout}
                theme={theme}
                height={240}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
                {loadingWristTemp ? 'Loading Wrist Temperature...' : 'No nocturnal wrist temperature data.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
