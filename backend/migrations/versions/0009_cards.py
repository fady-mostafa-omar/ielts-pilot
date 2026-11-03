"""v0.0.11: flashcards — Dalilk's 350 words and 150 phrases (read on the owner's computer,
D-041) and the owner's own words, with SM-2 spaced review.

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-03
"""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cards",
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
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("kind", "key", name="uq_card_kind_key"),
        sa.CheckConstraint("kind IN ('word', 'phrase', 'mine')", name="kind"),
        sa.CheckConstraint("ease >= 1.3", name="ease"),
    )
    op.create_index("ix_card_kind_due", "cards", ["kind", "due"])


def downgrade() -> None:
    op.drop_index("ix_card_kind_due", table_name="cards")
    op.drop_table("cards")
