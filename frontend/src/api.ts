// All calls go to app://ui/api/..., which the Electron main process forwards to the
// local backend and signs with the launch token (D-014). The renderer never sees the token.

import type {
  AppSettings,
  BackupInfo,
  DayPlan,
  Episode,
  EpisodeList,
  Estimate,
  PodcastFeed,
  PlanSummary,
  PlanTask,
  Skill,
  LevelEntry,
  Levels,
  Placement,
  PlacementInput,
  Profile,
  ProfileInput,
  Resource,
  ResourceInput,
  ResourcePatch,
  ResourceSkill,
  StudySession,
  SystemInfo,
  Achievements,
  Card,
  CardDeck,
  MistakeInput,
  SpeakingAttempt,
  WritingAttempt,
  CardImportItem,
  CardStats,
  ContentItem,
} from "./types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type FailureListener = (message: string) => void;
const failureListeners = new Set<FailureListener>();

/** Notified when the main process reports the backend has died. */
export function onBackendFailure(listener: FailureListener): () => void {
  failureListeners.add(listener);
  return () => failureListeners.delete(listener);
}

interface ErrorBody {
  detail?: { error?: string; message?: string } | { msg: string }[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`api/v1/${path}`, init);
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const detail = (data as ErrorBody | null)?.detail;
    let code = `http_${res.status}`;
    let message = res.statusText || code;
    if (Array.isArray(detail)) {
      code = "validation";
      message = detail.map((d) => d.msg.replace(/^Value error, /, "")).join("\n");
    } else if (detail && typeof detail === "object") {
      code = detail.error ?? code;
      message = detail.message ?? code;
    }
    if (code === "backend_failed") failureListeners.forEach((l) => l(message));
    throw new ApiError(res.status, code, message);
  }
  return data as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  health: () => request<{ status: string; version: string }>("health"),
  system: () => request<SystemInfo>("system"),
  profile: () => request<Profile>("profile"),
  saveProfile: (input: ProfileInput) => request<Profile>("profile", json("PUT", input)),
  levels: () => request<Levels>("skill-levels"),
  addLevels: (entries: LevelEntry[]) =>
    request<Levels>("skill-levels", json("POST", { entries })),
  backups: () => request<BackupInfo[]>("backups"),
  createBackup: () => request<BackupInfo>("backups", { method: "POST" }),
  restoreBackup: (name: string) =>
    request<{ restored: string; safety_backup: string }>(
      `backups/${encodeURIComponent(name)}/restore`,
      { method: "POST" },
    ),
  deleteBackup: (name: string) =>
    request<{ deleted: string }>(`backups/${encodeURIComponent(name)}`, { method: "DELETE" }),
  deleteAll: () =>
    request<{ safety_backup: string }>("data/delete-all", json("POST", { confirm: "DELETE" })),

  settings: () => request<AppSettings>("settings"),
  saveSettings: (patch: Partial<AppSettings>) => request<AppSettings>("settings", json("PUT", patch)),

  placements: () => request<Placement[]>("placements"),
  addPlacement: (input: PlacementInput) => request<Placement>("placements", json("POST", input)),

  resources: (includeArchived = false) =>
    request<Resource[]>(`resources${includeArchived ? "?include_archived=true" : ""}`),
  addResource: (input: ResourceInput) => request<Resource>("resources", json("POST", input)),
  patchResource: (id: number, patch: ResourcePatch) =>
    request<Resource>(`resources/${id}`, json("PATCH", patch)),
  resourceOpened: (id: number) => request<Resource>(`resources/${id}/opened`, { method: "POST" }),
  deleteResource: (id: number) => request<null>(`resources/${id}`, { method: "DELETE" }),

  sessions: (since: Date, until?: Date) => {
    const q = new URLSearchParams({ since: since.toISOString() });
    if (until) q.set("until", until.toISOString());
    return request<StudySession[]>(`sessions?${q.toString()}`);
  },
  openSessions: () => request<StudySession[]>("sessions/open"),
  startSession: (
    skill: ResourceSkill,
    resourceId: number | null,
    activityCode: string | null,
    planTaskId: number | null = null,
  ) =>
    request<StudySession>(
      "sessions/start",
      json("POST", {
        skill,
        resource_id: resourceId,
        activity_code: activityCode,
        plan_task_id: planTaskId,
      }),
    ),
  heartbeat: (id: number, activeDeltaSeconds: number) =>
    request<StudySession>(
      `sessions/${id}/heartbeat`,
      json("POST", { active_delta_seconds: activeDeltaSeconds }),
    ),
  stopSession: (id: number, notes = "") =>
    request<StudySession>(`sessions/${id}/stop`, json("POST", { notes })),
  patchSession: (
    id: number,
    patch: { state?: "confirmed" | "discarded"; active_seconds?: number; notes?: string },
  ) => request<StudySession>(`sessions/${id}`, json("PATCH", patch)),
  estimate: (input: {
    today: string;
    target_overall: number;
    targets?: Partial<Record<Skill, number>>;
    current: Record<Skill, number | null>;
    exam_date: string | null;
    study_weekdays: number[];
    daily_minutes: number;
    hours_per_band: number;
  }) => request<Estimate>("plan/estimate", json("POST", input)),
  planSummary: (today: string) =>
    request<PlanSummary>(
      `plan/summary?today=${today}&tz=${new Date().getTimezoneOffset()}`,
    ),
  planDay: (date: string, today: string) =>
    request<DayPlan>(`plan/day?date=${date}&today=${today}`),
  taskStart: (id: number) => request<PlanTask>(`plan/tasks/${id}/start`, { method: "POST" }),
  taskDone: (id: number) => request<PlanTask>(`plan/tasks/${id}/done`, { method: "POST" }),
  taskSkip: (id: number, reason: string) =>
    request<PlanTask>(`plan/tasks/${id}/skip`, json("POST", { reason })),
  taskReset: (id: number) => request<PlanTask>(`plan/tasks/${id}/reset`, { method: "POST" }),
  restartPlan: (body: { today: string; exam_date?: string | null; study_minutes_per_day?: number }) =>
    request<Estimate>("plan/restart", json("POST", body)),

  podcastImport: (feed: PodcastFeed, xml: string) =>
    request<{ added: number; updated: number; total: number; in_feed: number }>(
      `podcasts/${feed}/import`,
      json("POST", { xml }),
    ),
  podcastList: (feed: PodcastFeed) => request<EpisodeList>(`podcasts/${feed}`),
  podcastNext: (feed: PodcastFeed) => request<Episode>(`podcasts/${feed}/next`),
  podcastPatch: (
    id: number,
    patch: {
      position_seconds?: number;
      listened?: boolean;
      comprehension?: number;
      started?: boolean;
      stage?: number;
    },
  ) => request<Episode>(`podcasts/episodes/${id}`, json("PATCH", patch)),

  contentQueue: (params: Record<string, string | number | boolean | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
    return request<ContentItem[]>(`content/queue?${q.toString()}`);
  },
  contentStart: (id: number) => request<ContentItem>(`content/${id}/start`, { method: "POST" }),
  cardsImport: (kind: CardDeck, items: CardImportItem[]) =>
    request<{ kind: string; total: number; added: number; updated: number }>(
      "cards/import",
      json("POST", { kind, items }),
    ),
  cardStats: (today: string) => request<CardStats>(`cards/stats?today=${today}`),
  // v0.0.13: phrases come 5 a day (one situation), words up to 15 new a day
  cardsToday: (deck: CardDeck, today: string) =>
    request<Card[]>(`cards/today?deck=${deck}&today=${today}&new_limit=${deck === "phrase" ? 5 : 15}`),
  cardReview: (id: number, grade: number, today: string) =>
    request<Card>(`cards/${id}/review`, json("POST", { grade, today })),
  cardAdd: (front: string, meaning: string) =>
    request<Card>("cards", json("POST", { front, meaning })),
  phraseNext: () => request<Card>("cards/phrase/next"),
  cardsRecent: () => request<Card[]>("cards/recent"),
  mistakesAdd: (items: MistakeInput[], source: string, today: string) =>
    request<Card[]>("cards/mistakes", json("POST", { items, source, today })),
  mistakes: () => request<Card[]>("cards/mistakes"),
  cardDelete: (id: number) => request<null>(`cards/${id}`, { method: "DELETE" }),

  writingList: (params: { task?: number; plan_task_id?: number; limit?: number }) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
    return request<WritingAttempt[]>(`writing?${q.toString()}`);
  },
  writingNew: (task: 0 | 1 | 2, prompt: string, planTaskId: number | null) =>
    request<WritingAttempt>("writing", json("POST", { task, prompt, plan_task_id: planTaskId })),
  writingPatch: (
    id: number,
    patch: Partial<{
      prompt: string;
      text: string;
      seconds_used: number;
      checklist: string[];
      tutor_reply: string;
      tutor_overall: number | null;
      scores: Record<string, number>;
      submit: boolean;
    }>,
  ) => request<WritingAttempt>(`writing/${id}`, json("PATCH", patch)),
  writingDelete: (id: number) => request<null>(`writing/${id}`, { method: "DELETE" }),
  speakingList: () => request<SpeakingAttempt[]>("speaking"),
  speakingNew: (input: {
    part: 0 | 1 | 2 | 3;
    prompt: string;
    recording: string | null;
    seconds: number;
    transcript: string;
    self_rating: Record<string, number>;
    notes: string;
    plan_task_id: number | null;
  }) => request<SpeakingAttempt>("speaking", json("POST", input)),
  speakingPatch: (
    id: number,
    patch: Partial<{
      prompt: string;
      transcript: string;
      self_rating: Record<string, number>;
      notes: string;
      tutor_reply: string;
      tutor_overall: number | null;
      scores: Record<string, number>;
    }>,
  ) => request<SpeakingAttempt>(`speaking/${id}`, json("PATCH", patch)),
  speakingDelete: (id: number) =>
    request<{ deleted: number; recording: string | null }>(`speaking/${id}`, {
      method: "DELETE",
    }),
  phraseShown: (id: number) => request<Card>(`cards/${id}/shown`, { method: "POST" }),
  contentCount: (params: { kind: string; groups?: string; skills?: string }) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    return request<{ total: number; done: number }>(`content/count?${q.toString()}`);
  },
  contentPosition: (id: number, url: string) =>
    request<ContentItem>(`content/${id}/position`, json("POST", { url })),
  contentDone: (id: number) => request<ContentItem>(`content/${id}/done`, { method: "POST" }),

  achievements: () =>
    request<Achievements>(`stats/achievements?tz=${new Date().getTimezoneOffset()}`),

  logManual: (
    skill: ResourceSkill,
    startedAt: Date,
    minutes: number,
    notes: string,
    planTaskId?: number,
  ) =>
    request<StudySession>(
      "sessions/manual",
      json("POST", {
        skill,
        started_at: startedAt.toISOString(),
        minutes,
        notes,
        ...(planTaskId !== undefined ? { plan_task_id: planTaskId } : {}),
      }),
    ),
};
