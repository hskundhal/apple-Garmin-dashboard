export interface HealthSummary {
  avg_resting_hr: number | null;
  avg_hrv: number | null;
  avg_normal_hr?: number | null;
  avg_walking_hr?: number | null;
  avg_hr_recovery?: number | null;
  avg_vo2max: number | null;
  total_steps: number | null;
  avg_sleep_hours: number | null;
  total_active_energy: number | null;
  total_exercise_min: number | null;
  period_days: number;
}

export interface MetricEntry {
  id: number;
  source: string;
  metric_type: string;
  date: string;
  value: number;
  unit: string;
  timestamp: string | null;
}

export interface HeartTimelineData {
  resting_hr: MetricEntry[];
  hrv: MetricEntry[];
  heart_rate: MetricEntry[];
  walking_hr?: MetricEntry[];
  hr_recovery?: MetricEntry[];
}

export interface SleepStage {
  id: number;
  session_id: string;
  stage: 'deep' | 'light' | 'rem' | 'awake';
  start_time: string;
  end_time: string;
  duration_sec: number;
}

export interface SleepSession {
  id: string;
  source: string;
  calendar_date: string;
  sleep_start: string | null;
  sleep_end: string | null;
  total_sleep_sec: number | null;
  deep_sleep_sec: number | null;
  light_sleep_sec: number | null;
  rem_sleep_sec: number | null;
  awake_sec: number | null;
  overall_score: number | null;
  avg_hr: number | null;
  avg_hrv: number | null;
  stages?: SleepStage[];
}

export interface Activity {
  id: string;
  source: string;
  activity_name: string;
  activity_type: string;
  sport_type: string;
  start_time: string;
  duration_seconds: number;
  distance_meters: number | null;
  calories: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_speed: number | null;
  max_speed: number | null;
  elevation_gain: number | null;
  elevation_loss: number | null;
  avg_cadence: number | null;
  avg_power: number | null;
  created_at: string;
}

export interface ActivitySummary {
  total_count: number;
  total_duration_sec: number;
  total_distance_m: number;
  total_calories: number;
  avg_hr: number | null;
  type_breakdown: { type: string; count: number; duration_sec: number }[];
}

export interface SyncStatus {
  running: boolean;
  message: string;
  progress: number;
  needs_mfa?: boolean;
}

export interface MetaData {
  min_date: string;
  max_date: string;
  sources: string[];
  activity_types: string[];
  profile: { display_name: string; gender: string };
  has_real_data?: boolean;
}

const BASE_URL = "/api";

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, options);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API Error ${res.status}: ${errorText}`);
  }
  return res.json();
}

export const api = {
  getMeta: () => request<MetaData>("/meta"),

  getHealthSummary: (start: string, end: string) =>
    request<HealthSummary>(`/health-summary?start=${start}&end=${end}`),

  getHeartTimeline: (start: string, end: string) =>
    request<HeartTimelineData>(`/heart-timeline?start=${start}&end=${end}`),

  getSleepTimeline: (start: string, end: string) =>
    request<{ sessions: SleepSession[] }>(`/sleep-timeline?start=${start}&end=${end}`),

  getActivities: (type?: string, start?: string, end?: string) => {
    const params = new URLSearchParams();
    if (type && type !== "all") params.append("activity_type", type);
    if (start) params.append("start", start);
    if (end) params.append("end", end);
    return request<{ activities: Activity[]; types: string[] }>(`/activities?${params.toString()}`);
  },

  getActivitySummary: (type?: string, start?: string, end?: string) => {
    const params = new URLSearchParams();
    if (type && type !== "all") params.append("activity_type", type);
    if (start) params.append("start", start);
    if (end) params.append("end", end);
    return request<ActivitySummary>(`/activity-summary?${params.toString()}`);
  },

  getSyncStatus: () =>
    request<SyncStatus>("/sync/status"),

  syncGarminApiKey: (apiKey: string, days = 0) =>
    request<{ status: string }>("/sync/garmin-api-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, days }),
    }),

  getGarminApiKeyStatus: () =>
    request<{ configured: boolean; masked_key: string | null }>("/garmin-api-key/status"),

  syncGarmin: (credentials: { email: string; password: string; mfa_code?: string }, days = 30) =>
    request<{ status: string }>("/sync/garmin?days=" + days, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    }),

  importAppleHealthPath: (zipPath: string) =>
    request<{ status: string; message?: string }>("/import/apple-health-path?zip_path=" + encodeURIComponent(zipPath), {
      method: "POST",
    }),

  seedDemo: (days = 45) =>
    request<{ status: string; message: string }>("/seed?days=" + days, {
      method: "POST",
    }),

  getActivityHrChart: (activityId: string, theme: string) =>
    request<PlotData>(`/activity/${encodeURIComponent(activityId)}/hr-chart?theme=${theme}`),

  submitGarminMfa: (mfaCode: string) =>
    request<{ status: string }>("/sync/garmin/mfa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mfa_code: mfaCode }),
    }),
};

export interface PlotData {
  traces: any[];
  layout: any;
}

export const appleHealthApi = {
  getVo2: (start: string, end: string, gender = "male", theme = "dark") =>
    request<PlotData>(`/vo2?start=${start}&end=${end}&gender=${gender}&theme=${theme}`),

  getRhrHrv: (start: string, end: string, theme = "dark") =>
    request<PlotData>(`/rhr-hrv?start=${start}&end=${end}&theme=${theme}`),

  getSleepStages: (start: string, end: string, theme = "dark") =>
    request<PlotData>(`/sleep-stages?start=${start}&end=${end}&theme=${theme}`),

  getSleepDuration: (start: string, end: string, theme = "dark") =>
    request<PlotData>(`/sleep-duration?start=${start}&end=${end}&theme=${theme}`),

  getSleepConsistency: (start: string, end: string, theme = "dark") =>
    request<PlotData>(`/sleep-consistency?start=${start}&end=${end}&theme=${theme}`),

  getWristTemp: (start: string, end: string, theme = "dark") =>
    request<PlotData>(`/wrist-temp?start=${start}&end=${end}&theme=${theme}`),
};

export const demoApi = {
  getStatus: () => request<{ enabled: boolean }>("/demo/status"),
  toggle: (enable: boolean) =>
    request<{ enabled: boolean; message: string }>(`/demo/toggle?enable=${enable}`, {
      method: "POST",
    }),
};
