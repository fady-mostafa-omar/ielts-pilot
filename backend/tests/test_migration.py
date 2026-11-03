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


def test_downgrade_restores_newest_compatible_backup(tmp_path: Path) -> None:
    """Older app + database changed by a newer app: refuse, then (when asked) go back to
    the newest backup this version can read and keep the newer data as a backup."""
    import zipfile

    from fastapi.testclient import TestClient

    from tests.conftest import AUTH, VALID_PROFILE

    settings = settings_for(tmp_path)
    client = TestClient(create_app(settings), base_url="http://127.0.0.1:54321")
    client.headers.update(AUTH)
    client.put("/api/v1/profile", json={**VALID_PROFILE, "display_name": "before"})
    assert client.post("/api/v1/backups").status_code == 200
    client.put("/api/v1/profile", json={**VALID_PROFILE, "display_name": "after"})

    engine = make_engine(settings.db_path)
    with engine.begin() as conn:  # pretend a newer version migrated the database
        conn.execute(text("UPDATE alembic_version SET version_num = '9999'"))
    engine.dispose()

    with pytest.raises(StartupError, match=r"\[newer_db\]"):
        create_app(settings)

    from dataclasses import replace

    app = create_app(replace(settings, restore_compatible=True))
    client = TestClient(app, base_url="http://127.0.0.1:54321")
    client.headers.update(AUTH)
    assert client.get("/api/v1/profile").json()["display_name"] == "before"
    safety = list((tmp_path / "backups").glob("*-pre-restore.zip"))
    assert len(safety) == 1
    with zipfile.ZipFile(safety[0]) as zf:
        assert '"9999"' in zf.read("manifest.json").decode()


def test_downgrade_without_compatible_backup_explains(tmp_path: Path) -> None:
    from dataclasses import replace

    settings = settings_for(tmp_path)
    create_app(settings)
    engine = make_engine(settings.db_path)
    with engine.begin() as conn:
        conn.execute(text("UPDATE alembic_version SET version_num = '9999'"))
    engine.dispose()
    with pytest.raises(StartupError, match=r"\[no_compatible_backup\]"):
        create_app(replace(settings, restore_compatible=True))


def test_0006_keeps_episodes_and_downgrade_drops_english(tmp_path: Path) -> None:
    _make_db_at(tmp_path, "0005")
    settings = settings_for(tmp_path)
    engine = make_engine(settings.db_path)
    now = datetime.now(UTC).replace(tzinfo=None)
    insert = text(
        "INSERT INTO podcast_episodes (feed, guid, number, title, audio_url, summary, "
        "position_seconds, plays, created_at, updated_at) "
        "VALUES (:feed, :guid, 1, 'Daily IELTS Listening #1', 'https://a/1.mp3', '', 42, 1, "
        ":t, :t)"
    )
    with engine.begin() as conn:
        conn.execute(insert, {"feed": "dalilk_ielts", "guid": "g1", "t": now})
    engine.dispose()

    create_app(settings)  # upgrades to head

    engine = make_engine(settings.db_path)
    with engine.begin() as conn:
        assert conn.execute(text("SELECT position_seconds FROM podcast_episodes")).scalar() == 42
        conn.execute(insert, {"feed": "dalilk_english", "guid": "g1", "t": now})
        with pytest.raises(Exception, match="CHECK"):
            conn.execute(insert, {"feed": "other", "guid": "g2", "t": now})
    cfg = _config()
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        command.downgrade(cfg, "0005")
    with engine.connect() as conn:
        feeds = [r[0] for r in conn.execute(text("SELECT feed FROM podcast_episodes"))]
        indexes = {i["name"] for i in inspect(conn).get_indexes("podcast_episodes")}
    assert feeds == ["dalilk_ielts"]
    assert "ix_podcast_feed_number" in indexes
    engine.dispose()
