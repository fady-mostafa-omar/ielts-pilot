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

**Re-ordered again 2026-11-03 (owner's third list):** 0.0.7 quick requests → content map (.md for approval) → 0.0.8 plan on Dalilk's method with its content → 0.0.9 owner's requests (scaling, one item at a time) → 0.0.10 Dalilk's ratio, podcast stages, speaking recording → 0.0.11 words and phrases → 0.0.12 writing/speaking with the AI tutor → 0.0.13 exams and progress + introduction video = 0.1 → Linux → optional "Pro" add-on.

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
- [x] Owner updated through the Update tab — the first real in-app update — and reports everything working (2026-11-03)

## v0.0.7 — Owner's quick requests (2026-11-03)
- [x] Updates in one press (D-034)
- [x] "How long did you study?" when Next closes a task the timer under-counted; the difference counts as hand-logged time (D-033)
- [x] Achievement counters on Home: episodes per podcast, tasks finished, hours (h:mm, hand-logged shown), study days
- [x] Windows CI build green (154 tests, installer smoke); v0.0.7 published to ielts-pilot-releases (2026-11-03)
- [x] Owner updated to 0.0.7 and reports everything working (2026-11-03); the one-press button is used from the next update

## Content map (between 0.0.7 and 0.0.8)
- Analyse every Dalilk playlist (techniques, practice, speaking, "daily phrases" series) video by video: title, duration, question type, level (required for everyone / by level / optional)
- ieltsonlinetests.com (the site Dalilk's 90-day plan links), engnovate, Dalilk's mock page: free full and section tests with direct links
- The 100 stories (levels, length, audio, direct links), both podcast feeds, Dalilk's 350 words and 150 phrases pages
- Result to the owner as a .md file for approval before any code — sent 2026-11-03: `docs/research/content_map_videos.md` (102 videos, ~61 h) and `docs/research/content_map_part2.md` (tests, novels, words, phrases, podcasts); waiting for the owner's answers

## v0.0.8 — The plan on Dalilk's method (D-035) and the content
- [x] Content map approved by the owner (2026-11-03): videos classified, tests order, broken novels out; exam format asked at the start (D-036, D-037)
- [x] Catalogue shipped as facts only: 102 videos, 98 novels, 926 practice tests (`content/catalog/items/`), `content_items` with progress (migration 0007)
- [x] Planner-4 (CURRICULUM §4b): development hour + weekly focus, 12-week sequence adapted to the weeks left, cuts explained, daily caps, no two-weekly mock
- [x] Each task opens its own content: videos one after another (alone, full screen, YouTube overlays hidden, next on end), the next novel at the level, the next practice tests by direct link; each item once
- [x] My plan: Dalilk weeks strip, "what these hours hold" (episodes, novels, videos, tests, writing tasks, full tests), exam-format prompt; Home counters for videos, novels, tests
- [x] Windows CI build green (167 tests, installer smoke incl. content queue); v0.0.8 published to ielts-pilot-releases (2026-11-03)
- [x] Owner updated with the one-press button; videos play with YouTube's controls and novels open (2026-11-03)

## v0.0.9 — Owner's requests after 0.0.8 (D-038)
- [x] Development time = a third of the day (30:20:5:5), focus time shared in the exam weeks, final test days with a mistakes review
- [x] One item at a time, like the podcast: lesson n of m, the next video starts on its own; a finished novel asks "next novel" or "next task"; no list to pick from
- [x] Library: Dalilk's 100 novels, the techniques series and the daily-phrases series open the next item, not the website or the playlist
- [x] YouTube's player used as it is (0.0.8's CSS changes removed)
- [x] Windows CI build green; v0.0.9 published (2026-11-03)
- [x] Owner checked; asked for Dalilk's ratio instead of the plain scaling, podcast/novel units, break skip, the speaking recording (→ 0.0.10)

## v0.0.10 — Dalilk's ratio, podcast stages, speaking recording (D-039)
- [x] Planner-6: Dalilk's ratio on the real daily time, development never under one hour; podcast time in 15-minute stages; tests never cut below the exam's time
- [x] Podcast = 4 stages × 15 min (listen without the PDF, with it, shadowing, reading for meaning); "podcast n of m · stage s of 4", the stage kept for the next day (migration 0008)
- [x] Novel = 30 min: "novel n of m", the same novel carries on the next day, at its last page when the link shows it
- [x] One-minute pause: "Next" at once; a short "lesson done" line when a video ends
- [x] Speaking tasks start with a one-minute recording (microphone for our UI only, audio only; file kept in the data folder)
- [x] Windows CI build green; v0.0.10 published (2026-11-03)
- [ ] Owner checks on the laptop: podcast stages, novel count, recording with his microphone

## v0.0.11 — Words and phrases (D-041)
- [x] Dalilk's 350 words as cards coloured by section (basic, nouns, verbs, adjectives), English with the computer's voice, Arabic meaning, example and translation; read from Dalilk's page on the owner's computer (migration 0009)
- [x] SM-2 review (forgot / hard / knew it / easy, keys 1–4); "Today's words" 10 minutes every study day from the focus time: reviews first, then up to 15 new
- [x] "Add a new word" in podcast and novel tasks → the owner's own cards, learned first
- [x] Dalilk's 150 phrases: one in each pause between tasks, in order; the Library opens both decks as cards
- [x] Windows CI build green; v0.0.11 published (2026-11-03)
- [ ] Owner checks on the laptop: the words and phrases are read from Dalilk's pages, the voice speaks

## Sprint 3 — Output labs with the AI tutor · v0.0.12 (D-042)
- [x] Writing lab: Task 1 / Task 2, 20 / 40-minute clock, word count, autosaved drafts, submit, self-review checklist (own wording), history (migration 0010)
- [x] Speaking lab: Part 1 / 2 / 3, Part 2 one-minute preparation then up to two minutes recorded, playback and delete, transcript (typed or Win+H), self-rating
- [x] AI tutor through a copied prompt (ChatGPT / Claude / Gemini in Settings): ask for a question, ask for feedback, paste the reply back; the mark shown as "AI opinion" only
- [x] Mistakes notebook: mistakes read from the reply (or added by hand) become cards in "Today's words"; same error code → older ones back tomorrow; list in the Library
- [x] Shadowing recorder in the podcast's stage 3; recent words suggested in the daily writing
- [ ] Phrase bank by IELTS topic — needs a content source (later)
- [x] Windows CI build green; v0.0.12 published (2026-11-03)
- [x] Owner checked; asked for the changes below (→ 0.0.13)

## v0.0.13 — Owner's list after 0.0.12 (D-043)
- [x] 100 hours per band, fixed; new welcome line
- [x] The AI tutor's marks, typed into score boxes, count in the level ("from the AI tutor"; migration 0011)
- [x] Writing / speaking labs: a short opening message for the tutor's chat (topic only, then the answer in the same chat), copy the answer, score boxes, save; pasting the reply for mistakes is optional
- [x] Speaking lab step by step in the plan: Part 1 from the reading development weeks and in the exam weeks, Part 2 in the second round, all parts in the speaking week (planner-9)
- [x] "Today's phrases": a 5-minute task, 5 phrases a day; the pause between tasks holds tips only
- [x] Videos: the side narrows, no timer, no "finished" button; marked at the last second, the player closes and a "lesson done" screen shows; one line on what each video gives; the Library series numbered "video n of m"
- [x] No "how long did you study?" box: videos count by their length, podcast stages 15 minutes each, the rest by the timer
- [x] Listening and novel tasks without the instructions box; the stage button goes once the task's stages are done; each novel has a half-hour clock (red after, with a skip), a fixed number of novels, "Finished the novel — Next" on the last
- [x] Words and phrases: when Dalilk's page cannot be read as cards, the page itself opens in the app
- [x] App name and logo — the owner picked 4, "IELTS Band Up" (done in 0.0.14)
- [x] Free tests map approved (docs/research/tests_map.md) → done in 0.0.14
- [x] Windows CI build green; v0.0.13 published (2026-11-03)

## v0.0.14 — Tests by name, results, progress, the new name (D-044, D-045)
- [x] The official sample questions of ielts.org in the catalogue (part, question type, answer key, transcript); first-round technique days open them after the videos
- [x] Practice days open named full tests in the approved order: official, Cambridge 21, 20, 19, then ieltsonlinetests; each once (planner-10)
- [x] A result box under every test: a sample → right answers (recorded only); a full test → right answers and the band the site showed (a level entry); a final full test → a band per skill; optional question types got wrong (migration 0012: practice results, level source `practice_site`)
- [x] Writing lab on named questions (official Task 1/2, then Cambridge Writing Test N), the question in a tab beside the lab, one marking message for a new chat; the writing week's last day = Task 1 then Task 2
- [x] Speaking week on named tests (the official questions, then Cambridge Speaking Test N) in the speaking lab
- [x] «تقدّمي»: levels per skill with their source, right answers by question type, recent tests (delete one = its band goes too), marked lab answers
- [x] Library: "official sample questions" open one by one with their result box
- [x] Name "IELTS Band Up" and logo 4 in the app, window, installer shortcuts and uninstall entry; data folder, program file and update feed unchanged; "not connected with IELTS" line
- [x] Windows CI build green; v0.0.14 published (2026-11-03)

## v0.0.15 — Linux (D-046)
- [x] `.deb` for Ubuntu 22.04+ (and Mint, Zorin, Pop!_OS, Debian 12+), built on Ubuntu 22.04; Chromium sandbox on (AppArmor profile on 24.04+); file permissions fixed in the package
- [x] Updates in the app on Linux too (`latest-linux.yml`); the version list shows only versions that have a Linux build; a note that installing asks for the password
- [x] Hints that name Windows keys have Linux versions (screenshot, voice typing, microphone settings)
- [x] One release workflow: Windows installer, Linux `.deb` installed and started on Ubuntu 22.04 and 24.04, one release with both
- [x] v0.0.15 published (2026-11-03): Windows and Linux CI green, the .deb installed and started on Ubuntu 22.04 and 24.04

## v0.0.16 — Nothing seen comes back (D-047)
- [x] A video watched for a minute (or half of a short one) counts as seen when the task moves on, is skipped or the screen closes; the time credit counts the part watched
- [ ] v0.0.16 published

## Sprint 4 — Exam preparation and progress · v0.1
- Introduction video first, before anything else, on the first start, with skip and "watch again" in Settings (D-040, owner 2026-11-03): Eng. Fady Mostafa made the app free to help people; the app explained from the first step until the target band, on the final screens
- Content-policy review before the app is given to the public (the personal-use rules change, D-045)
- Weekly report; the plan adapts to test results
- Optional: AI method B (official API keys, provider switch, key stored encrypted)

**Exit = v0.1:** every PRD acceptance criterion passes on the baseline laptop.

## Linux — done in v0.0.15 (D-046)
A `.deb` that installs and updates itself the same way; an AppImage or rpm only if asked.

## v0.2 — Personalised engine

Diagnostic (official practice results + short original grammar/vocabulary checks), skill mastery model, priority scoring per master spec §7, lesson player and first original exercise bank, evidence-based Arabic → English shift.

## v0.3 — IELTS labs

Interactive Listening/Reading practice with in-app question sets (original, or owner-supplied for personal use), timed practice, mock-test flow, readiness indicator built on several recent full practice tests.

## v0.4+ — Optional

AI feedback provider interface; local speech-to-text add-on; report export.

"Pro" add-on (D-029): a local open-source model for simple tasks (word meanings, example sentences, grammar hints), only if a speed test on the owner's laptop is acceptable.
