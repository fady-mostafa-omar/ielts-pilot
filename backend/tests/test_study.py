"""Placements, settings, resource library, study sessions (Sprint 1b)."""

import csv
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update

from app import catalog
from app.db import make_engine, utcnow
from app.models import StudySession
from tests.conftest import settings_for

CATALOG = Path(__file__).resolve().parents[2] / "content" / "catalog"


def _catalog_ids() -> set[str]:
    ids: set[str] = set()
    for path in CATALOG.glob("*.csv"):
        with path.open(encoding="utf-8", newline="") as fh:
            ids |= {row["catalog_id"] for row in csv.DictReader(fh)}
    return ids


# --- placements & settings ----------------------------------------------------------


def test_placement_applied_to_skills(client: TestClient) -> None:
    res = client.post(
        "/api/v1/placements",
        json={
            "test": "dalilk_13english",
            "level_label": "Intermediate",
            "approx_band": 5.5,
            "taken_on": date.today().isoformat(),
            "apply_to_skills": ["listening", "reading"],
        },
    )
    assert res.status_code == 201, res.text
    levels = client.get("/api/v1/skill-levels").json()
    assert levels["current"]["reading"]["band"] == 5.5
    assert levels["current"]["reading"]["source_type"] == "placement_quiz"
    assert "13English" in levels["current"]["reading"]["source_note"]
    assert levels["current"]["writing"] is None
    assert client.get("/api/v1/placements").json()[0]["level_label"] == "Intermediate"


def test_placement_without_band_records_label_only(client: TestClient) -> None:
    res = client.post(
        "/api/v1/placements",
        json={"test": "dalilk_3min", "level_label": "B1", "taken_on": date.today().isoformat()},
    )
    assert res.status_code == 201
    assert client.get("/api/v1/skill-levels").json()["history"] == []


@pytest.mark.parametrize(
    "change",
    [
        {"test": "other"},
        {"level_label": "  "},
        {"approx_band": 5.3},
        {"taken_on": (date.today() + timedelta(days=1)).isoformat()},
        {"approx_band": None, "apply_to_skills": ["reading"]},
        {"apply_to_skills": ["reading", "reading"]},
        {"apply_to_skills": ["grammar"]},
    ],
)
def test_invalid_placements_rejected(client: TestClient, change: dict) -> None:
    body = {
        "test": "dalilk_13english",
        "level_label": "B1",
        "approx_band": 5.0,
        "taken_on": date.today().isoformat(),
        **change,
    }
    assert client.post("/api/v1/placements", json=body).status_code == 422, change


def test_settings_round_trip(new_client: Callable[[], TestClient]) -> None:
    assert new_client().get("/api/v1/settings").json() == {"web_keep_signin": None}
    assert new_client().put("/api/v1/settings", json={"web_keep_signin": True}).status_code == 200
    assert new_client().get("/api/v1/settings").json()["web_keep_signin"] is True
    assert new_client().put("/api/v1/settings", json={"nope": 1}).status_code == 422


# --- catalogue & resources ------------------------------------------------------------


def test_catalogue_loaded_on_start(client: TestClient) -> None:
    rows = client.get("/api/v1/resources").json()
    assert {r["catalog_id"] for r in rows} == _catalog_ids()
    dalilk = next(r for r in rows if r["catalog_id"] == "DLK-22")
    assert dalilk["provider"] == "Dalilk"
    assert dalilk["url"].startswith("https://dalilk.com/")


def test_catalogue_sync_keeps_owner_fields(tmp_path: Path, new_client) -> None:
    client = new_client()
    first = next(r for r in client.get("/api/v1/resources").json() if r["catalog_id"])
    client.patch(
        f"/api/v1/resources/{first['id']}", json={"notes": "my notes", "progress_position": "ep 4"}
    )

    edited = tmp_path / "catalog"
    edited.mkdir()
    for path in CATALOG.glob("*.csv"):
        text = path.read_text(encoding="utf-8")
        edited.joinpath(path.name).write_text(
            text.replace(first["title"], first["title"] + " (v2)"), encoding="utf-8"
        )
    engine = make_engine(settings_for(tmp_path).db_path)
    from sqlalchemy.orm import Session

    with Session(engine) as session, session.begin():
        assert catalog.sync(session, edited) >= 1
    with Session(engine) as session, session.begin():
        assert catalog.sync(session, edited) == 0  # idempotent

    again = next(r for r in new_client().get("/api/v1/resources").json() if r["id"] == first["id"])
    # the start-up sync used the shipped CSVs again, but notes and progress survive both syncs
    assert again["notes"] == "my notes"
    assert again["progress_position"] == "ep 4"


