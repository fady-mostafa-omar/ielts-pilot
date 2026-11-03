// app://ui/...      -> static files of the built frontend
// app://ui/api/...  -> forwarded to the local backend, signed with the launch token (D-014)
//
// Same origin for UI and API, so no CORS; the renderer never holds the token.

import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import type { BackendState } from "./backend";

export const APP_ORIGIN = "app://ui";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  // the listening player streams podcast audio (SoundCloud feeds redirect to CDN hosts
  // that change over time, so any https source is allowed for audio only)
  "media-src 'self' https:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

// Endpoints only the main process may call.
const BLOCKED_FROM_RENDERER = new Set(["/api/v1/shutdown"]);

function jsonError(status: number, error: string, message?: string): Response {
  return new Response(JSON.stringify({ detail: { error, message } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function serveStatic(uiDir: string, pathname: string): Promise<Response> {
  let rel: string;
  try {
    rel = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const root = normalize(uiDir);
  const full = normalize(join(root, rel));
  if (full !== root && !full.startsWith(root + sep)) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    const body = await readFile(full);
    const type = CONTENT_TYPES[extname(full).toLowerCase()] ?? "application/octet-stream";
    const headers: Record<string, string> = { "content-type": type };
    if (type.startsWith("text/html")) headers["content-security-policy"] = CSP;
    return new Response(body, { status: 200, headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

async function proxyToBackend(state: BackendState, request: Request, url: URL): Promise<Response> {
  if (state.status === "starting") return jsonError(503, "backend_starting");
  if (state.status === "failed") return jsonError(503, "backend_failed", state.message);
  if (BLOCKED_FROM_RENDERER.has(url.pathname)) return jsonError(403, "forbidden");

  const { backend } = state;
  const headers = new Headers({ "x-ip-token": backend.token });
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  try {
    const res = await fetch(`${backend.baseUrl}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
    });
    const outHeaders = new Headers();
    const resType = res.headers.get("content-type");
    if (resType) outHeaders.set("content-type", resType);
    return new Response(await res.arrayBuffer(), { status: res.status, headers: outHeaders });
  } catch {
    return jsonError(502, "backend_unreachable");
  }
}

export function makeHandler(uiDir: string, getState: () => BackendState) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (`${url.protocol}//${url.host}` !== APP_ORIGIN) return new Response("Not found", { status: 404 });
    if (url.pathname.startsWith("/api/")) return proxyToBackend(getState(), request, url);
    return serveStatic(uiDir, url.pathname);
  };
}
