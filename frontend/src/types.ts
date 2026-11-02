export const SKILLS = ["listening", "reading", "writing", "speaking"] as const;
export type Skill = (typeof SKILLS)[number];

export type Lang = "ar" | "en";
export type ExplanationLang = "ar_heavy" | "balanced" | "en_heavy";
export type SourceType =
  | "official_practice"
  | "external_marker"
  | "placement_quiz"
  | "self_estimate";

export const RESOURCE_SKILLS = [
  "listening",
  "reading",
  "writing",
  "speaking",
  "grammar",
  "vocabulary",
  "techniques",
  "general",
] as const;
export type ResourceSkill = (typeof RESOURCE_SKILLS)[number];

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

export type PlacementTest = "dalilk_13english" | "dalilk_3min";

export interface Placement {
  id: number;
  test: PlacementTest;
  level_label: string;
  approx_band: number | null;
  taken_on: string;
  notes: string;
  created_at: string;
}

export interface PlacementInput {
  test: PlacementTest;
  level_label: string;
  approx_band: number | null;
  taken_on: string;
  notes: string;
  apply_to_skills: Skill[];
}

export interface AppSettings {
  web_keep_signin: boolean | null;
}

export interface Resource {
  id: number;
  catalog_id: string | null;
  title: string;
  provider: string;
  track: string;
  skill: ResourceSkill;
  activity_codes: string;
  resource_type: string;
  format: string;
  url: string | null;
  local_path: string | null;
  needs_internet: boolean;
  relevance: string;
  licence_note: string;
  description: string;
  notes: string;
  progress_position: string | null;
  status: "active" | "archived";
  completed_at: string | null;
  last_opened_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResourceInput {
  title: string;
  skill: ResourceSkill;
  url?: string;
  local_path?: string;
  resource_type?: string;
  format?: string;
  notes?: string;
}

export interface ResourcePatch {
  notes?: string;
  progress_position?: string | null;
  status?: "active" | "archived";
  completed?: boolean;
}

export type SessionState = "running" | "confirmed" | "unconfirmed" | "discarded";

export interface StudySession {
  id: number;
  started_at: string;
  ended_at: string | null;
  last_heartbeat_at: string;
  active_seconds: number;
  skill: ResourceSkill;
  activity_code: string | null;
  resource_id: number | null;
  state: SessionState;
  origin: "timer" | "manual";
  notes: string;
}

export type PanelTarget = { url: string } | { library: string };

export interface PanelState {
  open: boolean;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  error: string | null;
}

export interface PanelBridge {
  open(target: PanelTarget, keepSignIn: boolean): Promise<PanelState>;
  setBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
  setVisible(visible: boolean): Promise<void>;
  nav(action: "back" | "forward" | "reload"): Promise<void>;
  close(): Promise<void>;
  openExternally(): Promise<boolean>;
  state(): Promise<PanelState>;
  onState(callback: (state: PanelState) => void): () => void;
}

export interface Bridge {
  restartBackend(): Promise<string>;
  openFolder(which: "data" | "backups"): Promise<boolean>;
  importBackup(): Promise<string | null>;
  exportBackup(name: string): Promise<boolean>;
  activity(): Promise<{ idleSeconds: number; audible: boolean }>;
  addLibraryFile(): Promise<{ fileName: string; title: string; format: string } | null>;
  clearWebData(): Promise<void>;
  panel: PanelBridge;
}

declare global {
  interface Window {
    ipBridge?: Bridge;
  }
}
