# IELTS Pilot — Architecture (v0.1)

Status: **draft for approval** · 2026-11-02 · Related: `PRD.md`, `DATABASE.md`, `DECISIONS.md`

---

## 1. Overview

```
┌───────────────────────── Electron app ──────────────────────────┐
│ Renderer (React + Vite + TS)                                     │
│  • UI only; no Node access (contextIsolation + sandbox)          │
│  • calls app://ui/api/…  (same origin, no token)                 │
│                    │                                             │
│                    ▼                                             │
│ Main process (TypeScript)                                        │
│  • app:// protocol: serves UI files, proxies /api/* to backend   │
│    and adds X-IP-Token (D-014)                                   │
│  • single-instance lock; spawns + supervises the backend         │
│  • web panel for external resources (separate session)           │
└────────────────────┼─────────────────────────────────────────────┘
                     ▼
     Backend: Python 3.12 · FastAPI · PyInstaller onedir
     listens on 127.0.0.1:<random port>, token-checked
                     │
                     ▼
     %APPDATA%\IELTS Pilot\  — SQLite DB, recordings, library, backups, logs
```

## 2. Stack

| Layer | Choice | Reason |
|---|---|---|
| Shell | Electron | Spec decision; supports Windows 10+ today |
| UI | React + Vite + TypeScript | D-002 — no server rendering needed; simpler than Next.js static export |
| Routing | None yet — page state in `App.tsx` (D-015) | Three screens; revisit when screens multiply |
| i18n | Small typed dictionary in `i18n.tsx` (D-015) | Arabic/English, RTL/LTR; compile-time check that both languages have every key |
| Charts | Chart.js or Recharts (choose in Sprint 4) | Lightweight; licence checked before adoption |
| Backend | Python 3.12, FastAPI, Uvicorn, Pydantic v2 | D-003, D-006 — owner works in Python; future local STT/NLP is Python |
| ORM / migrations | SQLAlchemy 2.x + Alembic | D-004 |
| Database | SQLite, WAL mode | Local, single user |
| Backend packaging | PyInstaller, onedir | No self-extraction at each start; onefile builds are flagged by antivirus more often |
| App packaging | electron-builder, NSIS, per-user | No admin rights; unsigned is acceptable for personal use |
| CI | GitHub Actions — Ubuntu for tests, Windows for builds | D-005 |

Exact versions are pinned during the packaging spike and recorded in `DECISIONS.md`. Each dependency's licence is read from its installed metadata/LICENSE file during the spike and recorded in `THIRD_PARTY_LICENSES.md` — not from memory.

## 3. Process lifecycle

**Startup** (window first, backend second — measured first launch was ~10 s on the baseline laptop)
1. Main acquires the single-instance lock; a second launch focuses the existing window. On the `ready` event it turns the session spellchecker off (it would otherwise download dictionaries from Google; see D-017).
2. Data dir = `app.getPath('userData')` → `%APPDATA%\IELTS Pilot\`.
3. Main picks a free port on 127.0.0.1 and generates a 256-bit random token.
4. Main spawns `resources\backend\ielts_pilot_backend.exe` with `IP_PORT`, `IP_TOKEN`, `IP_DATA_DIR` as **environment variables** (command-line arguments are readable by other processes).
5. Backend: if a migration is pending, writes an automatic backup, runs Alembic to head, then serves.
6. Main polls `GET /api/v1/health` (target: ready ≤ 10 s on the baseline laptop).
7. The window is created **before** step 3 and loads `app://ui/index.html` immediately. While the backend starts, `app://ui/api/*` answers 503 `backend_starting` and the UI shows a loading screen; if startup fails it answers 503 `backend_failed` with the reason and the UI shows an error screen with **Try again** (restarts the backend through the bridge) and **Open data folder**. The renderer calls `app://ui/api/…`; main forwards each call to the backend and adds the token, so the token never reaches the renderer (D-014). `/api/v1/shutdown` is refused when it comes from the renderer.

If the database was made by a newer app version, the backend refuses to start (`STARTUP_ERROR` line on stderr), and that reason is what the UI shows.

