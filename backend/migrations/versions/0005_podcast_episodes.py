"""Sprint 2b-1: podcast episodes for the listening player (Dalilk IELTS podcast).

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-03
"""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "podcast_episodes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("feed", sa.String(30), nullable=False),
        sa.Column("guid", sa.String(300), nullable=False),
        sa.Column("number", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("audio_url", sa.String(1000), nullable=False),
        sa.Column("page_url", sa.String(1000), nullable=True),
        sa.Column("transcript_id", sa.String(100), nullable=True),
        sa.Column("summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("position_seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("plays", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("comprehension", sa.Integer(), nullable=True),
        sa.Column("listened_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("feed", "guid", name="uq_podcast_feed_guid"),
        sa.CheckConstraint("feed IN ('dalilk_ielts')", name="feed"),
        sa.CheckConstraint(
            "comprehension IS NULL OR comprehension BETWEEN 1 AND 5", name="comprehension"
        ),
        sa.CheckConstraint("position_seconds >= 0", name="position"),
    )
    op.create_index("ix_podcast_feed_number", "podcast_episodes", ["feed", "number"])


def downgrade() -> None:
    op.drop_index("ix_podcast_feed_number", table_name="podcast_episodes")
    op.drop_table("podcast_episodes")
