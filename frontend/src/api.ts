// All calls go to app://ui/api/..., which the Electron main process forwards to the
// local backend and signs with the launch token (D-014). The renderer never sees the token.

import type { BackupInfo, LevelEntry, Levels, Profile, ProfileInput, SystemInfo } from "./types";

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
};
