# IELTS Pilot — Roadmap

Status: **draft for approval** · 2026-11-02

**Rules**
- A sprint starts only after the owner accepts the previous one.
- Each sprint ends with a short "done / remaining" report.
- Installers are built only when a sprint needs owner testing.
- No dates: pace depends on the owner's testing time.

---

## Sprint 0 — Discovery and validation · ✅ done 2026-11-02

- [x] Review master spec; risks; architecture recommendation
- [x] Check the Dalilk library page
- [x] Scope reset to personal edition (D-001)
- [x] Environment check on the baseline laptop
- [x] Build strategy: GitHub Actions (D-005)
- [x] Design documents (this set) — approved 2026-11-02
- [x] **Packaging spike** code: Electron + React window → FastAPI `/health` + one SQLite write/read in `%APPDATA%`; PyInstaller onedir; electron-builder NSIS per-user; CI workflows and Windows smoke scripts
- [x] Spike verified on Linux (packaged build, end-to-end smoke test, twice, persistence confirmed)
- [x] Versions pinned (`DECISIONS.md`)
- [x] Private GitHub repo attached; code pushed
- [x] Windows build + smoke tests green on GitHub Actions (first run, run 41518170203)
- [x] Owner installs on the baseline laptop — all exit criteria met
- [x] `THIRD_PARTY_LICENSES.md` generated from installed packages
- [x] D-014 approved

**Exit criteria (spike, on the baseline laptop) — results 2026-11-02:**
1. Installs per-user from the CI artifact — ✅
2. Opens with Wi-Fi off — ✅ (owner confirmed)
3. A value written before closing is still there after reopening — ✅
4. Backend bound to 127.0.0.1 only — ✅ (`Get-NetTCPConnection`: 127.0.0.1)

**Measured (from `main.log` on the baseline laptop):** backend ready after 9.6 s on the very first launch, 1.8 s on later launches. Installer 134 MB; installed size 395 MB. The first-launch delay is likely Windows Defender scanning new binaries plus a cold disk — not measured separately.

**Carried into Sprint 1:** show the window immediately with a loading state instead of waiting for the backend (first launch showed nothing for ~10 s).

## Sprint 1 — Foundation (split into 1a and 1b, approved 2026-11-02)

