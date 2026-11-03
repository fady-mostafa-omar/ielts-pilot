"""Content catalogue API (planner-4): the next videos / novel / practice test for a task,
and the owner's progress on each item."""

from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select

from app import content
from app.context import Ctx
from app.db import utcnow
from app.models import ContentItem

router = APIRouter(prefix="/api/v1")

Kind = Literal["video", "novel", "test"]


class ContentOut(BaseModel):
    id: int
    kind: str
    key: str
    title: str
    grp: str
    skill: str
    level: str
    provider: str
    sort: int
    duration_seconds: int | None
    url: str
    started_at: datetime | None
    completed_at: datetime | None
    position_url: str | None = None  # 0008: a novel's last page, to carry on from there


class PositionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str = Field(min_length=1, max_length=1000)


def _out(item: ContentItem) -> ContentOut:
    return ContentOut.model_validate(item, from_attributes=True)


def _split(value: str | None) -> list[str] | None:
    if not value:
        return None
    return [v.strip() for v in value.split(",") if v.strip()]


@router.get("/content/queue", response_model=list[ContentOut])
def get_queue(
    ctx: Ctx,
    kind: Kind,
    groups: str | None = None,
    skills: str | None = None,
    providers: str | None = None,
    level: str | None = None,
    minutes: Annotated[int | None, Query(ge=1, le=900)] = None,
    limit: Annotated[int | None, Query(ge=1, le=50)] = None,
    review: bool = False,
) -> list[ContentOut]:
    if level is not None and level not in content.NOVEL_LEVELS:
        raise HTTPException(422, {"error": "bad_level", "message": "unknown novel level"})
    with ctx.session_factory() as session:
        rows = content.queue(
            session,
            kind,
            groups=_split(groups),
            skills=_split(skills),
            providers=_split(providers),
            level=level,
            minutes=minutes,
            limit=limit,
            include_done=review,
        )
        return [_out(r) for r in rows]


@router.get("/content/{item_id}", response_model=ContentOut)
def get_item(item_id: int, ctx: Ctx) -> ContentOut:
    with ctx.session_factory() as session:
        item = session.get(ContentItem, item_id)
        if item is None:
            raise HTTPException(404, {"error": "not_found", "message": "no such item"})
        return _out(item)


def _mark(item_id: int, ctx: Ctx, action: str) -> ContentOut:
    now = utcnow()
    with ctx.session_factory.begin() as session:
        item = session.get(ContentItem, item_id)
        if item is None:
            raise HTTPException(404, {"error": "not_found", "message": "no such item"})
        if action == "start" and item.started_at is None:
            item.started_at = now
        elif action == "done":
            item.started_at = item.started_at or now
            item.completed_at = now
        elif action == "reset":
            item.completed_at = None
        item.updated_at = now
        session.flush()
        return _out(item)


@router.post("/content/{item_id}/start", response_model=ContentOut)
def start_item(item_id: int, ctx: Ctx) -> ContentOut:
    return _mark(item_id, ctx, "start")


@router.post("/content/{item_id}/done", response_model=ContentOut)
def finish_item(item_id: int, ctx: Ctx) -> ContentOut:
    return _mark(item_id, ctx, "done")


@router.post("/content/{item_id}/reset", response_model=ContentOut)
def reset_item(item_id: int, ctx: Ctx) -> ContentOut:
    return _mark(item_id, ctx, "reset")


@router.post("/content/{item_id}/position", response_model=ContentOut)
def save_position(item_id: int, body: PositionIn, ctx: Ctx) -> ContentOut:
    """Where a novel was left: a page of the same flip-book, nothing else."""
    with ctx.session_factory.begin() as session:
        item = session.get(ContentItem, item_id)
        if item is None:
            raise HTTPException(404, {"error": "not_found", "message": "no such item"})
        base = item.url.split("/page/")[0].split("?")[0]
        if item.kind != "novel" or not body.url.startswith(base + "/"):
            raise HTTPException(422, {"error": "bad_position", "message": "not a page of it"})
        item.position_url = body.url
        item.updated_at = utcnow()
        session.flush()
        return _out(item)


def done_counts(session) -> dict:
    rows = session.execute(
        select(ContentItem.kind, func.count(), func.sum(ContentItem.duration_seconds))
        .where(ContentItem.completed_at.is_not(None))
        .group_by(ContentItem.kind)
    ).all()
    out = {"videos": 0, "video_seconds": 0, "novels": 0, "tests": 0}
    for kind, count, seconds in rows:
        if kind == "video":
            out["videos"] = int(count)
            out["video_seconds"] = int(seconds or 0)
        elif kind == "novel":
            out["novels"] = int(count)
        elif kind == "test":
            out["tests"] = int(count)
    return out
