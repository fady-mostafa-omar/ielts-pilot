"""Listening player: RSS import, next episode, progress (Sprint 2b-1)."""

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.podcast import FeedError, parse_duration, parse_feed

FIXTURE = Path(__file__).parent / "fixtures" / "dalilk_ielts_sample.rss"
SAMPLE = FIXTURE.read_text(encoding="utf-8")


def test_parse_feed() -> None:
    episodes = {e.number: e for e in parse_feed(SAMPLE)}
    assert set(episodes) == {1, 2, 3}  # the javascript: enclosure is dropped
    assert episodes[3].transcript_id == "1BZsikJ3kl6SmXgSGl0eLYioJ_9Y6M1dJ"
    assert episodes[3].duration_seconds == 700
    assert episodes[1].duration_seconds == 725
    assert episodes[2].transcript_id is None
    assert episodes[2].page_url is None
    assert "<br" not in episodes[3].summary
    assert episodes[3].published_at is not None and episodes[3].published_at.tzinfo


@pytest.mark.parametrize(("text", "seconds"), [("00:11:40", 700), ("11:40", 700), ("725", 725),
                                               ("", None), ("abc", None)])
def test_duration(text: str, seconds: int | None) -> None:
    assert parse_duration(text) == seconds


def test_bad_feed() -> None:
    with pytest.raises(FeedError):
        parse_feed("<html>not rss</html>")
    with pytest.raises(FeedError):
        parse_feed("<<<")


def _import(client: TestClient) -> dict:
    res = client.post("/api/v1/podcasts/dalilk_ielts/import", json={"xml": SAMPLE})
    assert res.status_code == 200, res.text
    return res.json()


def test_import_is_idempotent(client: TestClient) -> None:
    first = _import(client)
    assert first == {"added": 3, "updated": 0, "total": 3, "in_feed": 3}
    second = _import(client)
    assert second["added"] == 0 and second["updated"] == 0 and second["total"] == 3
    listing = client.get("/api/v1/podcasts/dalilk_ielts").json()
    assert [e["number"] for e in listing["episodes"]] == [1, 2, 3]
    assert listing["refreshed_at"]
    ep3 = listing["episodes"][2]
    assert ep3["transcript_url"] == (
        "https://drive.google.com/file/d/1BZsikJ3kl6SmXgSGl0eLYioJ_9Y6M1dJ/preview"
    )


def test_next_episode_flow(client: TestClient) -> None:
    assert client.get("/api/v1/podcasts/dalilk_ielts/next").status_code == 404
    _import(client)
    first = client.get("/api/v1/podcasts/dalilk_ielts/next").json()
    assert first["number"] == 1

    # start episode 2 half-way: it becomes the one to continue
    eps = client.get("/api/v1/podcasts/dalilk_ielts").json()["episodes"]
    ep2 = eps[1]["id"]
    client.patch(f"/api/v1/podcasts/episodes/{ep2}", json={"position_seconds": 90, "started": True})
    assert client.get("/api/v1/podcasts/dalilk_ielts/next").json()["number"] == 2

    done = client.patch(
        f"/api/v1/podcasts/episodes/{ep2}", json={"listened": True, "comprehension": 4}
    ).json()
    assert done["listened_at"] and done["comprehension"] == 4 and done["position_seconds"] == 0
    assert done["plays"] == 1
    assert client.get("/api/v1/podcasts/dalilk_ielts/next").json()["number"] == 1

    for e in eps:
        client.patch(f"/api/v1/podcasts/episodes/{e['id']}", json={"listened": True})
    assert client.get("/api/v1/podcasts/dalilk_ielts/next").status_code == 404
    listing = client.get("/api/v1/podcasts/dalilk_ielts").json()
    assert listing["listened"] == 3


def test_import_keeps_progress(client: TestClient) -> None:
    _import(client)
    ep = client.get("/api/v1/podcasts/dalilk_ielts/next").json()
    client.patch(f"/api/v1/podcasts/episodes/{ep['id']}", json={"position_seconds": 30})
    changed = SAMPLE.replace("Daily IELTS Listening #1", "Daily IELTS Listening #1 (new title)")
    res = client.post("/api/v1/podcasts/dalilk_ielts/import", json={"xml": changed}).json()
    assert res["updated"] == 1
    again = client.get("/api/v1/podcasts/dalilk_ielts/next").json()
    assert again["position_seconds"] == 30 and "new title" in again["title"]


