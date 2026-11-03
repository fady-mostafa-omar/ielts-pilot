"""Content catalogue (planner-4, D-036): sync, queues, progress."""

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app import content
from app.models import ContentItem


def test_catalogue_files_are_consistent() -> None:
    rows = content.catalogue()
    kinds = {k: [r for r in rows if r["kind"] == k] for k in ("video", "novel", "test")}
    assert len(kinds["video"]) == 102
    assert len(kinds["novel"]) == 98
    assert len({r["key"] for r in kinds["novel"]}) == 98  # broken duplicate links left out
    assert len(kinds["test"]) >= 900
    assert all(r["url"].startswith("https://") for r in rows)
    assert {r["grp"] for r in kinds["video"]} == {
        "dev", "core", "computer", "paper", "low", "high", "practice", "phrases", "optional",
        "skip",
    }
    assert {r["skill"] for r in kinds["video"] if r["grp"] not in ("skip", "optional")} <= {
        "L", "R", "W1", "W2", "S",
    }
    assert {r["level"] for r in kinds["novel"]} == set(content.NOVEL_LEVELS)
    phrases = [r for r in kinds["video"] if r["grp"] == "phrases"]
    assert len(phrases) == 10


def test_queue_videos_fill_minutes_once(client: TestClient) -> None:
    first = client.get(
        "/api/v1/content/queue",
        params={"kind": "video", "groups": "core,computer", "skills": "L", "minutes": 40},
    ).json()
    assert first and sum(v["duration_seconds"] for v in first) <= 40 * 60
    assert all(v["skill"] == "L" and v["grp"] in ("core", "computer") for v in first)
    client.post(f"/api/v1/content/{first[0]['id']}/done")
    again = client.get(
        "/api/v1/content/queue",
        params={"kind": "video", "groups": "core,computer", "skills": "L", "limit": 50},
    ).json()
    assert first[0]["id"] not in [v["id"] for v in again]
    # a video longer than the time left is skipped for one that fits ...
    fit = client.get(
        "/api/v1/content/queue",
        params={"kind": "video", "groups": "practice", "skills": "R", "minutes": 45},
    ).json()
    assert fit and all(v["duration_seconds"] <= 45 * 60 for v in fit)
    # ... and when none fits, the next one comes alone
    long = client.get(
        "/api/v1/content/queue",
        params={"kind": "video", "groups": "practice", "skills": "L", "minutes": 1},
    ).json()
    assert len(long) == 1


def test_queue_tests_follow_provider_order(client: TestClient) -> None:
    eng = client.get(
        "/api/v1/content/queue",
        params={"kind": "test", "skills": "listening", "providers": "engnovate,ieltsonlinetests",
                "limit": 13},
    ).json()
    assert [t["provider"] for t in eng[:12]] == ["engnovate"] * 12
    assert eng[0]["key"].endswith("cambridge-ielts-21-academic-listening-test-1")
    assert eng[12]["provider"] == "ieltsonlinetests"
    full = client.get(
        "/api/v1/content/queue", params={"kind": "test", "providers": "dalilk", "limit": 2}
    ).json()
    assert [t["key"] for t in full] == ["dalilk:a", "dalilk:b"]


def test_novels_move_up_a_level_when_one_is_finished(client: TestClient) -> None:
    app = client.app
    with app.state.ctx.session_factory.begin() as session:
        for item in session.scalars(
            select(ContentItem).where(ContentItem.kind == "novel", ContentItem.level == "upper")
        ):
            item.completed_at = item.created_at
    nxt = client.get("/api/v1/content/queue", params={"kind": "novel", "level": "upper"}).json()
    assert nxt == []
    mid = client.get(
        "/api/v1/content/queue", params={"kind": "novel", "level": "intermediate"}
    ).json()
    assert len(mid) == 1 and mid[0]["level"] == "intermediate"
    assert mid[0]["url"].startswith("https://publuu.com/flip-book/232773/")
    bad = client.get("/api/v1/content/queue", params={"kind": "novel", "level": "x"})
    assert bad.status_code == 422


def test_progress_and_achievements(client: TestClient) -> None:
    item = client.get("/api/v1/content/queue", params={"kind": "novel", "limit": 1}).json()[0]
    assert client.post(f"/api/v1/content/{item['id']}/start").json()["started_at"]
    done = client.post(f"/api/v1/content/{item['id']}/done").json()
    assert done["completed_at"]
    assert client.get("/api/v1/stats/achievements").json()["novels"] == 1
    assert client.post(f"/api/v1/content/{item['id']}/reset").json()["completed_at"] is None
    assert client.post("/api/v1/content/999999/done").status_code == 404


def test_sync_keeps_progress_and_marks_missing_inactive(client: TestClient, tmp_path) -> None:
    app = client.app
    with app.state.ctx.session_factory.begin() as session:
        novel = session.scalars(select(ContentItem).where(ContentItem.kind == "novel")).first()
        novel.completed_at = novel.created_at
        key = novel.key
    empty = tmp_path / "empty-items"
    empty.mkdir()
    with app.state.ctx.session_factory.begin() as session:
        content.sync(session, empty)
        assert session.scalar(select(func.count()).select_from(ContentItem).where(
            ContentItem.active.is_(True))) == 0
    with app.state.ctx.session_factory.begin() as session:
        content.sync(session)
        again = session.scalars(select(ContentItem).where(ContentItem.key == key)).first()
        assert again.active and again.completed_at is not None


def test_novel_carries_on_from_its_last_page(client: TestClient) -> None:
    novel = client.get("/api/v1/content/queue", params={"kind": "novel", "level": "beginner",
                                                         "limit": 1}).json()[0]
    assert novel["position_url"] is None
    base = novel["url"].split("/page/")[0]
    r = client.post(f"/api/v1/content/{novel['id']}/position", json={"url": f"{base}/page/7"})
    assert r.status_code == 200 and r.json()["position_url"] == f"{base}/page/7"
    # the next day the same novel comes first, with its page
    again = client.get("/api/v1/content/queue", params={"kind": "novel", "level": "beginner",
                                                        "limit": 1}).json()[0]
    assert again["id"] == novel["id"] and again["position_url"] == f"{base}/page/7"
    for bad in ("https://example.com/page/2", base.replace(base.split("/")[-1], "1") + "/page/2"):
        assert client.post(f"/api/v1/content/{novel['id']}/position",
                           json={"url": bad}).status_code == 422
    video = client.get("/api/v1/content/queue", params={"kind": "video", "limit": 1}).json()[0]
    assert client.post(f"/api/v1/content/{video['id']}/position",
                       json={"url": video["url"] + "/x"}).status_code == 422


def test_series_count_and_video_notes(client: TestClient) -> None:
    params = {"kind": "video", "groups": "core", "skills": "L"}
    count = client.get("/api/v1/content/count", params=params).json()
    assert count == {"total": 5, "done": 0}
    first = client.get("/api/v1/content/queue", params={**params, "limit": 1}).json()[0]
    assert first["note"]  # our own one line on what the video gives
    client.post(f"/api/v1/content/{first['id']}/done")
    assert client.get("/api/v1/content/count", params=params).json() == {"total": 5, "done": 1}
    practice = client.get("/api/v1/content/queue",
                          params={"kind": "video", "groups": "practice", "limit": 1}).json()[0]
    assert practice["note"].startswith("حل عملي")
