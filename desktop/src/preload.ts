// Minimal, typed bridge for the few things the sandboxed UI cannot do itself.
// Runs sandboxed: only `contextBridge` and `ipcRenderer` are used.

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("ipBridge", {
  restartBackend: (): Promise<string> => ipcRenderer.invoke("ip:restart-backend"),
  openFolder: (which: "data" | "backups"): Promise<boolean> =>
    ipcRenderer.invoke("ip:open-folder", which),
  importBackup: (): Promise<string | null> => ipcRenderer.invoke("ip:import-backup"),
  exportBackup: (name: string): Promise<boolean> => ipcRenderer.invoke("ip:export-backup", name),
});
