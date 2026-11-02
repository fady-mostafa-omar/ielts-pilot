# IELTS Pilot — Database (v0.1)

Status: **draft for approval** · 2026-11-02 · Engine: SQLite · ORM: SQLAlchemy 2.x · Migrations: Alembic

File: `%APPDATA%\IELTS Pilot\data\ielts_pilot.db`

---

## 1. Connection settings

- `PRAGMA foreign_keys = ON` on every connection.
- `PRAGMA journal_mode = WAL`.
- `PRAGMA synchronous = NORMAL`.
- All writes inside transactions; one SQLAlchemy session per request.

## 2. Conventions

- Primary keys: `INTEGER` autoincrement (single local user, no sync).
- Timestamps: `UTCDateTime` column type — stored as naive UTC in SQLite, always returned timezone-aware; naive datetimes are rejected on write. Converted to local time for display.
- JSON columns stored as `TEXT`, validated by Pydantic on the way in and out.
- Enum-like columns stored as `TEXT` with `CHECK` constraints.
- `skill` values: `listening`, `reading`, `writing`, `speaking` (plus `grammar`, `vocabulary`, `general` where noted).
- Band values: `REAL` in 0–9, steps of 0.5, enforced by `CHECK`.
- Activity codes come from `CURRICULUM.md` §3.

## 3. Tables

### learner_profile — exactly one row
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | always 1 (`CHECK (id = 1)`) |
| display_name | TEXT NULL | |
| interface_language | TEXT | `ar` \| `en` |
| explanation_language | TEXT | `ar_heavy` \| `balanced` \| `en_heavy` |
| target_overall | REAL | band |
| target_listening / target_reading / target_writing / target_speaking | REAL | default = target_overall |
| minimum_per_skill | REAL | e.g. 6.5 |
| exam_date | DATE NULL | |
| study_days_per_week | INTEGER | 1–7 |
| study_minutes_per_day | INTEGER | 10–600 |
| created_at, updated_at | DATETIME | |

### skill_levels — current level per skill, with history
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| skill | TEXT | four skills only |
| band | REAL | |
| source_type | TEXT | `official_practice` \| `external_marker` \| `self_estimate` |
| source_note | TEXT | e.g. test title |
| practice_result_id | INTEGER FK NULL → practice_results | **added in Sprint 4** with `practice_results` |
| recorded_at | DATETIME | |

Latest row per skill = current level used by the planner. Index `(skill, recorded_at)`.

### app_settings
| Column | Type |
|---|---|
| key | TEXT PK (e.g. `planner.review_share`) |
| value_json | TEXT |
| updated_at | DATETIME |

