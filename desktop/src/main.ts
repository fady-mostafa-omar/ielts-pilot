// IELTS Pilot — Electron main process (packaging spike).

import { app, BrowserWindow, dialog, protocol, session } from "electron";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startBackend, stopBackend, type BackendLaunch, type RunningBackend } from "./backend";
import { APP_ORIGIN, makeHandler } from "./protocol";

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const smokeArg = process.argv.find((a) => a.startsWith("--smoke-test="));
const smokeOutFile = smokeArg ? smokeArg.slice("--smoke-test=".length) : null;
if (smokeOutFile) app.disableHardwareAcceleration();

let backend: RunningBackend | null = null;
let shuttingDown = false;

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

function createWindow(hidden: boolean): { win: BrowserWindow; loaded: Promise<void> } {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    show: !hidden,
    title: "IELTS Pilot",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: !hidden,
    },
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

// Runs inside the page: checks the UI rendered, then exercises the full
// renderer -> app:// proxy -> backend -> SQLite chain.
const SMOKE_PROBE = `(async () => {
  const el = () => document.querySelector('[data-testid="backend-status"]');
  for (let i = 0; i < 150 && (!el() || el().dataset.state === 'loading'); i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  const uiState = el() ? el().dataset.state : 'missing';
  const before = await (await fetch('api/v1/spike/value')).json();
  const written = 'smoke-' + new Date().toISOString();
  const put = await fetch('api/v1/spike/value', {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value: written }),
  });
  const after = await (await fetch('api/v1/spike/value')).json();
  const shutdown = await fetch('api/v1/shutdown', { method: 'POST' });
  return {
    uiState,
    previousValue: before.value,
    writtenValue: written,
    putStatus: put.status,
    roundTrip: after.value === written,
    shutdownBlockedFromRenderer: shutdown.status === 403,
  };
})()`;

async function runSmoke(outFile: string): Promise<number> {
  const result: Record<string, unknown> = { ok: false, platform: process.platform };
  try {
    result.dataDir = dataDir();
    result.backendStartupMs = backend?.startupMs;
    const { win, loaded } = createWindow(true);
    await loaded;
    const probe = (await win.webContents.executeJavaScript(SMOKE_PROBE, true)) as Record<
      string,
      unknown
    >;
    Object.assign(result, probe);
    result.ok =
      probe.uiState === "ok" &&
      probe.putStatus === 200 &&
      probe.roundTrip === true &&
      probe.shutdownBlockedFromRenderer === true;
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  writeFileSync(outFile, JSON.stringify(result, null, 2), "utf-8");
  log(`smoke test finished: ok=${String(result.ok)}`);
  return result.ok ? 0 : 1;
}

async function shutdown(): Promise<void> {
  if (backend) {
    await stopBackend(backend);
    backend = null;
  }
}

async function main(): Promise<void> {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );
  protocol.handle("app", makeHandler(uiDir(), () => backend));

  log(`starting ${app.getName()} ${app.getVersion()} packaged=${app.isPackaged}`);
  try {
    backend = await startBackend(backendLaunch(), dataDir());
    log(`backend healthy on 127.0.0.1:${backend.port} after ${backend.startupMs} ms`);
    backend.process.once("exit", (code) => {
      log(`backend exited (code ${code})`);
      if (!shuttingDown) {
        dialog.showErrorBox(
          "IELTS Pilot",
          `The local service stopped unexpectedly.\nLogs: ${join(dataDir(), "logs")}`,
        );
        app.quit();
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`backend start failed: ${message}`);
    if (smokeOutFile) {
      writeFileSync(smokeOutFile, JSON.stringify({ ok: false, error: message }, null, 2));
      app.exit(1);
      return;
    }
    dialog.showErrorBox(
      "IELTS Pilot",
      `Could not start the local service.\n${message}\nLogs: ${join(dataDir(), "logs")}`,
    );
    app.exit(1);
    return;
  }

  if (smokeOutFile) {
    const code = await runSmoke(smokeOutFile);
    shuttingDown = true;
    await shutdown();
    app.exit(code);
    return;
  }

  createWindow(false);
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
    if (shuttingDown || !backend) return;
    event.preventDefault();
    shuttingDown = true;
    void shutdown().finally(() => app.quit());
  });
  void app.whenReady().then(main);
}
