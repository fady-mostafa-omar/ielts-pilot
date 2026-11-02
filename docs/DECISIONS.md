# IELTS Pilot — Decision Log

Each decision: ID · date · decision · reason · status.
"Approved" = the owner confirmed it (the Phase 0 documents were approved on 2026-11-02).

| ID | Date | Decision | Reason | Status |
|---|---|---|---|---|
| D-001 | 2026-11-02 | Personal edition: one user (the owner); not distributed | The goal is the owner's own preparation; removes redistribution licensing, signing and trademark work | Approved |
| D-002 | 2026-11-02 | React + Vite + TypeScript instead of Next.js | Next.js in Electron needs static export, which drops SSR and API routes — its main benefits; a Vite SPA is simpler | Approved |
| D-003 | 2026-11-02 | Keep the Python + FastAPI backend | Owner works in Python; future local STT/NLP is Python. Plan B if the spike fails: TypeScript-only backend inside Electron | Approved; confirmed by the spike (2026-11-02) |
| D-004 | 2026-11-02 | SQLAlchemy 2.x (not SQLModel) + Alembic | More mature; first-class Alembic support; Pydantic schemas are kept separate anyway | Approved |
| D-005 | 2026-11-02 | Build on GitHub Actions; no development tooling on the owner's laptop | ~6 GB free disk; Windows 10 Home has no Windows Sandbox; CI provides a clean Windows for smoke tests | Approved |
| D-006 | 2026-11-02 | Python 3.12 for the backend | Most mature wheel and PyInstaller support; avoids early-adopter issues with 3.14 | Approved |
| D-007 | 2026-11-02 | Dalilk + official free material are the primary resources for personal study; third-party files never enter the repo or the installer | Personal use; respects providers; keeps the repo clean | Approved |
| D-008 | 2026-11-02 | No app-computed IELTS bands in v0.1; a band is stored only with the source of its conversion | Uncalibrated estimates would be fabricated precision | Approved |
| D-009 | 2026-11-02 | SM-2 for spaced review of mistakes and vocabulary | Simple, well documented, easy to test; can move to a newer scheduler later | Approved |
| D-010 | 2026-11-02 | Per-user NSIS install; data in `%APPDATA%\IELTS Pilot`; uninstall keeps data | No admin rights; upgrades and uninstalls never lose study history | Approved |
| D-011 | 2026-11-02 | Custom `app://` protocol; token-checked local API on a random 127.0.0.1 port; token passed via environment variable | Electron hardening; blocks other local software and web pages from calling the API | Approved (refined by D-014) |
| D-012 | 2026-11-02 | Own wording for criteria checklists; link to official band descriptors | The descriptors are the IELTS partners' text | Approved |
| D-013 | 2026-11-02 | v0.1 scope = PRD §5 (F1–F12); diagnostic, mastery model, lessons, labs and AI come later | Get the owner studying early (R-01) | Approved |
| D-014 | 2026-11-02 | The renderer calls `app://ui/api/…`; the main process proxies to the backend and adds the token. Requests with an `Origin` header are rejected; no CORS | Token never reaches the renderer; UI and API share one origin, avoiding CORS and Chromium private-network checks; renderer cannot call `/shutdown` | Approved (2026-11-02) |
| D-015 | 2026-11-02 | No router or i18n library yet: page state in `App.tsx`; a small typed dictionary for Arabic/English | Three screens; fewer dependencies; the type system guarantees every key exists in both languages | Proposed (Sprint 1a) |
| D-016 | 2026-11-02 | Backups as checksummed zips; restore copies into the live DB with SQLite's backup API; a safety backup before every migration, restore and delete-all; keep the newest 10 automatic backups | Works while Windows holds the DB file open; no destructive step without a way back; bounded disk use | Proposed (Sprint 1a) |
| D-017 | 2026-11-02 | Spellchecker disabled in the app | Electron's spellchecker downloads dictionaries from Google at startup (seen in the network log), which breaks offline-first; the real IELTS has no spellcheck, so practice should not have one | Proposed (Sprint 1a) |

## Pinned versions (packaging spike, 2026-11-02)

Latest stable at the time of the spike. Licences: `THIRD_PARTY_LICENSES.md`. CI resolved Python 3.12 to 3.12.10.

| Component | Version |
|---|---|
| Electron | 45.2.1 (Chromium 156, Node 24.22) |
| electron-builder | 26.18.0 |
| TypeScript | 7.0.2 |
| React / React DOM | 19.3.1 |
| Vite | 8.3.5 |
| @vitejs/plugin-react | 6.2.1 |
| Python | 3.12 |
| FastAPI | 0.162.0 |
| Uvicorn | 0.54.0 |
| Pydantic | 2.14.2 |
| SQLAlchemy | 2.1.6 |
| Alembic | 1.20.1 |
| PyInstaller | 6.22.3 |
| pytest / httpx / ruff | 9.2.0 / 0.28.1 / 0.17.3 |
| GitHub Actions | checkout, setup-python, setup-node, upload-artifact — v7 |
| Node (CI) | current LTS |