def test_owner_link_resource_lifecycle(client: TestClient) -> None:
    res = client.post(
        "/api/v1/resources",
        json={"title": "BBC 6 Minute English", "skill": "listening", "url": "https://bbc.co.uk/x"},
    )
    assert res.status_code == 201, res.text
    rid = res.json()["id"]
    assert res.json()["provider"] == "Mine"

    opened = client.post(f"/api/v1/resources/{rid}/opened").json()
    assert opened["last_opened_at"] is not None
    done = client.patch(f"/api/v1/resources/{rid}", json={"completed": True}).json()
    assert done["completed_at"] is not None

    client.patch(f"/api/v1/resources/{rid}", json={"status": "archived"})
    assert rid not in {r["id"] for r in client.get("/api/v1/resources").json()}
    archived = client.get("/api/v1/resources", params={"include_archived": True}).json()
    assert rid in {r["id"] for r in archived}

    assert client.delete(f"/api/v1/resources/{rid}").status_code == 204
    assert client.patch(f"/api/v1/resources/{rid}", json={}).status_code == 404


def test_catalogue_item_cannot_be_deleted(client: TestClient) -> None:
    item = client.get("/api/v1/resources").json()[0]
    res = client.delete(f"/api/v1/resources/{item['id']}")
    assert res.status_code == 409
    assert res.json()["detail"]["error"] == "catalog_item"


def test_local_file_resource(client: TestClient, tmp_path: Path) -> None:
    body = {"title": "My PDF", "skill": "reading", "local_path": "book.pdf", "format": "pdf"}
    assert client.post("/api/v1/resources", json=body).status_code == 400  # not copied yet

    library = tmp_path / "library"
    library.mkdir()
    (library / "book.pdf").write_bytes(b"%PDF-1.4")
    res = client.post("/api/v1/resources", json=body)
    assert res.status_code == 201, res.text
    assert res.json()["needs_internet"] is False

    client.delete(f"/api/v1/resources/{res.json()['id']}")
    assert not (library / "book.pdf").exists()


@pytest.mark.parametrize(
    "body",
    [
        {"title": "x", "skill": "reading"},  # no location
        {"title": "x", "skill": "reading", "url": "https://a.b", "local_path": "a.pdf"},
        {"title": "x", "skill": "reading", "url": "http://plain.example"},
        {"title": "x", "skill": "reading", "url": "javascript:alert(1)"},
        {"title": "x", "skill": "reading", "local_path": "../secret.pdf"},
        {"title": "x", "skill": "reading", "local_path": "sub/dir.pdf"},
        {"title": "x", "skill": "cooking", "url": "https://a.b"},
    ],
)
def test_invalid_resources_rejected(client: TestClient, body: dict) -> None:
    assert client.post("/api/v1/resources", json=body).status_code == 422


# --- study sessions -------------------------------------------------------------------


def _start(client: TestClient, **extra) -> dict:
    res = client.post("/api/v1/sessions/start", json={"skill": "listening", **extra})
    assert res.status_code == 201, res.text
    return res.json()


def _backdate(tmp_path: Path, session_id: int, seconds: int) -> None:
    """Pretend the session started `seconds` ago."""
    engine = make_engine(settings_for(tmp_path).db_path)
    past = utcnow() - timedelta(seconds=seconds)
    with engine.begin() as conn:
        conn.execute(
            update(StudySession)
            .where(StudySession.id == session_id)
            .values(started_at=past, last_heartbeat_at=past)
        )
    engine.dispose()


def test_session_counts_active_time(client: TestClient, tmp_path: Path) -> None:
    sid = _start(client)["id"]
    _backdate(tmp_path, sid, 60)
    beat = client.post(f"/api/v1/sessions/{sid}/heartbeat", json={"active_delta_seconds": 30})
    assert beat.json()["active_seconds"] == 30
    _backdate(tmp_path, sid, 0)  # no wall time has passed since the last beat...
    beat = client.post(f"/api/v1/sessions/{sid}/heartbeat", json={"active_delta_seconds": 30})
    assert beat.json()["active_seconds"] <= 5  # ...so a claim of 30 s is capped
    stopped = client.post(f"/api/v1/sessions/{sid}/stop", json={"notes": "episode 12"}).json()
    assert stopped["state"] == "confirmed"
    assert stopped["notes"] == "episode 12"
    assert client.post(f"/api/v1/sessions/{sid}/heartbeat", json={"active_delta_seconds": 1})\
        .status_code == 409


