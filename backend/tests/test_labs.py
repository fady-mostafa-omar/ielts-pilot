"""Writing and speaking labs and the mistakes notebook (v0.0.12, D-042)."""

from datetime import date, timedelta

from fastapi.testclient import TestClient

TODAY = date(2026, 11, 3)


def test_writing_draft_submit_and_opinion(client: TestClient) -> None:
    r = client.post("/api/v1/writing", json={"task": 2, "prompt": "Some people think..."})
    assert r.status_code == 201
    a = r.json()
    assert a["status"] == "draft" and a["words"] == 0
    r = client.patch(f"/api/v1/writing/{a['id']}",
                     json={"text": "It is often argued  that\ncities grow.", "seconds_used": 600})
    assert r.json()["words"] == 7 and r.json()["seconds_used"] == 600
    r = client.patch(f"/api/v1/writing/{a['id']}",
                     json={"submit": True, "checklist": ["task-all-parts", "coh-paragraphs"]})
    assert r.json()["status"] == "submitted" and r.json()["submitted_at"]
    assert r.json()["checklist"] == ["task-all-parts", "coh-paragraphs"]
    # the tutor's mark is an opinion in half bands, never anything else
    assert client.patch(f"/api/v1/writing/{a['id']}",
                        json={"tutor_overall": 6.3}).status_code == 422
    r = client.patch(f"/api/v1/writing/{a['id']}",
                     json={"tutor_overall": 6.5, "tutor_reply": "OVERALL: 6.5"})
    assert r.json()["tutor_overall"] == 6.5
    r = client.patch(f"/api/v1/writing/{a['id']}", json={"tutor_overall": None})
    assert r.json()["tutor_overall"] is None
    listing = client.get("/api/v1/writing", params={"task": 2}).json()
    assert [x["id"] for x in listing] == [a["id"]]
    # the levels are untouched by the tutor (D-026, D-008)
    assert client.get("/api/v1/skill-levels").json()["current"]["writing"] is None
    assert client.delete(f"/api/v1/writing/{a['id']}").status_code == 204
    assert client.get("/api/v1/writing").json() == []
    assert client.post("/api/v1/writing",
                       json={"task": 1, "plan_task_id": 999}).status_code == 422


def test_speaking_attempts_and_recording_names(client: TestClient) -> None:
    bad = {"part": 2, "recording": "../../secret.txt"}
    assert client.post("/api/v1/speaking", json=bad).status_code == 422
    assert client.post("/api/v1/speaking", json={"part": 1, "self_rating": {"fluency": 7}}
                       ).status_code == 422
    r = client.post("/api/v1/speaking", json={
        "part": 2, "prompt": "Describe a place you like.",
        "recording": "speaking-20261103-150202.webm", "seconds": 118,
        "transcript": "I would like to talk about...",
        "self_rating": {"fluency": 3, "lexical": 3, "grammar": 4, "pronunciation": 3}})
    assert r.status_code == 201
    a = r.json()
    r = client.patch(f"/api/v1/speaking/{a['id']}", json={"notes": "too many 'umm'"})
    assert r.json()["notes"] == "too many 'umm'" and r.json()["self_rating"]["grammar"] == 4
    assert client.get("/api/v1/speaking").json()[0]["seconds"] == 118
    r = client.delete(f"/api/v1/speaking/{a['id']}")
    assert r.json() == {"deleted": a["id"], "recording": "speaking-20261103-150202.webm"}


def test_mistakes_become_cards_and_same_code_comes_back(client: TestClient) -> None:
    first = client.post("/api/v1/cards/mistakes", json={
        "today": TODAY.isoformat(), "source": "AI tutor (opinion)",
        "items": [{"wrong": "He go to work.", "right": "He goes to work.",
                   "why": "third person -s", "code": "GR-AGR", "skill": "writing"}]})
    assert first.status_code == 201
    card = first.json()[0]
    assert card["kind"] == "mistake" and card["code"] == "GR-AGR"
    # learned well: due far away
    for day in (TODAY, TODAY + timedelta(days=1), TODAY + timedelta(days=7)):
        client.post(f"/api/v1/cards/{card['id']}/review",
                    json={"grade": 5, "today": day.isoformat()})
    later = TODAY + timedelta(days=8)
    r = client.post("/api/v1/cards/mistakes", json={
        "today": later.isoformat(),
        "items": [{"wrong": "She like it.", "right": "She likes it.", "code": "GR-AGR"}]})
    assert r.status_code == 201
    old = [c for c in client.get("/api/v1/cards/mistakes").json() if c["id"] == card["id"]][0]
    assert old["due"] == (later + timedelta(days=1)).isoformat() and old["interval_days"] == 1
    # new mistakes come first in today's cards, before Dalilk's words
    client.post("/api/v1/cards/import", json={"kind": "word", "items": [
        {"key": "basic-1", "section": "basic", "sort": 1, "front": "for", "meaning": "إلى"}]})
    deck = client.get("/api/v1/cards/today",
                      params={"deck": "word", "today": later.isoformat()}).json()
    assert deck[0]["kind"] == "mistake" and deck[-1]["front"] == "for"
    assert client.post("/api/v1/cards/mistakes", json={
        "today": TODAY.isoformat(), "items": [{"wrong": "x", "right": "y", "code": "bad code"}]
    }).status_code == 422
    assert client.delete(f"/api/v1/cards/{card['id']}").status_code == 204


def test_tutor_setting(client: TestClient) -> None:
    assert client.get("/api/v1/settings").json()["tutor"] == "chatgpt"
    r = client.put("/api/v1/settings", json={"tutor": "claude"})
    assert r.status_code == 200 and r.json()["tutor"] == "claude"
    assert client.put("/api/v1/settings", json={"tutor": "bing"}).status_code == 422
