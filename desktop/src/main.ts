// IELTS Pilot — Electron main process.
//
// Startup order: window first (shows a loading state), backend second. The UI polls
// app://ui/api/v1/health and gets 503 "backend_starting" until the backend is ready.

import { app, BrowserWindow, dialog, protocol, screen, session } from "electron";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  startBackend,
  stopBackend,
  type BackendLaunch,
  type BackendState,
} from "./backend";
import { registerIpc } from "./ipc";
import { StudyPanel } from "./panel";
import { checkForUpdate, initUpdater } from "./updater";
import { APP_ORIGIN, makeHandler } from "./protocol";

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const smokeArg = process.argv.find((a) => a.startsWith("--smoke-test="));
const smokeOutFile = smokeArg ? smokeArg.slice("--smoke-test=".length) : null;
if (smokeOutFile) app.disableHardwareAcceleration();

// Offline-first: the session spellchecker would download dictionaries from Google
// as soon as the default session exists, so turn it off at the earliest hook.
app.once("ready", () => {
  session.defaultSession.setSpellCheckerEnabled(false);
  session.defaultSession.setSpellCheckerLanguages([]);
});

let state: BackendState = { status: "starting" };
let booting: Promise<void> | null = null;
let shuttingDown = false;
let panel: StudyPanel | null = null;

function dataDir(): string {
  return app.getPath("userData"); // %APPDATA%\IELTS Pilot on Windows
}

function log(message: string): void {
  try {
    const dir = join(dataDir(), "logs");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "main.log"), `${new Date().toISOString()} ${message}\n`, "utf-8");
  } catch {
    // logging must never crash the app
  }
}

function uiDir(): string {
  return app.isPackaged
    ? join(app.getAppPath(), "ui")
    : join(__dirname, "..", "..", "frontend", "dist");
}

function backendLaunch(): BackendLaunch {
  if (app.isPackaged) {
    const exe = process.platform === "win32" ? "ielts_pilot_backend.exe" : "ielts_pilot_backend";
    return { command: join(process.resourcesPath, "backend", exe), args: [] };
  }
  const backendDir = join(__dirname, "..", "..", "backend");
  const python = process.env.IP_PYTHON ?? (process.platform === "win32" ? "python" : "python3");
  return { command: python, args: [join(backendDir, "run_backend.py")], cwd: backendDir };
}

function boot(extraEnv: Record<string, string> = {}): Promise<void> {
  if (booting) return booting;
  state = { status: "starting" };
  booting = (async () => {
    try {
      const backend = await startBackend(backendLaunch(), dataDir(), extraEnv);
      state = { status: "ready", backend };
      log(`backend healthy on 127.0.0.1:${backend.port} after ${backend.startupMs} ms`);
      backend.process.once("exit", (code) => {
        log(`backend exited (code ${code})`);
        if (!shuttingDown) {
          state = {
            status: "failed",
            message: `The local service stopped unexpectedly (code ${code}).`,
          };
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      state = { status: "failed", message };
      log(`backend start failed: ${message}`);
    } finally {
      booting = null;
    }
  })();
  return booting;
}

async function restartBackend(restoreCompatible = false): Promise<string> {
  if (state.status === "ready") return state.status;
  // After installing an older version: go back to the newest backup it can read (D-027).
  await boot(restoreCompatible ? { IP_RESTORE_COMPATIBLE: "1" } : {});
  return state.status;
}

function createWindow(hidden: boolean): { win: BrowserWindow; loaded: Promise<void> } {
  const area = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: Math.min(1320, area.width),
    height: Math.min(860, area.height),
    minWidth: 900,
    minHeight: 580,
    show: false,
    backgroundColor: "#f6f7f9",
    title: "IELTS Pilot",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // No spellchecker: it downloads dictionaries from Google, and the real IELTS
      // exam has no spellcheck, so practice should not have one either.
      spellcheck: false,
      backgroundThrottling: !hidden,
    },
  });
  if (!hidden) win.once("ready-to-show", () => win.show());
  panel = new StudyPanel(win, () => join(dataDir(), "library"));
  win.on("closed", () => {
    panel = null;
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`${APP_ORIGIN}/`)) event.preventDefault();
  });
  const loaded = new Promise<void>((resolve, reject) => {
    win.webContents.once("did-finish-load", () => resolve());
    win.webContents.once("did-fail-load", (_e, code, desc) =>
      reject(new Error(`UI failed to load: ${code} ${desc}`)),
    );
  });
  void win.loadURL(`${APP_ORIGIN}/index.html`);
  return { win, loaded };
}

