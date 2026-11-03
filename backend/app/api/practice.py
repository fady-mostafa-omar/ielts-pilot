"""Tests by name and their results (v0.0.14, owner 2026-11-03, D-044).

- A result is what the owner read off the test: the right answers out of the questions, the
  band the site showed (full tests only) and the question types he got wrong.
- Only a full test's band is a level entry (docs/research/tests_map.md §3): an official
  sample is a part of a test and is recorded only, for the question-type page.
- The app never turns right answers into a band itself: conversion tables differ from test
  to test, so the band is the one the site gave.
- The labs take their questions from named tests too: the next one not answered yet.
"""

import json
import re
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import select

from app import content
from app.api.content import ContentOut, _out
from app.api.plan import _stored
from app.context import Ctx
from app.db import utcnow
from app.models import (
    SKILLS,
    ContentItem,
    PlanTask,
    PracticeResult,
    SkillLevel,
    SpeakingAttempt,
    WritingAttempt,
)

router = APIRouter(prefix="/api/v1")

# official material: the IELTS partners' own samples and Cambridge's books (on engnovate)
OFFICIAL_PROVIDERS = {"official", "engnovate", "britishcouncil"}
QTYPE = re.compile(r"^[a-z_]{2,30}$")
PROVIDER_NAMES = {
    "official": "ielts.org",
    "engnovate": "engnovate",
    "ieltsonlinetests": "ieltsonlinetests",
    "britishcouncil": "British Council",
    "dalilk": "Dalilk",
}


def _band(value: float | None) -> float | None:
    if value is not None and (not 0 <= value <= 9 or value * 2 != int(value * 2)):
        raise ValueError("a band is 0–9 in steps of 0.5")
    return value


class ResultIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content_id: int
    correct: int | None = Field(default=None, ge=0, le=200)
    total: int | None = Field(default=None, ge=1, le=200)
    band: float | None = None
    # a full mock (the last days): the band of each skill
    bands: dict[Literal["listening", "reading", "writing", "speaking"], float] = Field(
        default_factory=dict
    )
    wrong_types: list[str] = Field(default_factory=list, max_length=20)
    plan_task_id: int | None = None

    _b = field_validator("band")(classmethod(lambda cls, v: _band(v)))

    @field_validator("bands")
    @classmethod
    def _bands(cls, value: dict[str, float]) -> dict[str, float]:
        for v in value.values():
            _band(v)
        return value

    @field_validator("wrong_types")
    @classmethod
    def _types(cls, value: list[str]) -> list[str]:
        if any(not QTYPE.match(v) for v in value):
            raise ValueError("unknown question type")
        return sorted(set(value))

    @model_validator(mode="after")
    def _marks(self) -> "ResultIn":
        if (self.correct is None) != (self.total is None):
            raise ValueError("give the right answers and the number of questions together")
        if self.correct is not None and self.total is not None and self.correct > self.total:
            raise ValueError("more right answers than questions")
        if self.correct is None and self.band is None and not self.bands:
            raise ValueError("nothing to save")
        return self


class ResultOut(BaseModel):
    id: int
    content_id: int | None
    test_key: str
    title: str
    provider: str
    skill: str
    kind: str
    part: int | None
    qtype: str
    correct: int | None
    total: int | None
    band: float | None
    bands: dict[str, float]
    wrong_types: list[str]
    level_ids: list[int]
    plan_task_id: int | None
    created_at: datetime


def _result_out(row: PracticeResult) -> ResultOut:
    data = {c: getattr(row, c) for c in ResultOut.model_fields if hasattr(row, c)}
    data["bands"] = json.loads(row.bands_json or "{}")
    data["wrong_types"] = json.loads(row.wrong_types_json or "[]")
    data["level_ids"] = json.loads(row.level_ids_json or "[]")
    return ResultOut(**data)


def _source(provider: str) -> str:
    return "official_practice" if provider in OFFICIAL_PROVIDERS else "practice_site"


