# IELTS Pilot — Roadmap

Status: **draft for approval** · 2026-11-02

**Rules**
- A sprint starts only after the owner accepts the previous one.
- Each sprint ends with a short "done / remaining" report.
- Installers are built only when a sprint needs owner testing.
- No dates: pace depends on the owner's testing time.

---

## Sprint 0 — Discovery and validation (current)

- [x] Review master spec; risks; architecture recommendation
- [x] Check the Dalilk library page
- [x] Scope reset to personal edition (D-001)
- [x] Environment check on the baseline laptop
- [x] Build strategy: GitHub Actions (D-005)
- [x] Design documents (this set) — approved 2026-11-02
- [x] **Packaging spike** code: Electron + React window → FastAPI `/health` + one SQLite write/read in `%APPDATA%`; PyInstaller onedir; electron-builder NSIS per-user; CI workflows and Windows smoke scripts
- [x] Spike verified on Linux (packaged build, end-to-end smoke test, twice, persistence confirmed)
- [x] Versions pinned (`DECISIONS.md`)
- [ ] Private GitHub repo attached to the session; code pushed
- [ ] Windows build + smoke tests green on GitHub Actions
- [ ] Owner installs on the baseline laptop (exit criteria below)
- [ ] Generate `THIRD_PARTY_LICENSES.md` from installed packages

**Exit criteria (spike, on the baseline laptop):**
1. Installs per-user from the CI artifact.
2. Opens with Wi-Fi off.
3. A value written before closing is still there after reopening.
4. `netstat` shows the backend bound to 127.0.0.1 only.

If the spike fails: plan B (TypeScript-only backend, D-003) is proposed to the owner before any feature work.

## Sprint 1 — Foundation

F1 setup, settings, database + migrations, F4 resource library with the Dalilk catalogue and owner-added resources, in-app PDF / YouTube / web panel, F5 sessions, F12 backup/restore. Close O-2 (official practice links) and O-3 (format facts).

**Exit:** the owner can open any resource inside the app and every use is logged.

## Sprint 2 — Today and plan · *the owner starts studying here*

F3 planner, F2 Today queue, carry-over rules, plan rationale. Decide O-1 (Dalilk 30-day plan).

**Exit:** the owner studies daily from Today.

## Sprint 3 — Output labs

F6 Writing lab, F7 Speaking lab.

## Sprint 4 — Memory and progress → v0.1 complete

F8 mistakes notebook, F9 vocabulary, reviews in Today, F10 practice results, F11 progress.

**Exit = v0.1:** every PRD acceptance criterion passes on the baseline laptop.

## v0.2 — Personalised engine

Diagnostic (official practice results + short original grammar/vocabulary checks), skill mastery model, priority scoring per master spec §7, lesson player and first original exercise bank, evidence-based Arabic → English shift.

## v0.3 — IELTS labs

Interactive Listening/Reading practice with in-app question sets (original, or owner-supplied for personal use), timed practice, mock-test flow, readiness indicator built on several recent full practice tests.

## v0.4+ — Optional

AI feedback provider interface; local speech-to-text add-on; report export.