// Runs inside the page: waits for the UI to leave its boot screen, then exercises
// renderer -> app:// proxy -> backend -> SQLite, a backup, and the bridge.
const SMOKE_PROBE = `(async () => {
  const el = () => document.querySelector('[data-testid="app-state"]');
  for (let i = 0; i < 300 && (!el() || el().dataset.state === 'booting'); i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  const uiState = el() ? el().dataset.state : 'missing';
  const before = await fetch('api/v1/profile');
  const previousValue = before.ok ? (await before.json()).display_name : null;
  const written = 'smoke-' + new Date().toISOString();
  const put = await fetch('api/v1/profile', {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      display_name: written, interface_language: 'ar', explanation_language: 'balanced',
      target_overall: 7.5, minimum_per_skill: 6.5,
      study_days_per_week: 5, study_minutes_per_day: 60,
    }),
  });
  const after = await (await fetch('api/v1/profile')).json();
  const backup = await fetch('api/v1/backups', { method: 'POST' });
  const backupName = backup.ok ? (await backup.json()).name : null;
  const listed = await (await fetch('api/v1/backups')).json();
  const shutdown = await fetch('api/v1/shutdown', { method: 'POST' });
  const resources = await (await fetch('api/v1/resources')).json();
  const started = await fetch('api/v1/sessions/start', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ skill: 'listening' }),
  });
  const sessionId = started.ok ? (await started.json()).id : null;
  const stopped = sessionId === null ? null : await fetch('api/v1/sessions/' + sessionId + '/stop', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  let panelUrl = null;
  if (window.ipBridge && window.ipBridge.panel) {
    await window.ipBridge.panel.setBounds({ x: 0, y: 0, width: 400, height: 300 });
    await window.ipBridge.panel.open({ library: 'smoke-panel.txt' }, false);
    for (let i = 0; i < 100; i++) {
      const s = await window.ipBridge.panel.state();
      if (s.open && !s.loading && s.url) { panelUrl = s.url; break; }
      await new Promise((r) => setTimeout(r, 100));
    }
    await window.ipBridge.panel.close();
  }
  const iso = new Date().toISOString().slice(0, 10);
  const planDay = await fetch('api/v1/plan/day?date=' + iso + '&today=' + iso);
  const planBody = planDay.ok ? await planDay.json() : null;
  const feedXml = '<?xml version="1.0"?><rss><channel><title>t</title><item><guid>g1</guid>' +
    '<title>Daily IELTS Listening #1</title><description>https://drive.google.com/file/d/' +
    'ABCDEFGHIJKLMNOP/view</description><enclosure url="https://feeds.soundcloud.com/x.mp3" ' +
    'type="audio/mpeg"/></item></channel></rss>';
  const imported = await fetch('api/v1/podcasts/dalilk_ielts/import', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ xml: feedXml }),
  });
  const nextEp = await fetch('api/v1/podcasts/dalilk_ielts/next');
  const nextBody = nextEp.ok ? await nextEp.json() : null;
  const englishImport = await fetch('api/v1/podcasts/dalilk_english/import', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ xml: feedXml.replace('Daily IELTS Listening #1', 'English Listening #1') }),
  });
  const queue = await fetch('api/v1/content/queue?kind=video&groups=core&skills=L&limit=2');
  const queueBody = queue.ok ? await queue.json() : [];
  const novels = await fetch('api/v1/content/queue?kind=novel&level=beginner');
  const novelBody = novels.ok ? await novels.json() : [];
  let rejected = false;
  try { await window.ipBridge.panel.open({ url: 'file:///C:/Windows/win.ini' }, false); }
  catch { rejected = true; }
  return {
    uiState,
    previousValue,
    writtenValue: written,
    putStatus: put.status,
    roundTrip: after.display_name === written,
    backupCreated: !!backupName && listed.some((b) => b.name === backupName && b.valid),
    shutdownBlockedFromRenderer: shutdown.status === 403,
    bridgePresent: typeof window.ipBridge === 'object',
    catalogResources: Array.isArray(resources) ? resources.length : 0,
    sessionRecorded: !!stopped && stopped.ok,
    panelShowedLibraryFile: !!panelUrl && panelUrl.endsWith('smoke-panel.txt'),
    panelRejectsFileUrl: rejected,
    planDayOk: planDay.status === 200 && !!planBody && typeof planBody.kind === 'string',
    podcastOk: imported.status === 200 && !!nextBody && nextBody.number === 1 &&
      typeof nextBody.transcript_url === 'string' && englishImport.status === 200,
    contentOk: queueBody.length === 2 && novelBody.length === 1 &&
      String(novelBody[0].url).startsWith('https://publuu.com/'),
  };
})()`;

