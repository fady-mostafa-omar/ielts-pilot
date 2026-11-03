"""Flashcards (v0.0.11, D-041): import keeps progress, SM-2, new-card allowance, phrases."""

from datetime import date, timedelta

from fastapi.testclient import TestClient

TODAY = date(2026, 11, 3)


def words(n: int, meaning: str = "معنى") -> dict:
    return {
        "kind": "word",
        "items": [
            {"key": f"basic-{i}", "section": "basic", "sort": i, "front": f"word{i}",
             "meaning": f"{meaning} {i}", "example": f"Example {i}.", "example_ar": "مثال"}
            for i in range(1, n + 1)
        ],
    }


def today_cards(client: TestClient, day: date = TODAY, **params) -> list[dict]:
    r = client.get("/api/v1/cards/today",
                   params={"deck": "word", "today": day.isoformat(), **params})
    assert r.status_code == 200
    return r.json()


def review(client: TestClient, card_id: int, grade: int, day: date = TODAY) -> dict:
    r = client.post(f"/api/v1/cards/{card_id}/review",
                    json={"grade": grade, "today": day.isoformat()})
    assert r.status_code == 200
    return r.json()


def test_import_is_idempotent_and_keeps_progress(client: TestClient) -> None:
    r = client.post("/api/v1/cards/import", json=words(20))
    assert r.json() == {"kind": "word", "total": 20, "added": 20, "updated": 0}
    first = today_cards(client)[0]
    review(client, first["id"], 4)
    # Dalilk fixes a meaning: the text changes, the progress stays
    r = client.post("/api/v1/cards/import", json=words(20, "معنى جديد"))
    assert r.json()["added"] == 0 and r.json()["updated"] == 20
    stats = client.get("/api/v1/cards/stats", params={"today": TODAY.isoformat()}).json()
    assert stats["word"]["total"] == 20 and stats["word"]["learned"] == 1


def test_new_cards_per_day_and_reviews_first(client: TestClient) -> None:
    client.post("/api/v1/cards/import", json=words(40))
    cards = today_cards(client)
    assert len(cards) == 15 and [c["front"] for c in cards[:2]] == ["word1", "word2"]
    for c in cards[:5]:
        review(client, c["id"], 4)
    assert len(today_cards(client)) == 10  # 5 of today's 15 new ones done
    tomorrow = TODAY + timedelta(days=1)
    nxt = today_cards(client, tomorrow)
    assert [c["front"] for c in nxt[:5]] == [f"word{i}" for i in range(1, 6)]  # reviews first
    assert len(nxt) == 5 + 15


def test_sm2_intervals(client: TestClient) -> None:
    client.post("/api/v1/cards/import", json=words(1))
    card = today_cards(client)[0]
    c = review(client, card["id"], 4)
    assert c["interval_days"] == 1 and c["due"] == (TODAY + timedelta(days=1)).isoformat()
    c = review(client, card["id"], 4, TODAY + timedelta(days=1))
    assert c["interval_days"] == 6
    c = review(client, card["id"], 5, TODAY + timedelta(days=7))
    assert c["interval_days"] == 15 and c["ease"] > 2.5  # 6 × 2.5, then ease grows
    c = review(client, card["id"], 1, TODAY + timedelta(days=30))
    assert c["reps"] == 0 and c["lapses"] == 1 and c["interval_days"] == 1
    assert c["learned_on"] == TODAY.isoformat()
    assert client.post(f"/api/v1/cards/{card['id']}/review",
                       json={"grade": 7, "today": TODAY.isoformat()}).status_code == 422


def test_my_words_come_first_and_can_be_deleted(client: TestClient) -> None:
    client.post("/api/v1/cards/import", json=words(5))
    r = client.post("/api/v1/cards", json={"front": "resilient", "meaning": "مرن"})
    assert r.status_code == 201 and r.json()["kind"] == "mine"
    assert today_cards(client)[0]["front"] == "resilient"
    assert client.delete(f"/api/v1/cards/{r.json()['id']}").status_code == 204
    dalilk = today_cards(client)[0]
    assert client.delete(f"/api/v1/cards/{dalilk['id']}").status_code == 404
    ach = client.get("/api/v1/stats/achievements").json()
    assert ach["words"] == 0 and ach["phrases"] == 0


def test_phrases_one_per_pause_in_order_then_again(client: TestClient) -> None:
    assert client.get("/api/v1/cards/phrase/next").status_code == 404
    client.post("/api/v1/cards/import", json={"kind": "phrase", "items": [
        {"key": str(i), "section": "emails", "situation": "1 بداية الإيميل", "sort": i,
         "front": f"Phrase {i}", "meaning": "معنى"} for i in (1, 2, 3)]})
    shown = []
    for _ in range(4):
        p = client.get("/api/v1/cards/phrase/next").json()
        shown.append(p["front"])
        client.post(f"/api/v1/cards/{p['id']}/shown")
    assert shown == ["Phrase 1", "Phrase 2", "Phrase 3", "Phrase 1"]
    phrase_deck = client.get("/api/v1/cards/today",
                             params={"deck": "phrase", "today": TODAY.isoformat()}).json()
    assert len(phrase_deck) == 3


def test_recent_words_for_the_days_writing(client: TestClient) -> None:
    client.post("/api/v1/cards/import", json=words(3))
    assert client.get("/api/v1/cards/recent").json() == []
    first = today_cards(client)[0]
    review(client, first["id"], 4)
    recent = client.get("/api/v1/cards/recent").json()
    assert [c["front"] for c in recent] == ["word1"]
