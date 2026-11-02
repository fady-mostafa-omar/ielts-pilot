from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

PORT = 54321
TOKEN = "t" * 64
AUTH = {"X-IP-Token": TOKEN}


def make_client(data_dir: Path, host: str = f"127.0.0.1:{PORT}") -> TestClient:
    settings = Settings(port=PORT, token=TOKEN, data_dir=data_dir)
    return TestClient(create_app(settings), base_url=f"http://{host}")


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    return make_client(tmp_path)


def test_health_ok_and_migrated(client: TestClient, tmp_path: Path) -> None:
    res = client.get("/api/v1/health", headers=AUTH)
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["schema_revision"] == "0001"
    assert (tmp_path / "data" / "ielts_pilot.db").exists()


def test_missing_token_rejected(client: TestClient) -> None:
    assert client.get("/api/v1/health").status_code == 401


def test_wrong_token_rejected(client: TestClient) -> None:
    res = client.get("/api/v1/health", headers={"X-IP-Token": "x" * 64})
    assert res.status_code == 401


def test_foreign_host_rejected(tmp_path: Path) -> None:
    client = make_client(tmp_path, host=f"localhost:{PORT}")
    assert client.get("/api/v1/health", headers=AUTH).status_code == 400


def test_browser_origin_rejected(client: TestClient) -> None:
    res = client.get("/api/v1/health", headers={**AUTH, "Origin": "https://example.com"})
    assert res.status_code == 403


def test_value_starts_empty(client: TestClient) -> None:
    assert client.get("/api/v1/spike/value", headers=AUTH).json()["value"] is None


def test_value_persists_across_restart(tmp_path: Path) -> None:
    first = make_client(tmp_path)
    res = first.put("/api/v1/spike/value", json={"value": "مرحبا"}, headers=AUTH)
    assert res.status_code == 200
    second = make_client(tmp_path)  # new app instance, same data dir = app restart
    assert second.get("/api/v1/spike/value", headers=AUTH).json()["value"] == "مرحبا"


def test_value_too_long_rejected(client: TestClient) -> None:
    res = client.put("/api/v1/spike/value", json={"value": "x" * 2001}, headers=AUTH)
    assert res.status_code == 422


def test_settings_from_env_validation(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("IP_PORT", "80")
    monkeypatch.setenv("IP_TOKEN", TOKEN)
    monkeypatch.setenv("IP_DATA_DIR", str(tmp_path))
    with pytest.raises(ValueError, match="between"):
        Settings.from_env()
    monkeypatch.setenv("IP_PORT", str(PORT))
    monkeypatch.setenv("IP_TOKEN", "short")
    with pytest.raises(ValueError, match="at least 32"):
        Settings.from_env()
    monkeypatch.delenv("IP_DATA_DIR")
    with pytest.raises(ValueError, match="Missing"):
        Settings.from_env()