@pytest.mark.parametrize(
    "body",
    [{"comprehension": 6}, {"position_seconds": -1}, {"unknown": 1}],
)
def test_bad_patch(client: TestClient, body: dict) -> None:
    _import(client)
    ep = client.get("/api/v1/podcasts/dalilk_ielts/next").json()
    assert client.patch(f"/api/v1/podcasts/episodes/{ep['id']}", json=body).status_code == 422


def test_unknown_feed_and_bad_xml(client: TestClient) -> None:
    assert client.post("/api/v1/podcasts/other/import", json={"xml": SAMPLE}).status_code == 422
    res = client.post("/api/v1/podcasts/dalilk_ielts/import", json={"xml": "<html/>"})
    assert res.status_code == 422


ENGLISH = (Path(__file__).parent / "fixtures" / "dalilk_english_sample.rss").read_text(
    encoding="utf-8"
)


def test_parse_english_feed() -> None:
    episodes = {e.number: e for e in parse_feed(ENGLISH)}
    assert set(episodes) == {1, 2}
    assert episodes[2].title == "English Listening #2: The Second Story"
    assert episodes[2].transcript_id == "1EnglishTwoXXXXXXXXXXXXXXXXXXXXXX"
    assert episodes[1].transcript_id == "1EnglishOneXXXXXXXXXXXXXXXXXXXXXX"
    assert episodes[2].duration_seconds == 492
    assert episodes[2].audio_url.startswith("https://anchor.fm/")
    assert episodes[2].page_url and episodes[2].page_url.startswith("https://podcasters.")
    assert "<p>" not in episodes[2].summary


def test_feeds_are_separate(client: TestClient) -> None:
    _import(client)
    res = client.post("/api/v1/podcasts/dalilk_english/import", json={"xml": ENGLISH})
    assert res.status_code == 200
    assert res.json()["total"] == 2
    english = client.get("/api/v1/podcasts/dalilk_english").json()
    assert [e["number"] for e in english["episodes"]] == [1, 2]
    assert all(e["feed"] == "dalilk_english" for e in english["episodes"])
    first = client.get("/api/v1/podcasts/dalilk_english/next").json()
    assert first["number"] == 1
    assert first["transcript_url"].endswith("/1EnglishOneXXXXXXXXXXXXXXXXXXXXXX/preview")
    client.patch(f"/api/v1/podcasts/episodes/{first['id']}", json={"listened": True})
    # finishing an English episode does not move the IELTS podcast
    assert client.get("/api/v1/podcasts/dalilk_ielts/next").json()["number"] == 1
    assert client.get("/api/v1/podcasts/dalilk_english/next").json()["number"] == 2
    assert client.get("/api/v1/podcasts/unknown").status_code == 422


def test_achievements_count_what_was_done(client: TestClient) -> None:
    empty = client.get("/api/v1/stats/achievements").json()
    assert empty == {
        "episodes": {"dalilk_ielts": 0, "dalilk_english": 0},
        "episodes_total": 0,
        "tasks_done": 0,
        "tasks_skipped": 0,
        "hours": 0,
        "hours_self_logged": 0,
        "study_days": 0,
    }
    _import(client)
    client.post("/api/v1/podcasts/dalilk_english/import", json={"xml": ENGLISH})
    first = client.get("/api/v1/podcasts/dalilk_ielts/next").json()
    client.patch(f"/api/v1/podcasts/episodes/{first['id']}", json={"listened": True})
    eng = client.get("/api/v1/podcasts/dalilk_english/next").json()
    client.patch(f"/api/v1/podcasts/episodes/{eng['id']}", json={"listened": True})
    start = datetime.now(UTC) - timedelta(hours=2)
    client.post("/api/v1/sessions/manual",
                json={"skill": "listening", "started_at": start.isoformat(), "minutes": 30})
    stats = client.get("/api/v1/stats/achievements").json()
    assert stats["episodes"] == {"dalilk_ielts": 1, "dalilk_english": 1}
    assert stats["episodes_total"] == 2
    assert stats["hours"] == 0.5 and stats["hours_self_logged"] == 0.5
    assert stats["study_days"] == 1
