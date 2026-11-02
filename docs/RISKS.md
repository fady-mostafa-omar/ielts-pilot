# IELTS Pilot — Risk Register (personal edition)

Status: **draft for approval** · 2026-11-02

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-01 | Building the app replaces studying — the original problem in a new form | High | High | Owner studies on the app from Sprint 2; anything not needed for tomorrow's session waits; small sprints |
| R-02 | Low free disk on the baseline laptop (~6 GB) | High | Medium | No local builds (CI); app refuses backup/recording with a clear message below 500 MB free; owner frees space for Windows itself |
| R-03 | Electron + PyInstaller packaging fails or is fragile | Medium | High | Packaging spike before any feature; onedir; CI smoke tests; plan B = TypeScript-only backend |
| R-04 | Antivirus false positive on the PyInstaller binary | Medium | Medium | onedir, no UPX; if it happens, rebuild the bootloader from source and/or report the false positive |
| R-05 | Unsigned installer → SmartScreen warning | Certain | Low (personal use) | Accepted; documented in the acceptance steps |
| R-06 | Dalilk resources change or disappear | Medium | Medium | Catalogue keeps URL + check date; owner keeps local copies of downloadable PDFs for personal use; broken links show clearly |
| R-07 | Self-estimates mislead the planner | Medium | Medium | Source stored and shown; plan flagged low-confidence; first official practice result replaces self-estimates |
| R-08 | Windows 10 is past Microsoft support; Chromium/Electron may drop it later | Low near-term | High long-term | Pin a supported Electron; watch release notes; move to a supported OS when feasible |
| R-09 | Local API reachable by other software or web pages | Low | Medium | 127.0.0.1 only; per-launch token; Host check; no docs UI in builds |
| R-10 | Data loss (crash, power cut, bad upgrade) | Low | High | WAL + transactions; session heartbeats; auto-backup before migrations; manual backup |
| R-11 | GitHub Actions free minutes run out (Windows minutes cost more) | Low | Low | Windows builds only on tag/manual run; tests on Ubuntu; check quota before Sprint 1 |
| R-12 | Writing/Speaking progress cannot be measured objectively offline | Certain | Medium | Self-review + external scores with source; no app-computed bands; optional AI later, labelled unofficial |
| R-13 | Unverified Dalilk content (Academic vs General, origin of "expected questions") | Medium | Medium | Marked unverified in the catalogue; checked when first used; practice-only label (CONTENT_POLICY §7) |
