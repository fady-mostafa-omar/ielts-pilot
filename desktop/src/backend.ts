// Starts, supervises and stops the local Python backend.

import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createWriteStream, mkdirSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import { join } from "node:path";

export interface BackendLaunch {
  command: string;
  args: string[];
  cwd?: string;
}

export interface RunningBackend {
  port: number;
  token: string;
  baseUrl: string;
  process: ChildProcess;
  startupMs: number;
}

export type BackendState =
  | { status: "starting" }
  | { status: "ready"; backend: RunningBackend }
  | { status: "failed"; message: string };

const HEALTH_TIMEOUT_MS = 60_000;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function startBackend(launch: BackendLaunch, dataDir: string): Promise<RunningBackend> {
  const port = await freePort();
  const token = randomBytes(32).toString("hex");
  const logDir = join(dataDir, "logs");
  mkdirSync(logDir, { recursive: true });
  const consoleLog = createWriteStream(join(logDir, "backend-console.log"), { flags: "a" });

  const started = Date.now();
  // Secrets go through the environment, never the command line.
  const child = spawn(launch.command, launch.args, {
    cwd: launch.cwd,
    env: {
      ...process.env,
      IP_PORT: String(port),
      IP_TOKEN: token,
      IP_DATA_DIR: dataDir,
      IP_PARENT_PID: String(process.pid), // backend stops itself if the app dies
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.pipe(consoleLog);
  child.stderr?.pipe(consoleLog);

  // The backend prints one "STARTUP_ERROR: <reason>" line when it refuses to start.
  let startupError: string | null = null;
  child.stderr?.on("data", (chunk: Buffer) => {
    const match = /STARTUP_ERROR: (.+)/.exec(chunk.toString("utf-8"));
    if (match) startupError = match[1].trim();
  });

  let exitedEarly: string | null = null;
  child.once("exit", (code, signal) => {
    exitedEarly = `The local service stopped during startup (code ${code}, signal ${signal}).`;
  });
  child.once("error", (err) => {
    exitedEarly = `The local service could not be started: ${err.message}`;
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  while (Date.now() - started < HEALTH_TIMEOUT_MS) {
    if (exitedEarly) {
      await sleep(100); // let the last stderr chunk arrive
      throw new Error(startupError ?? exitedEarly);
    }
    try {
      const res = await fetch(`${baseUrl}/api/v1/health`, {
        headers: { "x-ip-token": token },
        signal: AbortSignal.timeout(1_000),
      });
      if (res.ok) {
        child.removeAllListeners("exit");
        return { port, token, baseUrl, process: child, startupMs: Date.now() - started };
      }
    } catch {
      // not up yet
    }
    await sleep(200);
  }
  child.kill();
  throw new Error(`The local service did not start within ${HEALTH_TIMEOUT_MS / 1000} s.`);
}

export async function stopBackend(backend: RunningBackend): Promise<void> {
  const proc = backend.process;
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  const exited = new Promise<void>((r) => proc.once("exit", () => r()));
  try {
    await fetch(`${backend.baseUrl}/api/v1/shutdown`, {
      method: "POST",
      headers: { "x-ip-token": backend.token },
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    // fall through to kill
  }
  const timedOut = await Promise.race([exited.then(() => false), sleep(3_000).then(() => true)]);
  if (timedOut) proc.kill();
}
