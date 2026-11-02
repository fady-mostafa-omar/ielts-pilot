from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

PORT = 54321
TOKEN = "t" * 64
AUTH = {"X-IP-Token": TOKEN}

VALID_PROFILE = {
    "display_name": "Amr",
    "interface_language": "ar",
    "explanation_language": "balanced",
    "target_overall": 7.5,
    "minimum_per_skill": 6.5,
    "study_days_per_week": 6,
    "study_minutes_per_day": 60,
}


def settings_for(data_dir: Path) -> Settings:
    return Settings(port=PORT, token=TOKEN, data_dir=data_dir)


def make_client(data_dir: Path, host: str = f"127.0.0.1:{PORT}") -> TestClient:
    client = TestClient(create_app(settings_for(data_dir)), base_url=f"http://{host}")
    client.headers.update(AUTH)
    return client


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    return make_client(tmp_path)


@pytest.fixture
def new_client(tmp_path: Path) -> Callable[[], TestClient]:
    """Simulates an app restart on the same data directory."""
    return lambda: make_client(tmp_path)
