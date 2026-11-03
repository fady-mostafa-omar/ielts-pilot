// The study panel: a sandboxed browser view placed inside the main window, next to the
// app's own UI, for Dalilk pages, SoundCloud, Drive PDFs, engnovate, AI sites and
// files from the owner's library.
//
// Security model
// - Separate session (partition) from the app UI: sites never see app://ui or its API.
// - "persist:web" keeps sign-ins on this computer only when the owner agreed to it in
//   Settings > Accounts; otherwise "web-temp" (in memory, gone when the app closes).
//   Passwords are typed into the sites themselves; the app never reads or stores them.
// - Only http(s) pages and files inside the library folder can be shown.
// - Permissions: microphone only for dalilk.com (its 3-minute speaking test);
//   everything else is denied.

import {
  app,
  BrowserWindow,
  session,
  shell,
  WebContentsView,
  type Session,
  type WebContents,
} from "electron";
import { existsSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const KEEP_PARTITION = "persist:web";
export const TEMP_PARTITION = "web-temp";
export const LIBRARY_NAME = /^[A-Za-z0-9][A-Za-z0-9._ ()-]{0,200}$/;

export type PanelTarget = { url: string } | { library: string } | { video: string };

// One YouTube video, alone (D-036): YouTube's own embedded player with its controls,
// navigation locked to that video, and its playing state reported to the UI so the app
// moves to the next lesson when it ends. YouTube's player itself is not modified.
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const EMBED = "https://www.youtube-nocookie.com/embed/";
const EMBED_QUERY = "?autoplay=1&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&fs=0";

const MEDIA_PROBE = `(() => { const v = document.querySelector('video');
  return v ? { current: v.currentTime || 0, duration: v.duration || 0, ended: v.ended,
  paused: v.paused } : null; })()`;

export interface MediaState {
  video: string;
  current: number;
  duration: number;
  ended: boolean;
  paused: boolean;
}

export interface PanelState {
  open: boolean;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  error: string | null;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const configured = new Set<string>();

function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function isDalilk(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "dalilk.com" || host.endsWith(".dalilk.com");
  } catch {
    return false;
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function webSession(partition: string): Session {
  const ses = session.fromPartition(partition);
  if (configured.has(partition)) return ses;
  configured.add(partition);

  ses.setSpellCheckerEnabled(false);
  ses.setSpellCheckerLanguages([]);
  // Present as plain Chrome: some sign-in pages refuse unknown embedded browsers.
  const appToken = new RegExp(`\\s(?:Electron|${escapeRegExp(app.getName())})/\\S+`, "g");
  ses.setUserAgent(ses.getUserAgent().replace(appToken, ""));

  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    if (permission === "media") {
      const types = "mediaTypes" in details ? (details.mediaTypes ?? []) : [];
      const audioOnly = types.length > 0 && types.every((t) => t === "audio");
      callback(audioOnly && isDalilk(details.requestingUrl));
      return;
    }
    callback(permission === "fullscreen" || permission === "clipboard-sanitized-write");
  });
  // The embedded player refuses to play without a referrer (YouTube "error 153");
  // the panel's own pages have no web origin, so the player's own site is named.
  ses.webRequest.onBeforeSendHeaders({ urls: [`${EMBED}*`] }, (details, callback) => {
    const headers = { ...details.requestHeaders };
    if (!headers.Referer && !headers.referer) headers.Referer = "https://www.youtube-nocookie.com/";
    callback({ requestHeaders: headers });
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    if (permission === "media") return isDalilk(requestingOrigin);
    return permission === "fullscreen" || permission === "clipboard-sanitized-write";
  });
  return ses;
}

export class StudyPanel {
  private view: WebContentsView | null = null;
  private partition: string | null = null;
  private bounds: Bounds = { x: 0, y: 0, width: 0, height: 0 };
  private visible = true;
  private lastError: string | null = null;
  private videoId: string | null = null;
  private mediaTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly win: BrowserWindow,
    private readonly libraryDir: () => string,
  ) {
    win.on("closed", () => {
      this.view = null;
    });
  }

  state(): PanelState {
    const wc = this.view?.webContents;
    if (!wc || wc.isDestroyed()) {
      return {
        open: false,
        url: "",
        title: "",
        loading: false,
        canGoBack: false,
        canGoForward: false,
        error: null,
      };
    }
    return {
      open: true,
      url: wc.getURL(),
      title: wc.getTitle(),
      loading: wc.isLoading(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      error: this.lastError,
    };
  }

  isAudible(): boolean {
    const wc = this.view?.webContents;
    return !!wc && !wc.isDestroyed() && wc.isCurrentlyAudible();
  }

  private emit(): void {
    if (!this.win.isDestroyed()) this.win.webContents.send("ip:panel-state", this.state());
  }

  private libraryUrl(name: string): string | null {
    if (!LIBRARY_NAME.test(name)) return null;
    const root = normalize(this.libraryDir());
    const full = normalize(join(root, name));
    if (!full.startsWith(root + sep) || !existsSync(full)) return null;
    return pathToFileURL(full).href;
  }

  private allowedNavigation(url: string): boolean {
    if (this.videoId) return url.startsWith(EMBED + this.videoId);
    if (isWebUrl(url)) return true;
    // A library file may only show itself (PDF viewer anchors, etc.).
    const current = this.view?.webContents.getURL() ?? "";
    return url.startsWith("file:") && current.startsWith("file:") &&
      url.split("#")[0] === current.split("#")[0];
  }

  private guardContents(wc: WebContents, partition: string): void {
    wc.on("will-navigate", (event, url) => {
      if (!this.allowedNavigation(url)) event.preventDefault();
    });
    wc.on("will-redirect", (event, url) => {
      if (!isWebUrl(url)) event.preventDefault();
    });
    wc.setWindowOpenHandler(({ url, disposition }) => {
      if (!isWebUrl(url) || this.videoId) return { action: "deny" };
      if (disposition === "new-window") {
        // Sign-in pop-ups ("Continue with Google") need a real window with an opener.
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            parent: this.win,
            width: 520,
            height: 700,
            autoHideMenuBar: true,
            title: "IELTS Pilot",
            webPreferences: {
              partition,
              sandbox: true,
              contextIsolation: true,
              nodeIntegration: false,
              spellcheck: false,
            },
          },
        };
      }
      // Ordinary "open in new tab" links stay in the panel.
      setImmediate(() => {
        if (!wc.isDestroyed()) void wc.loadURL(url);
      });
      return { action: "deny" };
    });
    wc.on("did-create-window", (child) => {
      child.webContents.on("will-navigate", (event, url) => {
        if (!isWebUrl(url)) event.preventDefault();
      });
      child.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    });
  }

  private ensureView(partition: string): WebContentsView {
    if (this.view && this.partition === partition && !this.view.webContents.isDestroyed()) {
      return this.view;
    }
    this.close();
    webSession(partition);
    const view = new WebContentsView({
      webPreferences: {
        partition,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false,
        plugins: true, // built-in PDF viewer
        webviewTag: false,
        safeDialogs: true,
      },
    });
    view.setBackgroundColor("#ffffff");
    const wc = view.webContents;
    this.guardContents(wc, partition);
    const update = () => this.emit();
    wc.on("did-start-loading", () => {
      this.lastError = null;
      update();
    });
    wc.on("did-stop-loading", update);
    wc.on("did-navigate", update);
    wc.on("did-navigate-in-page", update);
    wc.on("page-title-updated", update);
    wc.on("did-fail-load", (_e, code, description, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) {
        this.lastError = `${description} (${code})`;
        update();
      }
    });
    wc.on("render-process-gone", () => {
      this.lastError = "page crashed";
      update();
    });
    this.win.contentView.addChildView(view);
    view.setBounds(this.bounds);
    view.setVisible(this.visible);
    this.view = view;
    this.partition = partition;
    return view;
  }

  private stopMedia(): void {
    if (this.mediaTimer) clearInterval(this.mediaTimer);
    this.mediaTimer = null;
    this.videoId = null;
  }

  private watchMedia(): void {
    if (this.mediaTimer) clearInterval(this.mediaTimer);
    this.mediaTimer = setInterval(() => {
      const wc = this.view?.webContents;
      const video = this.videoId;
      if (!wc || wc.isDestroyed() || !video) return;
      wc.executeJavaScript(MEDIA_PROBE, true)
        .then((state: Omit<MediaState, "video"> | null) => {
          if (state && !this.win.isDestroyed() && this.videoId === video) {
            this.win.webContents.send("ip:panel-media", { video, ...state });
          }
        })
        .catch(() => undefined);
    }, 2000);
  }

  async open(target: PanelTarget, keepSignIn: boolean): Promise<PanelState> {
    let url: string | null;
    this.stopMedia();
    if ("video" in target) {
      if (!VIDEO_ID.test(target.video)) throw new Error("this video cannot be opened");
      url = EMBED + target.video + EMBED_QUERY;
    } else if ("library" in target) url = this.libraryUrl(target.library);
    else url = isWebUrl(target.url) ? target.url : null;
    if (!url) throw new Error("this address cannot be opened");
    const view = this.ensureView(keepSignIn ? KEEP_PARTITION : TEMP_PARTITION);
    if ("video" in target) {
      this.videoId = target.video;
      this.watchMedia();
    }
    this.lastError = null;
    view.webContents.loadURL(url).catch(() => {
      // reported through did-fail-load
    });
    this.emit();
    return this.state();
  }

  setBounds(bounds: Bounds): void {
    const clean = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
    this.bounds = {
      x: clean(bounds.x),
      y: clean(bounds.y),
      width: clean(bounds.width),
      height: clean(bounds.height),
    };
    this.view?.setBounds(this.bounds);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.view?.setVisible(visible);
  }

  navigate(action: unknown): void {
    const wc = this.view?.webContents;
    if (!wc || wc.isDestroyed()) return;
    if (action === "back" && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    else if (action === "forward" && wc.navigationHistory.canGoForward()) {
      wc.navigationHistory.goForward();
    } else if (action === "reload") wc.reload();
  }

  async openExternally(): Promise<boolean> {
    const url = this.view?.webContents.getURL() ?? "";
    if (!isWebUrl(url)) return false;
    await shell.openExternal(url);
    return true;
  }

  close(): void {
    this.stopMedia();
    const view = this.view;
    this.view = null;
    this.partition = null;
    this.lastError = null;
    if (view) {
      if (!this.win.isDestroyed()) this.win.contentView.removeChildView(view);
      if (!view.webContents.isDestroyed()) view.webContents.close();
    }
    this.emit();
  }
}

export async function clearWebData(): Promise<void> {
  for (const partition of [KEEP_PARTITION, TEMP_PARTITION]) {
    const ses = webSession(partition);
    await ses.clearStorageData();
    await ses.clearCache();
  }
}
