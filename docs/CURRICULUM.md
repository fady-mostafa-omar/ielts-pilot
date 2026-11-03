# IELTS Pilot — Curriculum and Planning Rules (v0.1)

Status: **draft for approval** · 2026-11-02

---

## 1. What "curriculum" means in v0.1

v0.1 has no built-in lessons. The curriculum is:

1. a fixed set of **activity types** per skill (§3);
2. **resources** mapped to those activity types (`content/catalog/dalilk_inventory.csv` + owner-added);
3. **planning rules** that turn goals, current levels and available time into a weekly plan (§4) and a daily queue (§5).

Original lessons and exercises arrive in v0.2.

## 2. Two tracks

From the master spec:
- **Track A — English development:** grammar, vocabulary, extensive listening and reading, fluency, review of own output.
- **Track B — IELTS Academic preparation:** task types, strategies, timed practice.

Default split by phase. These are the master spec's design starting points, **not research-derived values**, and are tunable:

| Phase | Track A | Track B |
|---|---|---|
| Foundation | 75% | 25% |
| Development | 60% | 40% |
| Exam preparation | 35% | 65% |

**Phase selection (rule P, tunable):**
1. Exam date set and ≤ 4 weeks away → Exam preparation.
2. Otherwise by mean current level across the four skills: < 5.5 → Foundation; 5.5 to < 6.5 → Development; ≥ 6.5 → Exam preparation.
3. Any skill level missing → Development, and the plan is flagged "low confidence".

## 2a. Interim daily split (Sprint 1b, D-019)

Until the planner exists, Home splits the daily hours like this:

1. Phase by rule P above → development share *d* (75%, 60% or 35%).
2. Development time *D* = daily minutes × *d*, split the way Abdulrahman Hegazy describes a development hour (as given by the owner): 30/60 listening, 20/60 reading, 10/60 writing and speaking.
3. The rest is exam time: techniques videos and practice tests.
4. Minutes are rounded to 5; exam time takes the remainder.

Example: 3 h/day in the development phase → 108 min development → listening 55, reading 35, writing and speaking 20, exam 70.

Sessions count toward a part by their skill: listening → listening; reading → reading; writing/speaking → writing and speaking; techniques, practice tests and placement tests → exam; grammar, vocabulary and general → shown separately. Sprint 2 checks this against Dalilk's routine PDFs and turns it into tasks.

## 3. Activity types

| Code | Skill | Track | Typical block | Suggested resources |
|---|---|---|---|---|
| L-EXT | Listening | A | 15–30 min | Dalilk Daily English Listening podcast (DLK-11), Dalilk IELTS podcast (DLK-20) |
| L-SPELL | Listening | B | 10–15 min | Dalilk spelling challenge (DLK-21) |
| L-PRAC | Listening | B | 30–40 min | Official practice listening section; Dalilk mock (DLK-18) |
| R-EXT | Reading | A | 20–30 min | Dalilk 100 graded novels (DLK-07) |
| R-PRAC | Reading | B | 20 min (one passage) / 60 min (full) | Official practice reading; Dalilk mock (DLK-18) |
| W-T1 | Writing | B | 20 min | Writing lab |
| W-T2 | Writing | B | 40 min | Writing lab |
| W-REV | Writing | A | 15 min | Review own essay against checklist; log mistakes |
| S-P1 / S-P2 / S-P3 | Speaking | B | 10–20 min | Speaking lab; Dalilk expected speaking questions (DLK-19, see CONTENT_POLICY §7) |
| S-FLU | Speaking | A | 15 min | Dalilk fluency routine (DLK-10), daily phrases playlist (DLK-06) |
| G-FOC | Grammar | A | 15–20 min | Dalilk 17 grammar rules (DLK-05) |
| V-NEW | Vocabulary | A | 10–15 min | Words captured from reading/listening; Dalilk 350 words (DLK-04) for basics only |
| T-STRAT | any | B | 15–20 min | Dalilk IELTS techniques playlist (DLK-17), Dalilk IELTS book (DLK-16) |
| REV | errors + vocab | A | review reserve (§4) | Mistakes notebook + vocabulary review |

