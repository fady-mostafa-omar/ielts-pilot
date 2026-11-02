"""Sprint 2a: daily plan tasks; sessions linked to the task they belong to.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-03
"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

CATEGORY_CHECK = "category IN ('listening', 'reading', 'output', 'exam', 'support')"


def upgrade() -> None:
    op.create_table(
        "plan_tasks",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("plan_date", sa.Date(), nullable=False),
        sa.Column("order_in_day", sa.Integer(), nullable=False),
        sa.Column("day_type", sa.String(12), nullable=False),
        sa.Column("category", sa.String(10), nullable=False),
        sa.Column("skill", sa.String(12), nullable=False),
        sa.Column("activity_code", sa.String(20), nullable=False),
        sa.Column("planned_minutes", sa.Integer(), nullable=False),
        sa.Column(
            "resource_id",
            sa.Integer(),
            sa.ForeignKey("resources.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=False, server_default=""),
        sa.Column("reason", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(12), nullable=False, server_default="pending"),
        sa.Column("skip_reason", sa.String(300), nullable=True),
        sa.Column("inputs_hash", sa.String(64), nullable=False),
        sa.Column("generator_version", sa.String(20), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(CATEGORY_CHECK, name="category"),
        sa.CheckConstraint(
            "status IN ('pending', 'in_progress', 'done', 'skipped')", name="status"
        ),
        sa.CheckConstraint(
            "day_type IN ('study', 'mock', 'review', 'final_mock')", name="day_type"
        ),
        sa.CheckConstraint("planned_minutes > 0", name="planned_minutes"),
        sa.UniqueConstraint("plan_date", "order_in_day", name="uq_plan_tasks_day_order"),
    )
    op.create_index("ix_plan_tasks_date_status", "plan_tasks", ["plan_date", "status"])
    with op.batch_alter_table("study_sessions") as batch:
        batch.add_column(sa.Column("plan_task_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_study_sessions_plan_task", "plan_tasks", ["plan_task_id"], ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("study_sessions") as batch:
        batch.drop_constraint("fk_study_sessions_plan_task", type_="foreignkey")
        batch.drop_column("plan_task_id")
    op.drop_index("ix_plan_tasks_date_status", table_name="plan_tasks")
    op.drop_table("plan_tasks")