**Shutdown:** main calls `POST /api/v1/shutdown`, waits up to 3 s, then terminates the process tree.

**Crash recovery:** if the backend exits unexpectedly, the next API call returns `backend_failed` and the UI switches to the error screen with **Try again**. (Stale-process cleanup via a PID file is not implemented yet; not observed as a problem so far.)

## 4. Local API security

- Bind 127.0.0.1 only — never 0.0.0.0.
- Every request carries `X-IP-Token`; constant-time compare with the launch token; otherwise 401.
- `Host` header must equal `127.0.0.1:<port>`; otherwise 400 (DNS-rebinding guard).
- Any request carrying an `Origin` header → 403. The main process never sends one; browsers always do. No CORS is configured, so web pages cannot read responses either.
- OpenAPI `/docs`, `/redoc` and `/openapi.json` disabled.
- The token lives in memory in the main process and the backend only; never on disk, never in the renderer.

## 5. Electron hardening

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- Strict Content-Security-Policy for the app origin.
- Main window navigation restricted to `app://ui`; `window.open` denied.
- External resources open in a **separate web panel** (WebContentsView) with its own session partition, no preload, no Node. Links outside the allow-list open in the system browser after confirmation.
- All permission requests denied for now; the microphone will be allowed for the app origin only when the Speaking lab arrives (Sprint 3).
- Spellchecker disabled (D-017).
- **Preload bridge** (`window.ipBridge`, sandboxed, `contextBridge` only): `restartBackend()`, `openFolder('data'|'backups')`, `importBackup()` (file dialog → copies the zip into `backups\` as `ielts-pilot-imported-<time>.zip`), `exportBackup(name)` (save dialog → copies a backup elsewhere). Every IPC handler rejects callers whose frame is not `app://ui`. The backend never receives an arbitrary file path.

## 6. Embedded content

| Kind | Mechanism | Works offline |
|---|---|---|
| Local PDF | Chromium's PDF viewer inside Electron — **verify in spike**; fallback pdf.js | Yes |
| YouTube | Embedded player inside the web panel | No |
| Web tools (Dalilk etc.) | Web panel | No — shows a "needs internet" state |
| Local audio | HTML audio element; `playbackRate` for speed | Yes |
| Recording | MediaRecorder → webm/opus → uploaded to backend → saved to disk | Yes |

## 7. Data on disk

```
%APPDATA%\IELTS Pilot\
  data\ielts_pilot.db              SQLite (WAL)
  recordings\YYYY\MM\<uuid>.webm
  library\<resource-id>\…          third-party files the owner downloaded (never in the repo)
  backups\ielts-pilot-<timestamp>.zip
  logs\main.log, backend.log       rotating; no essay text, no recordings, no tokens
```

Electron/Chromium also keeps its own cache folders in this directory; backups include only `data\`, `recordings\` and `library\`.

The uninstaller removes program files only. Deleting study data is an explicit action in Settings.

## 8. Backend layout

```
backend/
  app/
    main.py          app factory, token + Host middleware
    config.py        env → settings
    db/              engine, session, pragmas
    models/          SQLAlchemy models
    schemas/         Pydantic models
    api/             routers (see §9)
    services/
      planner.py     weekly plan rules (CURRICULUM §4)
      queue.py       Today queue ordering (CURRICULUM §5)
      srs.py         SM-2 scheduler (CURRICULUM §7)
      progress.py    aggregates for F11
      backup.py      zip backups, restore, delete-all (SQLite online backup API)
  migrations/        Alembic
  tests/
```

## 9. API (v0.1)

All routes under `/api/v1`, JSON, token required.

| Area | Endpoints |
|---|---|
| System | `GET /health`, `POST /shutdown` |
| Profile & levels | `GET/PUT /profile`, `GET/POST /skill-levels` |
| System & data | `GET /system`, `GET/POST /backups`, `POST /backups/{name}/restore`, `DELETE /backups/{name}`, `POST /data/delete-all` |
| Resources | `GET/POST /resources`, `GET/PUT/DELETE /resources/{id}`, `POST /resources/{id}/file` |
| Sessions | `POST /sessions`, `PATCH /sessions/{id}` (heartbeat, stop, confirm), `GET /sessions` |
| Plan | `GET /plan/current`, `POST /plan/generate` |
| Today | `GET /today`, `POST /today/{task_id}/start`, `/done`, `/skip`, `/swap` |
| Writing | `GET/POST /writing/prompts`, `GET/POST /writing/attempts`, `PATCH /writing/attempts/{id}` |
| Speaking | `GET/POST /speaking/prompts`, `GET/POST /speaking/attempts`, `PUT/GET /speaking/attempts/{id}/audio`, `DELETE /speaking/attempts/{id}` |
| Mistakes | `GET/POST /errors`, `PATCH/DELETE /errors/{id}` |
| Vocabulary | `GET/POST /vocab`, `PATCH/DELETE /vocab/{id}` |
| Reviews | `GET /reviews/due`, `POST /reviews/{kind}/{id}/grade` |
| Practice results | `GET/POST /practice-results`, `PATCH/DELETE /practice-results/{id}` |
| Progress | `GET /progress/summary?weeks=N` |

## 10. Repository layout

```
ielts-pilot/
  desktop/              Electron main + preload (TypeScript)
  frontend/             React + Vite app
  backend/              Python package, tests, Alembic migrations
  content/catalog/      resource metadata only (CSV/JSON) — no third-party files
  docs/                 these documents
  .github/workflows/    ci.yml, release.yml
```

Deviation from the master spec layout: `frontend/` sits at the top level instead of under `desktop/` so the UI can be built and tested without Electron; `content/licensed/` and `assets/audio/` are dropped because third-party files never enter the repo (D-007).

## 11. Build and CI

- **`ci.yml`** — Ubuntu, every push: ruff + pytest (backend); typecheck + Vitest (frontend).
- **`release.yml`** (was `build-windows.yml` until v0.0.14) — on a version tag or manual run. Windows job, windows-latest:
  1. Set up Python 3.12 and the current Node LTS.
  2. Build the backend with PyInstaller (onedir).
  3. Smoke-test the backend binary: start it with a temp data dir, `GET /health`, confirm migrations ran, stop it.
  4. Build the frontend; package with electron-builder (NSIS, per-user).
  5. Install the NSIS package silently on the runner; run the installed app twice with `--smoke-test` (hidden window → UI renders → API round-trip through the proxy → value from run 1 read back in run 2); check no orphan backend; uninstall; confirm program files removed and study data kept.
  6. Upload the installer as a workflow artifact.

Scripts: `scripts/ci/backend-smoke.ps1`, `scripts/ci/installer-smoke.ps1`.
- Linux job (D-046), ubuntu-22.04 (so the build runs on 22.04 and newer): backend tests and PyInstaller build, frontend build, electron-builder `.deb` (an `afterPack` hook sets 0755/0644 on every file, as Electron's zip carries world-writable files), the packaged app's `--smoke-test` under Xvfb. Then the `.deb` is installed on ubuntu-22.04 and ubuntu-24.04, started as the normal user with the Chromium sandbox on, and removed. A publish job puts both installers and both update feeds (`latest.yml`, `latest-linux.yml`) in one release.
- The owner downloads the artifact and installs it on the baseline laptop for acceptance (`TEST_PLAN.md` §5).
- Private-repo Actions minutes are limited and Windows minutes count at a higher rate. Windows builds run only on tag/manual trigger; check the current quota before Sprint 1.

## 12. Offline behaviour

Everything works offline except the web panel, YouTube and online Dalilk tools, which show a clear "needs internet" state instead of a blank page.

## 13. Hooks for later versions (not built in v0.1)

- `services/evaluation/` provider interface for optional AI feedback. No API key is ever embedded in a build; any key is entered by the owner at runtime.
- Local speech-to-text (e.g. faster-whisper) as an optional add-on download, never bundled by default.
