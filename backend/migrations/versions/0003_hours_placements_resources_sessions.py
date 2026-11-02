"""Sprint 1b: study time in half hours up to 14 h, Dalilk placement results,
resources catalogue, study sessions.

SQLite cannot alter CHECK constraints, so learner_profile and skill_levels are
rebuilt (create new -> copy -> drop old -> rename).

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-03
"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

SKILL_CHECK = (
    "skill IN ('listening', 'reading', 'writing', 'speaking', 'grammar', "
    "'vocabulary', 'techniques', 'general')"
)


def _band(column: str) -> str:
    return f"{column} >= 0 AND {column} <= 9 AND ({column} * 2) = CAST({column} * 2 AS INTEGER)"


def _profile_table(name: str, minutes_check: str) -> None:
    op.create_table(
        name,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("display_name", sa.String(60), nullable=True),
        sa.Column("interface_language", sa.String(2), nullable=False),
        sa.Column("explanation_language", sa.String(10), nullable=False),
        sa.Column("target_overall", sa.Float(), nullable=False),
        sa.Column("target_listening", sa.Float(), nullable=False),
        sa.Column("target_reading", sa.Float(), nullable=False),
        sa.Column("target_writing", sa.Float(), nullable=False),
        sa.Column("target_speaking", sa.Float(), nullable=False),
        sa.Column("minimum_per_skill", sa.Float(), nullable=False),
        sa.Column("exam_date", sa.Date(), nullable=True),
        sa.Column("study_days_per_week", sa.Integer(), nullable=False),
        sa.Column("study_minutes_per_day", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("id = 1", name="single_row"),
        sa.CheckConstraint("interface_language IN ('ar', 'en')", name="interface_language"),
        sa.CheckConstraint(
            "explanation_language IN ('ar_heavy', 'balanced', 'en_heavy')",
            name="explanation_language",
        ),
        sa.CheckConstraint(_band("target_overall"), name="target_overall_band"),
        sa.CheckConstraint(_band("target_listening"), name="target_listening_band"),
        sa.CheckConstraint(_band("target_reading"), name="target_reading_band"),
        sa.CheckConstraint(_band("target_writing"), name="target_writing_band"),
        sa.CheckConstraint(_band("target_speaking"), name="target_speaking_band"),
        sa.CheckConstraint(_band("minimum_per_skill"), name="minimum_per_skill_band"),
        sa.CheckConstraint("study_days_per_week BETWEEN 1 AND 7", name="study_days"),
        sa.CheckConstraint(minutes_check, name="study_minutes"),
    )


def _levels_table(name: str, sources: str) -> None:
    op.create_table(
        name,
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("skill", sa.String(10), nullable=False),
        sa.Column("band", sa.Float(), nullable=False),
        sa.Column("source_type", sa.String(20), nullable=False),
        sa.Column("source_note", sa.String(200), nullable=False, server_default=""),
        sa.Column("recorded_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "skill IN ('listening', 'reading', 'writing', 'speaking')", name="skill"
        ),
        sa.CheckConstraint(_band("band"), name="band"),
        sa.CheckConstraint(f"source_type IN ({sources})", name="source_type"),
    )


PROFILE_COLS = (
    "id, display_name, interface_language, explanation_language, target_overall, "
    "target_listening, target_reading, target_writing, target_speaking, minimum_per_skill, "
    "exam_date, study_days_per_week, study_minutes_per_day, created_at, updated_at"
)
LEVEL_COLS = "id, skill, band, source_type, source_note, recorded_at"


def upgrade() -> None:
    # learner_profile: minutes -> whole half hours, 30..840 (0.5 h .. 14 h)
    _profile_table(
        "learner_profile_new",
        "study_minutes_per_day BETWEEN 30 AND 840 AND study_minutes_per_day % 30 = 0",
    )
    op.execute(
        f"INSERT INTO learner_profile_new ({PROFILE_COLS}) "
        "SELECT id, display_name, interface_language, explanation_language, target_overall, "
        "target_listening, target_reading, target_writing, target_speaking, minimum_per_skill, "
        "exam_date, study_days_per_week, "
        "MAX(30, MIN(840, CAST(ROUND(study_minutes_per_day / 30.0) AS INTEGER) * 30)), "
        "created_at, updated_at FROM learner_profile"
    )
    op.drop_table("learner_profile")
    op.rename_table("learner_profile_new", "learner_profile")

    # skill_levels: allow 'placement_quiz'
    _levels_table(
        "skill_levels_new",
        "'official_practice', 'external_marker', 'placement_quiz', 'self_estimate'",
    )
    op.execute(
        f"INSERT INTO skill_levels_new ({LEVEL_COLS}) SELECT {LEVEL_COLS} FROM skill_levels"
    )
    op.drop_index("ix_skill_levels_skill_recorded", table_name="skill_levels")
    op.drop_table("skill_levels")
    op.rename_table("skill_levels_new", "skill_levels")
    op.create_index("ix_skill_levels_skill_recorded", "skill_levels", ["skill", "recorded_at"])

    op.create_table(
        "placement_results",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("test", sa.String(20), nullable=False),
        sa.Column("level_label", sa.String(40), nullable=False),
        sa.Column("approx_band", sa.Float(), nullable=True),
        sa.Column("taken_on", sa.Date(), nullable=False),
        sa.Column("notes", sa.String(300), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("test IN ('dalilk_13english', 'dalilk_3min')", name="test"),
        sa.CheckConstraint(
            f"approx_band IS NULL OR ({_band('approx_band')})", name="approx_band"
        ),
    )

    op.create_table(
        "resources",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("catalog_id", sa.String(20), nullable=True, unique=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("provider", sa.String(40), nullable=False),
        sa.Column("track", sa.String(12), nullable=False, server_default=""),
        sa.Column("skill", sa.String(12), nullable=False),
        sa.Column("activity_codes", sa.String(100), nullable=False, server_default=""),
        sa.Column("resource_type", sa.String(20), nullable=False),
        sa.Column("format", sa.String(10), nullable=False),
        sa.Column("url", sa.String(500), nullable=True),
        sa.Column("local_path", sa.String(300), nullable=True),
        sa.Column("needs_internet", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("relevance", sa.String(10), nullable=False, server_default=""),
        sa.Column("licence_note", sa.String(300), nullable=False, server_default=""),
        sa.Column("description", sa.String(500), nullable=False, server_default=""),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("progress_position", sa.String(100), nullable=True),
        sa.Column("status", sa.String(10), nullable=False, server_default="active"),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("last_opened_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(SKILL_CHECK, name="skill"),
        sa.CheckConstraint("status IN ('active', 'archived')", name="status"),
        sa.CheckConstraint("url IS NOT NULL OR local_path IS NOT NULL", name="has_location"),
    )
    op.create_index("ix_resources_skill_status", "resources", ["skill", "status"])

    op.create_table(
        "study_sessions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.Column("last_heartbeat_at", sa.DateTime(), nullable=False),
        sa.Column("active_seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("skill", sa.String(12), nullable=False),
        sa.Column("activity_code", sa.String(20), nullable=True),
        sa.Column(
            "resource_id",
            sa.Integer(),
            sa.ForeignKey("resources.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("state", sa.String(12), nullable=False, server_default="running"),
        sa.Column("origin", sa.String(8), nullable=False, server_default="timer"),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.CheckConstraint(SKILL_CHECK, name="skill"),
        sa.CheckConstraint(
            "state IN ('running', 'confirmed', 'unconfirmed', 'discarded')", name="state"
        ),
        sa.CheckConstraint("active_seconds >= 0", name="active_seconds"),
        sa.CheckConstraint("origin IN ('timer', 'manual')", name="origin"),
    )
    op.create_index("ix_study_sessions_started", "study_sessions", ["started_at"])


def downgrade() -> None:
    op.drop_index("ix_study_sessions_started", table_name="study_sessions")
    op.drop_table("study_sessions")
    op.drop_index("ix_resources_skill_status", table_name="resources")
    op.drop_table("resources")
    op.drop_table("placement_results")

    _levels_table("skill_levels_old", "'official_practice', 'external_marker', 'self_estimate'")
    op.execute(
        f"INSERT INTO skill_levels_old ({LEVEL_COLS}) SELECT {LEVEL_COLS} FROM skill_levels "
        "WHERE source_type != 'placement_quiz'"
    )
    op.drop_index("ix_skill_levels_skill_recorded", table_name="skill_levels")
    op.drop_table("skill_levels")
    op.rename_table("skill_levels_old", "skill_levels")
    op.create_index("ix_skill_levels_skill_recorded", "skill_levels", ["skill", "recorded_at"])

    _profile_table("learner_profile_old", "study_minutes_per_day BETWEEN 10 AND 600")
    op.execute(
        f"INSERT INTO learner_profile_old ({PROFILE_COLS}) "
        "SELECT id, display_name, interface_language, explanation_language, target_overall, "
        "target_listening, target_reading, target_writing, target_speaking, minimum_per_skill, "
        "exam_date, study_days_per_week, MIN(600, study_minutes_per_day), created_at, updated_at "
        "FROM learner_profile"
    )
    op.drop_table("learner_profile")
    op.rename_table("learner_profile_old", "learner_profile")
