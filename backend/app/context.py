"""Per-app state shared by the routers."""

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import Engine
from sqlalchemy.orm import sessionmaker

from app.config import Settings


@dataclass
class AppContext:
    settings: Settings
    engine: Engine
    session_factory: sessionmaker
    schema_revision: str | None
    request_shutdown: Callable[[], None] = field(default=lambda: None)


def get_ctx(request: Request) -> AppContext:
    return request.app.state.ctx


Ctx = Annotated[AppContext, Depends(get_ctx)]
