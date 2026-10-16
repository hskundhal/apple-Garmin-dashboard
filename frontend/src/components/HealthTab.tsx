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
      traces.push({
        x: garmin.map((r) => r.date),
        y: garmin.map((r) => r.value),
        name: 'Garmin RHR',
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: t.garminColor, width: 2.2 },
        marker: { size: 5, color: t.garminColor },
        hovertemplate: '<b>Garmin RHR</b>: %{y:.1f} bpm<br>%{x}<extra></extra>',
      });
    }

    if (apple.length > 0) {
      traces.push({
        x: apple.map((r) => r.date),
        y: apple.map((r) => r.value),
        name: 'Apple RHR',
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: t.appleColor, width: 2.2, dash: 'dot' },
        marker: { size: 5, color: t.appleColor },
        hovertemplate: '<b>Apple RHR</b>: %{y:.1f} bpm<br>%{x}<extra></extra>',
      });
    }

    const rolling = buildRollingAvg(apple.length > 0 ? apple : garmin);
    if (rolling.length > 0) {
      traces.push({
        x: rolling.map((r) => r.date),
        y: rolling.map((r) => r.value),
        name: '7-Day Trend',
        type: 'scatter',
        mode: 'lines',
        line: { color: '#F59E0B', width: 2.5, shape: 'spline' },
        hovertemplate: '<b>7-Day Trend</b>: %{y:.1f} bpm<extra></extra>',
      });
    }

    return traces;
  };

  // 2. Normal / Ambient HR Traces
  const buildNormalHrTraces = () => {
    if (!heartData?.heart_rate) return [];
    const sorted = [...heartData.heart_rate].sort((a, b) => a.date.localeCompare(b.date));
    const traces: any[] = [
      {
        x: sorted.map((r) => r.date),
        y: sorted.map((r) => r.value),
        name: 'Normal HR (Daily Avg)',
        type: 'scatter',
        mode: 'markers',
        marker: { size: 6, color: t.heartColor, opacity: 0.6 },
        hovertemplate: '<b>Daily Avg HR</b>: %{y:.1f} bpm<br>%{x}<extra></extra>',
      },
    ];

    const rolling = buildRollingAvg(sorted);
    if (rolling.length > 0) {
      traces.push({
        x: rolling.map((r) => r.date),
        y: rolling.map((r) => r.value),
        name: '7-Day Avg Baseline',
        type: 'scatter',
        mode: 'lines',
        line: { color: '#EC4899', width: 2.5, shape: 'spline' },
        hovertemplate: '<b>Trend</b>: %{y:.1f} bpm<extra></extra>',
      });
    }
    return traces;
  };

  // 3. HRV SDNN Traces
  const buildHrvTraces = () => {
    if (!heartData?.hrv) return [];
    const sorted = [...heartData.hrv].sort((a, b) => a.date.localeCompare(b.date));
    const apple = sorted.filter((r) => r.source === 'apple_health');
    const garmin = sorted.filter((r) => r.source === 'garmin');
    const traces: any[] = [];

    if (apple.length > 0) {
      traces.push({
        x: apple.map((r) => r.date),
        y: apple.map((r) => r.value),
        name: 'Apple HRV (SDNN)',
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: t.hrvColor, width: 2 },
        marker: { size: 5, color: t.hrvColor },
        hovertemplate: '<b>Apple HRV</b>: %{y:.1f} ms<br>%{x}<extra></extra>',
      });
    }

    if (garmin.length > 0) {
      traces.push({
        x: garmin.map((r) => r.date),
        y: garmin.map((r) => r.value),
        name: 'Garmin HRV',
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: '#06B6D4', width: 2, dash: 'dot' },
        marker: { size: 5, color: '#06B6D4' },
        hovertemplate: '<b>Garmin HRV</b>: %{y:.1f} ms<br>%{x}<extra></extra>',
      });
    }

    return traces;
  };

  // 4. Walking HR & Recovery Traces
  const buildWalkingAndRecoveryTraces = () => {
    const traces: any[] = [];
    if (heartData?.walking_hr && heartData.walking_hr.length > 0) {
      traces.push({
        x: heartData.walking_hr.map((r) => r.date),
        y: heartData.walking_hr.map((r) => r.value),
        name: 'Walking HR Avg (bpm)',
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: '#10B981', width: 2.2 },
        marker: { size: 5, color: '#10B981' },
        hovertemplate: '<b>Walking HR</b>: %{y:.1f} bpm<br>%{x}<extra></extra>',
        yaxis: 'y',
      });
    }

    if (heartData?.hr_recovery && heartData.hr_recovery.length > 0) {
      traces.push({
        x: heartData.hr_recovery.map((r) => r.date),
        y: heartData.hr_recovery.map((r) => r.value),
        name: '1-Min Recovery Drop (bpm)',
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: '#F59E0B', width: 2, dash: 'dot' },
        marker: { size: 5, color: '#F59E0B' },
        hovertemplate: '<b>Recovery</b>: %{y:.1f} bpm drop<br>%{x}<extra></extra>',
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
                  yaxis: { title: { text: 'bpm', font: { size: 10 } } },
                }}
                theme={theme}
                height={280}
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
                  yaxis: { title: { text: 'bpm', font: { size: 10 } } },
                }}
                theme={theme}
                height={280}
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
                  yaxis: { title: { text: 'HRV SDNN (ms)', font: { size: 10 } } },
                }}
                theme={theme}
                height={280}
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
                  yaxis: { title: { text: 'Walking HR (bpm)', font: { size: 10 } } },
                  yaxis2: {
                    title: { text: 'Recovery Drop (bpm)', font: { size: 10 } },
                    overlaying: 'y',
                    side: 'right',
                    showgrid: false,
                  },
                }}
                theme={theme}
                height={280}
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
                height={290}
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
                height={290}
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
                height={290}
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
                height={290}
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
                height={280}
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
