"""Tests by name and their results (v0.0.14, owner 2026-11-03, D-044)."""

from fastapi.testclient import TestClient

from app import content


def _queue(client: TestClient, **params) -> list[dict]:
    return client.get("/api/v1/content/queue", params={"kind": "test", **params}).json()


def test_official_samples_in_the_catalogue() -> None:
    tests = [r for r in content.catalogue() if r["kind"] == "test"]
    official = [r for r in tests if r["provider"] == "official"]
    samples = [r for r in official if r["grp"] == "sample"]
    assert len([r for r in samples if r["skill"] == "listening"]) == 8
    assert len([r for r in samples if r["skill"] == "reading"]) == 10
    assert all(r["url"].startswith(("https://ielts.", "https://demo-ielts.")) for r in official)
    assert all(r["meta_json"] and "answer_url" in r["meta_json"]
               for r in samples if r["skill"] in ("listening", "reading"))
    assert {r["grp"] for r in official if r["skill"] == "writing"} == {"task1", "task2"}


def test_samples_then_full_tests_in_the_approved_order(client: TestClient) -> None:
    samples = _queue(client, skills="listening", series="samples", limit=10)
    assert len(samples) == 8 and all(s["test_kind"] == "sample" for s in samples)
    # day 1: Parts 1 and 2, day 2: Parts 3 and 4
    assert [s["meta"]["part"] for s in samples] == [1, 1, 2, 2, 3, 3, 3, 4]
    assert samples[0]["meta"]["qtype"] == "note_completion"
    assert samples[0]["meta"]["answer_url"].endswith("note-completion-answer-key.pdf")
    practice = _queue(client, skills="reading", series="practice", limit=6)
    assert practice[0]["key"] == "off:reading-full" and practice[0]["test_kind"] == "full"
    assert practice[1]["key"] == "eng:cambridge-ielts-21-academic-reading-test-1"
    assert practice[5]["key"] == "eng:cambridge-ielts-20-academic-reading-test-1"
    # each test once: a done test goes on to the next
    client.post(f"/api/v1/content/{practice[0]['id']}/done")
    assert _queue(client, skills="reading", series="practice", limit=1)[0]["key"] == practice[1][
        "key"]


def test_done_samples_open_a_full_test_only_with_its_time(client: TestClient) -> None:
    for s in _queue(client, skills="listening", series="samples", limit=10):
        client.post(f"/api/v1/content/{s['id']}/done")
    assert _queue(client, skills="listening", series="samples", limit=4, minutes=20) == []
    full = _queue(client, skills="listening", series="samples", limit=4, minutes=32)
    assert [t["key"] for t in full] == ["off:listening-full"]


def test_sample_result_is_recorded_only(client: TestClient) -> None:
    sample = _queue(client, skills="reading", series="samples", limit=1)[0]
    r = client.post("/api/v1/practice-results",
                    json={"content_id": sample["id"], "correct": 4, "total": 6})
    assert r.status_code == 201
    res = r.json()
    assert res["kind"] == "sample" and res["qtype"] == "mc_one" and res["level_ids"] == []
    assert client.get("/api/v1/skill-levels").json()["current"]["reading"] is None
    # a sample has no band (D-044)
    assert client.post("/api/v1/practice-results",
                       json={"content_id": sample["id"], "correct": 4, "total": 6,
                             "band": 6.0}).status_code == 422
    assert client.post("/api/v1/practice-results",
                       json={"content_id": sample["id"], "correct": 7,
                             "total": 6}).status_code == 422
    # saving marks the sample done
    assert client.get(f"/api/v1/content/{sample['id']}").json()["completed_at"]
    progress = client.get("/api/v1/progress").json()
    assert progress["question_types"] == [
        {"skill": "reading", "qtype": "mc_one", "correct": 4, "total": 6, "samples": 1,
         "wrong_in_full": 0}
    ]