def test_heartbeat_delta_is_bounded(client: TestClient) -> None:
    sid = _start(client)["id"]
    res = client.post(f"/api/v1/sessions/{sid}/heartbeat", json={"active_delta_seconds": 3600})
    assert res.status_code == 422


def test_new_session_closes_running_one(client: TestClient) -> None:
    first = _start(client)["id"]
    _start(client, skill="reading")
    open_ = client.get("/api/v1/sessions/open").json()
    states = {s["id"]: s["state"] for s in open_}
    assert states[first] == "unconfirmed"
    assert sum(1 for s in open_ if s["state"] == "running") == 1


def test_restart_marks_running_session_unconfirmed(new_client) -> None:
    sid = _start(new_client())["id"]
    open_ = new_client().get("/api/v1/sessions/open").json()
    assert [(s["id"], s["state"]) for s in open_] == [(sid, "unconfirmed")]


def test_unconfirmed_session_confirm_or_discard(client: TestClient, tmp_path: Path) -> None:
    sid = _start(client)["id"]
    _backdate(tmp_path, sid, 600)
    client.post(f"/api/v1/sessions/{sid}/heartbeat", json={"active_delta_seconds": 30})
    _start(client)  # closes the first one as unconfirmed

    too_long = client.patch(f"/api/v1/sessions/{sid}", json={"active_seconds": 3600})
    assert too_long.status_code == 422
    ok = client.patch(
        f"/api/v1/sessions/{sid}", json={"state": "confirmed", "active_seconds": 540}
    ).json()
    assert ok["state"] == "confirmed"
    assert ok["active_seconds"] == 540

    since = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    client.patch(f"/api/v1/sessions/{sid}", json={"state": "discarded"})
    listed = client.get("/api/v1/sessions", params={"since": since}).json()
    assert sid not in {s["id"] for s in listed}
    with_discarded = client.get(
        "/api/v1/sessions", params={"since": since, "include_discarded": True}
    ).json()
    assert sid in {s["id"] for s in with_discarded}


def test_running_session_cannot_be_patched(client: TestClient) -> None:
    sid = _start(client)["id"]
    assert client.patch(f"/api/v1/sessions/{sid}", json={"state": "confirmed"}).status_code == 409


def test_manual_session(client: TestClient) -> None:
    start = datetime.now(UTC) - timedelta(hours=2)
    res = client.post(
        "/api/v1/sessions/manual",
        json={"skill": "reading", "started_at": start.isoformat(), "minutes": 45},
    )
    assert res.status_code == 201, res.text
    assert res.json()["origin"] == "manual"
    assert res.json()["active_seconds"] == 45 * 60

    future = client.post(
        "/api/v1/sessions/manual",
        json={"skill": "reading", "started_at": datetime.now(UTC).isoformat(), "minutes": 60},
    )
    assert future.status_code == 422
    naive = client.post(
        "/api/v1/sessions/manual",
        json={"skill": "reading", "started_at": "2026-01-01T10:00:00", "minutes": 10},
    )
    assert naive.status_code == 422


def test_sessions_window(client: TestClient) -> None:
    _start(client)
    now = datetime.now(UTC)
    inside = client.get(
        "/api/v1/sessions",
        params={"since": (now - timedelta(hours=1)).isoformat(),
                "until": (now + timedelta(hours=1)).isoformat()},
    ).json()
    assert len(inside) == 1
    later = client.get(
        "/api/v1/sessions", params={"since": (now + timedelta(hours=1)).isoformat()}
    ).json()
    assert later == []
    naive = client.get("/api/v1/sessions", params={"since": "2026-01-01T00:00:00"})
    assert naive.status_code == 422


def test_session_resource_must_exist(client: TestClient) -> None:
    res = client.post("/api/v1/sessions/start", json={"skill": "reading", "resource_id": 99999})
    assert res.status_code == 404


def test_deleting_resource_keeps_its_sessions(client: TestClient) -> None:
    rid = client.post(
        "/api/v1/resources",
        json={"title": "x", "skill": "reading", "url": "https://example.org"},
    ).json()["id"]
    sid = _start(client, resource_id=rid)["id"]
    client.post(f"/api/v1/sessions/{sid}/stop", json={})
    client.delete(f"/api/v1/resources/{rid}")
    since = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    session = client.get("/api/v1/sessions", params={"since": since}).json()[0]
    assert session["id"] == sid
    assert session["resource_id"] is None


def test_delete_all_reloads_catalogue(client: TestClient) -> None:
    _start(client)
    client.post("/api/v1/data/delete-all", json={"confirm": "DELETE"})
    assert client.get("/api/v1/sessions/open").json() == []
    assert len(client.get("/api/v1/resources").json()) == len(_catalog_ids())
