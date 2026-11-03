"""Planner-3 rules (docs/CURRICULUM.md §4a) and the plan API."""

from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app import planner
from app.planner import PlanInputs, day_blocks, day_kind, estimate
from tests.conftest import VALID_PROFILE

SKILLS = planner.SKILLS
TUE = date(2026, 11, 3)  # a Tuesday


def inputs(**over) -> PlanInputs:
    base = dict(
        today=TUE,
        lang="ar",
        target_overall=7.0,
        targets=dict.fromkeys(SKILLS, 7.0),
        current={"listening": 6.0, "reading": 6.5, "writing": 5.5, "speaking": 5.5},
        exam_date=date(2027, 1, 2),
        daily_minutes=180,
        weekdays=planner.default_weekdays(6),
        hours_per_band=200,
        plan_start=TUE,
        hours_done=0.0,
    )
    base.update(over)
    return PlanInputs(**base)


# --------------------------------------------------------------------- basics


def test_default_rest_day_is_friday() -> None:
    assert planner.default_weekdays(6) == frozenset({0, 1, 2, 3, 4, 6})
    assert planner.default_weekdays(5) == frozenset({0, 1, 2, 3, 6})
    assert planner.default_weekdays(7) == frozenset(range(7))


@pytest.mark.parametrize(
    ("bands", "overall"),
    [([6.0, 6.5, 5.5, 5.5], 6.0), ([6.5, 6.5, 6.5, 6.0], 6.5), ([6.5, 6.5, 7.0, 7.0], 7.0),
     ([5.0, 5.0, 5.0, 5.5], 5.0)],
)
def test_ielts_rounding(bands: list[float], overall: float) -> None:
    assert planner.ielts_overall(bands) == overall


def test_weeks_start_on_saturday() -> None:
    assert planner.week_start(TUE) == date(2026, 10, 31)
    assert planner.week_start(date(2026, 10, 31)) == date(2026, 10, 31)


# --------------------------------------------------------------------- estimate


def test_hours_from_gap() -> None:
    e = estimate(inputs())
    # skill gaps 1.0, 0.5, 1.5, 1.5 -> mean 1.125 > overall gap 1.0
    assert e.current_overall == 6.0
    assert e.gap_bands == pytest.approx(1.125)
    assert e.total_hours == pytest.approx(225)
    assert e.remaining_hours == pytest.approx(225)
    assert e.goal_date == date(2026, 12, 29)
    assert e.final_mock_dates == [date(2026, 12, 29), date(2026, 12, 30), date(2026, 12, 31)]
    assert e.review_date == date(2027, 1, 1)


def test_unrealistic_plan_offers_three_ways_out() -> None:
    e = estimate(inputs())
    assert e.feasible is False
    assert e.needed_minutes_per_day == 282  # 225 h over 48 study days
    assert e.suggested_daily_minutes == 300  # rounded up to half hours
    assert e.earliest_exam_date is not None and e.earliest_exam_date > date(2027, 1, 2)
    assert e.reachable_band == 6.5


def test_feasible_plan() -> None:
    e = estimate(inputs(daily_minutes=300))
    assert e.feasible is True
    assert e.suggested_daily_minutes is None
    assert e.earliest_exam_date is None


def test_hours_done_reduce_remaining() -> None:
    e = estimate(inputs(hours_done=25))
    assert e.remaining_hours == pytest.approx(200)
    assert e.needed_minutes_per_day == 250


def test_impossible_when_over_14_hours() -> None:
    e = estimate(inputs(exam_date=TUE + timedelta(days=12)))
    assert e.impossible is True
    assert e.suggested_daily_minutes == 840


def test_no_level_no_estimate() -> None:
    e = estimate(inputs(current=dict.fromkeys(SKILLS)))
    assert e.total_hours is None
    assert "no_level" in e.notes


def test_hours_per_band_is_a_parameter() -> None:
    assert estimate(inputs(hours_per_band=100)).total_hours == pytest.approx(112.5)


def test_target_already_reached() -> None:
    e = estimate(inputs(current=dict.fromkeys(SKILLS, 7.5)))
    assert e.total_hours == 0
    assert e.feasible is True


# --------------------------------------------------------------------- calendar


