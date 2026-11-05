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
                     json={"tutor_overall": 6.5, "tutor_reply": "OVERALL: 6.5",
                           "scores": {"task": 6.5, "coherence": 6.0, "lexical": 6.5,
                                      "grammar": 6.0}})
    assert r.json()["tutor_overall"] == 6.5 and r.json()["scores"]["coherence"] == 6.0
    # owner, 2026-11-03 (D-043): the tutor's mark counts in the level, marked as the tutor's
    level = client.get("/api/v1/skill-levels").json()["current"]["writing"]
    assert level["band"] == 6.5 and level["source_type"] == "ai_tutor"
    assert level["source_note"] == "ChatGPT · Writing Task 2"
    r = client.patch(f"/api/v1/writing/{a['id']}", json={"tutor_overall": 7.0})
    assert client.get("/api/v1/skill-levels").json()["current"]["writing"]["band"] == 7.0
    assert client.patch(f"/api/v1/writing/{a['id']}",
                        json={"scores": {"task": 6.2}}).status_code == 422
    r = client.patch(f"/api/v1/writing/{a['id']}", json={"tutor_overall": None})
    assert r.json()["tutor_overall"] is None and r.json()["level_id"] is None
    listing = client.get("/api/v1/writing", params={"task": 2}).json()
    assert [x["id"] for x in listing] == [a["id"]]
    # removing the mark removed its level entry
    assert client.get("/api/v1/skill-levels").json()["current"]["writing"] is None
    client.patch(f"/api/v1/writing/{a['id']}", json={"tutor_overall": 6.0})
    assert client.delete(f"/api/v1/writing/{a['id']}").status_code == 204
    assert client.get("/api/v1/writing").json() == []
    assert client.get("/api/v1/skill-levels").json()["current"]["writing"] is None
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
    assert r.json() == {"deleted": a["id"], "recording": "speaking-20261103-150202.webm",
                        "model_recording": None}


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


def test_speaking_mark_counts_in_the_level(client: TestClient) -> None:
    a = client.post("/api/v1/speaking", json={"part": 1, "transcript": "I am a student."}).json()
    r = client.patch(f"/api/v1/speaking/{a['id']}", json={
        "tutor_overall": 5.5, "scores": {"fluency": 5.5, "lexical": 5.5, "grammar": 5.0}})
    assert r.json()["scores"]["grammar"] == 5.0
    level = client.get("/api/v1/skill-levels").json()["current"]["speaking"]
    assert level["band"] == 5.5 and level["source_note"] == "ChatGPT · Speaking Part 1"
    client.delete(f"/api/v1/speaking/{a['id']}")
    assert client.get("/api/v1/skill-levels").json()["current"]["speaking"] is None


def test_model_answer_and_its_recording(client: TestClient) -> None:
    """v0.0.17 (D-048): the tutor's model answer, the owner reading it, the saved PDF."""
    w = client.post("/api/v1/writing", json={"task": 2, "prompt": "Q"}).json()
    r = client.patch(f"/api/v1/writing/{w['id']}",
                     json={"model_answer": "A better essay.",
                           "pdf_file": "2026-11-05 · Task 2.pdf"})
    assert r.json()["model_answer"] == "A better essay." and r.json()["pdf_file"].endswith(".pdf")
    assert client.patch(f"/api/v1/writing/{w['id']}",
                        json={"pdf_file": "../x.pdf"}).status_code == 422
    s = client.post("/api/v1/speaking",
                    json={"part": 2, "recording": "speaking-20261105-101010.webm"})
    sid = s.json()["id"]
    r = client.patch(f"/api/v1/speaking/{sid}",
                     json={"model_answer": "I'd like to talk about…",
                           "model_recording": "model-20261105-101500.webm"})
    assert r.json()["model_recording"] == "model-20261105-101500.webm"
    assert client.patch(f"/api/v1/speaking/{sid}",
                        json={"model_recording": "x.webm"}).status_code == 422
    assert client.patch(f"/api/v1/speaking/{sid}",
                        json={"recording": "../x.webm"}).status_code == 422
    r = client.patch(f"/api/v1/speaking/{sid}",
                     json={"recording": "speaking-20261105-101200.webm", "seconds": 64})
    assert r.json()["recording"] == "speaking-20261105-101200.webm" and r.json()["seconds"] == 64
    r = client.delete(f"/api/v1/speaking/{sid}")
    assert r.json()["model_recording"] == "model-20261105-101500.webm"
    # the named test's title comes with the answer, for the PDF's name and heading
    assert w["test_title"] is None
    named = client.post("/api/v1/writing", json={
        "task": 2, "test_key": "eng:cambridge-ielts-21-academic-writing-test-1"}).json()
    assert named["test_title"] == "Cambridge IELTS 21 Academic — Writing Test 1"
    listed = client.get("/api/v1/writing", params={"limit": 1}).json()[0]
    assert listed["test_title"] == named["test_title"]
