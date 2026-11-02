"""Run Alembic migrations programmatically, both from source and from a PyInstaller build."""

import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from alembic.util.exc import CommandError
from sqlalchemy import Engine


def migrations_dir() -> Path:
    # In a PyInstaller build, data files live under sys._MEIPASS.
    bundle_root = getattr(sys, "_MEIPASS", None)
    base = Path(bundle_root) if bundle_root else Path(__file__).resolve().parent.parent
    return base / "migrations"


def _config() -> Config:
    cfg = Config()
    cfg.set_main_option("script_location", str(migrations_dir()))
    return cfg


def head_revision() -> str | None:
    return ScriptDirectory.from_config(_config()).get_current_head()


def is_known_revision(revision: str | None) -> bool:
    if revision is None:
        return True
    try:
        return ScriptDirectory.from_config(_config()).get_revision(revision) is not None
    except CommandError:
        return False


def current_revision(engine: Engine) -> str | None:
    with engine.connect() as connection:
        return MigrationContext.configure(connection).get_current_revision()


def upgrade_to_head(engine: Engine) -> str | None:
    """Apply all pending migrations and return the resulting revision id."""
    cfg = _config()
    with engine.begin() as connection:
        cfg.attributes["connection"] = connection
        command.upgrade(cfg, "head")
    return current_revision(engine)
