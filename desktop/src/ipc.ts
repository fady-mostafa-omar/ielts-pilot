// IPC handlers behind the preload bridge. Every handler checks the caller is our UI.

import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  net,
  powerMonitor,
  session,
  shell,
  type IpcMainInvokeEvent,
} from "electron";
import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  clearWebData,
  TEMP_PARTITION,
  type Bounds,
  type PanelTarget,
  type StudyPanel,
} from "./panel";
import { APP_ORIGIN } from "./protocol";
import {
  checkForUpdate,
  downloadUpdate,
  installUpdate,
  listReleases,
  updateNow,
  updateState,
} from "./updater";

const BACKUP_NAME = /^ielts-pilot-[A-Za-z0-9._-]+\.zip$/;

// Podcast feeds the listening player may download (public RSS, as podcast apps use).
const FEEDS: Record<string, string> = {
  dalilk_ielts: "https://feeds.soundcloud.com/users/soundcloud:users:672776474/sounds.rss",
  dalilk_english: "https://anchor.fm/s/f5d461d8/podcast/rss",
};
const MAX_FEED_BYTES = 30_000_000;

// v0.0.11 (D-041): the two Dalilk pages the word and phrase cards are read from, on this
// computer, like the podcast feeds. Nothing else can be fetched this way.
const DALILK_PAGES: Record<string, string> = {
  words: "https://dalilk.com/resources/foundation/words",
  phrases: "https://dalilk.com/resources/fluency/workplace",
};
const MAX_PAGE_BYTES = 10_000_000;

/** The page as a browser shows it (scripts run), for pages built in the browser. */
async function renderedPage(url: string): Promise<string> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      partition: TEMP_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.on("will-navigate", (event, target) => {
    if (target !== url) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.setAudioMuted(true);
  try {
    await win.loadURL(url);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const html = await win.webContents.executeJavaScript(
      "document.documentElement.outerHTML",
      true,
    );
    if (typeof html !== "string" || html.length > MAX_PAGE_BYTES) throw new Error("bad page");
    return html;
  } finally {
    win.destroy();
  }
}

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
    if (typeof v.video === "string") return { video: v.video };
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

const MAX_RECORDING_BYTES = 20 * 1024 * 1024; // a minute of speech is well under 1 MB
// v0.0.12: only files this app wrote can be read back or deleted
// v0.0.17: "model" is the learner reading the model answer aloud
const RECORDING_NAME = /^(speaking|shadow|model)-[0-9]{8}-[0-9]{6}(-[0-9]+)?\.webm$/;
const MAX_COPY_CHARS = 200_000;

// v0.0.17 (owner, 2026-11-05): every answer is saved as one PDF, with its recordings beside it,
// in Documents/IELTS Band Up/إجاباتي. The UI proposes a name; the file always lands there.
const ANSWERS_PATH = ["IELTS Band Up", "إجاباتي"];
const ANSWER_FILE = /\.(pdf|wav)$/i;
const AUDIO_LABELS: Record<string, string> = {
  mine: "إجابتي",
  model: "الإجابة النموذجية بصوتي",
};
const MAX_PDF_HTML = 6_000_000; // the page carries its own fonts and logo
const MAX_AUDIO_BYTES = 80 * 1024 * 1024; // WAV, 16 kHz mono: about 2 MB a minute
const PDF_PARTITION = "ip-pdf"; // in memory, nothing is fetched from the network

/** A file name stem that is safe on Windows and Linux; folders cannot be named. */
function answerStem(value: unknown): string {
  if (typeof value !== "string") throw new Error("bad name");
  const stem = value
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 150)
    .replace(/^[\s.]+|[\s.]+$/g, "");
  if (!stem) throw new Error("bad name");
  return stem;
}

function isWav(data: ArrayBuffer): boolean {
  if (data.byteLength < 44) return false;
  const head = Buffer.from(data, 0, 12);
  return head.toString("latin1", 0, 4) === "RIFF" && head.toString("latin1", 8, 12) === "WAVE";
}

