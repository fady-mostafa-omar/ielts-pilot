export const SKILLS = ["listening", "reading", "writing", "speaking"] as const;
export type Skill = (typeof SKILLS)[number];

export type Lang = "ar" | "en";
export type ExplanationLang = "ar_heavy" | "balanced" | "en_heavy";
export type SourceType =
  | "official_practice"
  | "external_marker"
  | "placement_quiz"
  | "self_estimate"
  | "ai_tutor" // v0.0.13: marks from the AI tutor, typed in by the owner (D-043)
  | "practice_site"; // v0.0.14: a practice website's band (not official material, D-044)

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
  hours_per_band: number | null;
  study_weekdays: number[] | null; // 0 = Sunday … 6 = Saturday
  break_every_minutes: number | null;
  break_minutes: number | null;
  plan_start: string | null;
  interlude_seconds: number | null; // pause between tasks, 0 = off
  exam_format: ExamFormat | null; // D-037, asked in setup
  tutor: TutorSite | null; // D-042: where the copied tutor prompt is pasted
}

export type TutorSite = "chatgpt" | "claude" | "gemini";

/** v0.0.12 (D-042): the writing and speaking labs. */
export interface WritingAttempt {
  id: number;
  task: 0 | 1 | 2;
  prompt: string;
  text: string;
  words: number;
  seconds_used: number;
  status: "draft" | "submitted";
  checklist: string[];
  tutor_reply: string;
  tutor_overall: number | null; // the AI tutor's overall mark (counts in the level, D-043)
  scores: Record<string, number>; // v0.0.13: the tutor's marks per criterion
  level_id: number | null;
  test_key: string | null; // v0.0.14: the named question (D-044)
  test_title: string | null; // v0.0.17
  model_answer: string; // v0.0.17: the tutor's model answer (editable)
  pdf_file: string | null; // v0.0.17: the PDF saved in Documents/IELTS Band Up/إجاباتي
  plan_task_id: number | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}
export type SpeakingCriterion = "fluency" | "lexical" | "grammar" | "pronunciation";
export interface SpeakingAttempt {
  id: number;
  part: 0 | 1 | 2 | 3;
  prompt: string;
  recording: string | null;
  seconds: number;
  transcript: string;
  self_rating: Partial<Record<SpeakingCriterion, number>>;
  notes: string;
  tutor_reply: string;
  tutor_overall: number | null;
  scores: Record<string, number>;
  level_id: number | null;
  test_key: string | null; // v0.0.14: the named test (D-044)
  test_title: string | null; // v0.0.17
  model_answer: string; // v0.0.17
  model_recording: string | null; // v0.0.17: the learner reading the model answer aloud
  pdf_file: string | null; // v0.0.17
  plan_task_id: number | null;
  created_at: string;
  updated_at: string;
}
export interface MistakeInput {
  wrong: string;
  right: string;
  why: string;
  code: string;
  context?: string;
  skill?: "writing" | "speaking" | "reading" | "listening" | "general";
}

export type ExamFormat = "computer" | "paper";

export type SplitKey = "listening" | "reading" | "output" | "exam";

export interface Estimate {
  current_overall: number | null;
  current_complete: boolean;
  target_overall: number;
  gap_bands: number | null;
  hours_per_band: number;
  total_hours: number | null;
  hours_done: number;
  remaining_hours: number | null;
  skill_gaps: Record<Skill, number | null>;
  exam_weights: Record<Skill, number>;
  phase: "foundation" | "development" | "exam";
  daily_minutes: number;
  split: Record<SplitKey, number>;
  exam_date: string | null;
  goal_date: string | null;
  final_mock_dates: string[];
  review_date: string | null;
  study_days_left: number | null;
  needed_minutes_per_day: number | null;
  feasible: boolean | null;
  impossible: boolean;
  suggested_daily_minutes: number | null;
  earliest_exam_date: string | null;
  reachable_band: number | null;
  next_mock_date: string | null;
  notes: string[];
}

export type DayKind =
  | "study"
  | "rest"
  | "mock"
  | "final_mock"
  | "review"
  | "exam"
  | "after_exam";

export interface PlanSummary extends Estimate {
  today_kind: DayKind;
  today_minutes: number;
  streak_days: number;
  focus_skill: Skill;
  weekdays: number[];
  spelling_weekdays: number[];
  week_plan: WeekPlan;
  exam_format: ExamFormat;
  content: ContentTotals;
  last_study_at: string | null;
  plan_restarted_at: string | null;
}

export interface PlanTask {
  id: number;
  plan_date: string;
  order_in_day: number;
  day_type: string;
  category: SplitKey | "support";
  skill: ResourceSkill;
  activity_code: string;
  planned_minutes: number;
  resource_id: number | null;
  title: string;
  instructions: string;
  reason: string;
  status: "pending" | "in_progress" | "done" | "skipped";
  skip_reason: string | null;
  started_at: string | null;
  completed_at: string | null;
  done_minutes: number;
  content: TaskContent | null;
}