### Sprint 1a — Setup, settings, data safety · v0.0.2
- [x] Window opens immediately with a loading state; error screen with Try again
- [x] Real schema (migration 0002) replacing the spike table; automatic backup before migrating
- [x] F1 first-run setup wizard (goals, current level with source, study time, language)
- [x] Home screen: goals, levels with sources, exam countdown, weekly time — no computed bands
- [x] Settings: goals and time, level history, data and backups
- [x] F12 backup / restore / import / export / delete-all, with safety backups
- [x] Arabic (RTL) and English (LTR)
- [x] Spellchecker off — no outbound network at startup (verified with Chromium's network log)
- [x] Windows CI build green; owner acceptance on the baseline laptop (2026-11-02)

### Sprint 1b — Library, study panel, hours, Dalilk tests · v0.0.3
- [x] New look from the approved Home mockup: bundled Arabic font, icons, hourglass / level / week / split charts
- [x] Dalilk placement tests (13English, 3-minute speaking) in setup and Settings → Level: open the test in the app, type the result, optionally use it as the starting level (`placement_quiz`)
- [x] Daily study time in hours (½ h to 14 h); migration 0003 rounds old values
- [x] Home: today's goal in hours (done / target, met or not), overall level over time (moves only with a new result), this week day by day, continue where you stopped, skills with sources, today's split (D-019)
- [x] F4 library: Dalilk catalogue + free official practice + engnovate, owner links and files (PDF, audio, video, text), archive, progress, notes
- [x] Study panel inside the window (D-018) with back / forward / reload / open in browser; built-in PDF viewer
- [x] F5 sessions: automatic timer with pause, idle detection, finish and lower-only correction, unconfirmed sessions after a crash, hand-logged time (D-020)
- [x] Settings → Accounts: consent to keep sign-ins, sites list, sign out of all sites
- [x] Backend stops when the app is gone (D-021); app icon
- [x] O-2 closed (official practice links in the catalogue); O-3 partly (format facts from ielts.org)
- [x] Windows CI build green (2026-11-02); owner reports v0.0.3 working on the baseline laptop (2026-11-03)

**Exit (Sprint 1):** the owner can open any resource inside the app and every use is logged.

## Owner additions (2026-11-03, approved)

1. Hours to goal: per-skill gap × hours per band (default 200, editable, labelled as an estimate) → total hours; divided over the study days left before the exam; the app learns the owner's own hours-per-band from official practice results (D-023).
2. Exam countdown: target reached 4 days before the exam; 3 days of full practice tests; last day techniques review only; a full practice test every two weeks before that (D-024).
3. If the hours needed exceed the time available, the app says so and offers: move the exam date, lower the target, or add hours. It never builds an impossible plan.
4. Bigger gap → more hours → more podcast episodes and stories; skills weighted by their own gap (CURRICULUM §4 step 3).
5. Focus mode: a task fills the window (optional full screen), one task, timer, Next; a large "Continue learning" button resumes exactly where the owner stopped; breaks after ~50 min (5–10 min countdown, not counted as study, adjustable) (D-025).
6. Brighter, more graphic UI with small celebrations when a goal is met — professional, not childish.
7. Writing/speaking tutor through ChatGPT (or Claude / Gemini): the app builds a prompt with level, target, task, flashcard words and recurring mistakes, copies it, opens the site in the panel; task timers (Task 1 20 min, Task 2 40 min); Next continues the plan. No typing into the site on the owner's behalf; AI marks are shown as "AI opinion" and never move the level (D-026).
8. Update tab: installers published to a separate public releases repository (code stays private); automatic update to the latest version or a chosen one; going back to an older version restores the backup taken before the newer one changed the database (D-027).

## Sprint 2a — Updates, plan and focus · v0.0.4
- Public releases repo + release workflow on tags; Settings → Update (latest or a chosen version)
- New setup order: name → Dalilk test → target → hours estimate → exam date → plan (additions 1–4)
- Planner-2: daily split per D-019 scaled by the hours estimate; final 4 days; bi-weekly mocks; unrealistic-plan warning; rationale shown
- Today in focus mode with "Continue learning", breaks, celebrations (additions 5–6)
- Needs from the owner: Dalilk routine PDFs (foundation, fluency, 30-day IELTS plan) to check the split; create the public releases repo

**Exit:** the owner studies daily from Today, and new versions arrive through the Update tab.

## Sprint 2b — Active listening, reading, vocabulary · v0.0.5
- Listening in 4 steps on the Dalilk IELTS podcast: listen only → listen + transcript (PDF beside the player) → shadowing → listen again and rate comprehension
- Reading: Dalilk graded stories by level
- Capture new words while listening/reading → flashcards (SM-2) → reviews in Today

## Sprint 3 — Output labs with the AI tutor · v0.0.6
- Writing Task 1 / Task 2 and Speaking Parts 1–3 with timers (addition 7)
- Shadowing with recording; sentence building from flashcard words (write / say); phrase bank by IELTS topic
- Mistakes notebook fed by the owner from the tutor's feedback

## Sprint 4 — Exam preparation and progress → v0.1
- Technique videos per question type (Hegazy playlist) placed in the plan; practice tests (official, engnovate) with result entry → levels and the overall chart
- Progress page and weekly report; vocabulary and mistakes reviews
- Optional: AI method B (official API keys, provider switch, key stored encrypted)

**Exit = v0.1:** every PRD acceptance criterion passes on the baseline laptop.

## v0.2 — Personalised engine

Diagnostic (official practice results + short original grammar/vocabulary checks), skill mastery model, priority scoring per master spec §7, lesson player and first original exercise bank, evidence-based Arabic → English shift.

## v0.3 — IELTS labs

Interactive Listening/Reading practice with in-app question sets (original, or owner-supplied for personal use), timed practice, mock-test flow, readiness indicator built on several recent full practice tests.

## v0.4+ — Optional

AI feedback provider interface; local speech-to-text add-on; report export.
