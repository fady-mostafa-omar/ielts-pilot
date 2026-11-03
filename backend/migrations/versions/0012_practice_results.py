"""v0.0.14: tests by name (owner, 2026-11-03, D-044): practice results, the question details
of a test, the named question of a lab answer, and a level source `practice_site` for the
bands of practice websites that are not official material (ieltsonlinetests, Dalilk).

`skill_levels` is rebuilt for the wider source list (SQLite cannot change a CHECK in place);
rows and ids are kept (downgrade drops the practice-site entries).

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-03
"""

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

LEVEL_COLS = "id, skill, band, source_type, source_note, recorded_at"
BAND = "band >= 0 AND band <= 9 AND (band * 2) = CAST(band * 2 AS INTEGER)"
OLD = "'official_practice', 'external_marker', 'placement_quiz', 'self_estimate', 'ai_tutor'"


def _rebuild(sources: str, where: str = "") -> None:
    op.create_table(
        "skill_levels_new",
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
    op.execute(
        f"INSERT INTO skill_levels_new ({LEVEL_COLS}) SELECT {LEVEL_COLS} FROM skill_levels "
        f"{where}"
    )
    op.drop_index("ix_skill_levels_skill_recorded", table_name="skill_levels")
    op.drop_table("skill_levels")
    op.rename_table("skill_levels_new", "skill_levels")
    op.create_index("ix_skill_levels_skill_recorded", "skill_levels", ["skill", "recorded_at"])


def upgrade() -> None:
    _rebuild(f"{OLD}, 'practice_site'")
    with op.batch_alter_table("content_items") as batch:
        batch.add_column(sa.Column("meta_json", sa.Text(), nullable=True))
    for table in ("writing_attempts", "speaking_attempts"):
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column("test_key", sa.String(200), nullable=True))
    op.create_table(
        "practice_results",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("content_id", sa.Integer(),
                  sa.ForeignKey("content_items.id", ondelete="SET NULL"), nullable=True),
        sa.Column("test_key", sa.String(200), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("provider", sa.String(30), nullable=False),
        sa.Column("skill", sa.String(10), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("part", sa.Integer(), nullable=True),
        sa.Column("qtype", sa.String(30), nullable=False, server_default=""),
        sa.Column("correct", sa.Integer(), nullable=True),
        sa.Column("total", sa.Integer(), nullable=True),
        sa.Column("band", sa.Float(), nullable=True),
        sa.Column("bands_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("wrong_types_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("level_ids_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("plan_task_id", sa.Integer(),
                  sa.ForeignKey("plan_tasks.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "skill IN ('listening', 'reading', 'writing', 'speaking', 'full')", name="skill"
        ),
        sa.CheckConstraint("kind IN ('sample', 'full')", name="kind"),
        sa.CheckConstraint(
            "(correct IS NULL AND total IS NULL) OR "
            "(total > 0 AND correct >= 0 AND correct <= total)",
            name="marks",
        ),
        sa.CheckConstraint(
            "band IS NULL OR (band >= 0 AND band <= 9 AND (band * 2) = CAST(band * 2 AS INTEGER))",
            name="band",
        ),
    )
    op.create_index("ix_practice_results_created", "practice_results", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_practice_results_created", table_name="practice_results")
    op.drop_table("practice_results")
    for table in ("writing_attempts", "speaking_attempts"):
        with op.batch_alter_table(table) as batch:
            batch.drop_column("test_key")
    with op.batch_alter_table("content_items") as batch:
        batch.drop_column("meta_json")
    _rebuild(OLD, "WHERE source_type != 'practice_site'")
