"""Backups, restore and delete-all (PRD F12, docs/DATABASE.md §6).

* A backup is one zip: manifest.json + data/ielts_pilot.db + recordings/ + library/.
* The database copy is made with SQLite's online backup API, so it is consistent
  while the app runs; restore uses the same API to copy *into* the live database,
  which avoids replacing a file that Windows may still have open.
* Destructive operations (restore, delete-all, schema migration) always write a
  safety backup first. Only the newest KEEP_AUTO automatic backups are kept;
  manual and imported backups are never deleted automatically.
"""

import hashlib
import json
import re
import shutil
import sqlite3
import tempfile
import threading
import zipfile
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from typing import Any

from sqlalchemy import Engine

from app.config import MIN_FREE_BYTES, Settings
from app.db import Base
from app.migrate import current_revision, is_known_revision, upgrade_to_head

MANIFEST = "manifest.json"
DB_ARCNAME = "data/ielts_pilot.db"
FORMAT = 1
AUTO_KINDS = ("pre-migration", "pre-restore", "pre-delete")
KINDS = ("manual", *AUTO_KINDS)
KEEP_AUTO = 10
NAME_RE = re.compile(r"^ielts-pilot-[A-Za-z0-9._-]+\.zip$")
AUTO_NAME_RE = re.compile(r"-(pre-migration|pre-restore|pre-delete)(-\d+)?\.zip$")
ALLOWED_PREFIXES = ("data/", "recordings/", "library/")

_lock = threading.RLock()


