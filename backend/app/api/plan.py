"""Owner settings, the hours-to-goal estimate, and the day-by-day plan (planner-2)."""

import json
from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app import planner
from app.context import AppContext, Ctx
from app.db import utcnow
from app.models import (
    SKILLS,
    AppSetting,
    LearnerProfile,
    PlacementResult,
    PlanTask,
    Resource,
    SkillLevel,
    StudySession,
)
from app.schemas import EstimateIn, PlanTaskOut, SettingsIO, SkipIn

router = APIRouter(prefix="/api/v1")

DEFAULTS = {
    "web_keep_signin": None,
    "hours_per_band": 200,
    "study_weekdays": None,
    "break_every_minutes": 50,
    "break_minutes": 10,
    "plan_start": None,
}

TZ_QUERY = Query(default=0, ge=-840, le=840, description="JavaScript getTimezoneOffset()")


# ------------------------------------------------------------------------ settings


def _stored(session: Session) -> dict:
    values = dict(DEFAULTS)
    for row in session.scalars(select(AppSetting)):
        if row.key in values:
            values[row.key] = json.loads(row.value_json)
    return values


def _effective(session: Session) -> SettingsIO:
    values = _stored(session)
    profile = session.get(LearnerProfile, 1)
    if profile is not None:
        weekdays = values["study_weekdays"]
        if not weekdays or len(weekdays) != profile.study_days_per_week:
            values["study_weekdays"] = sorted(
                planner.default_weekdays(profile.study_days_per_week)
            )
        if values["plan_start"] is None:
            values["plan_start"] = profile.created_at.date().isoformat()
    return SettingsIO(**values)


@router.get("/settings", response_model=SettingsIO)
def get_settings(ctx: Ctx) -> SettingsIO:
    with ctx.session_factory() as session:
        return _effective(session)


@router.put("/settings", response_model=SettingsIO)
def put_settings(body: SettingsIO, ctx: Ctx) -> SettingsIO:
    now = utcnow()
    with ctx.session_factory.begin() as session:
        for key, value in body.model_dump(mode="json", exclude_unset=True).items():
            row = session.get(AppSetting, key)
            if row is None:
                session.add(AppSetting(key=key, value_json=json.dumps(value), updated_at=now))
            else:
                row.value_json = json.dumps(value)
                row.updated_at = now
        if body.study_weekdays is not None:
            profile = session.get(LearnerProfile, 1)
            if profile is not None:
                profile.study_days_per_week = len(body.study_weekdays)
                profile.updated_at = now
    with ctx.session_factory() as session:
        return _effective(session)


# ------------------------------------------------------------------------ inputs


def _current_levels(session: Session) -> tuple[dict[str, float | None], datetime | None]:
    """Latest band per skill; a skill without one falls back to the latest Dalilk
    13English estimate. Also returns when the newest measurement was recorded."""
    current: dict[str, float | None] = {}
    newest: datetime | None = None
    for skill in SKILLS:
        row = session.scalars(
            select(SkillLevel)
            .where(SkillLevel.skill == skill)
            .order_by(SkillLevel.recorded_at.desc(), SkillLevel.id.desc())
            .limit(1)
        ).first()
        current[skill] = row.band if row else None
        if row and (newest is None or row.recorded_at > newest):
            newest = row.recorded_at
    if any(b is None for b in current.values()):
        placement = session.scalars(
            select(PlacementResult)
            .where(PlacementResult.test == "dalilk_13english")
            .where(PlacementResult.approx_band.is_not(None))
            .order_by(PlacementResult.taken_on.desc(), PlacementResult.id.desc())
            .limit(1)
        ).first()
        if placement is not None:
            for skill, band in current.items():
                if band is None:
                    current[skill] = placement.approx_band
            if newest is None:
                newest = placement.created_at
    return current, newest


def _hours_since(session: Session, since: datetime | None) -> float:
    query = select(func.coalesce(func.sum(StudySession.active_seconds), 0)).where(
        StudySession.state.in_(("confirmed", "running"))
    )
    if since is not None:
        query = query.where(StudySession.started_at >= since)
    return float(session.scalar(query) or 0) / 3600


