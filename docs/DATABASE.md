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
- `skill` values: `listening`, `reading`, `writing`, `speaking` (plus `grammar`, `vocabulary`, `techniques`, `general` where noted).
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
| study_minutes_per_day | INTEGER | whole half hours, 30–840 (½ h to 14 h); was 10–600 before 0003 |
| created_at, updated_at | DATETIME | |

### skill_levels — current level per skill, with history
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| skill | TEXT | four skills only |
| band | REAL | |
| source_type | TEXT | `official_practice` \| `external_marker` \| `placement_quiz` (0003, from a Dalilk test) \| `self_estimate` |
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

### placement_results (0003)
A result from one of Dalilk's free placement tests, typed in by the owner from the result page (the app never reads the page).

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| test | TEXT | `dalilk_13english` \| `dalilk_3min` |
| level_label | TEXT | as shown, e.g. "B1", "Intermediate" |
| approx_band | REAL NULL | only if the page showed one; band check |
| taken_on | DATE | not in the future |
| notes | TEXT | |
| created_at | DATETIME | |

Saving a result may also add `skill_levels` rows (`source_type = placement_quiz`) for the skills the owner ticks.

### resources (0003)
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| catalog_id | TEXT NULL UNIQUE | e.g. `DLK-15`; NULL for the owner's own resources |
| title | TEXT | |
| provider | TEXT | `Dalilk`, `Official`, `engnovate`, `Mine` |
| track | TEXT | Dalilk track: `foundation`, `fluency`, `ielts`; empty for the owner's own |
| skill | TEXT | four skills + `grammar`, `vocabulary`, `techniques`, `general` |
| activity_codes | TEXT | `;`-separated, from CURRICULUM §3 |
| resource_type | TEXT | `placement_test`, `practice_test`, `plan`, `book`, `video_playlist`, `video_series`, `podcast`, `web_tool`, `file`, `other` |
| format | TEXT | `pdf`, `audio`, `video`, `web`, `text` |
| url | TEXT NULL | owner-added links must be `https://` |
| local_path | TEXT NULL | a plain file name inside `library\` (no folders) |
| needs_internet | BOOLEAN | |
| relevance | TEXT | our IELTS-relevance judgement from the catalogue |
| licence_note | TEXT | from the catalogue |
| description | TEXT | Arabic description from the catalogue (`description_ar`) |
| notes | TEXT | the owner's notes (kept across catalogue updates) |
| progress_position | TEXT NULL | e.g. "episode 12" (owner's) |
| status | TEXT | `active` \| `archived` (owner's) |
| completed_at, last_opened_at | DATETIME NULL | owner's |
| created_at, updated_at | DATETIME | |

`CHECK (url IS NOT NULL OR local_path IS NOT NULL)`. Index `(skill, status)`.

**Catalogue sync.** At every start (and after a restore or delete-all) the backend reads `content/catalog/*.csv` (bundled with the backend) and inserts new rows or refreshes the catalogue columns of existing ones. The owner's columns (notes, progress, status, completed/opened dates) are never touched. Only the owner's own resources can be deleted; catalogue items are archived. Deleting a resource keeps its sessions (`resource_id` becomes NULL).

`sequence_group`, `order_index`, `is_repeatable` arrive with the planner in Sprint 2.


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

### study_sessions (0003)
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| started_at | DATETIME | |
| ended_at | DATETIME NULL | |
| last_heartbeat_at | DATETIME | the app sends a heartbeat every 30 s |
| active_seconds | INTEGER | never exceeds wall-clock duration |
| skill | TEXT | resource skills (see `resources`) |
| activity_code | TEXT NULL | e.g. `L-EXT`, `PRAC`, `PLACEMENT` |
| resource_id | INTEGER FK NULL → resources | `ON DELETE SET NULL` |
| state | TEXT | `running`, `confirmed`, `unconfirmed`, `discarded` |
| origin | TEXT | `timer` (measured) \| `manual` (logged by hand, shown as such) |
| notes | TEXT | |

Index `(started_at)`.

Rules: a heartbeat adds at most 120 s and never more than the wall time since the previous heartbeat (+5 s); idle time (no input for 5 min and no sound from the panel) is not sent. Starting a session closes any running one as `unconfirmed`; sessions still `running` at start-up become `unconfirmed` and the owner confirms or discards them on Home. Stopping confirms; the owner can lower (never raise) the minutes afterwards. `track` and `plan_task_id` arrive with the planner in Sprint 2.

### plan_tasks (0004)
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| plan_date | DATE | local calendar day |
| order_in_day | INTEGER | unique with `plan_date` |
| day_type | TEXT | `study`, `mock`, `final_mock`, `review` |
| category | TEXT | `listening`, `reading`, `output`, `exam`, `support` |
| skill | TEXT | resource skills |
| activity_code | TEXT | CURRICULUM §3, plus `MOCK` |
| planned_minutes | INTEGER | > 0 |
| resource_id | INTEGER FK NULL → resources | `ON DELETE SET NULL`; NULL = writing pad / timer |
| title, instructions, reason | TEXT | generated in the interface language |
| status | TEXT | `pending`, `in_progress`, `done`, `skipped` |
| skip_reason | TEXT NULL | |
| inputs_hash | TEXT | planner inputs; pending days are regenerated when it changes |
| generator_version | TEXT | `planner-2` |
| started_at, completed_at | DATETIME NULL | |
| created_at | DATETIME | |

Index `(plan_date, status)`. Planner settings live in `app_settings`: `hours_per_band`, `study_weekdays` (JavaScript numbering, 0 = Sunday), `break_every_minutes`, `break_minutes`, `plan_start`, `interlude_seconds` (0.0.6, pause between tasks, 0 = off), and `plan_restarted_at` (0.0.6, set by "start the plan again"; not editable).

### podcast_episodes (0005)
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| feed | TEXT | `dalilk_ielts`, `dalilk_english` (CHECK, 0006); unique with `guid` |
| guid | TEXT | the feed's item id |
| number | INTEGER NULL | from "#N" in the title |
| title | TEXT | |
| published_at | DATETIME NULL | |
| duration_seconds | INTEGER NULL | |
| audio_url | TEXT | https only; streamed, never downloaded |
| page_url | TEXT NULL | SoundCloud page (fallback when audio fails) |
| transcript_id | TEXT NULL | Google Drive file id from the description; shown as `drive.google.com/file/d/<id>/preview` |
| summary | TEXT NULL | description without HTML, ≤ 2000 chars |
| position_seconds | INTEGER | ≥ 0, where the owner stopped |
| plays | INTEGER | times started |
| comprehension | INTEGER NULL | 1–5, owner's own rating |
| listened_at | DATETIME NULL | |
| created_at, updated_at | DATETIME | |

Index `(feed, number)`. Re-importing the feed updates titles and links by `guid` and never touches the owner's progress. `app_settings.podcast_refreshed_<feed>` holds the last import time; the app re-reads the feed when it is older than 12 h.

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
| 0003 | 1b | study time in half hours, 30–840 min (existing values rounded to the nearest half hour and clamped); `placement_quiz` level source; add `placement_results`, `resources`, `study_sessions` |
| 0004 | 2a | add `plan_tasks`; `study_sessions.plan_task_id` (FK, `ON DELETE SET NULL`) |
| 0005 | 2b-1 | add `podcast_episodes` |
| 0006 | 0.0.6 | `podcast_episodes.feed` also allows `dalilk_english` (table rebuilt, rows and ids kept; downgrade drops English rows) |


- One Alembic revision per schema change; `alembic_version` holds the schema version.
- The backend runs pending migrations at startup, immediately after an automatic `pre-migration` backup. A database whose revision this app does not know (made by a newer version) is never touched: the backend refuses to start, and the app offers to restore the newest backup this version can read (D-027).
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
