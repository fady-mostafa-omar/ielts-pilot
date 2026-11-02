import json
import zipfile
from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import backup
from tests.conftest import VALID_PROFILE


def _name(client: TestClient) -> str:
    client.put("/api/v1/profile", json={**VALID_PROFILE, "display_name": "A"})
    res = client.post("/api/v1/backups")
    assert res.status_code == 200, res.text
    return res.json()["name"]


def test_backup_contains_manifest_db_and_files(client: TestClient, tmp_path: Path) -> None:
    rec = tmp_path / "recordings" / "2026" / "11" / "a.webm"
    rec.parent.mkdir(parents=True)
    rec.write_bytes(b"audio")
    name = _name(client)
    path = tmp_path / "backups" / name
    manifest = backup.verify(path)
    paths = {f["path"] for f in manifest["files"]}
    assert paths == {"data/ielts_pilot.db", "recordings/2026/11/a.webm"}
    assert manifest["kind"] == "manual"
    listed = client.get("/api/v1/backups").json()
    assert listed[0]["name"] == name and listed[0]["valid"] is True


def test_restore_brings_back_previous_state(client: TestClient, tmp_path: Path) -> None:
    rec = tmp_path / "recordings" / "r.webm"
    rec.parent.mkdir(parents=True)
    rec.write_bytes(b"one")
    name = _name(client)  # profile "A" + r.webm
    client.put("/api/v1/profile", json={**VALID_PROFILE, "display_name": "B"})
    rec.write_bytes(b"two")
    (tmp_path / "recordings" / "extra.webm").write_bytes(b"x")

    res = client.post(f"/api/v1/backups/{name}/restore")
    assert res.status_code == 200, res.text
    assert res.json()["safety_backup"].endswith("-pre-restore.zip")
    assert client.get("/api/v1/profile").json()["display_name"] == "A"
    assert rec.read_bytes() == b"one"
    assert not (tmp_path / "recordings" / "extra.webm").exists()


def test_restore_survives_restart(
    client: TestClient, new_client: Callable[[], TestClient]
) -> None:
    name = _name(client)
    client.put("/api/v1/profile", json={**VALID_PROFILE, "display_name": "B"})
    client.post(f"/api/v1/backups/{name}/restore")
    assert new_client().get("/api/v1/profile").json()["display_name"] == "A"


def test_tampered_backup_rejected(client: TestClient, tmp_path: Path) -> None:
    name = _name(client)
    src = tmp_path / "backups" / name
    bad = tmp_path / "backups" / "ielts-pilot-tampered.zip"
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(bad, "w") as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == "data/ielts_pilot.db":
                data = data[:100] + bytes([data[100] ^ 0xFF]) + data[101:]
            zout.writestr(item, data)
    res = client.post("/api/v1/backups/ielts-pilot-tampered.zip/restore")
    assert res.status_code == 400
    assert res.json()["detail"]["error"] == "invalid_backup"


def test_newer_schema_backup_refused(client: TestClient, tmp_path: Path) -> None:
    name = _name(client)
    src = tmp_path / "backups" / name
    newer = tmp_path / "backups" / "ielts-pilot-newer.zip"
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(newer, "w") as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == "manifest.json":
                manifest = json.loads(data)
                manifest["schema_revision"] = "9999"
                data = json.dumps(manifest).encode()
            zout.writestr(item, data)
    res = client.post("/api/v1/backups/ielts-pilot-newer.zip/restore")
    assert res.status_code == 409
    assert res.json()["detail"]["error"] == "newer_backup"


def test_zip_slip_rejected(client: TestClient, tmp_path: Path) -> None:
    evil = tmp_path / "backups" / "ielts-pilot-evil.zip"
    evil.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(evil, "w") as zf:
        zf.writestr(
            "manifest.json",
            json.dumps(
                {
                    "format": 1,
                    "kind": "manual",
                    "schema_revision": None,
                    "files": [{"path": "recordings/../../escape.txt", "sha256": "x", "size": 1}],
                }
            ),
        )
        zf.writestr("recordings/../../escape.txt", "x")
    res = client.post("/api/v1/backups/ielts-pilot-evil.zip/restore")
    assert res.status_code == 400
    assert not (tmp_path.parent / "escape.txt").exists()


@pytest.mark.parametrize("name", ["../x.zip", "notours.zip", "ielts-pilot-a.zip.partial"])
def test_bad_names_rejected(client: TestClient, name: str) -> None:
    res = client.post(f"/api/v1/backups/{name}/restore")
    assert res.status_code in (400, 404)


def test_low_disk_refuses_backup(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(backup, "free_bytes", lambda _path: 10 * 1024 * 1024)
    res = client.post("/api/v1/backups")
    assert res.status_code == 507
    assert res.json()["detail"]["error"] == "low_disk"


def test_auto_backups_are_pruned_but_manual_kept(tmp_path: Path) -> None:
    from tests.conftest import settings_for

    settings = settings_for(tmp_path)
    settings.backups_dir.mkdir(parents=True)
    manual = settings.backups_dir / "ielts-pilot-20200101-000000-manual.zip"
    manual.write_bytes(b"")
    for i in range(backup.KEEP_AUTO + 3):
        name = f"ielts-pilot-20200101-0000{i:02d}-pre-restore.zip"
        (settings.backups_dir / name).write_bytes(b"")
    backup._prune_auto(settings.backups_dir)
    autos = list(settings.backups_dir.glob("*-pre-restore.zip"))
    assert len(autos) == backup.KEEP_AUTO
    assert manual.exists()
    assert not (settings.backups_dir / "ielts-pilot-20200101-000000-pre-restore.zip").exists()


def test_delete_all_requires_confirmation(client: TestClient) -> None:
    client.put("/api/v1/profile", json=VALID_PROFILE)
    assert client.post("/api/v1/data/delete-all", json={"confirm": "yes"}).status_code == 422
    assert client.get("/api/v1/profile").status_code == 200


def test_delete_all_wipes_data_after_safety_backup(client: TestClient, tmp_path: Path) -> None:
    client.put("/api/v1/profile", json=VALID_PROFILE)
    (tmp_path / "library").mkdir()
    (tmp_path / "library" / "book.pdf").write_bytes(b"pdf")
    res = client.post("/api/v1/data/delete-all", json={"confirm": "DELETE"})
    assert res.status_code == 200, res.text
    safety = res.json()["safety_backup"]
    assert safety.endswith("-pre-delete.zip")
    assert client.get("/api/v1/profile").status_code == 404
    assert not (tmp_path / "library").exists()
    # the safety backup can bring everything back
    client.post(f"/api/v1/backups/{safety}/restore")
    assert client.get("/api/v1/profile").status_code == 200
    assert (tmp_path / "library" / "book.pdf").read_bytes() == b"pdf"
