# IELTS Pilot — Product Requirements Document

| | |
|---|---|
| Version | 0.1 — personal edition — **draft for approval** |
| Date | 2026-11-02 |
| Owner / sole user | Amr |
| Source of truth | `IELTS_Pilot_Claude_Master_Prompt.md`, as amended by `DECISIONS.md` |

---

## 1. Problem

Every time the owner starts preparing for IELTS Academic, momentum is lost to the same four things:

1. Too many sources, with no fixed order.
2. Constant switching between apps, tabs and screens.
3. No single answer to "what should I do right now?"
4. No trustworthy picture of real progress, so motivation fades.

## 2. Goal

One Windows desktop app that:

1. **Decides** the next study task and says why.
2. **Hosts** the task, so the work happens inside the app.
3. **Records** what was actually done, for how long, and with what result.
4. **Shows** honest progress built only from that record.

**v0.1 success criterion:** the owner can run complete study days inside IELTS Pilot without needing another app to decide, find or track anything. External web resources open inside the app.

## 3. Scope changes from the master spec

The master spec described a distributable product. This edition is for one learner and is not distributed (D-001).

| Area | Master spec | v0.1 personal edition |
|---|---|---|
| Users | IELTS Academic learners | One learner (the owner) |
| Distribution | Installer for the public | Unsigned per-user installer built by CI, for the owner only |
| Content | Dalilk library as primary source, behind a licensing gate | Dalilk + official free practice material for personal study; third-party files stay on the owner's machine, never in the repo (D-007) |
| Diagnostic | Built-in four-skill diagnostic | Deferred to v0.2; v0.1 starts from official practice-test results and self-estimates, labelled as such (D-008) |
| Adaptive engine | Mastery model + task priority | Rule-based weekly plan + spaced-review queue; mastery model in v0.2 |
| Lesson player / original exercise bank | Phase 4 | v0.2 |
| AI feedback, speech-to-text | Optional | Optional, v0.4 or later |

**Unchanged:** Windows desktop, offline-first core, local SQLite, no accounts, no fabricated bands, every recommendation explainable.

## 4. Target machine

Baseline, measured 2026-11-02: Windows 10 Home 22H2 x64, Intel Core i5-7200U, 8 GB RAM, ~6 GB free on C:.

Consequences:
- The app must stay light (targets in `TEST_PLAN.md` §6).
- No development tooling on this machine; builds run on GitHub Actions (D-005).
- Per-user install, no admin rights needed (D-010).
- Windows 10 is past Microsoft's end of support. Electron supports Windows 10+ today, but this can change (R-08).

## 5. Screens and features (v0.1)

Arabic-first UI with an English toggle; full RTL/LTR. The home screen is **Today**.

### F1 · First-run setup
- Target overall band.
- Per-skill targets (default = overall target).
- Minimum acceptable band per skill (one value, e.g. 6.5).
- Optional exam date.
- Study days per week; minutes per day.
- Current level per skill, from an official practice test or a self-estimate. Each value stores its source; self-estimates are labelled "self-reported".
- Explanation language preference: more Arabic / balanced / faster move to English.
- Everything editable later in Settings.

**Accept:** profile saved locally; the app opens straight to Today on next launch.

### F2 · Today
- One focused task at a time: skill, activity, suggested resource, planned minutes, and a one-line reason (e.g. "Reading gets the most IELTS time this week: largest gap to target, 6.0 → 7.5").
- Queue order: due reviews → today's planned blocks → at most one block carried over from yesterday (`CURRICULUM.md` §5).
- Actions: **Start** (opens the resource or lab and starts the session timer), **Done**, **Skip** (optional reason), **Swap** (next suggestion for the same skill and track).
- Day summary: minutes done vs planned.

**Accept:** with a plan and due reviews present, reviews come first; finishing a task logs a session and advances the queue; every task shows a reason.

### F3 · Weekly plan
- Generated from F1 inputs by the documented rules in `CURRICULUM.md` §4.
- Regenerated weekly, or on demand after a new practice result or a change of goals (changes apply from the next day; history is kept).
- Shows minutes per skill and track for the week, with the rationale for each allocation.

**Accept:** two different profiles produce two different plans; each allocation names the rule and inputs that produced it.

### F4 · Resource library
- Catalogue by skill and type: Dalilk resources (`content/catalog/dalilk_inventory.csv`), official free practice material, and anything the owner adds.
- Opens inside the app:
  - local PDFs → in-app PDF viewer;
  - YouTube playlists → embedded player;
  - web tools/pages → in-app web panel (needs internet).
- Each resource records provider, URL, local file path (if any), and a licence note.
- Ordered resources (e.g. a 30-day plan) track the owner's position; repeatable ones (podcasts, mocks) do not.

