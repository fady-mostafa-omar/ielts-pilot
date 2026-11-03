"""Data upkeep run at start-up and after a restore or delete-all."""

import logging

from app import catalog, content
from app.api.sessions import close_running_at_startup
from app.context import AppContext

log = logging.getLogger("ielts_pilot")


def prepare_data(ctx: AppContext) -> None:
    """Refresh the shipped resource catalogue and close sessions left running."""
    with ctx.session_factory.begin() as session:
        changed = catalog.sync(session)
        changed += content.sync(session)
    closed = close_running_at_startup(ctx)
    log.info("catalogue rows updated: %d; sessions left running: %d", changed, closed)