def test_exam_countdown_days() -> None:
    i = inputs()
    assert day_kind(i, date(2027, 1, 2)) == "exam"
    assert day_kind(i, date(2027, 1, 1)) == "review"
    for d in (date(2026, 12, 29), date(2026, 12, 30), date(2026, 12, 31)):
        assert day_kind(i, d) == "final_mock"
    assert day_kind(i, date(2027, 1, 3)) == "after_exam"


def test_rest_days_have_no_tasks() -> None:
    kind, blocks = day_blocks(inputs(), date(2026, 11, 6))  # Friday
    assert kind == "rest"
    assert blocks == []


def test_biweekly_mock_is_last_study_day_of_second_week() -> None:
    i = inputs()
    # plan week 0 starts Sat 31 Oct; week 1 starts Sat 7 Nov; Friday is rest -> Thursday
    assert day_kind(i, date(2026, 11, 12)) == "mock"
    assert day_kind(i, date(2026, 11, 5)) == "study"
    assert day_kind(i, date(2026, 11, 19)) == "study"
    assert day_kind(i, date(2026, 11, 26)) == "mock"
    assert planner.estimate(i).next_mock_date == date(2026, 11, 12)


def test_no_biweekly_mock_close_to_the_exam() -> None:
    i = inputs(exam_date=date(2026, 11, 20))
    assert day_kind(i, date(2026, 11, 12)) == "study"


# --------------------------------------------------------------------- day blocks


def test_study_day_follows_hegazy_split() -> None:
    kind, blocks = day_blocks(inputs(exam_date=None), TUE - timedelta(days=1))  # Monday
    assert kind == "study"
    by_cat = {b.category: b.minutes for b in blocks}
    assert len(by_cat) == len(blocks)
    # development phase: 60% of 180 = 108 -> 55 / 35 / 20, exam 70
    assert by_cat == {"listening": 55, "reading": 35, "output": 20, "exam": 70}
    assert sum(by_cat.values()) == 180
    assert blocks[0].catalog_id == "DLK-20"
    assert blocks[1].catalog_id == "DLK-07"


def test_exam_part_starts_week_with_a_technique() -> None:
    i = inputs(exam_date=None)
    saturday = date(2026, 11, 7)
    _, blocks = day_blocks(i, saturday)
    assert blocks[-1].activity_code == "T-STRAT"
    _, blocks = day_blocks(i, saturday + timedelta(days=1))
    assert blocks[-1].activity_code != "T-STRAT"


def test_exam_focus_rotates_biggest_gap_first() -> None:
    i = inputs(exam_date=None)
    weeks = [planner.focus_skill(i, date(2026, 10, 31) + timedelta(weeks=n)) for n in range(4)]
    assert weeks == ["writing", "speaking", "listening", "reading"]


def test_output_alternates_speaking_and_writing() -> None:
    i = inputs(exam_date=None)
    a = [b for b in day_blocks(i, TUE)[1] if b.category == "output"][0]
    b = [b for b in day_blocks(i, TUE + timedelta(days=1))[1] if b.category == "output"][0]
    assert {a.skill, b.skill} == {"speaking", "writing"}


def test_short_days_merge_tiny_blocks() -> None:
    _, blocks = day_blocks(inputs(exam_date=None, daily_minutes=30), TUE)
    assert all(b.minutes >= planner.MIN_BLOCK for b in blocks)
    assert sum(b.minutes for b in blocks) == 30


def test_low_level_gets_easier_listening() -> None:
    low = dict.fromkeys(SKILLS, 4.5)
    _, blocks = day_blocks(inputs(exam_date=None, current=low), TUE)
    assert blocks[0].catalog_id == "DLK-11"


def test_mock_and_review_blocks() -> None:
    i = inputs()
    kind, blocks = day_blocks(i, date(2026, 12, 30))
    assert kind == "final_mock" and blocks[0].activity_code == "MOCK"
    assert blocks[0].minutes == planner.MOCK_MINUTES
    kind, blocks = day_blocks(i, date(2027, 1, 1))
    assert kind == "review" and blocks[0].minutes <= planner.REVIEW_MAX_MINUTES


def test_english_texts() -> None:
    _, blocks = day_blocks(inputs(lang="en", exam_date=None), TUE)
    assert blocks[0].title == "Extended listening"


