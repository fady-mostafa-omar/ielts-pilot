// IPC handlers behind the preload bridge. Every handler checks the caller is our UI.

import {
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  powerMonitor,
  shell,
  type IpcMainInvokeEvent,
} from "electron";
import { copyFile, mkdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { clearWebData, type Bounds, type PanelTarget, type StudyPanel } from "./panel";
import { APP_ORIGIN } from "./protocol";
import {
  checkForUpdate,
  downloadUpdate,
  installUpdate,
  listReleases,
  updateState,
} from "./updater";

const BACKUP_NAME = /^ielts-pilot-[A-Za-z0-9._-]+\.zip$/;

// Podcast feeds the listening player may download (public RSS, as podcast apps use).
const FEEDS: Record<string, string> = {
  dalilk_ielts: "https://feeds.soundcloud.com/users/soundcloud:users:672776474/sounds.rss",
  dalilk_english: "https://anchor.fm/s/f5d461d8/podcast/rss",
};
const MAX_FEED_BYTES = 30_000_000;

export interface IpcDeps {
  dataDir: () => string;
  mainAudible: () => boolean;
  beforeUpdateInstall: () => Promise<void>;
  restartBackend: (restoreCompatible?: boolean) => Promise<string>;
  documentsDir: () => string;
  panel: () => StudyPanel | null;
}

// Files the panel can show with Chromium's own viewers.
const LIBRARY_FORMATS: Record<string, string> = {
  ".pdf": "pdf",
  ".mp3": "audio",
  ".m4a": "audio",
  ".wav": "audio",
  ".ogg": "audio",
  ".mp4": "video",
  ".webm": "video",
  ".txt": "text",
};

function safeFileName(original: string): string {
  const ext = extname(original).toLowerCase();
  const stem = basename(original, extname(original))
    .replace(/[^A-Za-z0-9._ ()-]+/g, "_")
    .replace(/^[^A-Za-z0-9]+/, "")
    .slice(0, 100);
  return `${stamp()}-${stem || "file"}${ext}`;
}

function parseTarget(value: unknown): PanelTarget {
  if (typeof value === "object" && value !== null) {
    const v = value as Record<string, unknown>;
    if (typeof v.url === "string") return { url: v.url };
    if (typeof v.library === "string") return { library: v.library };
  }
  throw new Error("invalid panel target");
}

function parseBounds(value: unknown): Bounds {
  const v = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const num = (n: unknown) => (typeof n === "number" ? n : 0);
  return { x: num(v.x), y: num(v.y), width: num(v.width), height: num(v.height) };
}

function fromOurUi(event: IpcMainInvokeEvent): boolean {
  return event.senderFrame?.url.startsWith(`${APP_ORIGIN}/`) ?? false;
}

function guard<A extends unknown[], R>(
  handler: (event: IpcMainInvokeEvent, ...args: A) => Promise<R>,
) {
  return async (event: IpcMainInvokeEvent, ...args: A): Promise<R> => {
    if (!fromOurUi(event)) throw new Error("forbidden");
    return handler(event, ...args);
  };
}

function stamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

export function registerIpc(deps: IpcDeps): void {
  const backupsDir = () => join(deps.dataDir(), "backups");
  const libraryDir = () => join(deps.dataDir(), "library");
  const panel = (): StudyPanel => {
    const p = deps.panel();
    if (!p) throw new Error("no window");
    return p;
  };

  ipcMain.handle(
    "ip:panel-open",
    guard(async (_event, target: unknown, keepSignIn: unknown) =>
      panel().open(parseTarget(target), keepSignIn === true),
    ),
  );
  ipcMain.handle(
    "ip:panel-bounds",
    guard(async (_event, bounds: unknown) => panel().setBounds(parseBounds(bounds))),
  );
  ipcMain.handle(
    "ip:panel-visible",
    guard(async (_event, visible: unknown) => panel().setVisible(visible === true)),
  );
  ipcMain.handle("ip:panel-nav", guard(async (_event, action: unknown) => panel().navigate(action)));
  ipcMain.handle("ip:panel-close", guard(async () => panel().close()));
  ipcMain.handle("ip:panel-external", guard(async () => panel().openExternally()));
  ipcMain.handle("ip:panel-state", guard(async () => panel().state()));
  // Study timer: idle seconds of keyboard/mouse, and whether the panel is playing sound
  // (listening practice is "active" even with no input).
  ipcMain.handle(
    "ip:activity",
    guard(async () => ({
      idleSeconds: powerMonitor.getSystemIdleTime(),
      audible: (deps.panel()?.isAudible() ?? false) || deps.mainAudible(),
    })),
  );
  ipcMain.handle("ip:clear-web-data", guard(async () => clearWebData()));

  ipcMain.handle(
    "ip:add-library-file",
    guard(async (event) => {
      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const options = {
        title: "IELTS Pilot",
        filters: [
          {
            name: "PDF, audio, video, text",
            extensions: Object.keys(LIBRARY_FORMATS).map((e) => e.slice(1)),
          },
        ],
        properties: ["openFile" as const],
      };
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || result.filePaths.length === 0) return null;
      const source = result.filePaths[0];
      const format = LIBRARY_FORMATS[extname(source).toLowerCase()];
      if (!format) return null;
      await mkdir(libraryDir(), { recursive: true });
      const fileName = safeFileName(basename(source));
      await copyFile(source, join(libraryDir(), fileName));
      return { fileName, title: basename(source, extname(source)), format };
    }),
  );

  ipcMain.handle(
    "ip:restart-backend",
    guard(async (_event, options: unknown) =>
      deps.restartBackend(
        typeof options === "object" &&
          options !== null &&
          (options as { restoreCompatible?: unknown }).restoreCompatible === true,
      ),
    ),
  );

  // Focus mode can take the whole screen.
  ipcMain.handle(
    "ip:fullscreen",
    guard(async (event, on: unknown) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return false;
      win.setFullScreen(on === true);
      return win.isFullScreen();
    }),
  );

  // Updates (D-027)
  ipcMain.handle("ip:update-state", guard(async () => updateState()));
  ipcMain.handle("ip:update-check", guard(async (_e, version: unknown) => checkForUpdate(version)));
  ipcMain.handle("ip:update-download", guard(async () => downloadUpdate()));
  ipcMain.handle(
    "ip:update-install",
    guard(async () => installUpdate(deps.beforeUpdateInstall)),
  );

  ipcMain.handle(
    "ip:podcast-feed",
    guard(async (_event, feed: unknown) => {
      const url = typeof feed === "string" ? FEEDS[feed] : undefined;
      if (!url) throw new Error("unknown feed");
      const res = await net.fetch(url, { headers: { "user-agent": "IELTS-Pilot" } });
      if (!res.ok) throw new Error(`feed answered ${res.status}`);
      const text = await res.text();
      if (text.length > MAX_FEED_BYTES) throw new Error("feed too large");
      return text;
    }),
  );

  ipcMain.handle(
    "ip:open-external",
    guard(async (_event, url: unknown) => {
      if (typeof url !== "string" || !/^https:\/\/[^\s]+$/.test(url)) return false;
      await shell.openExternal(url);
      return true;
    }),
  );
  ipcMain.handle("ip:update-releases", guard(async () => listReleases()));

  ipcMain.handle(
    "ip:open-folder",
    guard(async (_event, which: unknown) => {
      const target = which === "backups" ? backupsDir() : deps.dataDir();
      await mkdir(target, { recursive: true });
      return (await shell.openPath(target)) === "";
    }),
  );

  ipcMain.handle(
    "ip:import-backup",
    guard(async (event) => {
      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const options = {
        title: "IELTS Pilot",
        filters: [{ name: "IELTS Pilot backup", extensions: ["zip"] }],
        properties: ["openFile" as const],
      };
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || result.filePaths.length === 0) return null;
      const source = result.filePaths[0];
      if (!source.toLowerCase().endsWith(".zip")) return null;
      await mkdir(backupsDir(), { recursive: true });
      const name = `ielts-pilot-imported-${stamp()}.zip`;
      await copyFile(source, join(backupsDir(), name));
      return name;
    }),
  );

  ipcMain.handle(
    "ip:export-backup",
    guard(async (event, name: unknown) => {
      if (typeof name !== "string" || !BACKUP_NAME.test(name) || basename(name) !== name) {
        throw new Error("invalid backup name");
      }
      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const options = {
        title: "IELTS Pilot",
        defaultPath: join(deps.documentsDir(), name),
        filters: [{ name: "IELTS Pilot backup", extensions: ["zip"] }],
      };
      const result = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return false;
      await copyFile(join(backupsDir(), name), result.filePath);
      return true;
    }),
  );
}