async function runSmoke(outFile: string): Promise<number> {
  const result: Record<string, unknown> = { ok: false, platform: process.platform };
  try {
    result.dataDir = dataDir();
    mkdirSync(join(dataDir(), "library"), { recursive: true });
    writeFileSync(join(dataDir(), "library", "smoke-panel.txt"), "IELTS Pilot panel smoke\n");
    const { win, loaded } = createWindow(true);
    await Promise.all([loaded, boot()]);
    if (state.status !== "ready") throw new Error(`backend ${state.status}`);
    result.backendStartupMs = state.backend.startupMs;
    const probe = (await win.webContents.executeJavaScript(SMOKE_PROBE, true)) as Record<
      string,
      unknown
    >;
    Object.assign(result, probe);
    result.ok =
      (probe.uiState === "setup" || probe.uiState === "home") &&
      probe.putStatus === 200 &&
      probe.roundTrip === true &&
      probe.backupCreated === true &&
      probe.shutdownBlockedFromRenderer === true &&
      probe.bridgePresent === true &&
      typeof probe.catalogResources === "number" &&
      probe.catalogResources > 0 &&
      probe.sessionRecorded === true &&
      probe.panelShowedLibraryFile === true &&
      probe.panelRejectsFileUrl === true &&
      probe.planDayOk === true &&
      probe.contentOk === true &&
      probe.podcastOk === true;
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  writeFileSync(outFile, JSON.stringify(result, null, 2), "utf-8");
  log(`smoke test finished: ok=${String(result.ok)}`);
  return result.ok ? 0 : 1;
}

async function shutdown(): Promise<void> {
  if (booting) await booting;
  if (state.status === "ready") await stopBackend(state.backend);
}

async function main(): Promise<void> {
  // Only the microphone, audio only, for the speaking recorder of our own UI (v0.0.10);
  // everything else is refused.
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    const types = (details as { mediaTypes?: string[] }).mediaTypes ?? [];
    const from = (details as { requestingUrl?: string }).requestingUrl ?? wc.getURL();
    callback(
      permission === "media" &&
        from.startsWith(`${APP_ORIGIN}/`) &&
        types.length > 0 &&
        types.every((t) => t === "audio"),
    );
  });
  protocol.handle("app", makeHandler(uiDir(), () => state));
  registerIpc({
    dataDir,
    restartBackend,
    documentsDir: () => app.getPath("documents"),
    panel: () => panel,
    mainAudible: () =>
      BrowserWindow.getAllWindows().some(
        (w) => !w.isDestroyed() && w.webContents.isCurrentlyAudible(),
      ),
    beforeUpdateInstall: async () => {
      shuttingDown = true;
      await shutdown();
      log("stopped the backend for an update");
    },
  });
  log(`starting ${app.getName()} ${app.getVersion()} packaged=${app.isPackaged}`);

  if (smokeOutFile) {
    const code = await runSmoke(smokeOutFile);
    shuttingDown = true;
    await shutdown();
    app.exit(code);
    return;
  }

  const { win } = createWindow(false);
  initUpdater(win, log);
  void boot();
  // Look for a new version once, quietly, after start-up; offline is fine.
  setTimeout(() => void checkForUpdate(), 20_000);
}

// A second launch focuses the existing window (skipped for smoke tests).
if (!smokeOutFile && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", (event) => {
    if (shuttingDown) return;
    event.preventDefault();
    shuttingDown = true;
    void shutdown().finally(() => app.quit());
  });
  void app.whenReady().then(main).catch((err: unknown) => {
    log(`fatal: ${String(err)}`);
    dialog.showErrorBox("IELTS Pilot", String(err));
    app.exit(1);
  });
}
