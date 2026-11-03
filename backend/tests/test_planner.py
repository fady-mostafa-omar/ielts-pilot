"""Planner-4 rules (docs/CURRICULUM.md §4b, §4a) and the plan API."""

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



def test_no_biweekly_mock_close_to_the_exam() -> None:
    i = inputs(exam_date=date(2026, 11, 20))
    assert day_kind(i, date(2026, 11, 12)) == "study"


# --------------------------------------------------------------------- day blocks






def test_short_days_merge_tiny_blocks() -> None:
    _, blocks = day_blocks(inputs(exam_date=None, daily_minutes=30), TUE)
    assert all(b.minutes >= planner.MIN_BLOCK for b in blocks)
    assert sum(b.minutes for b in blocks) == 30



def test_mock_and_review_blocks() -> None:
    i = inputs()
    kind, blocks = day_blocks(i, date(2026, 12, 30))
    assert kind == "final_mock" and blocks[0].activity_code == "MOCK"
    assert blocks[0].minutes == planner.MOCK_MINUTES
    kind, blocks = day_blocks(i, date(2027, 1, 1))
    assert kind == "review" and blocks[0].minutes <= planner.REVIEW_MAX_MINUTES



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


# ------------------------------------------------------------------ planner-4

SAT = date(2026, 11, 7)  # a Saturday: weeks start on Saturday
EXAM12 = date(2027, 1, 30)  # last study day 2027-01-25 -> 12 study weeks from SAT


def p4(**over) -> PlanInputs:
    base = {"today": SAT, "plan_start": SAT, "exam_date": EXAM12}
    base.update(over)
    return inputs(**base)


def week(i: int, offset: int = 0) -> date:
    return SAT + timedelta(days=7 * i + offset)


def codes(blocks) -> list[str]:
    return [b.activity_code for b in blocks]


def test_development_hour_is_30_20_5_5() -> None:
    assert planner.dev_minutes(180) == {"listening": 30, "reading": 20, "writing": 5,
                                        "speaking": 5}
    assert planner.dev_minutes(600) == planner.dev_minutes(180)
    assert planner.dev_minutes(60) == {"listening": 20, "reading": 10, "writing": 0,
                                       "speaking": 0}


def test_twelve_weeks_follow_dalilks_order() -> None:
    plan = planner.week_plan(p4())
    assert plan["weeks"] == 12 and plan["notes"] == []
    assert [t for t, _ in plan["sequence"]] == [
        "devL", "devL", "devR", "devR", "listening", "reading", "writing", "speaking",
        "listening", "reading", "writing", "speaking",
    ]
    assert [r for _, r in plan["sequence"]][4:] == [1, 1, 1, 1, 2, 2, 2, 2]
    # more weeks -> more development, two weeks at a time
    longer = planner.week_plan(p4(exam_date=EXAM12 + timedelta(days=28)))
    assert [t for t, _ in longer["sequence"][:8]] == [
        "devL", "devL", "devR", "devR", "devL", "devL", "devR", "devR"]


def test_short_plans_say_what_was_cut() -> None:
    six = planner.week_plan(p4(exam_date=SAT + timedelta(days=45)))
    assert "no_consolidation" in six["notes"] and "short_plan" in six["notes"]
    assert [t for t, _ in six["sequence"]][-4:] == list(planner.EXAM_ROUND)
    tiny = p4(exam_date=SAT + timedelta(days=20))
    assert "squeezed" in planner.week_plan(tiny)["notes"]
    seen = {planner.week_info(tiny, SAT + timedelta(days=i))[0] for i in range(16)}
    assert seen == {"L", "R", "W", "S"}


def test_no_two_weekly_mock_any_more() -> None:
    i = p4()
    kinds = {day_kind(i, SAT + timedelta(days=n)) for n in range(70)}
    assert "mock" not in kinds


def test_listening_development_week() -> None:
    kind, blocks = day_blocks(p4(), week(0))
    assert kind == "study"
    assert sum(b.minutes for b in blocks) == 180
    assert codes(blocks)[:2] == ["T-VID", "L-EXT"]  # day 0: "how to listen" first
    assert blocks[0].content == {"kind": "videos", "groups": ["dev"], "skills": ["L"],
                                 "minutes": 10}
    assert blocks[1].content == {"kind": "podcast", "feed": "dalilk_ielts"}
    # development hour last (its podcast time joins the focus podcast task), with the
    # daily-phrases video in development weeks
    assert codes(blocks)[2:] == ["R-EXT", "W-DEV", "S-PHRASE"]
    assert blocks[-1].content["groups"] == ["phrases"]
    _, later = day_blocks(p4(), week(0, 2))  # Monday: no intro video
    assert codes(later)[0] == "L-EXT" and later[0].minutes > 60


def test_reading_development_week_uses_novels_at_level() -> None:
    _, blocks = day_blocks(p4(), week(2))
    assert codes(blocks)[:2] == ["T-VID", "R-EXT"]
    assert blocks[1].content == {"kind": "novel", "level": "intermediate"}
    low = p4(current=dict.fromkeys(SKILLS, 4.5))
    _, easy = day_blocks(low, week(2, 2))
    assert easy[0].content == {"kind": "novel", "level": "beginner"}
    assert [b.content for b in easy if b.activity_code == "L-EXT"][0]["feed"] == "dalilk_english"


