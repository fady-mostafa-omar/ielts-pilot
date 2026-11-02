from collections.abc import Callable
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from tests.conftest import VALID_PROFILE


def test_no_profile_before_setup(client: TestClient) -> None:
    res = client.get("/api/v1/profile")
    assert res.status_code == 404
    assert res.json()["detail"]["error"] == "no_profile"


def test_create_profile_defaults_skill_targets_to_overall(client: TestClient) -> None:
    res = client.put("/api/v1/profile", json=VALID_PROFILE)
    assert res.status_code == 200, res.text
    body = res.json()
    for skill in ("listening", "reading", "writing", "speaking"):
        assert body[f"target_{skill}"] == 7.5
    assert body["created_at"].endswith(("Z", "+00:00"))


def test_profile_survives_restart(new_client: Callable[[], TestClient]) -> None:
    new_client().put("/api/v1/profile", json={**VALID_PROFILE, "display_name": "عمرو"})
    assert new_client().get("/api/v1/profile").json()["display_name"] == "عمرو"


def test_update_keeps_created_at(client: TestClient) -> None:
    first = client.put("/api/v1/profile", json=VALID_PROFILE).json()
    second = client.put(
        "/api/v1/profile", json={**VALID_PROFILE, "target_writing": 7.0}
    ).json()
    assert second["created_at"] == first["created_at"]
    assert second["target_writing"] == 7.0


@pytest.mark.parametrize(
    "change",
    [
        {"target_overall": 7.3},  # not a half band
        {"target_overall": 9.5},  # above 9
        {"minimum_per_skill": -0.5},
        {"study_days_per_week": 0},
        {"study_days_per_week": 8},
        {"study_minutes_per_day": 5},
        {"interface_language": "fr"},
        {"target_writing": 6.0},  # below minimum_per_skill 6.5
        {"exam_date": (date.today() - timedelta(days=1)).isoformat()},
        {"display_name": "x" * 61},
        {"unexpected_field": 1},
    ],
)
def test_invalid_profiles_rejected(client: TestClient, change: dict) -> None:
    res = client.put("/api/v1/profile", json={**VALID_PROFILE, **change})
    assert res.status_code == 422, change


def test_exam_date_today_allowed(client: TestClient) -> None:
    res = client.put(
        "/api/v1/profile", json={**VALID_PROFILE, "exam_date": date.today().isoformat()}
    )
    assert res.status_code == 200


def test_skill_levels_current_is_latest(client: TestClient) -> None:
    client.post(
        "/api/v1/skill-levels",
        json={"entries": [{"skill": "reading", "band": 6.0, "source_type": "self_estimate"}]},
    )
    res = client.post(
        "/api/v1/skill-levels",
        json={
            "entries": [
                {
                    "skill": "reading",
                    "band": 6.5,
                    "source_type": "official_practice",
                    "source_note": "Official sample test 1",
                }
            ]
        },
    )
    body = res.json()
    assert body["current"]["reading"]["band"] == 6.5
    assert body["current"]["reading"]["source_type"] == "official_practice"
    assert body["current"]["listening"] is None
    assert len(body["history"]) == 2


@pytest.mark.parametrize(
    "entries",
    [
        [{"skill": "reading", "band": 6.0, "source_type": "official_practice"}],  # note missing
        [{"skill": "reading", "band": 6.2, "source_type": "self_estimate"}],
        [{"skill": "grammar", "band": 6.0, "source_type": "self_estimate"}],
        [
            {"skill": "reading", "band": 6.0, "source_type": "self_estimate"},
            {"skill": "reading", "band": 6.5, "source_type": "self_estimate"},
        ],
        [],
    ],
)
def test_invalid_levels_rejected(client: TestClient, entries: list) -> None:
    assert client.post("/api/v1/skill-levels", json={"entries": entries}).status_code == 422
