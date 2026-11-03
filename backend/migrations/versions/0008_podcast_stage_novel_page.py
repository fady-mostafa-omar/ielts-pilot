"""v0.0.10: where a podcast or a novel was left, so the next day carries on from there —
the podcast's stage (1–4) and the novel's last page link.

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-03
"""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("podcast_episodes") as batch:
        batch.add_column(sa.Column("stage", sa.Integer(), nullable=False, server_default="1"))
        batch.create_check_constraint("stage", "stage BETWEEN 1 AND 4")
    with op.batch_alter_table("content_items") as batch:
        batch.add_column(sa.Column("position_url", sa.String(1000), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("content_items") as batch:
        batch.drop_column("position_url")
    with op.batch_alter_table("podcast_episodes") as batch:
        batch.drop_constraint("stage", type_="check")
        batch.drop_column("stage")