Writing and speaking blocks in Track A (W-REV, S-FLU) count toward that skill. Grammar and vocabulary are support skills funded from Track A (§4 step 4).

## 4b. Planner-4/5/6 — Dalilk's 90-day method (v0.0.8, D-035; `planner-5` in v0.0.9, D-038; `planner-6` in v0.0.10, D-039; implemented in `backend/app/planner.py`)

Supersedes the daily mix of §4a; the estimate (D-023), the final days (D-024 without the two-weekly mock) and the spelling days stay.

**Day = focus block + development time on Dalilk's ratio** (owner 2026-11-03, D-039): his 3-hour day is 2 h on the week's skill + 1 h development, scaled to the real daily time. Development = a third of the day, **never under one hour** (or the whole day when it is shorter), rounded to 5, split 30:20:5:5 — writing and speaking each 1/12 of it (at least 5 min), listening 60 % of the rest, reading the remainder: 2 h → 30/20/5/5 + 1 h focus, 3 h → 30/20/5/5 + 2 h, 6 h → 60/40/10/10 + 4 h. Tasks run focus first, development last (Dalilk advises keeping the development time at its own time of day).

**Units** (D-039): a podcast = 4 stages × 15 min (listen without the PDF, listen with it, shadowing, reading for meaning) = 1 h; the day's podcast time is rounded to whole stages (the novel takes the difference) and a podcast left half-way carries on the next day from its stage. A novel = 30 min on average; a task holds round(minutes ÷ 30) novels, and a novel left half-way carries on the next day. Technique days never cut a test below the exam's own time (listening 30, reading 60): the videos give way, or the day stays videos only; a test day too short for a whole test gets a practice video instead. Final test days: the full test, a mistakes review, then the development split on the rest. Every speaking task starts with a one-minute recording.

**Word cards** (v0.0.11, D-041, `planner-7`): "Today's words" (`V-CARDS`, 10 min) every study day, taken from the focus time (from the novel on a day with no focus time); development keeps Dalilk's ratio. SM-2: reviews first, then up to 15 new cards a day (the owner's own words before Dalilk's 350). One of Dalilk's 150 phrases in each pause between tasks.

**Weeks** are calendar weeks from Saturday, counted from the plan start. Study weeks *W* = weeks up to the last study day (exam − 5); with no exam date, *W* = 12 and weeks after 12 repeat the consolidation round.

| *W* | Sequence |
|---|---|
| ≥ 8 | development weeks (*W* − 8) → exam round (listening, reading, writing, speaking) → consolidation round (same four) |
| 4–7 | development weeks (*W* − 4) → exam round; no consolidation round (said on My plan) |
| < 4 | exam round squeezed: the study days left are split into four equal runs (listening, reading, writing, speaking); no development weeks (said on My plan) |

Development weeks run listening first, then reading, in blocks of two weeks (one week each when only one or two are left, listening first).

**Focus block by week** (*k* = study day of the week, from 0; *n* = study days that week):
- Development listening: the podcast (Dalilk IELTS podcast, or Daily English Listening below band 5.0). Day 0 starts with "how to listen to podcasts".
- Development reading: Dalilk novels at the learner's level (below 5.0 beginner; 5.0–6.0 intermediate; 6.5+ upper-intermediate; the next level when a level is finished). Day 0 starts with "how to read".
- Exam listening / reading: days 0–1 technique videos for that skill (required set + the exam-format set + the low-level set below 5.5 + the high-target set when the target is 7+); later days practice tests of that skill (listening 40 min, reading 75 min each, review included), the rest of the time practice videos.
- Exam writing: the first ⌈3*n*/7⌉ days Task 1, the rest Task 2; the first day of each starts with its technique videos; Task 1 practice = 20 min writing + 10 min review, Task 2 = 40 + 10; the last study day of the week is a writing test.
- Exam speaking: day 0 technique videos; later days the expected questions (DLK-19) and speaking practice videos.
- Consolidation round: the same; videos already watched are not shown again, so technique days move on to the high-target and practice videos; practice tests start with Cambridge IELTS 21 → 19 (engnovate), then ieltsonlinetests.

