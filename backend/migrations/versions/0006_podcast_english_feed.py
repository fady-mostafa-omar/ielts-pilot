"""Sprint 2b-1 follow-up (v0.0.6): Dalilk's Daily English Listening in the player.

SQLite cannot change a CHECK constraint in place, so the table is rebuilt with the
wider feed list; rows and ids are kept.

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-03
"""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

COLUMNS = (
    "id, feed, guid, number, title, published_at, duration_seconds, audio_url, page_url, "
    "transcript_id, summary, position_seconds, plays, comprehension, listened_at, "
    "created_at, updated_at"
)


def _create(name: str, feeds: str) -> None:
    op.create_table(
        name,
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
        sa.CheckConstraint(f"feed IN ({feeds})", name="feed"),
        sa.CheckConstraint(
            "comprehension IS NULL OR comprehension BETWEEN 1 AND 5", name="comprehension"
        ),
        sa.CheckConstraint("position_seconds >= 0", name="position"),
    )


def _rebuild(feeds: str, where: str = "") -> None:
    _create("podcast_episodes_new", feeds)
    op.execute(
        f"INSERT INTO podcast_episodes_new ({COLUMNS}) "
        f"SELECT {COLUMNS} FROM podcast_episodes {where}"
    )
    op.drop_index("ix_podcast_feed_number", table_name="podcast_episodes")
    op.drop_table("podcast_episodes")
    op.rename_table("podcast_episodes_new", "podcast_episodes")
    op.create_index("ix_podcast_feed_number", "podcast_episodes", ["feed", "number"])


def upgrade() -> None:
    _rebuild("'dalilk_ielts', 'dalilk_english'")


def downgrade() -> None:
    _rebuild("'dalilk_ielts'", "WHERE feed = 'dalilk_ielts'")