/** Prints self-contained HTML to an A4 PDF in a hidden window with scripts and network off. */
async function htmlToPdf(html: string): Promise<Buffer> {
  const folder = await mkdtemp(join(tmpdir(), "ielts-band-up-"));
  const page = join(folder, "answer.html");
  const pageUrl = pathToFileURL(page).href;
  await writeFile(page, html, "utf8");
  const ses = session.fromPartition(PDF_PARTITION);
  // only our own temporary pages and the fonts and logo inside them (compared decoded and
  // in lower case: Windows paths may differ in letter case or in how they are encoded)
  const plain = (url: string) => {
    try {
      return decodeURIComponent(url).toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  };
  const ours = plain(pathToFileURL(join(tmpdir(), "ielts-band-up-")).href);
  ses.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url;
    callback({ cancel: !(url.startsWith("data:") || plain(url).startsWith(ours)) });
  });
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      session: ses,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: false,
    },
  });
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  try {
    await win.loadURL(pageUrl);
    return await win.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate:
        '<div style="width:100%;font-size:8px;color:#8a94a6;text-align:center;' +
        'font-family:sans-serif"><span class="pageNumber"></span> / ' +
        '<span class="totalPages"></span></div>',
    });
  } finally {
    win.destroy();
    await rm(folder, { recursive: true, force: true });
  }
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
        title: "IELTS Band Up",
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

  // v0.0.10: the speaking recorder's one-minute recordings stay in the data folder
  const recordingsDir = () => join(deps.dataDir(), "recordings");
  ipcMain.handle(
    "ip:save-recording",
    guard(async (_event, data: unknown, kind: unknown) => {
      if (!(data instanceof ArrayBuffer) || data.byteLength === 0) {
        throw new Error("invalid recording");
      }
      if (data.byteLength > MAX_RECORDING_BYTES) throw new Error("recording too large");
      await mkdir(recordingsDir(), { recursive: true });
      const prefix = kind === "shadow" || kind === "model" ? kind : "speaking";
      const fileName = `${prefix}-${stamp()}.webm`;
      await writeFile(join(recordingsDir(), fileName), Buffer.from(data));
      return fileName;
    }),
  );
  ipcMain.handle(
    "ip:read-recording",
    guard(async (_event, name: unknown) => {
      if (typeof name !== "string" || !RECORDING_NAME.test(name)) throw new Error("bad name");
      const data = await readFile(join(recordingsDir(), name));
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    }),
  );
  ipcMain.handle(
    "ip:delete-recording",
    guard(async (_event, name: unknown) => {
      if (typeof name !== "string" || !RECORDING_NAME.test(name)) throw new Error("bad name");
      await rm(join(recordingsDir(), name), { force: true });
      return true;
    }),
  );
  // v0.0.17: answers as PDF and WAV files the learner keeps (owner, 2026-11-05)
  const answersDir = () => {
    // a Linux home without its user folders set up gives the home itself: use ~/Documents
    const docs = deps.documentsDir();
    const base = docs === app.getPath("home") ? join(docs, "Documents") : docs;
    return join(base, ...ANSWERS_PATH);
  };
  ipcMain.handle(
    "ip:answer-name",
    guard(async (_event, stem: unknown, current: unknown) => {
      // the same answer saved again keeps its file name
      if (typeof current === "string" && current.toLowerCase().endsWith(".pdf")) {
        return answerStem(current.slice(0, -4));
      }
      const base = answerStem(stem);
      for (let n = 1; n < 100; n += 1) {
        const candidate = n === 1 ? base : `${base} (${n})`;
        if (!existsSync(join(answersDir(), `${candidate}.pdf`))) return candidate;
      }
      throw new Error("too many answers with this name");
    }),
  );
  ipcMain.handle(
    "ip:save-answer-pdf",
    guard(async (_event, stem: unknown, html: unknown) => {
      const name = `${answerStem(stem)}.pdf`;
      if (typeof html !== "string" || html.length > MAX_PDF_HTML) throw new Error("bad page");
      const pdf = await htmlToPdf(html);
      await mkdir(answersDir(), { recursive: true });
      await writeFile(join(answersDir(), name), pdf);
      return name;
    }),
  );
  ipcMain.handle(
    "ip:save-answer-audio",
    guard(async (_event, stem: unknown, label: unknown, data: unknown) => {
      const suffix = typeof label === "string" ? AUDIO_LABELS[label] : undefined;
      if (!suffix) throw new Error("bad label");
      if (!(data instanceof ArrayBuffer) || !isWav(data)) throw new Error("not a WAV file");
      if (data.byteLength > MAX_AUDIO_BYTES) throw new Error("recording too large");
      const name = `${answerStem(stem)} · ${suffix}.wav`;
      await mkdir(answersDir(), { recursive: true });
      await writeFile(join(answersDir(), name), Buffer.from(data));
      return name;
    }),
  );
  ipcMain.handle(
    "ip:list-answers",
    guard(async () => {
      if (!existsSync(answersDir())) return [];
      const entries = await readdir(answersDir(), { withFileTypes: true });
      const files = await Promise.all(
        entries
          .filter((e) => e.isFile() && ANSWER_FILE.test(e.name) && !e.name.startsWith("."))
          .map(async (e) => {
            const info = await stat(join(answersDir(), e.name));
            return { name: e.name, size: info.size, modified: info.mtimeMs };
          }),
      );
      return files.sort((a, b) => b.modified - a.modified);
    }),
  );
  ipcMain.handle(
    "ip:open-answer",
    guard(async (_event, name: unknown) => {
      if (
        typeof name !== "string" ||
        basename(name) !== name ||
        name.startsWith(".") ||
        !ANSWER_FILE.test(name)
      ) {
        throw new Error("bad name");
      }
      const file = join(answersDir(), name);
      if (!existsSync(file)) return false;
      return (await shell.openPath(file)) === "";
    }),
  );
  // "نزّل التسجيل": a copy the learner uploads to ChatGPT himself (no API, owner 2026-11-05)
  ipcMain.handle(
    "ip:export-audio",
    guard(async (event, data: unknown, suggested: unknown) => {
      if (!(data instanceof ArrayBuffer) || !isWav(data)) throw new Error("not a WAV file");
      if (data.byteLength > MAX_AUDIO_BYTES) throw new Error("recording too large");
      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const options = {
        title: "IELTS Band Up",
        defaultPath: join(app.getPath("downloads"), `${answerStem(suggested)}.wav`),
        filters: [{ name: "WAV audio", extensions: ["wav"] }],
      };
      const result = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return null;
      await writeFile(result.filePath, Buffer.from(data));
      shell.showItemInFolder(result.filePath);
      return basename(result.filePath);
    }),
  );
  // v0.0.12: the tutor prompt goes to the clipboard; the owner pastes it himself (D-026)
  ipcMain.handle(
    "ip:copy-text",
    guard(async (_event, text: unknown) => {
      if (typeof text !== "string" || text.length > MAX_COPY_CHARS) throw new Error("bad text");
      clipboard.writeText(text);
      return true;
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
  ipcMain.handle("ip:update-now", guard(async () => updateNow(deps.beforeUpdateInstall)));

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
    "ip:dalilk-page",
    guard(async (_event, which: unknown, rendered: unknown) => {
      const url = typeof which === "string" ? DALILK_PAGES[which] : undefined;
      if (!url) throw new Error("unknown page");
      if (rendered === true) return renderedPage(url);
      const res = await net.fetch(url, { headers: { "user-agent": "IELTS-Pilot" } });
      if (!res.ok) throw new Error(`page answered ${res.status}`);
      const text = await res.text();
      if (text.length > MAX_PAGE_BYTES) throw new Error("page too large");
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
      const target =
        which === "backups" ? backupsDir() : which === "answers" ? answersDir() : deps.dataDir();
      await mkdir(target, { recursive: true });
      return (await shell.openPath(target)) === "";
    }),
  );

  ipcMain.handle(
    "ip:import-backup",
    guard(async (event) => {
      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const options = {
        title: "IELTS Band Up",
        filters: [{ name: "IELTS Band Up backup", extensions: ["zip"] }],
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
        title: "IELTS Band Up",
        defaultPath: join(deps.documentsDir(), name),
        filters: [{ name: "IELTS Band Up backup", extensions: ["zip"] }],
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
