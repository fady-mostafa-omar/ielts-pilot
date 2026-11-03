"""v0.0.12: writing and speaking labs (attempts) and the mistakes notebook as cards.

SQLite cannot change a CHECK constraint in place, so `cards` is rebuilt with the wider kind
list and the two new columns; rows, ids and progress are kept.

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-03
"""

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None

CARD_COLUMNS = (
    "id, kind, key, section, situation, sort, front, meaning, example, example_ar, reps, "
    "lapses, ease, interval_days, due, learned_on, reviewed_at, shown_at, created_at, updated_at"
)


def _cards(name: str, kinds: str, extra: bool) -> None:
    columns = [
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("key", sa.String(100), nullable=False),
        sa.Column("section", sa.String(20), nullable=False, server_default=""),
        sa.Column("situation", sa.String(200), nullable=False, server_default=""),
        sa.Column("sort", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("front", sa.String(300), nullable=False),
        sa.Column("meaning", sa.String(500), nullable=False, server_default=""),
        sa.Column("example", sa.String(500), nullable=False, server_default=""),
        sa.Column("example_ar", sa.String(500), nullable=False, server_default=""),
        sa.Column("reps", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("lapses", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ease", sa.Float(), nullable=False, server_default="2.5"),
        sa.Column("interval_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("due", sa.Date(), nullable=True),
        sa.Column("learned_on", sa.Date(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("shown_at", sa.DateTime(), nullable=True),
    ]
    if extra:
        columns += [
            sa.Column("code", sa.String(20), nullable=False, server_default=""),
            sa.Column("source", sa.String(100), nullable=False, server_default=""),
        ]
    columns += [
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    ]
    op.create_table(
        name,
        *columns,
        sa.UniqueConstraint("kind", "key", name="uq_card_kind_key"),
        sa.CheckConstraint(f"kind IN ({kinds})", name="kind"),
        sa.CheckConstraint("ease >= 1.3", name="ease"),
    )


def _rebuild(kinds: str, extra: bool, where: str = "") -> None:
    op.drop_index("ix_card_kind_due", table_name="cards")
    _cards("cards_new", kinds, extra)
    op.execute(
        f"INSERT INTO cards_new ({CARD_COLUMNS}) SELECT {CARD_COLUMNS} FROM cards {where}"
    )
    op.drop_table("cards")
    op.rename_table("cards_new", "cards")
    op.create_index("ix_card_kind_due", "cards", ["kind", "due"])


def upgrade() -> None:
    _rebuild("'word', 'phrase', 'mine', 'mistake'", extra=True)
    op.create_table(
        "writing_attempts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("task", sa.Integer(), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False, server_default=""),
        sa.Column("text", sa.Text(), nullable=False, server_default=""),
        sa.Column("words", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("seconds_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(10), nullable=False, server_default="draft"),
        sa.Column("checklist_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("tutor_reply", sa.Text(), nullable=False, server_default=""),
        sa.Column("tutor_overall", sa.Float(), nullable=True),
        sa.Column("plan_task_id", sa.Integer(),
                  sa.ForeignKey("plan_tasks.id", ondelete="SET NULL"), nullable=True),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("task IN (0, 1, 2)", name="task"),
        sa.CheckConstraint("status IN ('draft', 'submitted')", name="status"),
    )
    op.create_index("ix_writing_created", "writing_attempts", ["created_at"])
    op.create_table(
        "speaking_attempts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("part", sa.Integer(), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False, server_default=""),
        sa.Column("recording", sa.String(100), nullable=True),
        sa.Column("seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("transcript", sa.Text(), nullable=False, server_default=""),
        sa.Column("self_rating_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("tutor_reply", sa.Text(), nullable=False, server_default=""),
        sa.Column("tutor_overall", sa.Float(), nullable=True),
        sa.Column("plan_task_id", sa.Integer(),
                  sa.ForeignKey("plan_tasks.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("part IN (0, 1, 2, 3)", name="part"),
    )
    op.create_index("ix_speaking_created", "speaking_attempts", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_speaking_created", table_name="speaking_attempts")
    op.drop_table("speaking_attempts")
    op.drop_index("ix_writing_created", table_name="writing_attempts")
    op.drop_table("writing_attempts")
    _rebuild("'word', 'phrase', 'mine'", extra=False, where="WHERE kind != 'mistake'")
