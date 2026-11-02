"""FastAPI application factory."""

from collections.abc import Callable
from datetime import UTC, datetime

from fastapi import FastAPI
from pydantic import BaseModel, Field
from sqlalchemy import Engine
from sqlalchemy.orm import sessionmaker

from app import __version__
from app.config import Settings
from app.db import make_engine
from app.migrate import upgrade_to_head
from app.models import SpikeKV
from app.security import LocalGuardMiddleware

SPIKE_KEY = "spike"


class ValueIn(BaseModel):
    value: str = Field(max_length=2000)


class ValueOut(BaseModel):
    value: str | None
    updated_at: datetime | None


def create_app(settings: Settings, engine: Engine | None = None) -> FastAPI:
    engine = engine or make_engine(settings.db_path)
    schema_revision = upgrade_to_head(engine)
    session_factory = sessionmaker(engine, expire_on_commit=False)

    app = FastAPI(
        title="IELTS Pilot backend",
        version=__version__,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.add_middleware(LocalGuardMiddleware, token=settings.token, port=settings.port)

    # Replaced by the server with a callable that stops uvicorn.
    request_shutdown: list[Callable[[], None]] = [lambda: None]
    app.state.set_shutdown_handler = lambda fn: request_shutdown.__setitem__(0, fn)

    @app.get("/api/v1/health")
    def health() -> dict:
        return {
            "status": "ok",
            "version": __version__,
            "schema_revision": schema_revision,
            "data_dir": str(settings.data_dir),
        }

    @app.post("/api/v1/shutdown")
    def shutdown() -> dict:
        request_shutdown[0]()
        return {"status": "stopping"}

    @app.get("/api/v1/spike/value", response_model=ValueOut)
    def get_value() -> ValueOut:
        with session_factory() as session:
            row = session.get(SpikeKV, SPIKE_KEY)
            if row is None:
                return ValueOut(value=None, updated_at=None)
            return ValueOut(value=row.value, updated_at=row.updated_at)

    @app.put("/api/v1/spike/value", response_model=ValueOut)
    def put_value(body: ValueIn) -> ValueOut:
        now = datetime.now(UTC)
        with session_factory.begin() as session:
            row = session.get(SpikeKV, SPIKE_KEY)
            if row is None:
                session.add(SpikeKV(key=SPIKE_KEY, value=body.value, updated_at=now))
            else:
                row.value = body.value
                row.updated_at = now
        return ValueOut(value=body.value, updated_at=now)

    return app
