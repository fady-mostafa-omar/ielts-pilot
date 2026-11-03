"""FastAPI application factory."""

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import Engine
from sqlalchemy.orm import sessionmaker

from app import (
    __version__,
    backup,
    models,  # noqa: F401  (registers tables)
)
from app.api import data, placements, plan, podcast, profile, resources, sessions
from app.config import Settings
from app.context import AppContext
from app.db import make_engine
from app.migrate import current_revision, head_revision, is_known_revision, upgrade_to_head
from app.security import LocalGuardMiddleware
from app.startup import prepare_data

log = logging.getLogger("ielts_pilot")


class StartupError(RuntimeError):
    pass


def _migrate(settings: Settings, engine: Engine) -> str | None:
    """Back up an existing database before any schema change, then migrate."""
    db_existed = settings.db_path.exists() and settings.db_path.stat().st_size > 0
    if db_existed:
        current, head = current_revision(engine), head_revision()
        if current != head:
            if not is_known_revision(current):
                if settings.restore_compatible:
                    return _restore_compatible(settings, engine, current)
                raise StartupError(
                    f"[newer_db] The database (schema {current}) was changed by a newer "
                    "version of IELTS Pilot. Install the newer version again, or go back to "
                    "the newest backup this version can read."
                )
            path = backup.create_backup(settings, "pre-migration", current, __version__)
            log.info("pre-migration backup %s (%s -> %s)", path.name, current, head)
    return upgrade_to_head(engine)


def _restore_compatible(settings: Settings, engine: Engine, current: str | None) -> str | None:
    """After a downgrade: restore the newest valid backup this version understands.
    The current (newer) database is kept first as a pre-restore backup."""
    candidates = [
        b
        for b in backup.list_backups(settings)
        if b["valid"] and is_known_revision(b["schema_revision"])
    ]
    candidates.sort(key=lambda b: b["created_at"] or "", reverse=True)
    if not candidates:
        raise StartupError(
            f"[no_compatible_backup] No backup made by this version or an older one was found "
            f"(database schema {current}). Install the newer version again."
        )
    restored, safety = backup.restore(settings, engine, candidates[0]["name"], __version__)
    log.warning("downgrade: restored %s; newer data kept in %s", restored, safety)
    return current_revision(engine)


def create_app(settings: Settings, engine: Engine | None = None) -> FastAPI:
    engine = engine or make_engine(settings.db_path)
    try:
        schema_revision = _migrate(settings, engine)
    except backup.BackupError as exc:
        raise StartupError(
            f"Could not back up before updating the database: {exc.message}"
        ) from exc

    app = FastAPI(
        title="IELTS Pilot backend",
        version=__version__,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.ctx = AppContext(
        settings=settings,
        engine=engine,
        session_factory=sessionmaker(engine, expire_on_commit=False),
        schema_revision=schema_revision,
    )
    prepare_data(app.state.ctx)
    app.add_middleware(LocalGuardMiddleware, token=settings.token, port=settings.port)

    @app.exception_handler(backup.BackupError)
    async def _backup_error(_request: Request, exc: backup.BackupError) -> JSONResponse:
        return JSONResponse(
            {"detail": {"error": exc.code, "message": exc.message}}, status_code=exc.status
        )

    for module in (data, profile, placements, plan, podcast, resources, sessions):
        app.include_router(module.router)
    return app
