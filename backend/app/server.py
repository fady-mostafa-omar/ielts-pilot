"""Process entry point: configure logging, build the app, serve on 127.0.0.1 only."""

import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

import uvicorn

from app import __version__
from app.config import Settings
from app.main import StartupError, create_app


def _setup_logging(log_dir: Path) -> None:
    log_dir.mkdir(parents=True, exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    file_handler = RotatingFileHandler(
        log_dir / "backend.log", maxBytes=1_000_000, backupCount=3, encoding="utf-8"
    )
    file_handler.setFormatter(fmt)
    root.addHandler(file_handler)
    if sys.stderr is not None:
        stream_handler = logging.StreamHandler(sys.stderr)
        stream_handler.setFormatter(fmt)
        root.addHandler(stream_handler)


def main() -> None:
    try:
        settings = Settings.from_env()
    except ValueError as exc:
        print(f"ielts_pilot_backend: {exc}", file=sys.stderr)
        sys.exit(2)

    _setup_logging(settings.log_dir)
    log = logging.getLogger("ielts_pilot")
    log.info("starting backend %s on 127.0.0.1:%s", __version__, settings.port)

    try:
        app = create_app(settings)
    except StartupError as exc:
        # One-line reason on stderr; the Electron shell shows it to the user.
        log.error("startup failed: %s", exc)
        print(f"STARTUP_ERROR: {exc}", file=sys.stderr, flush=True)
        sys.exit(3)
    except Exception:
        log.exception("startup failed")
        sys.exit(3)

    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=settings.port,
        loop="asyncio",
        http="h11",
        ws="none",
        lifespan="off",
        log_config=None,
        access_log=False,
        server_header=False,
    )
    server = uvicorn.Server(config)
    app.state.ctx.request_shutdown = lambda: setattr(server, "should_exit", True)
    server.run()
    log.info("backend stopped")
