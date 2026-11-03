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
- [x] Public releases repo (owner created 2026-11-03) + publish step on version tags; Settings → Update (latest or a chosen version; older version → restore the newest compatible backup)
- [x] New setup order: name → Dalilk tests → target → level → hours estimate → exam date and time → review (additions 1–4)
- [x] Planner-2 (CURRICULUM §4a): hours estimate, final 4 days, bi-weekly mocks, three ways out of an unrealistic plan, rationale on every task
- [x] "My plan" page: hours done / left, road to the exam, today's tasks, coming days, gap per skill
- [x] Focus mode with "Continue learning", full screen, breaks, skip with reason, writing pad, celebrations (additions 5–6)
- [x] Dalilk routine PDFs read (2026-11-03): trackers without a minute split; the 30-day plan's order (input → technique → practice, one skill per week) is used for the exam part
- [x] Windows CI build green; v0.0.4 published to ielts-pilot-releases (2026-11-03)
- [x] Owner installed v0.0.4 on the laptop; everything works (2026-11-03)

**Exit:** the owner studies daily from Today, and new versions arrive through the Update tab.

## Order after v0.0.4 (owner, 2026-11-03)

The owner asked for the podcast player first, as soon as possible. Versions from here: 0.0.5 player → 0.0.6 stories and flashcards → 0.0.7 writing/speaking with the AI tutor → 0.1 exams and progress → optional "Pro" add-on (D-029).

**Re-ordered 2026-11-03 (owner, second list of additions):** 0.0.6 quick fixes → 0.0.7 content map → 0.0.8 words, phrases and stories → 0.0.9 writing/speaking with the AI tutor → 0.1 exams and progress → optional "Pro" add-on.

## Sprint 2b-1 — Podcast player · v0.0.5
- [x] Dalilk IELTS podcast from its public feed (D-028): episode list, next episode, resume position, listened / comprehension 1–5
- [x] Player: play/pause, back / forward 5 s (also ← / → / Space), seek, speed 0.75–1.25×; break pauses the audio
- [x] Transcript PDF (Google Drive) beside the player; 4 steps: listen only → listen + read → shadowing → listen and rate
- [x] Opens from the Library and from the plan's podcast task (DLK-20)
- [x] Windows CI build green (141 tests, installer smoke incl. podcast); v0.0.5 published to ielts-pilot-releases (2026-11-03)
- [ ] Owner installs v0.0.5 through the Update tab (first real in-app update) and confirms audio + transcript play on the laptop

## Owner's second list (2026-11-03)

The owner's screenshot showed Daily English Listening (DLK-11) opening the old page: only the IELTS podcast had the player. His new requests, with where each one goes:

| Request | Version |
|---|---|
| Daily English Listening in the same player | 0.0.6 |
| "Start from zero" and "start the plan again" buttons | 0.0.6 |
| One-minute pause between tasks with an encouraging line and a colourful picture | 0.0.6 (phrase cards join it in 0.0.8) |
| Spelling challenge on fixed, known days | 0.0.6 |
| Analyse Dalilk's 30-day and 90-day plans and use them for each learner's path | 0.0.7 |
| Exact counts and links: podcast episodes, stories, books, videos — no duplicates; the plan's hours shown as that content (episode length × listens for shadowing, reading time per level, video durations, expected writing tasks and mock tests) | 0.0.7 |
| Technique videos analysed per level (required for everyone / by level / optional); shown alone, full screen, no other videos | 0.0.7 |
| Practice-test sites mapped (ieltsonlinetests.com — the one Dalilk's 90-day plan links —, engnovate, Dalilk's mock page): free full and section tests with direct links | 0.0.7 |
| IELTS exam simulation in the final practice tests | 0.0.7 |
| Words and flashcards starting with Dalilk's 350 words, coloured, Arabic and English | 0.0.8 |
| Dalilk's 150 phrases for meetings and emails, shown one by one between tasks | 0.0.8 |

## v0.0.6 — Quick fixes
- [x] Daily English Listening (DLK-11) in the listening player: its public feed (604 episodes, a Google Drive script and translation per episode), migration 0006 (D-030)
- [x] Home and focus mode say honestly when tasks were closed early or skipped (less than half their time) and offer to bring them back
- [x] "Start the plan again" (My plan; offered on Home after 4+ days without study): plan starts today, hours counted from now, history kept (D-031); "Start from zero" (Settings → Data and backups) renamed and linked
- [x] One-minute pause between tasks: original encouraging lines and original illustrations, Next after the countdown, adjustable or off in Settings (D-032)
- [x] Planner-3: spelling challenge (DLK-21) on two fixed study days a week outside the exam phase, 15 min from the listening time
- [x] Dalilk's 90-day plan read (owner's PDF): structure and links in `docs/research/dalilk_plans.md` for 0.0.7
- [x] Windows CI build green (152 tests, installer smoke incl. both podcasts); v0.0.6 published to ielts-pilot-releases (2026-11-03)
- [ ] Owner updates through the Update tab and checks both podcasts on the laptop

## v0.0.7 — Content map
- Analyse Dalilk's 30-day and 90-day plans, the two podcasts, the 100 stories, the technique playlists and the practice-test sites; the result goes to the owner as a .md file for approval before any code
- Plan header: the hours as content (episodes, stories, videos, writing tasks, mock tests), each item once, with links
- Technique videos per level, full screen, alone; direct links to each free practice test; exam simulation in the final days

## v0.0.8 — Words, phrases and stories
- Dalilk's 350 words first (coloured cards, Arabic and English), then words captured from the podcasts and stories → flashcards (SM-2) → reviews in Today
- Dalilk's 150 phrases one by one in the pauses between tasks
- Reading: Dalilk graded stories by level

## Sprint 3 — Output labs with the AI tutor · v0.0.9
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

"Pro" add-on (D-029): a local open-source model for simple tasks (word meanings, example sentences, grammar hints), only if a speed test on the owner's laptop is acceptable.
