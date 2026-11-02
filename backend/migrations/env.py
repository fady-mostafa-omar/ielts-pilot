"""Alembic environment.

Migrations always run on a connection supplied by app.migrate.upgrade_to_head(),
so this file only implements the 'online' path.
"""

from alembic import context

from app import models  # noqa: F401  (registers tables on Base.metadata)
from app.db import Base

config = context.config
target_metadata = Base.metadata


def run_migrations_online() -> None:
    connection = config.attributes.get("connection")
    if connection is None:
        raise RuntimeError("Run migrations through app.migrate.upgrade_to_head()")
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=True,  # SQLite needs batch mode for ALTER TABLE
    )
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    raise RuntimeError("Offline migrations are not supported")
run_migrations_online()
