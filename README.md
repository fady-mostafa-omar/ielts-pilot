# IELTS Band Up (internal name IELTS Pilot)

Desktop app for Windows and Linux for English development and IELTS Academic preparation:
it decides the next study task, hosts it inside the app, records what was done, and
shows honest progress. Personal edition — not distributed.

**Status:** Sprint 0 — packaging spike. See [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Layout

| Path | What |
|---|---|
| `docs/` | Design documents (PRD, architecture, database, curriculum, policies, plans, decisions) |
| `backend/` | Python 3.12 · FastAPI · SQLAlchemy · Alembic — packaged with PyInstaller (onedir) |
| `frontend/` | React · Vite · TypeScript UI |
| `desktop/` | Electron main process + electron-builder (Windows: NSIS, per-user; Linux: .deb) |
| `content/catalog/` | Resource metadata only — no third-party files |
| `scripts/ci/` | Windows smoke tests used by CI |
| `.github/workflows/` | `ci.yml` (tests on Ubuntu), `release.yml` (Windows and Linux installers) |

## Builds

Installers are built on GitHub Actions, not locally (`docs/DECISIONS.md` D-005).

- Run **Build installers** from the Actions tab (or push a `v*` tag).
- Windows: the workflow tests the backend, builds it, smoke-tests the binary, packages the
  installer, installs it on a clean runner, runs the app twice, uninstalls it.
- Linux (D-046): it builds the backend and the `.deb` on Ubuntu 22.04, starts the packaged
  app, then installs the `.deb` on Ubuntu 22.04 and 24.04, starts it as a normal user with
  the Chromium sandbox on, and removes it.
- With "release" ticked (or a tag) it publishes `IELTS-Pilot-Setup-<version>.exe`,
  `IELTS-Band-Up-<version>-amd64.deb`, `latest.yml` and `latest-linux.yml` to the public
  releases repository the app updates from.

The Windows installer is unsigned: Windows SmartScreen shows a warning → **More info → Run anyway**.

### Linux

Ubuntu 22.04 or newer, and distributions built on it (Linux Mint 21+, Zorin OS 17+,
Pop!_OS 22.04+), Debian 12+; 64-bit (x86-64). Download the `.deb` from the releases page
and install it with `sudo apt install ./IELTS-Band-Up-<version>-amd64.deb` (or open it with
the Software app). The app updates itself; installing an update asks for the computer's
password once. Data: `~/.config/IELTS Pilot/`.

## Data

Everything stays on the machine, under `%APPDATA%\IELTS Pilot\` on Windows and
`~/.config/IELTS Pilot/` on Linux (`data/ielts_pilot.db`, `logs/`). Uninstalling keeps this folder.

## Run from source (developer machine)

```bash
# backend tests
cd backend && python -m pip install -r requirements-dev.txt && python -m pytest

# UI + desktop
cd frontend && npm ci && npm run build
cd ../desktop && npm ci && npm start      # uses python on PATH (or IP_PYTHON) for the backend
```
