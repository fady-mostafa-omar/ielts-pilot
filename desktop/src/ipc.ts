// IPC handlers behind the preload bridge. Every handler checks the caller is our UI.

import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import { copyFile, mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { APP_ORIGIN } from "./protocol";

const BACKUP_NAME = /^ielts-pilot-[A-Za-z0-9._-]+\.zip$/;

export interface IpcDeps {
  dataDir: () => string;
  restartBackend: () => Promise<string>;
  documentsDir: () => string;
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

  ipcMain.handle("ip:restart-backend", guard(async () => deps.restartBackend()));

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
