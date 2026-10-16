/**
 * Modern Blueish / Oceanic & Slate Design Tokens
 * Harmonious palette balancing Apple Health clean aesthetics with Garmin/Athlytics sport tech.
 */

export const BRAND_BLUE = "#2563EB";       // Royal Sapphire
export const BRAND_CYAN = "#06B6D4";       // Electric Cyan / Teal
export const BRAND_INDIGO = "#4F46E5";     // Deep Indigo
export const APPLE_RED = "#EF4444";        // Apple Health Heart Red / Coral
export const GARMIN_BLUE = "#007ACC";      // Garmin Connect Blue
export const ACCENT_GREEN = "#10B981";     // Emerald recovery / sleep

export type ThemeName = "dark" | "light";

export interface ThemeTokens {
  bg: string;
  bgGradient: string;
  card: string;
  cardGlass: string;
  cardHover: string;
  border: string;
  borderSubtle: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  navBg: string;
  grid: string;
  tick: string;
  muted: string;
  accent: string;
  accentLight: string;
  accentGlow: string;
  appleColor: string;
  garminColor: string;
  heartColor: string;
  hrvColor: string;
  deepSleep: string;
  lightSleep: string;
  remSleep: string;
  awakeSleep: string;
}

export const THEMES: Record<ThemeName, ThemeTokens> = {
  dark: {
    bg: "#0B0F19",                         // Deep navy night
    bgGradient: "radial-gradient(ellipse at 20% 0%, rgba(37, 99, 235, 0.15) 0%, transparent 60%), radial-gradient(ellipse at 80% 100%, rgba(6, 182, 212, 0.1) 0%, transparent 50%), #0B0F19",
    card: "#111827",                       // Rich slate navy
    cardGlass: "rgba(17, 24, 39, 0.75)",
    cardHover: "#182235",
    border: "#1E293B",
    borderSubtle: "#334155",
    text: "#F8FAFC",
    textMuted: "#94A3B8",
    textSubtle: "#64748B",
    navBg: "#0F172A",
    grid: "rgba(255, 255, 255, 0.05)",
    tick: "#64748B",
    muted: "#1E293B",
    accent: "#38BDF8",                     // Bright sky cyan
    accentLight: "rgba(56, 189, 248, 0.15)",
    accentGlow: "rgba(56, 189, 248, 0.25)",
    appleColor: "#F43F5E",                 // Rose Red
    garminColor: "#38BDF8",                // Garmin Sky Blue
    heartColor: "#F43F5E",
    hrvColor: "#818CF8",                   // Violet / Lavender
    deepSleep: "#1E40AF",                  // Deep Navy Blue
    lightSleep: "#38BDF8",                 // Sky Blue
    remSleep: "#818CF8",                   // Indigo Purple
    awakeSleep: "#475569",                 // Muted Slate
  },
  light: {
    bg: "#F1F5F9",                         // Slate 100
    bgGradient: "radial-gradient(ellipse at 20% 0%, rgba(37, 99, 235, 0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 100%, rgba(6, 182, 212, 0.06) 0%, transparent 50%), #F1F5F9",
    card: "#FFFFFF",
    cardGlass: "rgba(255, 255, 255, 0.9)",
    cardHover: "#F8FAFC",
    border: "#E2E8F0",
    borderSubtle: "#CBD5E1",
    text: "#0F172A",
    textMuted: "#64748B",
    textSubtle: "#94A3B8",
    navBg: "#E2E8F0",
    grid: "rgba(15, 23, 42, 0.06)",
    tick: "#64748B",
    muted: "#E2E8F0",
    accent: "#0284C7",                     // Ocean Blue
    accentLight: "rgba(2, 132, 199, 0.12)",
    accentGlow: "rgba(2, 132, 199, 0.2)",
    appleColor: "#E11D48",
    garminColor: "#0284C7",
    heartColor: "#E11D48",
    hrvColor: "#6366F1",
    deepSleep: "#1E3A8A",
    lightSleep: "#0284C7",
    remSleep: "#6366F1",
    awakeSleep: "#94A3B8",
  },
};

export const SPORT_COLORS: Record<string, string> = {
  running: "#38BDF8",
  cycling: "#06B6D4",
  swimming: "#3B82F6",
  walking: "#10B981",
  hiking: "#14B8A6",
  strength: "#F59E0B",
  yoga: "#8B5CF6",
  cardio: "#EC4899",
  other: "#64748B",
};
