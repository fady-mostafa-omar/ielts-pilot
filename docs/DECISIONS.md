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
| D-018 | 2026-11-03 | Study panel = a sandboxed `WebContentsView` inside the main window, in its own browser session; sign-in cookies are kept (`persist:web`) only after the owner ticks the consent box, otherwise an in-memory session; passwords are typed into the sites and never pass through the app; only `http(s)` pages and files inside `library\` can be shown; microphone allowed for `dalilk.com` only | Everything in one window (the owner's main pain); the owner asked to "connect accounts once" — this does it without storing credentials; sites cannot reach the app's API (different session and origin) | Proposed (Sprint 1b) |
| D-019 | 2026-11-03 | Daily split (kept by planner-2): phase picks the development/exam shares (75/25, 60/40, 35/65); each development hour = 30 min listening + 20 reading + 10 writing and speaking (Abdulrahman Hegazy's split, as given by the owner) | The owner wants to see today's hours split this way now; Sprint 2 checks it against Dalilk's routine PDFs and turns it into tasks | Proposed (Sprint 1b) |
| D-020 | 2026-11-03 | Study time is measured, not claimed: heartbeats every 30 s, idle time (5 min without input and without sound) not counted, hand-logged time stored as `manual`, minutes can be lowered but not raised | "Honest progress" (PRD): hours on Home must be real | Proposed (Sprint 1b) |
| D-021 | 2026-11-03 | The backend watches the Electron process (PID in `IP_PARENT_PID`) and stops when it is gone | A crashed or killed app must not leave a backend holding the database open | Proposed (Sprint 1b) |
| D-022 | 2026-11-03 | IBM Plex Sans Arabic bundled with the app (OFL-1.1, via `@fontsource`), no web fonts | Readable Arabic and Latin in one family, works offline | Proposed (Sprint 1b) |
| D-023 | 2026-11-03 | Hours-to-goal estimate: per-skill gap × hours per band, default 200 h per band, editable and labelled as an estimate; recalibrated for the owner from official practice results over time | The owner asked for hours from the gap; "100 h per band" has no reliable source found; ~200 h is a common rule of thumb of unclear origin, and published course studies report smaller gains (≈0.2–0.5 band over 3–12 weeks) | Approved (owner, 2026-11-03) |
| D-024 | 2026-11-03 | Exam countdown: goal date = exam − 4 days; 3 days of full practice tests; last day techniques review only; a full practice test every two weeks before that (the two-weekly mock is replaced by D-035) | Owner's structure; regular mocks give real data for the level chart | Approved (owner, 2026-11-03) |
| D-025 | 2026-11-03 | Focus mode for tasks, "Continue learning" resume point, timed breaks not counted as study | Fewer distractions during long sessions (owner's request) | Approved (owner, 2026-11-03) |
| D-026 | 2026-11-03 | AI tutor via a generated prompt that the app copies and the owner pastes (no automated typing into AI sites); context lives in the app so the tutor can be switched; AI marks shown as opinion only | Site automation breaks and may breach terms; switching ChatGPT / Claude / Gemini must lose nothing; uncalibrated marks must not look like bands (D-008) | Approved (owner, 2026-11-03) |
| D-027 | 2026-11-03 | Updates from a separate public repository that holds installers only; the app never contains a GitHub token. The app checks for a new version once, 20 s after start (an offline failure is ignored); downloading and installing wait for the owner | The code repo is private; a token inside the app would be a security hole | Approved (owner, 2026-11-03) |
| D-028 | 2026-11-03 | Dalilk IELTS podcast player: episode list from the podcast's public SoundCloud RSS feed (fetched by the desktop process, one allow-listed URL); audio streams from the feed's own link; the transcript is the episode's Google Drive PDF shown from Drive in the panel; nothing is copied into the app. Steps 1 and 4 hide the transcript | The owner asked for audio + transcript + ±5 s on one screen as soon as possible; the feed is public and lists the Drive link in each episode; copying the PDFs would breach D-010 | Approved (owner, 2026-11-03) |
| D-029 | 2026-11-03 | "Pro" add-on (after v0.1): an optional local open-source model for simple tasks only (word explanations, example sentences, grammar hints); never band marks. A speed test on the owner's laptop comes first; if it is too slow the add-on is not shipped. ChatGPT via a copied prompt (D-026) stays the main tutor | Owner's request; an i5-7200U with 8 GB RAM runs only small models, slowly; small models are unreliable for writing/speaking assessment | Approved as a direction (owner, 2026-11-03) |
| D-030 | 2026-11-03 | Dalilk's Daily English Listening (DLK-11) uses the same player as the IELTS podcast: its public feed (Spotify for Podcasters, https://anchor.fm/s/f5d461d8/podcast/rss, 604 episodes) is a second allow-listed URL; each episode's Google Drive script and translation is shown from Drive. The two feeds keep separate progress | The owner opened DLK-11 expecting the player; Dalilk's own 90-day plan uses this podcast for the development month | Approved (owner, 2026-11-03) |
| D-031 | 2026-11-03 | "Start the plan again": plan_start = today, today's and later tasks are rebuilt, hours studied count from the later of the newest level measurement and the restart; sessions, levels and earlier days stay. Offered on Home after 4 days without study. "Start from zero" stays the full wipe (backup first) | Owner's request; coming back after a break should not show a plan built on old dates, and history must not be lost | Approved (owner, 2026-11-03) |
| D-032 | 2026-11-03 | One-minute pause between focus-mode tasks (adjustable 0–120 s): lines of encouragement written for the app, no quotes attributed to real people; illustrations drawn for the app; not counted as study time | Owner's request; misattributed quotes are common and would break the no-fabric
| D-033 | 2026-11-03 | When "Next" closes a focus-mode task and the timer counted less than its planned time, the app asks "how long did you study?" (default: the task's time, at least what the timer counted, at most planned + 120 min); the difference is saved as hand-logged time on that task (origin `manual`, shown as "logged by you") and counts in the hours. Changes D-020 for this case only | Owner's request: time studied away from the screen (walking with a podcast, a paper book) must count; asking keeps the hours honest | Approved (owner, 2026-11-03) |
| D-034 | 2026-11-03 | Updates in one press: "Check and update" / "Update now" downloads, closes, installs and reopens; the automatic check after start still only reports. Changes D-027's "downloading and installing wait for the owner": they wait for one press instead of three | Owner's request | Approved (owner, 2026-11-03) |
| D-035 | 2026-11-03 | The plan follows Dalilk's 90-day method (planner-4, v0.0.8): a fixed daily development hour (30 listening / 20 reading / 5 writing / 5 speaking) plus a focus block on one thing per week — listening, reading, then the four exam skills twice — adapted to the time to the exam and the level. No full mock test before the exam-skills weeks (replaces D-024's mock every two weeks); final days of full tests and the review day stay (D-024) | Owner's choice after the 90-day plan video (docs/research/dalilk_plans.md) | Approved (owner, 2026-11-03) |
| D-036 | 2026-11-03 | Content catalogue shipped with the app holds facts only (YouTube ids, titles, durations; novel ids, levels, titles; practice-test URLs); videos play in YouTube's own embedded player, novels in Publuu's, tests on their sites; nothing of the content itself is copied. Two Dalilk novels whose links open another novel are left out until Dalilk fixes them | CONTENT_POLICY; owner approved the content map (2026-11-03) | Approved (owner, 2026-11-03) |
| D-037 | 2026-11-03 | The exam format (computer or paper) is asked in setup and can be changed in Settings; it selects the format-specific videos and the final-days simulation | Owner: "ready for both, the user chooses at the start" | Approved (owner, 2026-11-03) |
| D-038 | 2026-11-03 | Development time scales with the day: a third of the daily time (Dalilk's 1 h of 3), split 30:20:5:5; focus time in the exam weeks is shared (technique days 60/40, test days ~half tests, final test days add a mistakes review). Each piece of content opens one item at a time with no list to pick from; a finished novel asks "next novel" or "next task". YouTube's player is used as it is (its controls, nothing hidden by the app): the app only locks navigation and moves to the next lesson when one ends. Generator becomes planner-5, so days not started yet are rebuilt with the new split | Owner's requests after 0.0.8; changing YouTube's player page goes against YouTube's developer policies | Approved (owner, 2026-11-03) |

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