export interface PreviewTask {
  title: string;
  category: SplitKey | "support";
  skill: ResourceSkill;
  activity_code: string;
  planned_minutes: number;
}

export type DayPlan =
  | { date: string; kind: DayKind; preview: false; tasks: PlanTask[] }
  | { date: string; kind: DayKind; preview: true; tasks: PreviewTask[] };

export interface UpdateState {
  status:
    | "unsupported"
    | "idle"
    | "checking"
    | "available"
    | "none"
    | "downloading"
    | "downloaded"
    | "error";
  current: string;
  version: string | null;
  notes: string | null;
  percent: number;
  error: string | null;
  downgrade: boolean;
}

export interface ReleaseInfo {
  version: string;
  name: string;
  publishedAt: string;
  notes: string;
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
  plan_task_id: number | null;
}

export type PanelTarget = { url: string } | { library: string } | { video: string };

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
  /** v0.0.8: playing state of a YouTube video shown alone in the panel. */
  onMedia?(callback: (state: MediaState) => void): () => void;
}

export interface MediaState {
  video: string;
  current: number;
  duration: number;
  ended: boolean;
  paused: boolean;
}

export interface UpdateBridge {
  state(): Promise<UpdateState>;
  check(version?: string): Promise<UpdateState>;
  download(): Promise<UpdateState>;
  install(): Promise<boolean>;
  /** Download (if needed), install and reopen — one press. */
  now(): Promise<UpdateState>;
  releases(): Promise<ReleaseInfo[]>;
  onState(callback: (state: UpdateState) => void): () => void;
}

export type PodcastFeed = "dalilk_ielts" | "dalilk_english";

export interface Episode {
  id: number;
  feed: PodcastFeed;
  number: number | null;
  title: string;
  published_at: string | null;
  duration_seconds: number | null;
  audio_url: string;
  page_url: string | null;
  transcript_url: string | null;
  summary: string;
  position_seconds: number;
  stage: number; // 1 listen · 2 listen + PDF · 3 shadowing · 4 reading (0008)
  plays: number;
  comprehension: number | null;
  listened_at: string | null;
}

export interface EpisodeList {
  feed: PodcastFeed;
  refreshed_at: string | null;
  total: number;
  listened: number;
  episodes: Episode[];
}