# --------------------------------------------------------------------- API


def _setup(client: TestClient, **profile) -> None:
    client.put("/api/v1/profile", json={**VALID_PROFILE, **profile})
    client.post(
        "/api/v1/skill-levels",
        json={"entries": [
            {"skill": "listening", "band": 6.0, "source_type": "self_estimate"},
            {"skill": "reading", "band": 6.5, "source_type": "self_estimate"},
            {"skill": "writing", "band": 5.5, "source_type": "self_estimate"},
            {"skill": "speaking", "band": 5.5, "source_type": "self_estimate"},
        ]},
    )


def test_estimate_preview_without_profile(client: TestClient) -> None:
    res = client.post(
        "/api/v1/plan/estimate",
        json={
            "today": TUE.isoformat(),
            "target_overall": 7.0,
            "current": {"listening": 6.0, "reading": 6.5, "writing": 5.5, "speaking": 5.5},
            "exam_date": "2027-01-02",
            "study_weekdays": [0, 1, 2, 3, 4, 6],
            "daily_minutes": 180,
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total_hours"] == 225
    assert body["feasible"] is False
    assert body["final_mock_dates"][0] == "2026-12-29"


def test_settings_weekdays_update_profile(client: TestClient) -> None:
    _setup(client)
    settings = client.get("/api/v1/settings").json()
    assert len(settings["study_weekdays"]) == VALID_PROFILE["study_days_per_week"]
    assert settings["hours_per_band"] == 200
    client.put("/api/v1/settings", json={"study_weekdays": [6, 0, 1]})
    assert client.get("/api/v1/profile").json()["study_days_per_week"] == 3
    assert client.get("/api/v1/settings").json()["study_weekdays"] == [0, 1, 6]
    assert client.put("/api/v1/settings", json={"study_weekdays": [1, 1]}).status_code == 422


def test_summary_and_day(client: TestClient) -> None:
    _setup(client, study_minutes_per_day=180, study_days_per_week=7)
    today = date.today()
    summary = client.get("/api/v1/plan/summary", params={"today": today.isoformat()}).json()
    assert summary["total_hours"] == 325  # targets 7.5: mean skill gap 1.625 bands
    assert summary["today_kind"] in ("study", "mock")
    assert summary["streak_days"] == 0

    day = client.get("/api/v1/plan/day", params={"date": today.isoformat()}).json()
    assert day["preview"] is False and day["tasks"]
    again = client.get("/api/v1/plan/day", params={"date": today.isoformat()}).json()
    assert [t["id"] for t in again["tasks"]] == [t["id"] for t in day["tasks"]]

    preview = client.get(
        "/api/v1/plan/day",
        params={"date": (today + timedelta(days=2)).isoformat(), "today": today.isoformat()},
    ).json()
    assert preview["preview"] is True


def test_day_regenerates_until_started(client: TestClient) -> None:
    _setup(client, study_minutes_per_day=180, study_days_per_week=7)
    today = date.today().isoformat()
    first = client.get("/api/v1/plan/day", params={"date": today}).json()["tasks"]
    client.put("/api/v1/profile", json={**VALID_PROFILE, "study_minutes_per_day": 120,
                                        "study_days_per_week": 7})
    second = client.get("/api/v1/plan/day", params={"date": today}).json()["tasks"]
    assert sum(t["planned_minutes"] for t in first) == 180
    assert sum(t["planned_minutes"] for t in second) == 120

    client.post(f"/api/v1/plan/tasks/{second[0]['id']}/start")
    client.put("/api/v1/profile", json={**VALID_PROFILE, "study_minutes_per_day": 60,
                                        "study_days_per_week": 7})
    third = client.get("/api/v1/plan/day", params={"date": today}).json()["tasks"]
    assert [t["id"] for t in third] == [t["id"] for t in second]  # kept once started


def test_task_lifecycle_and_sessions(client: TestClient) -> None:
    _setup(client, study_minutes_per_day=180, study_days_per_week=7)
    today = date.today().isoformat()
    task = client.get("/api/v1/plan/day", params={"date": today}).json()["tasks"][0]
    assert client.post(f"/api/v1/plan/tasks/{task['id']}/start").json()["status"] == "in_progress"
    session = client.post(
        "/api/v1/sessions/start",
        json={"skill": task["skill"], "plan_task_id": task["id"],
              "resource_id": task["resource_id"]},
    ).json()
    assert session["plan_task_id"] == task["id"]
    client.post(f"/api/v1/sessions/{session['id']}/stop", json={})
    done = client.post(f"/api/v1/plan/tasks/{task['id']}/done").json()
    assert done["status"] == "done" and done["completed_at"]
    skipped = client.post(
        f"/api/v1/plan/tasks/{task['id'] + 1}/skip", json={"reason": "no internet"}
    ).json()
    assert skipped["status"] == "skipped" and skipped["skip_reason"] == "no internet"
    reset = client.post(f"/api/v1/plan/tasks/{task['id'] + 1}/reset").json()
    assert reset["status"] == "pending" and reset["skip_reason"] is None
    assert client.post("/api/v1/plan/tasks/99999/done").status_code == 404


def test_summary_needs_profile(client: TestClient) -> None:
    res = client.get("/api/v1/plan/summary", params={"today": TUE.isoformat()})
    assert res.status_code == 404


def test_hours_done_count_from_latest_measurement(client: TestClient, tmp_path) -> None:

    from sqlalchemy import text

    from app.db import make_engine
    from tests.conftest import settings_for

    _setup(client, study_minutes_per_day=180, study_days_per_week=7)
    engine = make_engine(settings_for(tmp_path).db_path)
    measured = (datetime.now(UTC) - timedelta(hours=2)).replace(tzinfo=None)
    with engine.begin() as conn:
        conn.execute(text("UPDATE skill_levels SET recorded_at = :t"), {"t": measured})
    engine.dispose()

    start = datetime.now(UTC) - timedelta(hours=5)
    client.post("/api/v1/sessions/manual",
                json={"skill": "reading", "started_at": start.isoformat(), "minutes": 120})
    summary = client.get("/api/v1/plan/summary", params={"today": date.today().isoformat()})
    # the session started before the levels were measured -> not counted
    assert summary.json()["hours_done"] == 0
    later = datetime.now(UTC) - timedelta(minutes=30)
    client.post("/api/v1/sessions/manual",
                json={"skill": "reading", "started_at": later.isoformat(), "minutes": 25})
    summary = client.get("/api/v1/plan/summary", params={"today": date.today().isoformat()})
    assert summary.json()["hours_done"] == pytest.approx(25 / 60, abs=0.01)


def test_spelling_has_two_fixed_days_outside_the_exam_phase() -> None:
    i = inputs(exam_date=None)
    # study days Sat..Thu (Friday rest): 2nd and 4th study day = Sunday and Tuesday
    assert planner.spelling_weekdays(i) == frozenset({0, 2})
    _, blocks = day_blocks(i, TUE)
    codes = [b.activity_code for b in blocks]
    assert codes[:2] == ["L-EXT", "L-SPELL"]
    spell = blocks[1]
    assert spell.catalog_id == "DLK-21" and spell.minutes == planner.SPELL_MINUTES
    listening = sum(b.minutes for b in blocks if b.category == "listening")
    assert listening == 55  # spelling comes out of the listening time
    assert "الأحد" in spell.reason and "التلات" in spell.reason
    _, monday = day_blocks(i, TUE - timedelta(days=1))
    assert "L-SPELL" not in [b.activity_code for b in monday]
    # exam phase (exam within 4 weeks): no spelling
    _, close = day_blocks(inputs(exam_date=TUE + timedelta(days=20)), TUE)
    assert "L-SPELL" not in [b.activity_code for b in close]


@pytest.mark.parametrize(
    ("weekdays", "expected"),
    [({6}, {6}), ({6, 1}, {1}), ({6, 0, 2}, {0}), ({6, 0, 1, 2, 3}, {0, 2})],
)
def test_spelling_days_for_short_weeks(weekdays: set[int], expected: set[int]) -> None:
    i = inputs(exam_date=None, weekdays=frozenset(weekdays))
    assert planner.spelling_weekdays(i) == frozenset(expected)


def test_restart_plan_counts_hours_from_now(client: TestClient) -> None:
    # no level recorded, so every earlier session counts until the restart
    client.put("/api/v1/profile", json={**VALID_PROFILE, "study_days_per_week": 7})
    today = date.today()
    start = datetime.now(UTC) - timedelta(minutes=50)
    client.post("/api/v1/sessions/manual",
                json={"skill": "reading", "started_at": start.isoformat(), "minutes": 40})
    before = client.get("/api/v1/plan/summary", params={"today": today.isoformat()}).json()
    assert before["hours_done"] == pytest.approx(40 / 60, abs=0.01)
    assert before["last_study_at"] is not None
    tasks = client.get("/api/v1/plan/day", params={"date": today.isoformat()}).json()["tasks"]
    client.post(f"/api/v1/plan/tasks/{tasks[0]['id']}/skip", json={"reason": "tired"})

    new_exam = (today + timedelta(days=90)).isoformat()
    res = client.post(
        "/api/v1/plan/restart",
        json={"today": today.isoformat(), "exam_date": new_exam, "study_minutes_per_day": 120},
    )
    assert res.status_code == 200, res.text
    assert res.json()["hours_done"] == 0
    profile = client.get("/api/v1/profile").json()
    assert profile["exam_date"] == new_exam and profile["study_minutes_per_day"] == 120
    settings = client.get("/api/v1/settings").json()
    assert settings["plan_start"] == today.isoformat()
    after = client.get("/api/v1/plan/summary", params={"today": today.isoformat()}).json()
    assert after["plan_restarted_at"] is not None
    # today's tasks are generated again, all pending
    fresh = client.get("/api/v1/plan/day", params={"date": today.isoformat()}).json()["tasks"]
    assert fresh and all(t["status"] == "pending" for t in fresh)
    # the session history is kept
    assert len(client.get("/api/v1/sessions").json()) == 1


def test_restart_plan_validation(client: TestClient) -> None:
    today = date.today().isoformat()
    assert client.post("/api/v1/plan/restart", json={"today": today}).status_code == 404
    _setup(client)
    assert client.post("/api/v1/plan/restart",
                       json={"today": today, "exam_date": today}).status_code == 422
    assert client.post("/api/v1/plan/restart",
                       json={"today": today, "study_minutes_per_day": 45}).status_code == 422
    # exam date left out -> kept
    exam = client.get("/api/v1/profile").json()["exam_date"]
    assert client.post("/api/v1/plan/restart", json={"today": today}).status_code == 200
    assert client.get("/api/v1/profile").json()["exam_date"] == exam


def test_interlude_setting_defaults_to_a_minute(client: TestClient) -> None:
    _setup(client)
    assert client.get("/api/v1/settings").json()["interlude_seconds"] == 60
    res = client.put("/api/v1/settings", json={"interlude_seconds": 0})
    assert res.json()["interlude_seconds"] == 0
    assert client.put("/api/v1/settings", json={"interlude_seconds": 999}).status_code == 422


def test_self_logged_time_counts_toward_a_task(client: TestClient) -> None:
    client.put("/api/v1/profile", json={**VALID_PROFILE, "study_days_per_week": 7})
    today = date.today().isoformat()
    task = client.get("/api/v1/plan/day", params={"date": today}).json()["tasks"][0]
    client.post(f"/api/v1/plan/tasks/{task['id']}/start")
    client.post(f"/api/v1/plan/tasks/{task['id']}/done")
    start = datetime.now(UTC) - timedelta(minutes=task["planned_minutes"])
    res = client.post(
        "/api/v1/sessions/manual",
        json={
            "skill": task["skill"],
            "started_at": start.isoformat(),
            "minutes": task["planned_minutes"],
            "plan_task_id": task["id"],
        },
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["origin"] == "manual" and body["plan_task_id"] == task["id"]
    assert body["resource_id"] == task["resource_id"]
    day = client.get("/api/v1/plan/day", params={"date": today}).json()["tasks"]
    assert day[0]["done_minutes"] == pytest.approx(task["planned_minutes"])
    summary = client.get("/api/v1/plan/summary", params={"today": today}).json()
    assert summary["hours_done"] == pytest.approx(task["planned_minutes"] / 60, abs=0.01)
    missing = client.post(
        "/api/v1/sessions/manual",
        json={"skill": "reading", "started_at": start.isoformat(), "minutes": 5,
              "plan_task_id": 99999},
    )
    assert missing.status_code == 404