def test_full_test_band_is_a_level_entry(client: TestClient) -> None:
    cambridge = _queue(client, skills="listening", providers="engnovate", limit=1)[0]
    r = client.post("/api/v1/practice-results",
                    json={"content_id": cambridge["id"], "correct": 30, "total": 40,
                          "band": 7.0, "wrong_types": ["map_labelling", "map_labelling",
                                                       "mc_multi"]})
    res = r.json()
    assert res["kind"] == "full" and len(res["level_ids"]) == 1
    assert res["wrong_types"] == ["map_labelling", "mc_multi"]
    level = client.get("/api/v1/skill-levels").json()["current"]["listening"]
    assert level["band"] == 7.0 and level["source_type"] == "official_practice"
    assert level["source_note"].startswith("Cambridge IELTS 21 Academic — Listening Test 1")
    # a practice website that is not official material is marked as such
    site = _queue(client, skills="reading", providers="ieltsonlinetests", limit=1)[0]
    client.post("/api/v1/practice-results", json={"content_id": site["id"], "band": 6.0})
    level = client.get("/api/v1/skill-levels").json()["current"]["reading"]
    assert level["source_type"] == "practice_site"
    types = client.get("/api/v1/progress").json()["question_types"]
    assert {(t["qtype"], t["wrong_in_full"]) for t in types} == {
        ("map_labelling", 1), ("mc_multi", 1)}
    # deleting the result removes its level entry
    assert client.delete(f"/api/v1/practice-results/{res['id']}").status_code == 204
    assert client.get("/api/v1/skill-levels").json()["current"]["listening"] is None


def test_final_mock_bands_per_skill(client: TestClient) -> None:
    mock = _queue(client, providers="dalilk", limit=1)[0]
    r = client.post("/api/v1/practice-results",
                    json={"content_id": mock["id"],
                          "bands": {"listening": 6.5, "reading": 6.0, "writing": 5.5}})
    assert r.status_code == 201 and len(r.json()["level_ids"]) == 3
    current = client.get("/api/v1/skill-levels").json()["current"]
    assert current["writing"]["band"] == 5.5 and current["writing"]["source_type"] == (
        "practice_site")
    assert client.post("/api/v1/practice-results",
                       json={"content_id": mock["id"], "band": 6.0}).status_code == 422
    assert client.post("/api/v1/practice-results",
                       json={"content_id": mock["id"]}).status_code == 422


def test_labs_take_named_questions_in_order(client: TestClient) -> None:
    nxt = client.get("/api/v1/lab-test", params={"skill": "writing", "task": 1}).json()
    assert nxt["key"] == "off:writing-task1-computer"
    client.put("/api/v1/settings", json={"exam_format": "paper"})
    nxt = client.get("/api/v1/lab-test", params={"skill": "writing", "task": 1}).json()
    assert nxt["key"] == "off:writing-task1-paper"
    # an answer on it: the next Task 1 is Cambridge 21 Test 1; Task 2 still starts official
    a = client.post("/api/v1/writing", json={"task": 1, "test_key": nxt["key"]}).json()
    assert a["test_key"] == "off:writing-task1-paper"
    nxt = client.get("/api/v1/lab-test", params={"skill": "writing", "task": 1}).json()
    assert nxt["key"] == "eng:cambridge-ielts-21-academic-writing-test-1"
    t2 = client.get("/api/v1/lab-test", params={"skill": "writing", "task": 2}).json()
    assert t2["key"] == "off:writing-task2-paper"
    assert client.post("/api/v1/writing",
                       json={"task": 1, "test_key": "nope"}).status_code == 422
    # the mark's level entry names the question
    client.patch(f"/api/v1/writing/{a['id']}", json={"text": "a b c", "submit": True})
    client.patch(f"/api/v1/writing/{a['id']}", json={"tutor_overall": 6.0})
    note = client.get("/api/v1/skill-levels").json()["current"]["writing"]["source_note"]
    assert note == "ChatGPT · Official sample — Academic Writing Task 1 (paper) · Writing Task 1"
    # speaking: the official questions, then Cambridge; a plan task keeps its test
    s = client.get("/api/v1/lab-test", params={"skill": "speaking"}).json()
    assert s["key"] == "off:speaking-sample-tasks"
    client.post("/api/v1/speaking", json={"part": 1, "test_key": s["key"]})
    s2 = client.get("/api/v1/lab-test", params={"skill": "speaking"}).json()
    assert s2["key"] == "eng:cambridge-ielts-21-academic-speaking-test-1"


def test_progress_lists_levels_and_marked_answers(client: TestClient) -> None:
    client.post("/api/v1/skill-levels", json={"entries": [
        {"skill": "reading", "band": 5.5, "source_type": "self_estimate", "source_note": ""}]})
    a = client.post("/api/v1/writing", json={"task": 2, "test_key": "off:writing-task2-computer"})
    aid = a.json()["id"]
    client.patch(f"/api/v1/writing/{aid}", json={"text": "x", "submit": True})
    client.patch(f"/api/v1/writing/{aid}", json={"tutor_overall": 6.0})
    p = client.get("/api/v1/progress").json()
    assert [lv["source_type"] for lv in p["levels"]] == ["self_estimate", "ai_tutor"]
    assert p["labs"][0]["test_title"] == "Official sample — Academic Writing Task 2 (computer)"
    assert p["results"] == [] and p["tests_done"] == 0