export interface Bridge {
  restartBackend(options?: { restoreCompatible?: boolean }): Promise<string>;
  podcastFeed(feed: PodcastFeed): Promise<string>;
  openExternal(url: string): Promise<boolean>;
  /** v0.0.10: keeps a speaking recording in the data folder; returns its file name */
  saveRecording?(data: ArrayBuffer, kind?: "speaking" | "shadow" | "model"): Promise<string>;
  /** v0.0.12: a recording this app wrote, to play it again */
  readRecording?(name: string): Promise<ArrayBuffer>;
  deleteRecording?(name: string): Promise<boolean>;
  /** v0.0.12: the tutor prompt goes to the clipboard (D-026) */
  copyText?(text: string): Promise<boolean>;
  /** v0.0.11: one of Dalilk's two card pages, as served or as a browser shows it */
  dalilkPage?(which: "words" | "phrases", rendered: boolean): Promise<string>;
  setFullScreen(on: boolean): Promise<boolean>;
  updates: UpdateBridge;
  openFolder(which: "data" | "backups" | "answers"): Promise<boolean>;
  /** v0.0.17: answers kept as PDF and WAV in Documents/IELTS Band Up/إجاباتي */
  answers?: AnswersBridge;
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

/** Achievement counters (v0.0.7). */
export interface Achievements {
  episodes: Record<PodcastFeed, number>;
  episodes_total: number;
  tasks_done: number;
  tasks_skipped: number;
  hours: number;
  hours_self_logged: number;
  study_days: number;
  videos: number;
  video_hours: number;
  novels: number;
  tests: number;
  words: number; // v0.0.11: cards learned (Dalilk's words + the owner's)
  phrases: number;
}

/** v0.0.11 (D-041): flashcards. */
export type CardDeck = "word" | "phrase";
export interface Card {
  id: number;
  kind: "word" | "phrase" | "mine" | "mistake";
  key: string;
  section: string;
  situation: string;
  sort: number;
  front: string;
  meaning: string;
  example: string;
  example_ar: string;
  reps: number;
  lapses: number;
  ease: number;
  interval_days: number;
  due: string | null;
  learned_on: string | null;
  reviewed_at: string | null;
  code?: string; // mistakes: CURRICULUM §6 error code
  source?: string;
}
export interface CardCounts {
  total: number;
  learned: number;
  due: number;
  mastered: number;
  new_today: number;
}
export interface CardStats {
  word: CardCounts;
  mine: CardCounts;
  mistake: CardCounts;
  phrase: CardCounts;
}
export interface CardImportItem {
  key: string;
  section: string;
  situation: string;
  sort: number;
  front: string;
  meaning: string;
  example: string;
  example_ar: string;
}

/** planner-4 (v0.0.8): what a plan task opens. */
export type NovelLevel = "beginner" | "intermediate" | "upper";
export type TaskContent =
  | { kind: "podcast"; feed: PodcastFeed }
  | { kind: "novel"; level: NovelLevel; count?: number }
  | {
      kind: "videos";
      groups: string[];
      skills: string[];
      minutes?: number;
      count?: number;
      review?: boolean;
    }
  | {
      kind: "tests";
      skills: string[];
      providers?: string[]; // before v0.0.14
      series?: TestSeries; // v0.0.14: tests by name in the approved order (D-044)
      count: number;
      minutes?: number;
    }
  | { kind: "writing"; task: 0 | 1 | 2; count: number; test?: boolean }
  | { kind: "cards"; deck: CardDeck }
  | { kind: "speaking"; parts: (1 | 2 | 3)[]; test?: boolean };

export type TestSeries = "samples" | "practice" | "lab";

export interface TestMeta {
  part?: number;
  qtype?: string;
  answer_url?: string;
  transcript_url?: string;
  format?: "computer" | "paper";
}

/** A practice test's result as the owner read it (v0.0.14, D-044). */
export interface PracticeResult {
  id: number;
  content_id: number | null;
  test_key: string;
  title: string;
  provider: string;
  skill: Skill | "full";
  kind: "sample" | "full";
  part: number | null;
  qtype: string;
  correct: number | null;
  total: number | null;
  band: number | null;
  bands: Partial<Record<Skill, number>>;
  wrong_types: string[];
  level_ids: number[];
  plan_task_id: number | null;
  created_at: string;
}

export interface PracticeResultInput {
  content_id: number;
  correct?: number;
  total?: number;
  band?: number;
  bands?: Partial<Record<Skill, number>>;
  wrong_types?: string[];
  plan_task_id?: number | null;
}

export interface ProgressData {
  levels: { id: number; skill: Skill; band: number; source_type: SourceType; source_note: string; recorded_at: string }[];
  question_types: {
    skill: "listening" | "reading";
    qtype: string;
    correct: number;
    total: number;
    samples: number;
    wrong_in_full: number;
  }[];
  results: PracticeResult[];
  labs: {
    kind: "writing" | "speaking";
    task?: number;
    part?: number;
    test_key: string | null;
    test_title: string;
    prompt: string;
    overall: number;
    scores: Record<string, number>;
    created_at: string;
  }[];
  tests_done: number;
  counts: ProgressCount[]; // v0.0.17: "done of total" for each kind of work
}

export type ProgressCountKey =
  | "podcast"
  | "novels"
  | "technique_videos"
  | "practice_videos"
  | "phrase_videos"
  | "words"
  | "phrases"
  | "samples"
  | "full_tests"
  | "writing_t1"
  | "writing_t2"
  | "speaking"
  | "hours";

export interface ProgressCount {
  key: ProgressCountKey;
  done: number;
  total: number;
}

export interface AnswerFile {
  name: string;
  size: number;
  modified: number; // ms since 1970
}

export interface AnswersBridge {
  name(stem: string, current?: string | null): Promise<string>;
  savePdf(stem: string, html: string): Promise<string>;
  saveAudio(stem: string, label: "mine" | "model", wav: ArrayBuffer): Promise<string>;
  list(): Promise<AnswerFile[]>;
  open(name: string): Promise<boolean>;
  exportAudio(wav: ArrayBuffer, suggested: string): Promise<string | null>;
}

export interface ContentItem {
  id: number;
  kind: "video" | "novel" | "test";
  key: string;
  title: string;
  grp: string;
  skill: string;
  level: string;
  provider: string;
  sort: number;
  duration_seconds: number | null;
  url: string;
  started_at: string | null;
  completed_at: string | null;
  position_url: string | null; // a novel's last page (0008)
  note?: string; // v0.0.13: what a video gives, in one line
  meta?: TestMeta; // v0.0.14: a test's part, question type, answer key, transcript
  test_kind?: "sample" | "full" | ""; // a sample is recorded only; a full test's band counts
}

export interface ContentTotals {
  days: number;
  podcast_minutes: number;
  episodes: number;
  episode_minutes: number;
  episode_measured: boolean;
  novel_minutes: number;
  novels: number;
  videos: number;
  video_hours: number;
  tests: number;
  samples?: number; // v0.0.14: official sample questions
  full_tests: number;
  writing_t1: number;
  writing_t2: number;
}

export interface WeekPlan {
  weeks: number;
  default: boolean;
  sequence: string[]; // "devL:0", "listening:1", …
  notes: string[]; // no_consolidation, squeezed, short_plan
  current: number; // index of this week in the sequence
}
