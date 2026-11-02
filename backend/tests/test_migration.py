"""Upgrade path that the owner's laptop will take: spike database (0001) -> current head."""

from datetime import UTC, datetime
from pathlib import Path

import pytest
from alembic import command
from sqlalchemy import inspect, text

from app.db import make_engine
from app.main import StartupError, create_app
from app.migrate import _config, head_revision
from tests.conftest import settings_for


def _make_spike_db(data_dir: Path) -> None:
    settings = settings_for(data_dir)
    engine = make_engine(settings.db_path)
    cfg = _config()
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        command.upgrade(cfg, "0001")
    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO spike_kv (key, value, updated_at) VALUES ('spike', 'فادي', :t)"),
            {"t": datetime.now(UTC)},
        )
    engine.dispose()


def test_upgrade_from_spike_makes_backup_then_migrates(tmp_path: Path) -> None:
    _make_spike_db(tmp_path)
    settings = settings_for(tmp_path)
    create_app(settings)

    backups = list((tmp_path / "backups").glob("*-pre-migration.zip"))
    assert len(backups) == 1

    engine = make_engine(settings.db_path)
    tables = set(inspect(engine).get_table_names())
    assert {"learner_profile", "skill_levels", "app_settings"} <= tables
    assert "spike_kv" not in tables
    with engine.connect() as conn:
        version = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
    assert version == head_revision()


def test_fresh_install_makes_no_backup(tmp_path: Path) -> None:
    create_app(settings_for(tmp_path))
    assert not list(tmp_path.glob("backups/*.zip"))


def test_second_start_makes_no_backup(tmp_path: Path) -> None:
    _make_spike_db(tmp_path)
    create_app(settings_for(tmp_path))
    create_app(settings_for(tmp_path))
    assert len(list((tmp_path / "backups").glob("*-pre-migration.zip"))) == 1


def test_database_from_newer_app_refuses_to_start(tmp_path: Path) -> None:
    settings = settings_for(tmp_path)
    create_app(settings)
    engine = make_engine(settings.db_path)
    with engine.begin() as conn:
        conn.execute(text("UPDATE alembic_version SET version_num = '9999'"))
    engine.dispose()
    with pytest.raises(StartupError, match="newer version"):
        create_app(settings)
