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
from app.api import data, placements, profile, resources, sessions
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
                raise StartupError(
                    f"The database (schema {current}) was created by a newer version of "
                    "IELTS Pilot. Install the newer version, or restore an older backup."
                )
            path = backup.create_backup(settings, "pre-migration", current, __version__)
            log.info("pre-migration backup %s (%s -> %s)", path.name, current, head)
    return upgrade_to_head(engine)


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

    for module in (data, profile, placements, resources, sessions):
        app.include_router(module.router)
    return app
