# IELTS Pilot — Test Plan (v0.1)

Status: **draft for approval** · 2026-11-02

---

## 1. Levels

1. **Unit** — backend (pytest), frontend (Vitest).
2. **Integration** — FastAPI + real SQLite in a temp directory.
3. **Windows CI smoke** — `build-windows.yml` on a clean GitHub-hosted Windows runner.
4. **Owner acceptance** — on the baseline laptop (§5).

A feature counts as done only when its unit and integration tests pass in CI and its PRD acceptance criteria pass on the baseline laptop.

## 2. Unit tests

**Planner (`CURRICULUM.md` §4)**
- Phase selection: exam ≤ 4 weeks; level thresholds; missing levels → Development + low-confidence flag.
- Weights: each ≥ 0.10; Σw = 1; zero-gap case → 0.25 each.
- Track split matches the phase table.
- Minimum one W-T2 per week rule.
- Determinism: same inputs → same plan.
- Every allocation has a rationale entry.
- The CURRICULUM §4 worked example reproduces exactly (before rounding).

**Today queue (§5)**
- Reviews first, capped at the reserve.
- At most one carried-over task; others marked `dropped` with reason.
- Swap returns same skill and track.

**Spaced review (§7)**
- Intervals 1 → 6 → interval × EF.
- EF never below 1.3.
- Grade < 3 resets repetitions and interval.
- Re-logging an error code resets its interval and increments `occurrence_count`.

**Sessions**
- Idle pause after the threshold.
- Recovery of a session with a stale heartbeat as `unconfirmed`.
- `active_seconds` never exceeds wall-clock duration.

**Writing**
- Word count rules, defined and tested: whitespace-separated tokens; hyphenated words = 1; numbers = 1; contractions = 1.
- Autosave produces no duplicate drafts.

**Practice results**
- A band without `band_source` is rejected.

**Backup**
- Manifest checksums match file contents.

## 3. Integration tests

- CRUD round-trip through the API for every router.
- Token middleware: missing or wrong token → 401. Host middleware: foreign Host → 400.
- Migrations: empty DB → head; previous schema with data → head, data intact.
- Backup → delete all → restore: identical rows and file hashes.
- Restoring a backup with a newer schema is refused.
- Low free disk (simulated): backup and recording refuse with a clear message when < 500 MB free.

## 4. Windows CI smoke (`build-windows.yml`)

- The PyInstaller backend starts on a clean runner without any system Python on PATH and answers `/health`.
- Migrations run on a fresh temp data dir.
- The NSIS installer installs silently per-user; expected files present.
- The installed backend answers `/health`.
- Uninstall removes program files and leaves the data directory.

## 5. Owner acceptance checklist (baseline laptop)

1. Download the artifact and install. Expected: SmartScreen warning (unsigned) → "More info" → "Run anyway".
2. First launch with Wi-Fi off → setup → Today.
3. Start a task, close the app mid-session, reopen → session offered as "unconfirmed".
4. A writing draft survives a restart.
5. A speaking recording plays after a restart.
6. Add a mistake and a word → both due the next day.
7. Backup → restore.
8. In Command Prompt: `netstat -ano | findstr LISTENING` → the app's port is bound to `127.0.0.1` only.
9. With Wi-Fi off, the web panel shows "needs internet", not a blank page.

## 6. Performance targets (baseline: i5-7200U, 8 GB RAM, Windows 10)

These are **targets to be measured**, not promises:

| Metric | Target |
|---|---|
| Cold start to Today | ≤ 10 s |
| Screen navigation | ≤ 300 ms perceived |
| Memory, all app processes, idle on Today | ≤ 500 MB |
| Installer size | Investigate if > 250 MB |

**Measured at the packaging spike (2026-11-02)**

| Metric | Baseline laptop | GitHub Windows runner |
|---|---|---|
| Backend ready, first launch after install | 9.6 s | 1.8 s |
| Backend ready, later launches | 1.8 s | 1.3 s |
| Installer size | — | 134 MB |
| Installed size | — | 395 MB |

Cold start to a usable window was not measured separately; the window currently waits for the backend (fixed in Sprint 1). Memory use not yet measured.

## 7. Edge cases (master spec §13, applicable to v0.1)

No internet; resource URL down; missing or corrupt local PDF/audio; app closed during save; database not writable; low disk; old backup; app upgrade with migration; invalid input (band out of range, negative minutes); setup not completed; goal changed mid-week (new plan from the next day, history kept).
