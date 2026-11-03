"""Study sessions: the timer behind "hours studied today" (PRD F6).

A session is `running` while the owner studies. The app sends a heartbeat every 30 s with
the seconds of real activity (idle time left out). Stopping confirms it; a session left
running when the app closed becomes `unconfirmed` and the owner confirms or discards it.
Hours logged by hand are kept apart as origin=`manual`.
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.context import Ctx
from app.db import utcnow
from app.models import PlanTask, Resource, StudySession
from app.schemas import (
    HeartbeatIn,
    ManualSessionIn,
    SessionOut,
    SessionPatch,
    SessionStartIn,
    SessionStopIn,
)

router = APIRouter(prefix="/api/v1")

# A heartbeat may count a few seconds more than the wall time since the previous one
# (timer jitter), never more.
HEARTBEAT_SLACK = 5


def _out(row: StudySession) -> SessionOut:
    return SessionOut.model_validate(row, from_attributes=True)


def _get(session: Session, session_id: int) -> StudySession:
    row = session.get(StudySession, session_id)
    if row is None:
        raise HTTPException(404, {"error": "not_found", "message": "no such session"})
    return row


def _wall_seconds(row: StudySession, end: datetime) -> int:
    return max(0, int((end - row.started_at).total_seconds()))


def close_running(session: Session) -> int:
    """Running sessions become unconfirmed, ending at their last heartbeat."""
    rows = session.scalars(select(StudySession).where(StudySession.state == "running")).all()
    for row in rows:
        row.state = "unconfirmed"
        row.ended_at = row.last_heartbeat_at
    return len(rows)


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(
    ctx: Ctx,
    since: datetime,
    until: datetime | None = None,
    include_discarded: bool = False,
) -> list[SessionOut]:
    if since.tzinfo is None or (until is not None and until.tzinfo is None):
        raise HTTPException(422, {"error": "naive_datetime", "message": "include UTC offset"})
    with ctx.session_factory() as session:
        query = select(StudySession).where(StudySession.started_at >= since)
        if until is not None:
            query = query.where(StudySession.started_at < until)
        if not include_discarded:
            query = query.where(StudySession.state != "discarded")
        rows = session.scalars(query.order_by(StudySession.started_at)).all()
        return [_out(r) for r in rows]


@router.get("/sessions/open", response_model=list[SessionOut])
def open_sessions(ctx: Ctx) -> list[SessionOut]:
    """Running and unconfirmed sessions (any date) that need the owner's attention."""
    with ctx.session_factory() as session:
        rows = session.scalars(
            select(StudySession)
            .where(StudySession.state.in_(("running", "unconfirmed")))
            .order_by(StudySession.started_at)
        ).all()
        return [_out(r) for r in rows]


@router.post("/sessions/start", response_model=SessionOut, status_code=201)
def start_session(body: SessionStartIn, ctx: Ctx) -> SessionOut:
    now = utcnow()
    with ctx.session_factory.begin() as session:
        if body.resource_id is not None and session.get(Resource, body.resource_id) is None:
            raise HTTPException(404, {"error": "not_found", "message": "no such resource"})
        if body.plan_task_id is not None and session.get(PlanTask, body.plan_task_id) is None:
            raise HTTPException(404, {"error": "not_found", "message": "no such task"})
        close_running(session)
        row = StudySession(
            started_at=now,
            last_heartbeat_at=now,
            active_seconds=0,
            skill=body.skill,
            activity_code=body.activity_code,
            resource_id=body.resource_id,
            plan_task_id=body.plan_task_id,
            state="running",
            origin="timer",
            notes="",
        )
        session.add(row)
        session.flush()
        return _out(row)


@router.post("/sessions/{session_id}/heartbeat", response_model=SessionOut)
def heartbeat(session_id: int, body: HeartbeatIn, ctx: Ctx) -> SessionOut:
    now = utcnow()
    with ctx.session_factory.begin() as session:
        row = _get(session, session_id)
        if row.state != "running":
            raise HTTPException(409, {"error": "not_running", "message": row.state})
        since_last = int((now - row.last_heartbeat_at).total_seconds()) + HEARTBEAT_SLACK
        delta = min(body.active_delta_seconds, max(0, since_last))
        row.active_seconds = min(row.active_seconds + delta, _wall_seconds(row, now))
        row.last_heartbeat_at = now
        session.flush()
        return _out(row)


@router.post("/sessions/{session_id}/stop", response_model=SessionOut)
def stop_session(session_id: int, body: SessionStopIn, ctx: Ctx) -> SessionOut:
    now = utcnow()
    with ctx.session_factory.begin() as session:
        row = _get(session, session_id)
        if row.state != "running":
            raise HTTPException(409, {"error": "not_running", "message": row.state})
        row.state = "confirmed"
        row.ended_at = now
        row.last_heartbeat_at = now
        row.active_seconds = min(row.active_seconds, _wall_seconds(row, now))
        if body.notes.strip():
            row.notes = body.notes.strip()
        session.flush()
        return _out(row)


@router.patch("/sessions/{session_id}", response_model=SessionOut)
def patch_session(session_id: int, body: SessionPatch, ctx: Ctx) -> SessionOut:
    with ctx.session_factory.begin() as session:
        row = _get(session, session_id)
        if row.state == "running":
            raise HTTPException(409, {"error": "running", "message": "stop the session first"})
        if body.active_seconds is not None:
            end = row.ended_at or row.last_heartbeat_at
            if body.active_seconds > _wall_seconds(row, end):
                raise HTTPException(
                    422,
                    {"error": "too_long", "message": "longer than the session itself"},
                )
            row.active_seconds = body.active_seconds
        if body.notes is not None:
            row.notes = body.notes.strip()
        if body.state is not None:
            row.state = body.state
        session.flush()
        return _out(row)


@router.post("/sessions/manual", response_model=SessionOut, status_code=201)
def log_manual(body: ManualSessionIn, ctx: Ctx) -> SessionOut:
    now = utcnow()
    ended = body.started_at + timedelta(minutes=body.minutes)
    if ended > now + timedelta(minutes=1):
        raise HTTPException(422, {"error": "future", "message": "that time has not ended yet"})
    with ctx.session_factory.begin() as session:
        task = None
        if body.plan_task_id is not None:
            task = session.get(PlanTask, body.plan_task_id)
            if task is None:
                raise HTTPException(404, {"error": "not_found", "message": "no such plan task"})
        row = StudySession(
            started_at=body.started_at,
            ended_at=ended,
            last_heartbeat_at=ended,
            active_seconds=body.minutes * 60,
            skill=body.skill,
            activity_code=task.activity_code if task else None,
            resource_id=task.resource_id if task else None,
            plan_task_id=task.id if task else None,
            state="confirmed",
            origin="manual",
            notes=body.notes.strip(),
        )
        session.add(row)
        session.flush()
        return _out(row)


def close_running_at_startup(ctx) -> int:
    with ctx.session_factory.begin() as session:
        return session.execute(
            update(StudySession)
            .where(StudySession.state == "running")
            .values(state="unconfirmed", ended_at=StudySession.last_heartbeat_at)
        ).rowcount
