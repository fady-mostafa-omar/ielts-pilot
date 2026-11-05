"""v0.0.17: the AI tutor's model answer (owner, 2026-11-05, D-048): the model answer the owner
pastes back, the recording of him reading it (speaking), and the PDF file the attempt was
saved to.

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-05
"""

import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("writing_attempts", "speaking_attempts"):
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column("model_answer", sa.Text(), nullable=False,
                                       server_default=""))
            batch.add_column(sa.Column("pdf_file", sa.String(200), nullable=True))
    with op.batch_alter_table("speaking_attempts") as batch:
        batch.add_column(sa.Column("model_recording", sa.String(100), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("speaking_attempts") as batch:
        batch.drop_column("model_recording")
    for table in ("writing_attempts", "speaking_attempts"):
        with op.batch_alter_table(table) as batch:
            batch.drop_column("pdf_file")
            batch.drop_column("model_answer")