### resources
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| catalog_id | TEXT NULL UNIQUE | e.g. `DLK-15` from the catalogue CSV |
| title | TEXT | |
| provider | TEXT | `Dalilk`, `Official`, `Owner`, `Original` |
| skill | TEXT | four skills + `grammar`, `vocabulary`, `general` |
| activity_codes | TEXT NULL | `;`-separated, from CURRICULUM §3 |
| resource_type | TEXT | `practice_test`, `plan`, `book`, `video_playlist`, `video_series`, `podcast`, `web_tool`, `other` |
| format | TEXT | `pdf`, `audio`, `video`, `web`, `text` |
| url | TEXT NULL | |
| local_path | TEXT NULL | relative to `library\` |
| sequence_group | TEXT NULL | resources consumed in order |
| order_index | INTEGER NULL | |
| is_repeatable | BOOLEAN | |
| needs_internet | BOOLEAN | |
| licence_note | TEXT | required |
| progress_position | TEXT NULL | e.g. "Day 7" |
| status | TEXT | `active` \| `archived` |
| completed_at | DATETIME NULL | |
| created_at, updated_at | DATETIME | |

Indexes: `(skill, status)`, `(sequence_group, order_index)`.

### weekly_plans
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| week_start | DATE | |
| generated_at | DATETIME | |
| generator_version | TEXT | e.g. `planner-1` |
| inputs_json | TEXT | snapshot of profile + skill levels used |
| allocation_json | TEXT | minutes per skill, track and activity |
| rationale_json | TEXT | one entry per allocation: rule id + inputs + sentence |
| is_current | BOOLEAN | partial unique index: one row where `is_current = 1` |

### plan_tasks
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| plan_id | INTEGER FK → weekly_plans | |
| scheduled_date | DATE | |
| order_in_day | INTEGER | |
| skill | TEXT | |
| track | TEXT | `A` \| `B` |
| activity_code | TEXT | |
| planned_minutes | INTEGER | |
| resource_id | INTEGER FK NULL → resources | |
| status | TEXT | `pending`, `in_progress`, `done`, `skipped`, `dropped` |
| selection_reason | TEXT | shown on Today |
| skip_reason | TEXT NULL | |
| carried_over_from | DATE NULL | |
| completed_at | DATETIME NULL | |

Index `(scheduled_date, status)`.

### study_sessions
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| started_at | DATETIME | |
| ended_at | DATETIME NULL | |
| last_heartbeat_at | DATETIME | updated ≤ every 30 s |
| active_seconds | INTEGER | never exceeds wall-clock duration |
| skill, track, activity_code | TEXT | |
| resource_id | INTEGER FK NULL | |
| plan_task_id | INTEGER FK NULL | |
| state | TEXT | `running`, `confirmed`, `unconfirmed`, `discarded` |
| notes | TEXT NULL | |

Indexes: `(started_at)`, `(skill, started_at)`.

### writing_prompts
`id`, `task_type` (`task1` \| `task2`), `prompt_text`, `source_note`, `created_at`.

### writing_attempts
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| prompt_id | INTEGER FK NULL | |
| task_type | TEXT | |
| prompt_snapshot | TEXT | prompt as written at the time |
| text | TEXT | |
| word_count | INTEGER | rules in TEST_PLAN §2 |
| time_limit_seconds, time_used_seconds | INTEGER | |
| status | TEXT | `draft` \| `submitted` |
| checklist_json | TEXT NULL | |
| self_scores_json | TEXT NULL | four criteria, labelled self-rating |
| external_score_json | TEXT NULL | `{band, criteria?, source}` — source required |
| session_id | INTEGER FK NULL | |
| created_at, updated_at, submitted_at | DATETIME | |

### speaking_prompts
`id`, `part` (1 \| 2 \| 3), `prompt_text`, `cue_points_json` NULL, `source_note`, `created_at`.

### speaking_attempts
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| prompt_id | INTEGER FK NULL | |
| part | INTEGER | |
| prompt_snapshot | TEXT | |
| audio_path | TEXT NULL | relative to `recordings\` |
| duration_seconds | INTEGER | |
| self_scores_json, external_score_json | TEXT NULL | as in writing |
| notes | TEXT NULL | |
| session_id | INTEGER FK NULL | |
| created_at | DATETIME | |

### error_log
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| skill | TEXT | |
| error_code | TEXT | CURRICULUM §6 |
| context, wrong, correct, explanation | TEXT | wrong/correct may be empty for skills like timing |
| source_note | TEXT NULL | |
| occurrence_count | INTEGER | default 1 |
| ease_factor | REAL | default 2.5 |
| interval_days | INTEGER | default 0 |
| repetitions | INTEGER | default 0 |
| next_review_at | DATETIME | |
| last_reviewed_at | DATETIME NULL | |
| resolved_at | DATETIME NULL | |
| created_at | DATETIME | |

Indexes: `(next_review_at)`, `(error_code)`.

### vocabulary_items
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| word | TEXT | unique, `COLLATE NOCASE` |
| meaning_ar, meaning_en | TEXT NULL | at least one required |
| example, collocations | TEXT NULL | |
| source_note | TEXT NULL | |
| status | TEXT | `learning`, `review`, `mastered`, `suspended` |
| ease_factor, interval_days, repetitions, next_review_at, last_reviewed_at | | as in error_log |
| created_at | DATETIME | |

Index `(next_review_at)`.

### review_events
`id`, `item_kind` (`error` \| `vocab`), `item_id`, `reviewed_at`, `grade` (0–5), `interval_before`, `interval_after`. Index `(item_kind, item_id)`.

### practice_results
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| source_title | TEXT | |
| section | TEXT | `listening`, `reading`, `writing`, `speaking`, `full` |
| raw_score, max_score | INTEGER NULL | |
| reported_band | REAL NULL | |
| band_source | TEXT NULL | `CHECK (reported_band IS NULL OR band_source IS NOT NULL)` |
| time_used_seconds | INTEGER NULL | |
| taken_on | DATE | |
| qtype_breakdown_json | TEXT NULL | |
| notes | TEXT NULL | |
| resource_id | INTEGER FK NULL | |
| created_at | DATETIME | |

## 4. Deferred to v0.2+ (from the master spec)

`assessments`, `assessment_results`, `skills`, `modules`, `lessons`, `activities`, `attempts`, `skill_mastery` — added by migrations when the diagnostic and lesson player arrive. Names stay compatible with the master spec. The spec's `content_sources` is covered by `resources`; `learning_plans` by `weekly_plans`; `learner_id` columns are omitted because there is one learner.

## 5. Migrations and versioning

| Revision | Sprint | Change |
|---|---|---|
| 0001 | 0 | `spike_kv` (packaging spike) |
| 0002 | 1a | drop `spike_kv`; add `learner_profile`, `skill_levels`, `app_settings` |


- One Alembic revision per schema change; `alembic_version` holds the schema version.
- The backend runs pending migrations at startup, immediately after an automatic `pre-migration` backup. A database whose revision this app does not know (made by a newer version) is never touched: the backend refuses to start.
- Downgrades are not supported in packaged builds; recovery is by restoring the pre-migration backup.

## 6. Backup format

`ielts-pilot-<YYYYMMDD-HHMMSS>.zip`:
- `manifest.json` — app version, schema version, created_at, file list with SHA-256.
- `data/ielts_pilot.db` — made with SQLite's online backup API, consistent while the app runs.
- `recordings/…`, `library/…`.

- Name: `ielts-pilot-<UTC yyyymmdd-hhmmss>-<kind>.zip`; kinds `manual`, `pre-migration`, `pre-restore`, `pre-delete`; files copied in via the bridge are named `ielts-pilot-imported-<time>.zip`.
- Written to a `.partial` file first, then renamed, so a crash never leaves a half backup that looks complete.
- Refused below 500 MB free disk (R-02).
- Retention: the newest 10 automatic backups are kept; manual and imported backups are never deleted automatically.

**Restore** verifies every checksum and refuses unsafe paths (zip-slip) and backups with an unknown (newer) schema; makes a `pre-restore` backup; copies the database **into** the live file with SQLite's backup API (no file replacement, which Windows may block while the file is open); replaces `recordings\` and `library\`; then migrates to head if the backup is older.

**Delete all data** requires the literal confirmation `DELETE` (the UI asks the owner to type «امسح» / “DELETE”), makes a `pre-delete` backup, clears every table and the `recordings\` and `library\` folders. Backups are kept.