@router.post("/practice-results", response_model=ResultOut, status_code=201)
def add_result(body: ResultIn, ctx: Ctx) -> ResultOut:
    now = utcnow()
    with ctx.session_factory.begin() as session:
        item = session.get(ContentItem, body.content_id)
        if item is None or item.kind != "test":
            raise HTTPException(404, {"error": "not_found", "message": "no such test"})
        if body.plan_task_id is not None and session.get(PlanTask, body.plan_task_id) is None:
            raise HTTPException(422, {"error": "bad_task", "message": "no such plan task"})
        kind = content.test_kind(item)
        if kind == "sample" and (body.band is not None or body.bands):
            # a sample is a part of a test: it says nothing about a band (owner, D-044)
            raise HTTPException(422, {"error": "sample_band",
                                      "message": "a sample question has no band"})
        bands: dict[str, float] = dict(body.bands)
        if body.band is not None:
            if item.skill not in SKILLS:
                raise HTTPException(422, {"error": "bad_band",
                                          "message": "give the band of each skill"})
            bands[item.skill] = body.band
        meta = content.meta(item)
        row = PracticeResult(
            content_id=item.id, test_key=item.key, title=item.title, provider=item.provider,
            skill=item.skill, kind=kind, part=meta.get("part"), qtype=meta.get("qtype", ""),
            correct=body.correct, total=body.total, band=body.band,
            bands_json=json.dumps(body.bands, sort_keys=True),
            wrong_types_json=json.dumps(body.wrong_types), plan_task_id=body.plan_task_id,
            created_at=now,
        )
        level_ids: list[int] = []
        note = f"{item.title} · {PROVIDER_NAMES.get(item.provider, item.provider)}"[:200]
        for skill, band in bands.items():
            level = SkillLevel(skill=skill, band=band, source_type=_source(item.provider),
                               source_note=note, recorded_at=now)
            session.add(level)
            session.flush()
            level_ids.append(level.id)
        row.level_ids_json = json.dumps(level_ids)
        session.add(row)
        item.started_at = item.started_at or now
        item.completed_at = item.completed_at or now
        item.updated_at = now
        session.flush()
        return _result_out(row)


@router.get("/practice-results", response_model=list[ResultOut])
def list_results(
    ctx: Ctx,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    content_id: int | None = None,
) -> list[ResultOut]:
    with ctx.session_factory() as session:
        q = select(PracticeResult)
        if content_id is not None:
            q = q.where(PracticeResult.content_id == content_id)
        rows = session.scalars(
            q.order_by(PracticeResult.created_at.desc(), PracticeResult.id.desc()).limit(limit)
        )
        return [_result_out(r) for r in rows]


@router.delete("/practice-results/{result_id}", status_code=204)
def delete_result(result_id: int, ctx: Ctx) -> None:
    """Deletes the result and the level entries its band made."""
    with ctx.session_factory.begin() as session:
        row = session.get(PracticeResult, result_id)
        if row is None:
            raise HTTPException(404, {"error": "not_found", "message": "no such result"})
        for level_id in json.loads(row.level_ids_json or "[]"):
            level = session.get(SkillLevel, level_id)
            if level is not None:
                session.delete(level)
        session.delete(row)


# ------------------------------------------------------------------ the labs' questions


def lab_tests(session, skill: str, task: int, exam_format: str) -> list[ContentItem]:
    """The lab's named questions in order: the official one (paper or computer, as the
    exam), then Cambridge 21, 20, 19 (engnovate), then ieltsonlinetests."""
    rows = list(session.scalars(
        select(ContentItem).where(ContentItem.kind == "test", ContentItem.skill == skill,
                                  ContentItem.active.is_(True)).order_by(ContentItem.sort)
    ))
    out = []
    for r in content.series_order(rows, "lab"):
        if r.provider == "official" and skill == "writing":
            if r.grp != f"task{task}" or content.meta(r).get("format", "computer") != exam_format:
                continue
        out.append(r)
    return out


