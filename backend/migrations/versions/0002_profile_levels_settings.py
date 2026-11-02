"""Sprint 1a: learner profile, skill levels, app settings; drop the spike table.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-02
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def _band(column: str) -> str:
    return f"{column} >= 0 AND {column} <= 9 AND ({column} * 2) = CAST({column} * 2 AS INTEGER)"


def upgrade() -> None:
    op.drop_table("spike_kv")

    op.create_table(
        "learner_profile",
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
        sa.CheckConstraint("study_minutes_per_day BETWEEN 10 AND 600", name="study_minutes"),
    )

    op.create_table(
        "skill_levels",
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
        sa.CheckConstraint(
            "source_type IN ('official_practice', 'external_marker', 'self_estimate')",
            name="source_type",
        ),
    )
    op.create_index("ix_skill_levels_skill_recorded", "skill_levels", ["skill", "recorded_at"])

    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(100), primary_key=True),
        sa.Column("value_json", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("app_settings")
    op.drop_index("ix_skill_levels_skill_recorded", table_name="skill_levels")
    op.drop_table("skill_levels")
    op.drop_table("learner_profile")
    op.create_table(
        "spike_kv",
        sa.Column("key", sa.String(length=64), primary_key=True),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