def _inputs(session: Session, today: date) -> planner.PlanInputs:
    profile = session.get(LearnerProfile, 1)
    if profile is None:
        raise HTTPException(404, {"error": "no_profile", "message": "setup not completed"})
    settings = _effective(session)
    current, measured_at = _current_levels(session)
    return planner.PlanInputs(
        today=today,
        lang=profile.interface_language,
        target_overall=profile.target_overall,
        targets={s: getattr(profile, f"target_{s}") for s in SKILLS},
        current=current,
        exam_date=profile.exam_date,
        daily_minutes=profile.study_minutes_per_day,
        weekdays=frozenset(settings.study_weekdays or []),
        hours_per_band=settings.hours_per_band or 200,
        plan_start=settings.plan_start or today,
        hours_done=_hours_since(session, measured_at),
    )


def _estimate_dict(inputs: planner.PlanInputs) -> dict:
    est = planner.estimate(inputs)
    data = est.__dict__.copy()
    data["final_mock_dates"] = [d.isoformat() for d in est.final_mock_dates]
    for key in ("exam_date", "goal_date", "review_date", "earliest_exam_date", "next_mock_date"):
        value = data[key]
        data[key] = value.isoformat() if value else None
    return data


@router.post("/plan/estimate")
def estimate_preview(body: EstimateIn) -> dict:
    targets = {s: (body.targets or {}).get(s, body.target_overall) for s in SKILLS}
    inputs = planner.PlanInputs(
        today=body.today,
        lang="ar",
        target_overall=body.target_overall,
        targets=targets,
        current={s: body.current.get(s) for s in SKILLS},
        exam_date=body.exam_date,
        daily_minutes=body.daily_minutes,
        weekdays=frozenset(body.study_weekdays),
        hours_per_band=body.hours_per_band,
        plan_start=body.today,
    )
    return _estimate_dict(inputs)


# ------------------------------------------------------------------------ day plan


def _local_bounds(day: date, tz_offset: int) -> tuple[datetime, datetime]:
    """UTC range of a local calendar day (tz_offset as from JS getTimezoneOffset)."""
    start = datetime(day.year, day.month, day.day, tzinfo=UTC) + timedelta(minutes=tz_offset)
    return start, start + timedelta(days=1)


def _task_out(session: Session, task: PlanTask) -> PlanTaskOut:
    seconds = session.scalar(
        select(func.coalesce(func.sum(StudySession.active_seconds), 0))
        .where(StudySession.plan_task_id == task.id)
        .where(StudySession.state.in_(("confirmed", "running", "unconfirmed")))
    )
    out = PlanTaskOut.model_validate(task, from_attributes=True)
    out.done_minutes = round(float(seconds or 0) / 60, 1)
    return out


def _resource_ids(session: Session) -> dict[str, int]:
    rows = session.execute(
        select(Resource.catalog_id, Resource.id).where(Resource.catalog_id.is_not(None))
    )
    return {cid: rid for cid, rid in rows}


def _ensure_day(session: Session, inputs: planner.PlanInputs, day: date) -> list[PlanTask]:
    """Stored tasks for the day; (re)generated while none of them has been started."""
    digest = planner.inputs_hash(inputs, day)
    tasks = list(
        session.scalars(
            select(PlanTask).where(PlanTask.plan_date == day).order_by(PlanTask.order_in_day)
        )
    )
    touched = any(t.status != "pending" for t in tasks)
    if tasks and (touched or all(t.inputs_hash == digest for t in tasks)):
        return tasks
    if tasks:
        session.execute(delete(PlanTask).where(PlanTask.plan_date == day))
        session.flush()
    kind, blocks = planner.day_blocks(inputs, day)
    ids = _resource_ids(session)
    now = utcnow()
    tasks = []
    for order, block in enumerate(blocks, start=1):
        task = PlanTask(
            plan_date=day,
            order_in_day=order,
            day_type=kind,
            category=block.category,
            skill=block.skill,
            activity_code=block.activity_code,
            planned_minutes=block.minutes,
            resource_id=ids.get(block.catalog_id) if block.catalog_id else None,
            title=block.title,
            instructions=block.instructions,
            reason=block.reason,
            status="pending",
            inputs_hash=digest,
            generator_version=planner.GENERATOR,
            created_at=now,
        )
        session.add(task)
        tasks.append(task)
    session.flush()
    return tasks


def _day_minutes(session: Session, day: date, tz_offset: int) -> float:
    start, end = _local_bounds(day, tz_offset)
    seconds = session.scalar(
        select(func.coalesce(func.sum(StudySession.active_seconds), 0))
        .where(StudySession.state.in_(("confirmed", "running")))
        .where(StudySession.started_at >= start)
        .where(StudySession.started_at < end)
    )
    return float(seconds or 0) / 60


