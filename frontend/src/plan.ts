// Time helpers, the interim daily split, and the overall-band history.
//
// The daily split is the Sprint 1b interim rule (docs/CURRICULUM.md §2a): the phase picks
// the development/exam shares, and every development hour is split the way Abdulrahman
// Hegazy suggests — 30 min listening, 20 min reading, 10 min writing and speaking.
// Sprint 2's planner replaces it with day-by-day tasks.

import {
  SKILLS,
  type Levels,
  type Placement,
  type Profile,
  type ResourceSkill,
  type StudySession,
} from "./types";

/* ---------- time ---------- */

export const DAY_MS = 86_400_000;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Weeks start on Saturday (Egypt). */
export function startOfWeek(d: Date): Date {
  const sinceSaturday = (d.getDay() + 1) % 7;
  return addDays(startOfDay(d), -sinceSaturday);
}

export function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayIso(): string {
  return dayKey(new Date());
}

export function daysUntil(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  return Math.round((target.getTime() - startOfDay(new Date()).getTime()) / DAY_MS);
}

/** 105 -> "1:45" */
export function formatHM(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** 5025 s -> "1:23:45"; under an hour "23:45" */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

export function hoursLabel(minutes: number): string {
  const h = minutes / 60;
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

/* ---------- categories ---------- */

export const CATEGORIES = ["listening", "reading", "output", "exam", "support"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_COLOR: Record<Category, string> = {
  listening: "#2563EB",
  reading: "#0F766E",
  output: "#D97706",
  exam: "#7C3AED",
  support: "#64748B",
};

export function categoryOf(skill: ResourceSkill, activityCode: string | null): Category {
  if (skill === "techniques" || activityCode === "PRAC" || activityCode === "PLACEMENT") {
    return "exam";
  }
  if (skill === "listening") return "listening";
  if (skill === "reading") return "reading";
  if (skill === "writing" || skill === "speaking") return "output";
  return "support";
}

export function minutesOf(sessions: StudySession[]): number {
  return sessions.reduce((sum, s) => sum + s.active_seconds, 0) / 60;
}

export function counted(sessions: StudySession[]): StudySession[] {
  return sessions.filter((s) => s.state === "confirmed" || s.state === "running");
}

/* ---------- phase and daily split ---------- */

export type Phase = "foundation" | "development" | "exam";

export const DEVELOPMENT_SHARE: Record<Phase, number> = {
  foundation: 0.75,
  development: 0.6,
  exam: 0.35,
};

export function phaseOf(profile: Profile, levels: Levels | null): Phase {
  if (profile.exam_date && daysUntil(profile.exam_date) <= 28) return "exam";
  const bands = SKILLS.map((s) => levels?.current[s]?.band);
  if (bands.some((b) => b === undefined)) return "development";
  const mean = (bands as number[]).reduce((a, b) => a + b, 0) / bands.length;
  if (mean < 5.5) return "foundation";
  if (mean < 6.5) return "development";
  return "exam";
}

export interface DailySplit {
  phase: Phase;
  total: number;
  minutes: Record<Exclude<Category, "support">, number>;
}

export function dailySplit(profile: Profile, levels: Levels | null): DailySplit {
  const phase = phaseOf(profile, levels);
  const total = profile.study_minutes_per_day;
  const dev = total * DEVELOPMENT_SHARE[phase];
  const round5 = (n: number) => Math.round(n / 5) * 5;
  const minutes = {
    listening: round5((dev * 30) / 60),
    reading: round5((dev * 20) / 60),
    output: round5((dev * 10) / 60),
    exam: 0,
  };
  minutes.exam = Math.max(0, total - minutes.listening - minutes.reading - minutes.output);
  return { phase, total, minutes };
}

/* ---------- overall band ---------- */

/** IELTS rounding: x.25 goes up to x.5, x.75 goes up to the next whole band. */
export function ieltsOverall(bands: number[]): number {
  const mean = bands.reduce((a, b) => a + b, 0) / bands.length;
  const whole = Math.floor(mean);
  const frac = mean - whole;
  if (frac < 0.25) return whole;
  if (frac < 0.75) return whole + 0.5;
  return whole + 1;
}

export interface OverallPoint {
  date: string; // YYYY-MM-DD (local)
  band: number;
  kind: "official" | "estimate";
  source: "skills" | "placement";
}

const OFFICIAL = new Set(["official_practice", "external_marker"]);

export function overallHistory(levels: Levels | null, placements: Placement[]): OverallPoint[] {
  const points: OverallPoint[] = [];
  const history = [...(levels?.history ?? [])].sort((a, b) =>
    a.recorded_at === b.recorded_at ? a.id - b.id : a.recorded_at.localeCompare(b.recorded_at),
  );
  const latest = new Map<string, { band: number; source: string }>();
  for (let i = 0; i < history.length; i++) {
    const row = history[i];
    latest.set(row.skill, { band: row.band, source: row.source_type });
    const lastOfBatch =
      i === history.length - 1 || history[i + 1].recorded_at !== row.recorded_at;
    if (!lastOfBatch || latest.size < SKILLS.length) continue;
    const values = SKILLS.map((s) => latest.get(s)!);
    points.push({
      date: dayKey(new Date(row.recorded_at)),
      band: ieltsOverall(values.map((v) => v.band)),
      kind: values.every((v) => OFFICIAL.has(v.source)) ? "official" : "estimate",
      source: "skills",
    });
  }
  for (const p of placements) {
    if (p.approx_band === null) continue;
    points.push({ date: p.taken_on, band: p.approx_band, kind: "estimate", source: "placement" });
  }
  points.sort((a, b) => a.date.localeCompare(b.date));
  // One point per day: official > all four skills > a placement estimate; later wins ties.
  const rank = (p: OverallPoint) => (p.kind === "official" ? 2 : p.source === "skills" ? 1 : 0);
  const byDay = new Map<string, OverallPoint>();
  for (const p of points) {
    const prev = byDay.get(p.date);
    if (!prev || rank(p) >= rank(prev)) byDay.set(p.date, p);
  }
  return [...byDay.values()];
}
