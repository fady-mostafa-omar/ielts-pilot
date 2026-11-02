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


def _make_db_at(data_dir: Path, revision: str) -> None:
    engine = make_engine(settings_for(data_dir).db_path)
    cfg = _config()
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        command.upgrade(cfg, revision)
    engine.dispose()


@pytest.mark.parametrize(("old", "new"), [(10, 30), (45, 60), (60, 60), (75, 90), (600, 600)])
def test_0003_rounds_study_minutes_to_half_hours(tmp_path: Path, old: int, new: int) -> None:
    _make_db_at(tmp_path, "0002")
    settings = settings_for(tmp_path)
    engine = make_engine(settings.db_path)
    now = datetime.now(UTC).replace(tzinfo=None)
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO learner_profile VALUES (1, 'Amr', 'ar', 'balanced', 7.5, 7.5, 7.5, "
                "7.5, 7.5, 6.5, NULL, 6, :m, :t, :t)"
            ),
            {"m": old, "t": now},
        )
        conn.execute(
            text(
                "INSERT INTO skill_levels (skill, band, source_type, source_note, recorded_at) "
                "VALUES ('reading', 6.0, 'self_estimate', '', :t)"
            ),
            {"t": now},
        )
    engine.dispose()

    create_app(settings)

    engine = make_engine(settings.db_path)
    with engine.connect() as conn:
        minutes = conn.execute(text("SELECT study_minutes_per_day FROM learner_profile"))
        assert minutes.scalar() == new
        assert conn.execute(text("SELECT band FROM skill_levels")).scalar() == 6.0
        indexes = {i["name"] for i in inspect(conn).get_indexes("skill_levels")}
    assert "ix_skill_levels_skill_recorded" in indexes
    assert len(list((tmp_path / "backups").glob("*-pre-migration.zip"))) == 1


def test_0003_downgrade_round_trip(tmp_path: Path) -> None:
    create_app(settings_for(tmp_path))
    engine = make_engine(settings_for(tmp_path).db_path)
    cfg = _config()
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        command.downgrade(cfg, "0002")
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        command.upgrade(cfg, "head")
    assert {"resources", "study_sessions", "placement_results"} <= set(
        inspect(engine).get_table_names()
    )