**Focus time is shared in the exam weeks** (v0.0.9): technique days 60 % videos, 40 % practice right away (tests for listening/reading, answers for writing, speaking practice); test days about half the focus in tests (each with its review time), the rest half practice videos, half podcast + novels; writing days about 60 % answers; speaking days half speaking practice. On a final test day the full test keeps its real time and, when the day is longer, up to 60 min of reviewing its mistakes then podcast + novels. **Caps:** technique videos ≤ 4 h, practice tests ≤ 4, practice videos ≤ 2 h, writing answers ≤ 4, speaking practice ≤ 1 h; whatever is left goes to podcast (60 %) and novels (40 %). Videos are taken in catalogue order, skipping any that does not fit the time left (it comes on a day with more time). The development hour's podcast and novel time joins the focus block's when both are the same content.

**Development hour:** listening = podcast; reading = novel; writing = 5 sentences on the writing pad; speaking = speaking aloud, or in development weeks the next video of Dalilk's daily-phrases series (its real length, taken from the focus block). The spelling challenge (15 min) takes listening time on two fixed days in development weeks.

**Final days** (D-024): exam − 4, − 3, − 2 full practice tests — Dalilk's computer-based mock exams A → J in order (for both formats; the British Council familiarisation test on the first final day for the computer format); exam − 1 technique review (watched technique videos may be shown again).