**Accept:** opening any resource keeps the owner inside the app; opening a resource from Today starts a session automatically.

### F5 · Study sessions
- A session = start, end, active seconds, skill, activity, resource, plan task, notes.
- The timer pauses after an idle threshold (default 5 min without input) and asks on return whether to keep the idle time.
- Sessions interrupted by a crash or power loss are recovered as "unconfirmed" on next launch.

**Accept:** closing the app mid-session loses at most the last autosave interval (target ≤ 30 s).

### F6 · Writing lab
- Task 1 or Task 2 prompt, typed/pasted by the owner or chosen from saved prompts.
- Timer (defaults 20 min Task 1, 40 min Task 2), live word count, minimum-length warning (150 / 250 words).
- Autosaved drafts; final submission.
- Post-writing self-review checklist grouped by the four official criteria, in our own wording (D-012).
- Optional external score (teacher, marking service) stored with its source.
- History of all attempts.

**Accept:** a draft survives an app restart; submitted essays list word count, time used and any score with its source.

### F7 · Speaking lab
- Part 1 / 2 / 3 prompt, from saved prompts or typed.
- Part 2: 1-minute preparation timer, then up to 2 minutes speaking.
- Local audio recording, playback, delete.
- Self-rating on the four speaking criteria + notes; optional external score with source.
- Recordings stay on the machine; never uploaded.

**Accept:** a recording plays back after an app restart; deleting an attempt deletes its audio file.

### F8 · Mistakes notebook
- Entry: skill, error code (`CURRICULUM.md` §6), context, what I wrote/answered, correct form, explanation, source.
- Spaced review (D-009). Logging the same error code again resets its interval to one day.
- Review mode: show context, recall the correction, self-grade.

**Accept:** a new entry is due the next day; a failed review returns it to short intervals.

### F9 · Vocabulary
- Word, meaning (Arabic and/or English), example sentence, collocations, source.
- Same spaced-review scheduler as F8.

**Accept:** due cards appear in Today's review block; grading updates the next due date.

### F10 · Practice results log
- Results from official-format practice material: source title, section, raw score / max, time used, date, notes, optional question-type breakdown.
- A band can be stored only together with the source of its conversion table (D-008).

**Accept:** results appear on the progress timeline with source and date; the app computes no band.

### F11 · Progress
- Study minutes per skill per week, planned vs done.
- Active days vs planned days (this week, last 4 weeks).
- Reviews done, items due, most-repeated error codes.
- Practice results over time per section.
- Every number states what it is (time, count, raw score, reported band, self-rating).

**Accept:** no number is labelled as an IELTS band unless it came from F10 with a source.

### F12 · Settings, backup and restore
- UI language, explanation language, goals, study time.
- Plan rules visible (read-only constants in v0.1).
- Backup: one `.zip` with database, recordings and local library files.
- Restore: validates the backup's schema version; takes an automatic backup first.
- Shows where data lives on disk.
- Delete-all-data behind a typed confirmation.

**Accept:** backup → delete all → restore gives back the same profile, history and recordings.

## 6. Honesty contract (measurement)

These stay separate and are never blended:

| Metric | Source | Shown as |
|---|---|---|
| Study time | Measured sessions | minutes / hours |
| Plan adherence | Plan vs sessions | done / planned |
| Review performance | Review grades | counts, items due |
| Practice results | Owner-entered from official-format material | raw score; band only as reported by its source |
| Self-assessment | Owner | labelled "self-rating" |
| Estimated band | — | **not computed in v0.1** |
| Readiness | — | not before v0.3, and then only from several recent full practice tests |

## 7. UX rules

- One primary action per screen.
- Every recommendation shows its reason.
- No backlog guilt: an unfinished block carries over one day at most, then is dropped and logged.
- Motivation comes from evidence — time, consistency, score trend — not badges or endless streak counters.
- Short instructions; Arabic explanation available everywhere.

## 8. Out of scope for v0.1

Built-in diagnostic; mastery model; lesson player and original exercise bank; interactive Listening/Reading labs with in-app question sets; full mock-test flow; AI feedback; speech-to-text; pronunciation scoring; theming beyond the default; PDF/CSV report export.

## 9. Open items

| # | Item | Needed by |
|---|---|---|
| O-1 | Owner uploads Dalilk's "30-day IELTS plan" PDF so we can judge whether it can seed the weekly plan | Sprint 2 |
| O-2 | Find and verify current links to official free IELTS Academic practice material; add to catalogue | Sprint 1 |
| O-3 | Re-check IELTS Academic format and timing facts (`CURRICULUM.md` §8) against ielts.org | Sprint 1 |