class BackupError(Exception):
    def __init__(self, code: str, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _sqlite_copy(src: Path, dst: Path) -> None:
    source = sqlite3.connect(src)
    target = sqlite3.connect(dst)
    try:
        source.backup(target)
    finally:
        target.close()
        source.close()


def free_bytes(path: Path) -> int:
    path.mkdir(parents=True, exist_ok=True)
    return shutil.disk_usage(path).free


def _unique_name(directory: Path, kind: str) -> str:
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    base = f"ielts-pilot-{stamp}-{kind}"
    name, n = f"{base}.zip", 2
    while (directory / name).exists():
        name, n = f"{base}-{n}.zip", n + 1
    return name


def _user_files(settings: Settings) -> list[tuple[str, Path]]:
    files: list[tuple[str, Path]] = []
    folders = ((settings.recordings_dir, "recordings"), (settings.library_dir, "library"))
    for folder, prefix in folders:
        if folder.exists():
            for item in sorted(folder.rglob("*")):
                if item.is_file():
                    files.append((f"{prefix}/{item.relative_to(folder).as_posix()}", item))
    return files


def create_backup(
    settings: Settings, kind: str, schema_revision: str | None, app_version: str
) -> Path:
    if kind not in KINDS:
        raise ValueError(f"unknown backup kind: {kind}")
    backups = settings.backups_dir
    if free_bytes(backups) < MIN_FREE_BYTES:
        raise BackupError(
            "low_disk",
            f"Less than {MIN_FREE_BYTES // (1024 * 1024)} MB free on the disk; "
            "free some space and try again.",
            507,
        )
    with _lock, tempfile.TemporaryDirectory(dir=backups) as tmp:
        entries: list[tuple[str, Path]] = []
        if settings.db_path.exists():
            db_copy = Path(tmp) / "ielts_pilot.db"
            _sqlite_copy(settings.db_path, db_copy)
            entries.append((DB_ARCNAME, db_copy))
        entries.extend(_user_files(settings))

        manifest = {
            "format": FORMAT,
            "kind": kind,
            "app_version": app_version,
            "schema_revision": schema_revision,
            "created_at": datetime.now(UTC).isoformat(),
            "files": [
                {"path": arc, "sha256": _sha256(path), "size": path.stat().st_size}
                for arc, path in entries
            ],
        }
        final = backups / _unique_name(backups, kind)
        partial = final.with_name(final.name + ".partial")
        with zipfile.ZipFile(partial, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(MANIFEST, json.dumps(manifest, indent=2))
            for arc, path in entries:
                zf.write(path, arc)
        partial.replace(final)
    if kind in AUTO_KINDS:
        _prune_auto(backups)
    return final


def _prune_auto(backups: Path) -> None:
    auto = sorted(
        (p for p in backups.glob("ielts-pilot-*.zip") if AUTO_NAME_RE.search(p.name)),
        key=lambda p: p.name,
        reverse=True,
    )
    for old in auto[KEEP_AUTO:]:
        old.unlink(missing_ok=True)


def _safe_arcname(name: str) -> bool:
    path = PurePosixPath(name)
    return (
        not path.is_absolute()
        and ".." not in path.parts
        and "\\" not in name
        and name.startswith(ALLOWED_PREFIXES)
    )


def _read_manifest(zf: zipfile.ZipFile) -> dict[str, Any]:
    try:
        manifest = json.loads(zf.read(MANIFEST))
    except KeyError as exc:
        raise BackupError("invalid_backup", "manifest.json is missing") from exc
    except json.JSONDecodeError as exc:
        raise BackupError("invalid_backup", "manifest.json is not valid JSON") from exc
    if manifest.get("format") != FORMAT or not isinstance(manifest.get("files"), list):
        raise BackupError("invalid_backup", "unsupported backup format")
    for entry in manifest["files"]:
        if not _safe_arcname(str(entry.get("path", ""))):
            raise BackupError("invalid_backup", f"unsafe path in backup: {entry.get('path')}")
    return manifest


def verify(path: Path) -> dict[str, Any]:
    """Full check: manifest, safe paths, and every file's checksum."""
    try:
        with zipfile.ZipFile(path) as zf:
            manifest = _read_manifest(zf)
            for entry in manifest["files"]:
                digest = hashlib.sha256()
                with zf.open(entry["path"]) as fh:
                    for chunk in iter(lambda: fh.read(1 << 20), b""):
                        digest.update(chunk)
                if digest.hexdigest() != entry["sha256"]:
                    raise BackupError("invalid_backup", f"checksum mismatch: {entry['path']}")
            return manifest
    except zipfile.BadZipFile as exc:
        raise BackupError("invalid_backup", "not a valid zip file") from exc
    except KeyError as exc:
        raise BackupError("invalid_backup", f"file listed in manifest is missing: {exc}") from exc


def resolve(settings: Settings, name: str) -> Path:
    if not NAME_RE.match(name):
        raise BackupError("bad_name", "invalid backup name")
    path = (settings.backups_dir / name).resolve()
    if path.parent != settings.backups_dir.resolve():
        raise BackupError("bad_name", "invalid backup name")
    if not path.is_file():
        raise BackupError("not_found", "backup not found", 404)
    return path


def list_backups(settings: Settings) -> list[dict[str, Any]]:
    backups = settings.backups_dir
    if not backups.exists():
        return []
    items = []
    for path in sorted(backups.glob("ielts-pilot-*.zip"), key=lambda p: p.name, reverse=True):
        if not NAME_RE.match(path.name):
            continue
        info: dict[str, Any] = {
            "name": path.name,
            "size_bytes": path.stat().st_size,
            "kind": None,
            "created_at": None,
            "app_version": None,
            "schema_revision": None,
            "valid": True,
            "problem": None,
        }
        try:
            with zipfile.ZipFile(path) as zf:
                manifest = _read_manifest(zf)
            info.update(
                kind=manifest.get("kind"),
                created_at=manifest.get("created_at"),
                app_version=manifest.get("app_version"),
                schema_revision=manifest.get("schema_revision"),
            )
        except (BackupError, zipfile.BadZipFile) as exc:
            info.update(valid=False, problem=getattr(exc, "message", "not a valid zip file"))
        items.append(info)
    return items


def delete_backup(settings: Settings, name: str) -> None:
    with _lock:
        resolve(settings, name).unlink()


def _replace_folder(folder: Path, zf: zipfile.ZipFile, prefix: str, names: list[str]) -> None:
    if folder.exists():
        shutil.rmtree(folder)
    root = folder.resolve()
    for name in names:
        if not name.startswith(prefix + "/"):
            continue
        target = (folder / name[len(prefix) + 1 :]).resolve()
        if root not in target.parents:
            raise BackupError("invalid_backup", f"unsafe path in backup: {name}")
        target.parent.mkdir(parents=True, exist_ok=True)
        with zf.open(name) as src, target.open("wb") as dst:
            shutil.copyfileobj(src, dst)


def _clear_tables(engine: Engine) -> None:
    with engine.begin() as connection:
        for table in reversed(Base.metadata.sorted_tables):
            connection.execute(table.delete())


def restore(settings: Settings, engine: Engine, name: str, app_version: str) -> tuple[str, str]:
    with _lock:
        path = resolve(settings, name)
        manifest = verify(path)
        if not is_known_revision(manifest.get("schema_revision")):
            raise BackupError(
                "newer_backup",
                "This backup was made by a newer version of IELTS Pilot; update the app first.",
                409,
            )
        safety = create_backup(settings, "pre-restore", current_revision(engine), app_version)
        names = [entry["path"] for entry in manifest["files"]]
        engine.dispose()
        with zipfile.ZipFile(path) as zf, tempfile.TemporaryDirectory(dir=settings.data_dir) as tmp:
            if DB_ARCNAME in names:
                extracted = Path(tmp) / "restore.db"
                with zf.open(DB_ARCNAME) as src, extracted.open("wb") as dst:
                    shutil.copyfileobj(src, dst)
                _sqlite_copy(extracted, settings.db_path)
            else:
                _clear_tables(engine)
            _replace_folder(settings.recordings_dir, zf, "recordings", names)
            _replace_folder(settings.library_dir, zf, "library", names)
        upgrade_to_head(engine)
        return path.name, safety.name


def delete_all(settings: Settings, engine: Engine, app_version: str) -> str:
    with _lock:
        safety = create_backup(settings, "pre-delete", current_revision(engine), app_version)
        _clear_tables(engine)
        for folder in (settings.recordings_dir, settings.library_dir):
            if folder.exists():
                shutil.rmtree(folder)
        return safety.name
