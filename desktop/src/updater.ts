// In-app updates (D-027). Installers are published to a separate PUBLIC repository
// (fady-mostafa-omar/ielts-pilot-releases); the code repository stays private and the app
// holds no GitHub token. "Latest" uses electron-updater's GitHub provider; a chosen
// version reads that release's own latest.yml through the generic provider.

import { app, net, type BrowserWindow } from "electron";
// Named import: the package is CommonJS with __esModule and no default export.
import { autoUpdater, type ProgressInfo, type UpdateInfo } from "electron-updater";

export const RELEASES = { owner: "fady-mostafa-omar", repo: "ielts-pilot-releases" };
const RELEASES_API = `https://api.github.com/repos/${RELEASES.owner}/${RELEASES.repo}/releases?per_page=30`;
const VERSION_RE = /^\d+\.\d+\.\d+$/;

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

let state: UpdateState = {
  status: "idle",
  current: "",
  version: null,
  notes: null,
  percent: 0,
  error: null,
  downgrade: false,
};
let target: BrowserWindow | null = null;
let log: (message: string) => void = () => undefined;

function set(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch };
  if (target && !target.isDestroyed()) target.webContents.send("ip:update-state", state);
}

function notesText(info: UpdateInfo): string | null {
  const notes = info.releaseNotes;
  if (!notes) return null;
  if (typeof notes === "string") return notes;
  return notes.map((n) => n.note ?? "").join("\n\n");
}

export function initUpdater(window: BrowserWindow, logger: (message: string) => void): void {
  target = window;
  log = logger;
  state = { ...state, current: app.getVersion() };
  if (!app.isPackaged) {
    set({ status: "unsupported" });
    return;
  }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = {
    info: (m: unknown) => log(`updater: ${String(m)}`),
    warn: (m: unknown) => log(`updater warn: ${String(m)}`),
    error: (m: unknown) => log(`updater error: ${String(m)}`),
    debug: () => undefined,
  };
  autoUpdater.on("checking-for-update", () => set({ status: "checking", error: null }));
  autoUpdater.on("update-available", (info: UpdateInfo) =>
    set({ status: "available", version: info.version, notes: notesText(info), percent: 0 }),
  );
  autoUpdater.on("update-not-available", () => set({ status: "none", version: null }));
  autoUpdater.on("download-progress", (p: ProgressInfo) =>
    set({ status: "downloading", percent: Math.round(p.percent) }),
  );
  autoUpdater.on("update-downloaded", (info: UpdateInfo) =>
    set({ status: "downloaded", version: info.version, percent: 100 }),
  );
  autoUpdater.on("error", (err: Error) => set({ status: "error", error: err.message }));
}

export function updateState(): UpdateState {
  return state;
}

/** Check for the latest version, or for one chosen version (which may be older). */
export async function checkForUpdate(version?: unknown): Promise<UpdateState> {
  if (state.status === "unsupported") return state;
  if (state.status === "downloading") return state;
  try {
    if (typeof version === "string") {
      if (!VERSION_RE.test(version)) throw new Error("invalid version");
      autoUpdater.allowDowngrade = true;
      autoUpdater.setFeedURL({
        provider: "generic",
        url: `https://github.com/${RELEASES.owner}/${RELEASES.repo}/releases/download/v${version}`,
      });
      set({ downgrade: compareVersions(version, app.getVersion()) < 0 });
    } else {
      autoUpdater.allowDowngrade = false;
      autoUpdater.setFeedURL({ provider: "github", ...RELEASES });
      set({ downgrade: false });
    }
    await autoUpdater.checkForUpdates();
  } catch (err) {
    set({ status: "error", error: err instanceof Error ? err.message : String(err) });
  }
  return state;
}

export async function downloadUpdate(): Promise<UpdateState> {
  if (state.status !== "available") return state;
  set({ status: "downloading", percent: 0 });
  try {
    await autoUpdater.downloadUpdate();
  } catch (err) {
    set({ status: "error", error: err instanceof Error ? err.message : String(err) });
  }
  return state;
}

/** Stops the backend first (so no file of the install folder is in use), then quits
 *  and runs the installer, which reopens the app. */
export async function installUpdate(beforeQuit: () => Promise<void>): Promise<boolean> {
  if (state.status !== "downloaded") return false;
  await beforeQuit();
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
  return true;
}

export async function listReleases(): Promise<ReleaseInfo[]> {
  const res = await net.fetch(RELEASES_API, {
    headers: { accept: "application/vnd.github+json", "user-agent": "IELTS-Pilot" },
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  const data = (await res.json()) as {
    tag_name: string;
    name: string | null;
    published_at: string;
    body: string | null;
    draft: boolean;
    prerelease: boolean;
  }[];
  return data
    .filter((r) => !r.draft && !r.prerelease && /^v\d+\.\d+\.\d+$/.test(r.tag_name))
    .map((r) => ({
      version: r.tag_name.slice(1),
      name: r.name ?? r.tag_name,
      publishedAt: r.published_at,
      notes: r.body ?? "",
    }));
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}
