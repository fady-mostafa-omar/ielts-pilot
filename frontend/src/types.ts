export const SKILLS = ["listening", "reading", "writing", "speaking"] as const;
export type Skill = (typeof SKILLS)[number];

export type Lang = "ar" | "en";
export type ExplanationLang = "ar_heavy" | "balanced" | "en_heavy";
export type SourceType = "official_practice" | "external_marker" | "self_estimate";

export interface Profile {
  display_name: string | null;
  interface_language: Lang;
  explanation_language: ExplanationLang;
  target_overall: number;
  target_listening: number;
  target_reading: number;
  target_writing: number;
  target_speaking: number;
  minimum_per_skill: number;
  exam_date: string | null;
  study_days_per_week: number;
  study_minutes_per_day: number;
  created_at: string;
  updated_at: string;
}

export interface ProfileInput {
  display_name: string | null;
  interface_language: Lang;
  explanation_language: ExplanationLang;
  target_overall: number;
  target_listening?: number;
  target_reading?: number;
  target_writing?: number;
  target_speaking?: number;
  minimum_per_skill: number;
  exam_date: string | null;
  study_days_per_week: number;
  study_minutes_per_day: number;
}

export interface LevelEntry {
  skill: Skill;
  band: number;
  source_type: SourceType;
  source_note: string;
}

export interface Level extends LevelEntry {
  id: number;
  recorded_at: string;
}

export interface Levels {
  current: Record<Skill, Level | null>;
  history: Level[];
}

export interface BackupInfo {
  name: string;
  kind: string | null;
  created_at: string | null;
  app_version: string | null;
  schema_revision: string | null;
  size_bytes: number;
  valid: boolean;
  problem: string | null;
}

export interface SystemInfo {
  version: string;
  schema_revision: string | null;
  data_dir: string;
  backups_dir: string;
  db_size_bytes: number;
  free_bytes: number;
  low_disk: boolean;
}

export interface Bridge {
  restartBackend(): Promise<string>;
  openFolder(which: "data" | "backups"): Promise<boolean>;
  importBackup(): Promise<string | null>;
  exportBackup(name: string): Promise<boolean>;
}

declare global {
  interface Window {
    ipBridge?: Bridge;
  }
}
