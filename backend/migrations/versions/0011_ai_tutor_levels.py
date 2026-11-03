"""v0.0.13: the AI tutor's marks count in the level (owner, 2026-11-03, D-043): a level
source `ai_tutor`, the marks per criterion on each writing/speaking attempt and the level
entry the attempt made.

SQLite cannot change a CHECK constraint in place, so `skill_levels` is rebuilt with the
wider source list; rows and ids are kept (downgrade drops the AI entries).

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-03
"""

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None

LEVEL_COLS = "id, skill, band, source_type, source_note, recorded_at"
BAND = "band >= 0 AND band <= 9 AND (band * 2) = CAST(band * 2 AS INTEGER)"


def _levels(name: str, sources: str) -> None:
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
        sa.CheckConstraint(BAND, name="band"),
        sa.CheckConstraint(f"source_type IN ({sources})", name="source_type"),
    )


def _rebuild(sources: str, where: str = "") -> None:
    _levels("skill_levels_new", sources)
    op.execute(
        f"INSERT INTO skill_levels_new ({LEVEL_COLS}) SELECT {LEVEL_COLS} FROM skill_levels "
        f"{where}"
    )
    op.drop_index("ix_skill_levels_skill_recorded", table_name="skill_levels")
    op.drop_table("skill_levels")
    op.rename_table("skill_levels_new", "skill_levels")
    op.create_index("ix_skill_levels_skill_recorded", "skill_levels", ["skill", "recorded_at"])


def upgrade() -> None:
    _rebuild("'official_practice', 'external_marker', 'placement_quiz', 'self_estimate', "
             "'ai_tutor'")
    for table in ("writing_attempts", "speaking_attempts"):
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column("scores_json", sa.Text(), nullable=False,
                                       server_default="{}"))
            batch.add_column(sa.Column("level_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    for table in ("writing_attempts", "speaking_attempts"):
        with op.batch_alter_table(table) as batch:
            batch.drop_column("level_id")
            batch.drop_column("scores_json")
    _rebuild("'official_practice', 'external_marker', 'placement_quiz', 'self_estimate'",
             "WHERE source_type != 'ai_tutor'")
