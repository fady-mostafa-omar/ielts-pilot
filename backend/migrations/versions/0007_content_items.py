"""v0.0.8: content catalogue with progress (videos, novels, practice tests) and the
content a plan task points to (planner-4).

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-03
"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "content_items",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("key", sa.String(200), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("grp", sa.String(20), nullable=False, server_default=""),
        sa.Column("skill", sa.String(12), nullable=False, server_default=""),
        sa.Column("level", sa.String(12), nullable=False, server_default=""),
        sa.Column("provider", sa.String(30), nullable=False, server_default=""),
        sa.Column("sort", sa.Integer(), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("url", sa.String(1000), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("kind", "key", name="uq_content_kind_key"),
        sa.CheckConstraint("kind IN ('video', 'novel', 'test')", name="kind"),
    )
    op.create_index("ix_content_kind_sort", "content_items", ["kind", "sort"])
    with op.batch_alter_table("plan_tasks") as batch:
        batch.add_column(sa.Column("content_json", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("plan_tasks") as batch:
        batch.drop_column("content_json")
    op.drop_index("ix_content_kind_sort", table_name="content_items")
    op.drop_table("content_items")