def test_listening_exam_week_techniques_then_tests() -> None:
    _, tech = day_blocks(p4(), week(4))
    assert codes(tech)[0] == "T-VID"
    assert tech[0].content["groups"] == ["core", "computer", "high"]  # target 7.0
    assert tech[0].content["skills"] == ["L"]
    _, paper = day_blocks(p4(exam_format="paper"), week(4))
    assert "paper" in paper[0].content["groups"]
    _, practice = day_blocks(p4(), week(4, 2))
    assert practice[0].activity_code == "P-TEST"
    assert practice[0].content["providers"] == ["ieltsonlinetests"]
    assert practice[0].content["count"] == 120 // 40
    _, round2 = day_blocks(p4(), week(8, 2))
    assert round2[0].content["providers"] == ["engnovate", "ieltsonlinetests"]
    # no spelling or phrases outside development weeks
    assert "L-SPELL" not in codes(practice) and "S-PHRASE" not in codes(practice)


def test_writing_week_task1_then_task2_then_a_test() -> None:
    days = [day_blocks(p4(), week(6, i))[1] for i in (0, 1, 2, 3, 4, 5)]
    assert days[0][0].content["skills"] == ["W1"]
    assert days[1][0].activity_code == "W-T1" and days[1][0].content["count"] == 120 // 30
    assert days[3][0].content["skills"] == ["W2"]
    assert days[4][0].activity_code == "W-T2"
    assert days[5][0].activity_code == "P-TEST" and days[5][0].content["skills"] == ["writing"]


def test_speaking_week() -> None:
    _, first = day_blocks(p4(), week(7))
    assert first[0].content["skills"] == ["S"]
    _, later = day_blocks(p4(), week(7, 1))
    assert codes(later)[:2] == ["S-PRAC", "P-VID"]


def test_final_days_use_dalilk_mocks_and_the_official_test() -> None:
    i = p4()
    _, first = day_blocks(i, EXAM12 - timedelta(days=4))
    assert first[0].content["providers"] == ["britishcouncil", "dalilk"]
    _, second = day_blocks(i, EXAM12 - timedelta(days=3))
    assert second[0].content["providers"] == ["dalilk"]
    _, paper = day_blocks(p4(exam_format="paper"), EXAM12 - timedelta(days=4))
    assert paper[0].content["providers"] == ["dalilk"]
    kind, review = day_blocks(i, EXAM12 - timedelta(days=1))
    assert kind == "review" and review[0].content["review"] is True


def test_spelling_only_in_development_weeks() -> None:
    i = p4()
    assert planner.spelling_weekdays(i) == frozenset({0, 2})
    _, sunday = day_blocks(i, week(0, 1))
    assert "L-SPELL" in codes(sunday)
    spell = [b for b in sunday if b.activity_code == "L-SPELL"][0]
    assert spell.minutes == planner.SPELL_MINUTES
    assert "الأحد" in spell.reason and "التلات" in spell.reason
    _, exam_sunday = day_blocks(i, week(4, 1))
    assert "L-SPELL" not in codes(exam_sunday)


def test_english_texts() -> None:
    _, blocks = day_blocks(p4(lang="en"), week(4))
    assert blocks[0].title == "Listening technique videos"
    _, dev = day_blocks(p4(lang="en"), week(0, 2))
    assert dev[0].title == "Listening hours"


def test_content_totals_count_the_plan() -> None:
    totals = planner.content_minutes(p4())
    assert totals["days"] > 60
    assert totals["podcast"] > 0 and totals["novel"] > 0 and totals["video"] > 0
    assert totals["tests"] > 0 and totals["writing_t1"] > 0 and totals["writing_t2"] > 0
    assert totals["full_tests"] == 3
    assert totals["phrase_videos"] > 0


def test_summary_has_week_plan_and_content(client: TestClient) -> None:
    _setup(client)
    client.put("/api/v1/settings", json={"exam_format": "paper"})
    data = client.get("/api/v1/plan/summary", params={"today": date.today().isoformat()}).json()
    assert data["exam_format"] == "paper"
    assert data["week_plan"]["sequence"]
    assert {"episodes", "novels", "videos", "video_hours", "tests", "writing_t1"} <= set(
        data["content"])
    day = client.get("/api/v1/plan/day", params={"date": date.today().isoformat()}).json()
    assert any(t["content"] for t in day["tasks"])


def test_long_days_are_capped_and_spill_into_input() -> None:
    long = p4(daily_minutes=630)
    _, tests_day = day_blocks(long, week(4, 2))
    assert tests_day[0].content["count"] == planner.MAX_TESTS
    assert sum(b.minutes for b in tests_day) == 630
    assert "L-EXT" in codes(tests_day) and "R-EXT" in codes(tests_day)
    _, tech = day_blocks(long, week(4))
    assert tech[0].minutes == planner.MAX_TECH_VIDEO
    _, writing = day_blocks(long, week(6, 1))
    assert writing[0].content["count"] == planner.MAX_WRITING_TASKS
    assert sum(b.minutes for b in writing) == 630
