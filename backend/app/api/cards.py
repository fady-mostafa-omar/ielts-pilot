"""Flashcards (v0.0.11, D-041): Dalilk's 350 words and 150 phrases — read from Dalilk's
public pages on the owner's computer and sent here by the UI, never shipped — and the
owner's own words. Spaced review with SM-2; one phrase per pause between tasks."""

from datetime import date, datetime, timedelta
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.context import Ctx
from app.db import utcnow
from app.models import Card

router = APIRouter(prefix="/api/v1")

Deck = Literal["word", "phrase"]
NEW_PER_DAY = 15
MASTERED_DAYS = 21


class CardOut(BaseModel):
    id: int
    kind: str
    key: str
    section: str
    situation: str
    sort: int
    front: str
    meaning: str
    example: str
    example_ar: str
    reps: int
    lapses: int
    ease: float
    interval_days: int
    due: date | None
    learned_on: date | None
    reviewed_at: datetime | None


class ImportItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str = Field(min_length=1, max_length=100)
    section: str = Field(default="", max_length=20)
    situation: str = Field(default="", max_length=200)
    sort: int = Field(ge=0, le=100_000)
    front: str = Field(min_length=1, max_length=300)
    meaning: str = Field(default="", max_length=500)
    example: str = Field(default="", max_length=500)
    example_ar: str = Field(default="", max_length=500)


class ImportIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Deck
    items: list[ImportItem] = Field(min_length=1, max_length=1000)


class MineIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    front: str = Field(min_length=1, max_length=300)
    meaning: str = Field(default="", max_length=500)
    example: str = Field(default="", max_length=500)


class ReviewIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    grade: int = Field(ge=0, le=5)  # UI: 1 forgot, 3 hard, 4 good, 5 easy
    today: date


def _out(card: Card) -> CardOut:
    return CardOut.model_validate(card, from_attributes=True)


def _kinds(deck: str) -> tuple[str, ...]:
    return ("word", "mine") if deck == "word" else ("phrase",)