def _streak(session: Session, inputs: planner.PlanInputs, tz_offset: int) -> int:
    """Study days in a row (rest days skipped) that met the daily goal. Today counts only
    once its goal is met, so an unfinished today does not break the streak."""
    streak = 0
    day = inputs.today
    for _ in range(366):
        if planner.is_study_day(inputs, day):
            met = _day_minutes(session, day, tz_offset) >= inputs.daily_minutes
            if met:
                streak += 1
            elif day != inputs.today:
                break
        day -= timedelta(days=1)
        if day < inputs.plan_start - timedelta(days=1):
            break
    return streak


@router.get("/plan/summary")
def plan_summary(ctx: Ctx, today: date, tz: int = TZ_QUERY) -> dict:
    with ctx.session_factory.begin() as session:
        inputs = _inputs(session, today)
        data = _estimate_dict(inputs)
        data["today_kind"] = planner.day_kind(inputs, today)
        data["today_minutes"] = round(_day_minutes(session, today, tz), 1)
        data["streak_days"] = _streak(session, inputs, tz)
        data["focus_skill"] = planner.focus_skill(inputs, today)
        data["weekdays"] = sorted(inputs.weekdays)
        return data


@router.get("/plan/day")
def plan_day(
    ctx: Ctx, date_: Annotated[date, Query(alias="date")], today: date | None = None
) -> dict:
    """Tasks for a day. Today and later days within a week are stored so they can be
    resumed; further days are a preview."""
    today = today or date_
    with ctx.session_factory.begin() as session:
        inputs = _inputs(session, today)
        kind = planner.day_kind(inputs, date_)
        if date_ < today:
            tasks = list(
                session.scalars(
                    select(PlanTask)
                    .where(PlanTask.plan_date == date_)
                    .order_by(PlanTask.order_in_day)
                )
            )
        elif date_ == today:
            tasks = _ensure_day(session, inputs, date_)
        else:
            _, blocks = planner.day_blocks(inputs, date_)
            return {
                "date": date_.isoformat(),
                "kind": kind,
                "preview": True,
                "tasks": [
                    {"title": b.title, "category": b.category, "skill": b.skill,
                     "activity_code": b.activity_code, "planned_minutes": b.minutes}
                    for b in blocks
                ],
            }
        return {
            "date": date_.isoformat(),
            "kind": kind,
            "preview": False,
            "tasks": [_task_out(session, t).model_dump(mode="json") for t in tasks],
        }


def _get_task(session: Session, task_id: int) -> PlanTask:
    task = session.get(PlanTask, task_id)
    if task is None:
        raise HTTPException(404, {"error": "not_found", "message": "no such task"})
    return task


def _set_status(ctx: AppContext, task_id: int, status: str, reason: str | None = None):
    now = utcnow()
    with ctx.session_factory.begin() as session:
        task = _get_task(session, task_id)
        task.status = status
        if status == "in_progress" and task.started_at is None:
            task.started_at = now
        if status in ("done", "skipped"):
            task.completed_at = now
        if status == "pending":
            task.started_at = task.completed_at = None
            task.skip_reason = None
        if status == "skipped":
            task.skip_reason = (reason or "").strip() or None
        session.flush()
        return _task_out(session, task)


@router.post("/plan/tasks/{task_id}/start", response_model=PlanTaskOut)
def start_task(task_id: int, ctx: Ctx) -> PlanTaskOut:
    return _set_status(ctx, task_id, "in_progress")


@router.post("/plan/tasks/{task_id}/done", response_model=PlanTaskOut)
def finish_task(task_id: int, ctx: Ctx) -> PlanTaskOut:
    return _set_status(ctx, task_id, "done")


@router.post("/plan/tasks/{task_id}/skip", response_model=PlanTaskOut)
def skip_task(task_id: int, body: SkipIn, ctx: Ctx) -> PlanTaskOut:
    return _set_status(ctx, task_id, "skipped", body.reason)


@router.post("/plan/tasks/{task_id}/reset", response_model=PlanTaskOut)
def reset_task(task_id: int, ctx: Ctx) -> PlanTaskOut:
    return _set_status(ctx, task_id, "pending")