**Content, each item once.** Tasks name a kind of content, not a fixed item; opening a task gives the next unfinished item of that kind (videos by group and skill in catalogue order, tests by provider order, novels by level, podcast episodes as in §4a). Catalogue: `content/catalog/videos.csv` (102 videos, ~61 h), `novels.csv` (98 working links; two broken links on Dalilk's site left out), `practice_tests.csv`.

**Plan header totals** (all study days to the exam, or 12 weeks): videos = the scheduled videos' real durations; tests and writing tasks = counted from the tasks; podcast episodes = podcast minutes ÷ (4 × average episode length — listen, listen and read, shadow, listen again; the average comes from the feed, 11.5 min until it is read); novels = reading minutes ÷ 60 min per novel until the owner's own reading time is measured. Estimates are labelled as such.

**Exam format** (`app_settings.exam_format`: `computer` | `paper`, asked in setup): picks the computer-delivered or paper videos.

## 4a. Planner-2 (Sprint 2a, implemented in `backend/app/planner.py`)

Replaces planner-1 below for v0.1. Every rule is a pure function with unit tests (`backend/tests/test_planner.py`).

**Inputs:** targets, current level per skill (latest `skill_levels` row; a missing skill falls back to the latest Dalilk 13English estimate), exam date, study weekdays (default: Friday off first), minutes per day, hours per band *H* (default 200, Settings), plan start date, hours studied since the latest level measurement.

**Estimate (D-023).** Current overall = IELTS rounding of the known skill bands. Gap = max(target overall − current overall, mean of the per-skill gaps). Hours needed = gap × *H*; remaining = needed − hours studied since the latest measurement. Study days left = study weekdays from today to exam − 5. Needed per day = remaining ÷ study days left. If it does not fit the daily time, three ways out are offered: the daily time rounded up to half hours (if ≤ 14 h), the earliest exam date that fits the current daily time, and the band reachable by the exam date (floored to 0.5). Nothing about *H* is claimed as fact: ~200 h/band is a rule of thumb of unclear origin; published course studies report smaller gains (≈0.2–0.5 band over 3–12 weeks).

**Calendar (D-024).** Exam − 4, − 3, − 2: full practice tests (165 min). Exam − 1: techniques review only (≤ 120 min). Exam day and later: no tasks. Rest weekdays: no tasks. A full practice test on the last study day of every second week after the plan start, except within 10 days of the exam.

**A study day (D-019).** Phase (§2 rule P) → development share 75 / 60 / 35 %. Development time = 30/60 listening (L-EXT: Dalilk IELTS podcast, or Daily English Listening below band 5.0), 20/60 reading (R-EXT: Dalilk graded stories), 10/60 output alternating speaking (S-FLU: expected questions, or everyday situations below 5.5) and writing (W-REV on the writing pad). The exam share follows Dalilk's 30-day plan order — one skill per week, biggest gap first: the first study day of the week is a technique video (T-STRAT), later days practice (L-PRAC / R-PRAC with official or engnovate tests, W-T1 / W-T2 on the writing pad, S-PRAC with expected questions). Blocks shorter than 10 min are merged into the longest development block. Minutes are rounded to 5; the exam block takes the remainder.

**Spelling (planner-3, 0.0.6).** Outside the exam phase, the spelling challenge (L-SPELL, DLK-21) takes 15 min of the listening time on two fixed study days a week: the 2nd and 4th study day counted from Saturday (with 1–3 study days a week: one day, the 2nd or the only one). The days are shown on My plan.

**Storage.** Today's blocks are stored as `plan_tasks` the first time they are asked for and regenerated while none has started (inputs hash); started days are kept. Later days are previews. Tasks: pending → in_progress → done / skipped (with a reason) and can be reset. Sessions started from a task carry its id.

**Focus mode (D-025).** "Continue learning" opens the first unfinished task in a full-window view; Next finishes it and opens the next; a break of *b* minutes is offered after every *e* minutes of real study (defaults 10 and 50, Settings), and break time is not counted. Between two tasks a one-minute pause shows an encouraging line and a picture (D-032). A day whose tasks were skipped or closed before half their time is not celebrated; those tasks can be brought back. "Start the plan again" restarts the plan from today (D-031).

**Podcast listening (D-028).** The L-EXT task on the Dalilk IELTS podcast opens the player on the next episode: the one started and not finished, else the lowest-numbered one not yet listened. Four steps, all on the same episode: 1 listen only, transcript hidden (general idea); 2 listen with the transcript, note unknown words; 3 shadowing — pause and repeat sentences after the speaker, transcript shown; 4 listen once more without the transcript and rate understanding 1–5 (self-rating, never a band). "Finished the episode" marks it listened and moves to the next. Below band 5.0 the plan uses Daily English Listening (DLK-11), which opens in the same player since 0.0.6 (D-030), with its own progress.

## 4. Weekly planning rules (`planner-1`, superseded by §4a)

**Inputs:** days/week *D*, minutes/day *M*, per-skill targets *T*ₛ, current levels *C*ₛ (latest `skill_levels` row), phase (§2).

| Step | Rule |
|---|---|
| 1 · Review reserve | Each day reserves 10% of *M* (min 5, max 15 min) for due reviews. Unused review time goes to that day's last block. |
| 2 · Track split | Remaining weekly minutes split A/B by the phase table. |
| 3 · Skill weights | Gap gₛ = max(*T*ₛ − *C*ₛ, 0). Weight wₛ = 0.10 + 0.60 × gₛ / Σg. Every skill gets at least 10%. If Σg = 0, wₛ = 0.25 (maintenance). Σw = 1. |
| 4 · Allocation | Track B minutes per skill = B × wₛ. Track A: 30% to grammar + vocabulary (G-FOC, V-NEW), 70% to skills by wₛ (L-EXT, R-EXT, W-REV, S-FLU). |
| 5 · Blocks | Round each allocation to whole blocks of its activity type. If writing's Track B minutes fall below one W-T2 (40 min), round up to one W-T2 per week, taking the time proportionally from the other skills' Track B minutes. |
| 6 · Days | Each skill appears on at least two study days if its minutes allow; at most three different skills per day; W-T2 goes on a day with ≥ 45 free minutes, or the longest day. |
| 7 · Resources | Each block gets the next unfinished item of its resource sequence; repeatable resources rotate. |
| 8 · Rationale | Every allocation stores the rule and inputs, e.g. "Reading: 28% of IELTS time — gap 1.5 of total 5.0 (step 3)". |

All constants (10%, 5/15 min, 0.10/0.60, 30/70, 40 min, 45 min, three skills/day) live in `app_settings` under `planner.*` and are shown in Settings.

**Worked example (before rounding):**
6 days × 60 min = 360 min/week. Self-estimates L 6.5, R 6.0, W 6.0, S 6.5; all targets 7.5.

- Mean level 6.25 → Development (60/40).
- Review reserve 6 min/day → 36 min/week; remaining 324 min.
- Track A = 194.4 min; Track B = 129.6 min.
- Gaps 1.0 / 1.5 / 1.5 / 1.0, Σ = 5.0 → weights L 0.22, R 0.28, W 0.28, S 0.22.
- Track B: L 28.5, R 36.3, W 36.3, S 28.5 min.
- Track A: grammar + vocabulary 58.3 min; skills L 29.9, R 38.1, W 38.1, S 29.9 min.
- Step 5 then raises writing's Track B to one W-T2 (40 min), and the plan is flagged "low confidence" until a practice test replaces the self-estimates.

## 5. Today queue rules

1. **Due reviews** — errors first, then vocabulary, oldest due first, up to the day's review reserve. The rest wait for the next day.
2. **Today's plan tasks** in `order_in_day`.
3. **Carry-over** — at most one unfinished task from the previous study day (the one with the highest skill weight). Others are marked `dropped` with reason "missed day". Older tasks are never carried.
4. **Swap** offers the next activity for the same skill and track.

## 6. Error taxonomy (v0.1 codes)

| Area | Codes |
|---|---|
| Grammar | GR-TENSE, GR-ART (articles), GR-PREP (prepositions), GR-AGR (agreement), GR-STRUCT (sentence structure) |
| Vocabulary | VO-MEAN, VO-COLL (collocation), VO-FORM (word form), VO-SPELL |
| Reading | RD-MAIN (main idea), RD-DETAIL, RD-INFER, RD-REF (reference), RD-TIME (time management) |
| Listening | LS-DETAIL (missed detail), LS-DISTRACT (distractor), LS-SPELL, LS-NUM (numbers, dates) |
| Writing | WR-TASK (task coverage), WR-ORG (organisation), WR-COH (cohesion), WR-GRAM, WR-VOCAB |
| Speaking | SP-HESIT (hesitation), SP-REPEAT (repetition), SP-ORG, SP-GRAM, SP-PRON |

Based on the master spec's taxonomy; RD-TIME, LS-NUM and GR-STRUCT added.

## 7. Spaced review (SM-2)

- Grades: **Again** = 2, **Hard** = 3, **Good** = 4, **Easy** = 5.
- Grade < 3 → repetitions = 0, interval = 1 day.
- Grade ≥ 3 → repetitions 1 → 1 day, repetitions 2 → 6 days, then interval × EF (rounded).
- EF′ = EF + (0.1 − (5 − q)(0.08 + (5 − q) × 0.02)); EF never below 1.3.
- New items are due the next day.
- Logging an existing error code again: `occurrence_count + 1`, interval reset to 1 day.

## 8. IELTS Academic format reference

To be re-checked against ielts.org in Sprint 1 (PRD O-3) before the labs rely on these values.

| Section | Format |
|---|---|
| Listening | ~30 min, 4 parts, 40 questions |
| Reading | 60 min, 3 passages, 40 questions |
| Writing | 60 min — Task 1 ≥ 150 words (~20 min), Task 2 ≥ 250 words (~40 min) |
| Speaking | 11–14 min, 3 parts; Part 2 = 1 min preparation, up to 2 min talk |

Writing criteria: Task Achievement (Task 1) / Task Response (Task 2), Coherence and Cohesion, Lexical Resource, Grammatical Range and Accuracy.
Speaking criteria: Fluency and Coherence, Lexical Resource, Grammatical Range and Accuracy, Pronunciation.

## 9. v0.2 preview

Diagnostic (official practice results + short original grammar/vocabulary checks), skill mastery model, task priority scoring per master spec §7, lesson player with the first original exercise bank, and gradual Arabic → English shift of explanations based on evidence.