def sm2(card: Card, grade: int, today: date) -> None:
    """SuperMemo-2: a failed card starts again tomorrow; a passed one waits 1, 6, then
    interval × ease days; ease moves with how easy it was (never under 1.3)."""
    if grade < 3:
        card.reps = 0
        card.lapses += 1
        card.interval_days = 1
    else:
        card.reps += 1
        if card.reps == 1:
            card.interval_days = 1
        elif card.reps == 2:
            card.interval_days = 6
        else:
            card.interval_days = max(1, round(card.interval_days * card.ease))
    card.ease = max(1.3, card.ease + 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
    card.due = today + timedelta(days=card.interval_days)
    card.learned_on = card.learned_on or today


@router.post("/cards/import")
def import_cards(body: ImportIn, ctx: Ctx) -> dict:
    """Adds or refreshes Dalilk's cards by key; the owner's progress is never touched."""
    now = utcnow()
    added = updated = 0
    with ctx.session_factory.begin() as session:
        existing = {
            c.key: c for c in session.scalars(select(Card).where(Card.kind == body.kind))
        }
        seen: set[str] = set()
        for item in body.items:
            if item.key in seen:
                continue
            seen.add(item.key)
            fields = item.model_dump()
            card = existing.get(item.key)
            if card is None:
                session.add(Card(kind=body.kind, created_at=now, updated_at=now, **fields))
                added += 1
            else:
                changed = any(getattr(card, k) != v for k, v in fields.items())
                for k, v in fields.items():
                    setattr(card, k, v)
                if changed:
                    card.updated_at = now
                    updated += 1
        total = session.scalar(select(func.count()).select_from(Card).where(
            Card.kind == body.kind))
    return {"kind": body.kind, "total": total, "added": added, "updated": updated}


def _stats(session: Session, kinds: tuple[str, ...], today: date) -> dict:
    base = select(func.count()).select_from(Card).where(Card.kind.in_(kinds))
    return {
        "total": session.scalar(base) or 0,
        # learned = recalled at least once since it was last forgotten
        "learned": session.scalar(base.where(Card.reps > 0)) or 0,
        "due": session.scalar(base.where(Card.due.is_not(None), Card.due <= today)) or 0,
        "mastered": session.scalar(base.where(Card.interval_days >= MASTERED_DAYS)) or 0,
        "new_today": session.scalar(base.where(Card.learned_on == today)) or 0,
    }


@router.get("/cards/stats")
def card_stats(ctx: Ctx, today: date) -> dict:
    with ctx.session_factory() as session:
        return {
            "word": _stats(session, ("word",), today),
            "mine": _stats(session, ("mine",), today),
            "phrase": _stats(session, ("phrase",), today),
        }


@router.get("/cards/today", response_model=list[CardOut])
def cards_today(
    ctx: Ctx,
    deck: Deck,
    today: date,
    new_limit: Annotated[int, Query(ge=0, le=100)] = NEW_PER_DAY,
) -> list[CardOut]:
    """Due reviews first (oldest first), then new cards: the owner's own words before
    Dalilk's, in Dalilk's order, up to today's allowance of new cards."""
    kinds = _kinds(deck)
    with ctx.session_factory() as session:
        due = list(session.scalars(
            select(Card).where(Card.kind.in_(kinds), Card.due.is_not(None), Card.due <= today)
            .order_by(Card.due, Card.sort, Card.id)
        ))
        started = session.scalar(
            select(func.count()).select_from(Card)
            .where(Card.kind.in_(kinds), Card.learned_on == today)
        ) or 0
        room = max(0, new_limit - started)
        fresh = list(session.scalars(
            select(Card).where(Card.kind.in_(kinds), Card.due.is_(None))
            .order_by(Card.kind != "mine", Card.sort, Card.id).limit(room)
        )) if room else []
        return [_out(c) for c in due + fresh]


@router.post("/cards/{card_id}/review", response_model=CardOut)
def review_card(card_id: int, body: ReviewIn, ctx: Ctx) -> CardOut:
    with ctx.session_factory.begin() as session:
        card = session.get(Card, card_id)
        if card is None:
            raise HTTPException(404, {"error": "not_found", "message": "no such card"})
        sm2(card, body.grade, body.today)
        card.reviewed_at = card.updated_at = utcnow()
        session.flush()
        return _out(card)


@router.post("/cards", response_model=CardOut, status_code=201)
def add_mine(body: MineIn, ctx: Ctx) -> CardOut:
    """A word the owner met in a podcast or a novel."""
    now = utcnow()
    with ctx.session_factory.begin() as session:
        card = Card(kind="mine", key=f"mine-{uuid4().hex[:12]}", section="mine",
                    sort=0, front=body.front.strip(), meaning=body.meaning.strip(),
                    example=body.example.strip(), created_at=now, updated_at=now)
        session.add(card)
        session.flush()
        return _out(card)


@router.delete("/cards/{card_id}", status_code=204)
def delete_mine(card_id: int, ctx: Ctx) -> None:
    with ctx.session_factory.begin() as session:
        card = session.get(Card, card_id)
        if card is None or card.kind != "mine":
            raise HTTPException(404, {"error": "not_found", "message": "no such card of yours"})
        session.delete(card)


@router.get("/cards/phrase/next", response_model=CardOut)
def next_phrase(ctx: Ctx) -> CardOut:
    """The pause's phrase: the next one never shown, in Dalilk's order; after all 150,
    round again from the one shown longest ago."""
    with ctx.session_factory() as session:
        card = session.scalars(
            select(Card).where(Card.kind == "phrase", Card.shown_at.is_(None))
            .order_by(Card.sort, Card.id).limit(1)
        ).first() or session.scalars(
            select(Card).where(Card.kind == "phrase").order_by(Card.shown_at, Card.sort)
            .limit(1)
        ).first()
        if card is None:
            raise HTTPException(404, {"error": "no_phrases", "message": "phrases not read yet"})
        return _out(card)


@router.post("/cards/{card_id}/shown", response_model=CardOut)
def phrase_shown(card_id: int, ctx: Ctx) -> CardOut:
    with ctx.session_factory.begin() as session:
        card = session.get(Card, card_id)
        if card is None or card.kind != "phrase":
            raise HTTPException(404, {"error": "not_found", "message": "no such phrase"})
        card.shown_at = card.updated_at = utcnow()
        session.flush()
        return _out(card)


def learned_counts(session: Session) -> dict:
    """For the achievements: words and phrases learned (recalled, not forgotten since)."""
    rows = session.execute(
        select(Card.kind, func.count()).where(Card.reps > 0).group_by(Card.kind)
    ).all()
    counts = dict(rows)
    return {"words": counts.get("word", 0) + counts.get("mine", 0),
            "phrases": counts.get("phrase", 0)}
