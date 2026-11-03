"""Listening player: podcast episodes, the next one to listen to, and progress."""

import json
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.context import Ctx
from app.db import utcnow
from app.models import AppSetting, PodcastEpisode
from app.podcast import FeedError, parse_feed

router = APIRouter(prefix="/api/v1")

Feed = Literal["dalilk_ielts", "dalilk_english"]
MAX_FEED_CHARS = 30_000_000


class ImportIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    xml: str = Field(min_length=1, max_length=MAX_FEED_CHARS)


class EpisodeOut(BaseModel):
    id: int
    feed: str
    number: int | None
    title: str
    published_at: datetime | None
    duration_seconds: int | None
    audio_url: str
    page_url: str | None
    transcript_url: str | None
    summary: str
    position_seconds: int
    plays: int
    comprehension: int | None
    listened_at: datetime | None


class EpisodePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    position_seconds: int | None = Field(default=None, ge=0, le=24 * 3600)
    listened: bool | None = None
    comprehension: int | None = Field(default=None, ge=1, le=5)
    started: bool | None = None  # counts one more play


def _out(row: PodcastEpisode) -> EpisodeOut:
    data = {c: getattr(row, c) for c in EpisodeOut.model_fields if hasattr(row, c)}
    data["transcript_url"] = (
        f"https://drive.google.com/file/d/{row.transcript_id}/preview"
        if row.transcript_id
        else None
    )
    return EpisodeOut(**data)


def _order(query):
    # numbered episodes in order, then by publication date
    return query.order_by(
        PodcastEpisode.number.is_(None),
        PodcastEpisode.number,
        PodcastEpisode.published_at,
        PodcastEpisode.id,
    )


def _refreshed_key(feed: str) -> str:
    return f"podcast_refreshed_{feed}"


def _refreshed_at(session: Session, feed: str) -> str | None:
    row = session.get(AppSetting, _refreshed_key(feed))
    return json.loads(row.value_json) if row else None


@router.post("/podcasts/{feed}/import")
def import_feed(feed: Feed, body: ImportIn, ctx: Ctx) -> dict:
    try:
        parsed = parse_feed(body.xml)
    except FeedError as exc:
        raise HTTPException(422, {"error": "bad_feed", "message": str(exc)}) from exc
    now = utcnow()
    added = updated = 0
    with ctx.session_factory.begin() as session:
        existing = {
            r.guid: r
            for r in session.scalars(select(PodcastEpisode).where(PodcastEpisode.feed == feed))
        }
        for ep in parsed:
            values = {
                "title": ep.title,
                "number": ep.number,
                "published_at": ep.published_at,
                "duration_seconds": ep.duration_seconds,
                "audio_url": ep.audio_url,
                "page_url": ep.page_url,
                "transcript_id": ep.transcript_id,
                "summary": ep.summary,
            }
            row = existing.get(ep.guid)
            if row is None:
                session.add(
                    PodcastEpisode(feed=feed, guid=ep.guid, created_at=now, updated_at=now,
                                   **values)
                )
                added += 1
            elif any(getattr(row, k) != v for k, v in values.items()):
                for key, value in values.items():
                    setattr(row, key, value)
                row.updated_at = now
                updated += 1
        stamp = json.dumps(now.isoformat())
        setting = session.get(AppSetting, _refreshed_key(feed))
        if setting is None:
            session.add(AppSetting(key=_refreshed_key(feed), value_json=stamp, updated_at=now))
        else:
            setting.value_json = stamp
            setting.updated_at = now
        session.flush()
        total = session.scalar(
            select(func.count()).select_from(PodcastEpisode).where(PodcastEpisode.feed == feed)
        )
    return {"added": added, "updated": updated, "total": total, "in_feed": len(parsed)}


@router.get("/podcasts/{feed}")
def list_episodes(feed: Feed, ctx: Ctx) -> dict:
    with ctx.session_factory() as session:
        rows = session.scalars(_order(select(PodcastEpisode).where(PodcastEpisode.feed == feed)))
        episodes = [_out(r) for r in rows]
        return {
            "feed": feed,
            "refreshed_at": _refreshed_at(session, feed),
            "total": len(episodes),
            "listened": sum(1 for e in episodes if e.listened_at),
            "episodes": [e.model_dump(mode="json") for e in episodes],
        }


@router.get("/podcasts/{feed}/next", response_model=EpisodeOut)
def next_episode(feed: Feed, ctx: Ctx) -> EpisodeOut:
    """An episode started and not finished, else the first one not listened to."""
    with ctx.session_factory() as session:
        base = select(PodcastEpisode).where(PodcastEpisode.feed == feed)
        started = session.scalars(
            base.where(PodcastEpisode.listened_at.is_(None))
            .where(PodcastEpisode.position_seconds > 0)
            .order_by(PodcastEpisode.updated_at.desc())
            .limit(1)
        ).first()
        row = started or session.scalars(
            _order(base.where(PodcastEpisode.listened_at.is_(None))).limit(1)
        ).first()
        if row is None:
            raise HTTPException(404, {"error": "no_episodes", "message": "nothing left to play"})
        return _out(row)


@router.patch("/podcasts/episodes/{episode_id}", response_model=EpisodeOut)
def patch_episode(episode_id: int, body: EpisodePatch, ctx: Ctx) -> EpisodeOut:
    now = utcnow()
    with ctx.session_factory.begin() as session:
        row = session.get(PodcastEpisode, episode_id)
        if row is None:
            raise HTTPException(404, {"error": "not_found", "message": "no such episode"})
        if body.position_seconds is not None:
            row.position_seconds = body.position_seconds
        if body.started:
            row.plays += 1
        if body.comprehension is not None:
            row.comprehension = body.comprehension
        if body.listened is not None:
            row.listened_at = now if body.listened else None
            if body.listened:
                row.position_seconds = 0
        row.updated_at = now
        session.flush()
        return _out(row)
