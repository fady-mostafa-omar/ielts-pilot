// Copies the built frontend (../frontend/dist) into ./ui so electron-builder can package it.
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "frontend", "dist");
const dest = join(here, "..", "ui");

if (!existsSync(join(src, "index.html"))) {
  console.error(`Frontend build not found at ${src}. Run "npm run build" in frontend/ first.`);
  process.exit(1);
}
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log(`Copied UI: ${src} -> ${dest}`);
