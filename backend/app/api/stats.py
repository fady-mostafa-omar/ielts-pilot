"""Achievement counters (owner's request, v0.0.7): what has been done so far, to show
progress in things finished, not only in hours."""

from datetime import timedelta

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.api.content import done_counts
from app.context import Ctx
from app.models import PODCAST_FEEDS, PlanTask, PodcastEpisode, StudySession

router = APIRouter(prefix="/api/v1")

COUNTED = ("confirmed", "running")


@router.get("/stats/achievements")
def achievements(
    ctx: Ctx,
    tz: int = Query(default=0, ge=-840, le=840, description="JavaScript getTimezoneOffset()"),
) -> dict:
    with ctx.session_factory() as session:
        listened = dict(
            session.execute(
                select(PodcastEpisode.feed, func.count())
                .where(PodcastEpisode.listened_at.is_not(None))
                .group_by(PodcastEpisode.feed)
            ).all()
        )
        tasks = dict(
            session.execute(
                select(PlanTask.status, func.count())
                .where(PlanTask.status.in_(("done", "skipped")))
                .group_by(PlanTask.status)
            ).all()
        )
        finished = done_counts(session)
        rows = session.execute(
            select(StudySession.started_at, StudySession.active_seconds, StudySession.origin).where(
                StudySession.state.in_(COUNTED)
            )
        ).all()
    seconds = sum(r.active_seconds for r in rows)
    self_logged = sum(r.active_seconds for r in rows if r.origin == "manual")
    # local calendar days (JavaScript offset: minutes to ADD to local time to get UTC)
    days = {(r.started_at - timedelta(minutes=tz)).date() for r in rows if r.active_seconds > 0}
    return {
        "episodes": {feed: int(listened.get(feed, 0)) for feed in PODCAST_FEEDS},
        "episodes_total": int(sum(listened.values())),
        "tasks_done": int(tasks.get("done", 0)),
        "tasks_skipped": int(tasks.get("skipped", 0)),
        "hours": round(seconds / 3600, 2),
        "hours_self_logged": round(self_logged / 3600, 2),
        "study_days": len(days),
        "videos": finished["videos"],
        "video_hours": round(finished["video_seconds"] / 3600, 2),
        "novels": finished["novels"],
        "tests": finished["tests"],
    }
