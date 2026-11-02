import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import __version__
from app.config import Settings
from app.migrate import head_revision
from tests.conftest import PORT, TOKEN, make_client


def test_health_ok_and_migrated(client: TestClient, tmp_path: Path) -> None:
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["schema_revision"] == head_revision()
    assert (tmp_path / "data" / "ielts_pilot.db").exists()


def test_missing_token_rejected(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    client.headers.pop("X-IP-Token")
    assert client.get("/api/v1/health").status_code == 401


def test_wrong_token_rejected(client: TestClient) -> None:
    res = client.get("/api/v1/health", headers={"X-IP-Token": "x" * 64})
    assert res.status_code == 401


def test_foreign_host_rejected(tmp_path: Path) -> None:
    client = make_client(tmp_path, host=f"localhost:{PORT}")
    assert client.get("/api/v1/health").status_code == 400


def test_browser_origin_rejected(client: TestClient) -> None:
    res = client.get("/api/v1/health", headers={"Origin": "https://example.com"})
    assert res.status_code == 403


def test_system_info(client: TestClient, tmp_path: Path) -> None:
    body = client.get("/api/v1/system").json()
    assert body["data_dir"] == str(tmp_path)
    assert body["db_size_bytes"] > 0
    assert body["free_bytes"] > 0
    assert isinstance(body["low_disk"], bool)


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


def test_backend_and_desktop_versions_match() -> None:
    package = Path(__file__).resolve().parents[2] / "desktop" / "package.json"
    assert json.loads(package.read_text(encoding="utf-8"))["version"] == __version__


def test_watchdog_fires_when_parent_exits() -> None:
    import subprocess
    import sys
    import threading

    from app.watchdog import watch_parent

    child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(0.5)"])
    fired = threading.Event()
    # On POSIX the watchdog also checks os.getppid(); watch a non-parent PID here,
    # so only the liveness poll matters.
    import app.watchdog as wd

    original = wd.os.getppid
    wd.os.getppid = lambda: child.pid  # type: ignore[assignment]
    try:
        watch_parent(fired.set, pid=child.pid)
        child.wait()
        assert fired.wait(timeout=5)
    finally:
        wd.os.getppid = original  # type: ignore[assignment]
