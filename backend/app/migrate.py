"""Run Alembic migrations programmatically, both from source and from a PyInstaller build."""

import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import Engine


def migrations_dir() -> Path:
    # In a PyInstaller build, data files live under sys._MEIPASS.
    bundle_root = getattr(sys, "_MEIPASS", None)
    base = Path(bundle_root) if bundle_root else Path(__file__).resolve().parent.parent
    return base / "migrations"


def upgrade_to_head(engine: Engine) -> str | None:
    """Apply all pending migrations and return the resulting revision id."""
    cfg = Config()
    cfg.set_main_option("script_location", str(migrations_dir()))
    with engine.begin() as connection:
        cfg.attributes["connection"] = connection
        command.upgrade(cfg, "head")
    with engine.connect() as connection:
        return MigrationContext.configure(connection).get_current_revision()
