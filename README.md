# IELTS Pilot

Personal Windows desktop app for English development and IELTS Academic preparation:
it decides the next study task, hosts it inside the app, records what was done, and
shows honest progress. Personal edition — not distributed.

**Status:** Sprint 0 — packaging spike. See [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Layout

| Path | What |
|---|---|
| `docs/` | Design documents (PRD, architecture, database, curriculum, policies, plans, decisions) |
| `backend/` | Python 3.12 · FastAPI · SQLAlchemy · Alembic — packaged with PyInstaller (onedir) |
| `frontend/` | React · Vite · TypeScript UI |
| `desktop/` | Electron main process + electron-builder (NSIS, per-user) |
| `content/catalog/` | Resource metadata only — no third-party files |
| `scripts/ci/` | Windows smoke tests used by CI |
| `.github/workflows/` | `ci.yml` (tests on Ubuntu), `build-windows.yml` (installer) |

## Builds

Installers are built on GitHub Actions, not locally (`docs/DECISIONS.md` D-005).

- Run **Build Windows installer** from the Actions tab (or push a `v*` tag).
- The workflow tests the backend, builds it, smoke-tests the binary, packages the
  installer, installs it on a clean runner, runs the app twice, uninstalls it, and
  uploads `IELTS-Pilot-Setup-<version>.exe` as an artifact.

The installer is unsigned: Windows SmartScreen shows a warning → **More info → Run anyway**.

## Data

Everything stays on the machine, under `%APPDATA%\IELTS Pilot\`
(`data\ielts_pilot.db`, `logs\`). Uninstalling keeps this folder.

## Run from source (developer machine)

```bash
# backend tests
cd backend && python -m pip install -r requirements-dev.txt && python -m pytest

# UI + desktop
cd frontend && npm ci && npm run build
cd ../desktop && npm ci && npm start      # uses python on PATH (or IP_PYTHON) for the backend
```