@router.get("/lab-test", response_model=ContentOut | None)
def next_lab_test(
    ctx: Ctx,
    skill: Literal["writing", "speaking"],
    task: Annotated[int, Query(ge=0, le=2)] = 0,
    plan_task_id: int | None = None,
) -> ContentOut | None:
    """The named question for the lab now: the one this task's draft (writing) or earlier
    answers (speaking) use, else the next one not answered yet."""
    with ctx.session_factory() as session:
        exam_format = _stored(session).get("exam_format") or "computer"
        if skill == "writing":
            if task not in (1, 2):
                return None
            attempts = list(session.scalars(
                select(WritingAttempt).where(WritingAttempt.task == task,
                                             WritingAttempt.test_key.is_not(None))
                .order_by(WritingAttempt.created_at.desc(), WritingAttempt.id.desc())
            ))
            current = next((a.test_key for a in attempts if plan_task_id is not None
                            and a.plan_task_id == plan_task_id and a.status == "draft"), None)
        else:
            attempts = list(session.scalars(
                select(SpeakingAttempt).where(SpeakingAttempt.test_key.is_not(None))
                .order_by(SpeakingAttempt.created_at.desc(), SpeakingAttempt.id.desc())
            ))
            current = next((a.test_key for a in attempts if plan_task_id is not None
                            and a.plan_task_id == plan_task_id), None)
        tests = lab_tests(session, skill, task, exam_format)
        if current:
            found = next((r for r in tests if r.key == current), None)
            if found is None:
                found = session.scalars(select(ContentItem).where(
                    ContentItem.kind == "test", ContentItem.key == current)).first()
            if found is not None:
                return _out(found)
        used = {a.test_key for a in attempts}
        return next((_out(r) for r in tests if r.key not in used), None)


# ------------------------------------------------------------------ the progress page


@router.get("/progress")
def progress(ctx: Ctx) -> dict:
    """«تقدّمي»: every level entry (with its source), the right answers by question type,
    the recent tests and the lab answers the tutor marked."""
    with ctx.session_factory() as session:
        levels = [
            {"id": lv.id, "skill": lv.skill, "band": lv.band, "source_type": lv.source_type,
             "source_note": lv.source_note, "recorded_at": lv.recorded_at}
            for lv in session.scalars(select(SkillLevel).order_by(SkillLevel.recorded_at,
                                                                  SkillLevel.id))
        ]
        results = list(session.scalars(
            select(PracticeResult).order_by(PracticeResult.created_at.desc(),
                                            PracticeResult.id.desc())
        ))
        types: dict[tuple[str, str], dict] = {}
        for r in results:
            if r.skill not in ("listening", "reading"):
                continue
            if r.kind == "sample" and r.qtype and r.total:
                t = types.setdefault((r.skill, r.qtype), {"skill": r.skill, "qtype": r.qtype,
                                                         "correct": 0, "total": 0,
                                                         "samples": 0, "wrong_in_full": 0})
                t["correct"] += r.correct or 0
                t["total"] += r.total
                t["samples"] += 1
            for q in json.loads(r.wrong_types_json or "[]"):
                t = types.setdefault((r.skill, q), {"skill": r.skill, "qtype": q, "correct": 0,
                                                    "total": 0, "samples": 0,
                                                    "wrong_in_full": 0})
                if r.kind == "full":
                    t["wrong_in_full"] += 1
        writing = [
            {"kind": "writing", "task": a.task, "test_key": a.test_key, "prompt": a.prompt[:200],
             "overall": a.tutor_overall, "scores": json.loads(a.scores_json or "{}"),
             "created_at": a.created_at}
            for a in session.scalars(select(WritingAttempt).where(
                WritingAttempt.tutor_overall.is_not(None)).order_by(
                WritingAttempt.created_at.desc()).limit(20))
        ]
        speaking = [
            {"kind": "speaking", "part": a.part, "test_key": a.test_key,
             "prompt": a.prompt[:200], "overall": a.tutor_overall,
             "scores": json.loads(a.scores_json or "{}"), "created_at": a.created_at}
            for a in session.scalars(select(SpeakingAttempt).where(
                SpeakingAttempt.tutor_overall.is_not(None)).order_by(
                SpeakingAttempt.created_at.desc()).limit(20))
        ]
        titles = {i.key: i.title for i in session.scalars(select(ContentItem).where(
            ContentItem.kind == "test", ContentItem.key.in_(
                [x["test_key"] for x in writing + speaking if x["test_key"]])))}
        for x in writing + speaking:
            x["test_title"] = titles.get(x["test_key"] or "", "")
        return {
            "levels": levels,
            "question_types": sorted(types.values(), key=lambda t: (t["skill"], t["qtype"])),
            "results": [_result_out(r).model_dump() for r in results[:30]],
            "labs": sorted(writing + speaking, key=lambda x: x["created_at"], reverse=True)[:20],
            "tests_done": len({r.test_key for r in results}),
        }
