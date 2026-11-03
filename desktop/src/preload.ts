// Minimal, typed bridge for the few things the sandboxed UI cannot do itself.
// Runs sandboxed: only `contextBridge` and `ipcRenderer` are used.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

type PanelTarget = { url: string } | { library: string };
type Bounds = { x: number; y: number; width: number; height: number };

contextBridge.exposeInMainWorld("ipBridge", {
  restartBackend: (options?: { restoreCompatible?: boolean }): Promise<string> =>
    ipcRenderer.invoke("ip:restart-backend", options ?? {}),
  setFullScreen: (on: boolean): Promise<boolean> => ipcRenderer.invoke("ip:fullscreen", on),
  updates: {
    state: (): Promise<unknown> => ipcRenderer.invoke("ip:update-state"),
    check: (version?: string): Promise<unknown> => ipcRenderer.invoke("ip:update-check", version),
    download: (): Promise<unknown> => ipcRenderer.invoke("ip:update-download"),
    install: (): Promise<boolean> => ipcRenderer.invoke("ip:update-install"),
    releases: (): Promise<unknown> => ipcRenderer.invoke("ip:update-releases"),
    onState: (callback: (state: unknown) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, s: unknown) => callback(s);
      ipcRenderer.on("ip:update-state", handler);
      return () => ipcRenderer.removeListener("ip:update-state", handler);
    },
  },
  openFolder: (which: "data" | "backups"): Promise<boolean> =>
    ipcRenderer.invoke("ip:open-folder", which),
  importBackup: (): Promise<string | null> => ipcRenderer.invoke("ip:import-backup"),
  exportBackup: (name: string): Promise<boolean> => ipcRenderer.invoke("ip:export-backup", name),
  activity: (): Promise<{ idleSeconds: number; audible: boolean }> =>
    ipcRenderer.invoke("ip:activity"),
  addLibraryFile: (): Promise<{ fileName: string; title: string; format: string } | null> =>
    ipcRenderer.invoke("ip:add-library-file"),
  clearWebData: (): Promise<void> => ipcRenderer.invoke("ip:clear-web-data"),
  podcastFeed: (feed: string): Promise<string> => ipcRenderer.invoke("ip:podcast-feed", feed),
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke("ip:open-external", url),
  panel: {
    open: (target: PanelTarget, keepSignIn: boolean): Promise<unknown> =>
      ipcRenderer.invoke("ip:panel-open", target, keepSignIn),
    setBounds: (bounds: Bounds): Promise<void> => ipcRenderer.invoke("ip:panel-bounds", bounds),
    setVisible: (visible: boolean): Promise<void> =>
      ipcRenderer.invoke("ip:panel-visible", visible),
    nav: (action: "back" | "forward" | "reload"): Promise<void> =>
      ipcRenderer.invoke("ip:panel-nav", action),
    close: (): Promise<void> => ipcRenderer.invoke("ip:panel-close"),
    openExternally: (): Promise<boolean> => ipcRenderer.invoke("ip:panel-external"),
    state: (): Promise<unknown> => ipcRenderer.invoke("ip:panel-state"),
    onState: (callback: (state: unknown) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, state: unknown) => callback(state);
      ipcRenderer.on("ip:panel-state", handler);
      return () => ipcRenderer.removeListener("ip:panel-state", handler);
    },
  },
});
