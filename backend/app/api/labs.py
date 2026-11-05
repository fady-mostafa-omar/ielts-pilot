"""Writing and speaking labs (v0.0.12, PRD F6/F7, D-042): attempts with the question, the
answer, time used, the self-review and the AI tutor's reply. Since v0.0.13 (owner,
2026-11-03, D-043) the marks the owner types in from the tutor count in his level: the
overall mark of a submitted answer is a level entry with the source "ai_tutor", updated or
removed with it. Recordings stay in the data folder; the UI asks the desktop app to delete
a file when its attempt is deleted."""

import json
import re
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select

from app.api.plan import _stored
from app.context import Ctx
from app.db import utcnow
from app.models import ContentItem, PlanTask, SkillLevel, SpeakingAttempt, WritingAttempt

router = APIRouter(prefix="/api/v1")

RECORDING = re.compile(r"^(speaking|shadow|model)-[0-9]{8}-[0-9]{6}(-[0-9]+)?\.webm$")
PDF_FILE = re.compile(r"^[^/\\:*?\"<>|]{1,180}\.pdf$")  # a file name only, no folders
CRITERIA = Literal["task", "coherence", "lexical", "grammar", "fluency", "pronunciation"]
TUTOR_NAMES = {"chatgpt": "ChatGPT", "claude": "Claude", "gemini": "Gemini"}


def _scores(value: dict[str, float] | None) -> dict[str, float] | None:
    if value is not None:
        for v in value.values():
            _band(v)
    return value


def _test_title(session, row) -> str | None:
    if not getattr(row, "test_key", None):
        return None
    return session.scalars(select(ContentItem.title).where(
        ContentItem.kind == "test", ContentItem.key == row.test_key)).first()


def _label(session, row, label: str) -> str:
    """v0.0.14: the named question in the level's note, e.g. "Cambridge 21 … · Task 1"."""
    title = _test_title(session, row)
    return f"{title} · {label}" if title else label


def _sync_level(session, row, skill: str, label: str) -> None:
    """The tutor's overall mark as a level entry (D-043): made, changed or removed with it."""
    level = session.get(SkillLevel, row.level_id) if row.level_id else None
    if row.tutor_overall is None:
        if level is not None:
            session.delete(level)
        row.level_id = None
        return
    site = TUTOR_NAMES.get(_stored(session).get("tutor") or "chatgpt", "AI")
    note = f"{site} · {_label(session, row, label)}"[:200]
    if level is None:
        level = SkillLevel(skill=skill, band=row.tutor_overall, source_type="ai_tutor",
                           source_note=note, recorded_at=utcnow())
        session.add(level)
        session.flush()
        row.level_id = level.id
    else:
        level.band, level.source_note = row.tutor_overall, note


def _pdf_name(value: str | None) -> str | None:
    if value is not None and not PDF_FILE.match(value):
        raise ValueError("a PDF file name only")
    return value


def count_words(text: str) -> int:
    """Same rule as the writing pad: words are separated by white space."""
    return len(text.split())


def _band(value: float | None) -> float | None:
    if value is None:
        return None
    if not 0 <= value <= 9 or value * 2 != int(value * 2):
        raise ValueError("an opinion is 0–9 in steps of 0.5")
    return value


class WritingIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task: Literal[0, 1, 2]
    prompt: str = Field(default="", max_length=5000)
    plan_task_id: int | None = None
    test_key: str | None = Field(default=None, max_length=200)  # v0.0.14: named question


class WritingPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str | None = Field(default=None, max_length=5000)
    text: str | None = Field(default=None, max_length=30000)
    seconds_used: int | None = Field(default=None, ge=0, le=24 * 3600)
    checklist: list[str] | None = Field(default=None, max_length=40)
    tutor_reply: str | None = Field(default=None, max_length=60000)
    tutor_overall: float | None = None
    # 0011: the tutor's marks per criterion, typed in by the owner
    scores: dict[Literal["task", "coherence", "lexical", "grammar"], float] | None = None
    submit: bool | None = None
    model_answer: str | None = Field(default=None, max_length=30000)  # 0013
    pdf_file: str | None = Field(default=None, max_length=200)

    _pdf = field_validator("pdf_file")(classmethod(lambda cls, v: _pdf_name(v)))

    _overall = field_validator("tutor_overall")(classmethod(lambda cls, v: _band(v)))
    _criteria = field_validator("scores")(classmethod(lambda cls, v: _scores(v)))


class WritingOut(BaseModel):
    id: int
    task: int
    prompt: str
    text: str
    words: int
    seconds_used: int
    status: str
    checklist: list[str]
    tutor_reply: str
    tutor_overall: float | None
    scores: dict[str, float]
    level_id: int | None
    test_key: str | None
    test_title: str | None = None  # v0.0.17: the named test's title, for the PDF
    model_answer: str
    pdf_file: str | None
    plan_task_id: int | None
    submitted_at: datetime | None
    created_at: datetime
    updated_at: datetime


def _writing_out(row: WritingAttempt, session) -> WritingOut:
    data = {c: getattr(row, c) for c in WritingOut.model_fields if hasattr(row, c)}
    data["test_title"] = _test_title(session, row)
    data["checklist"] = json.loads(row.checklist_json or "[]")
    data["scores"] = json.loads(row.scores_json or "{}")
    return WritingOut(**data)


def _check_task(session, plan_task_id: int | None) -> None:
    if plan_task_id is not None and session.get(PlanTask, plan_task_id) is None:
        raise HTTPException(422, {"error": "bad_task", "message": "no such plan task"})


def _check_test(session, key: str | None) -> None:
    if key is not None and session.scalars(select(ContentItem.id).where(
            ContentItem.kind == "test", ContentItem.key == key)).first() is None:
        raise HTTPException(422, {"error": "bad_test", "message": "no such test"})


@router.post("/writing", response_model=WritingOut, status_code=201)
def new_writing(body: WritingIn, ctx: Ctx) -> WritingOut:
    now = utcnow()
    with ctx.session_factory.begin() as session:
        _check_task(session, body.plan_task_id)
        _check_test(session, body.test_key)
        row = WritingAttempt(task=body.task, prompt=body.prompt, plan_task_id=body.plan_task_id,
                             test_key=body.test_key, created_at=now, updated_at=now)
        session.add(row)
        session.flush()
        return _writing_out(row, session)


@router.get("/writing", response_model=list[WritingOut])
def list_writing(
    ctx: Ctx,
    limit: Annotated[int, Query(ge=1, le=200)] = 30,
    plan_task_id: int | None = None,
    task: Annotated[int | None, Query(ge=0, le=2)] = None,
) -> list[WritingOut]:
    with ctx.session_factory() as session:
        q = select(WritingAttempt)
        if plan_task_id is not None:
            q = q.where(WritingAttempt.plan_task_id == plan_task_id)
        if task is not None:
            q = q.where(WritingAttempt.task == task)
        rows = session.scalars(q.order_by(WritingAttempt.created_at.desc(),
                                          WritingAttempt.id.desc()).limit(limit))
        return [_writing_out(r, session) for r in rows]


def _writing(session, attempt_id: int) -> WritingAttempt:
    row = session.get(WritingAttempt, attempt_id)
    if row is None:
        raise HTTPException(404, {"error": "not_found", "message": "no such answer"})
    return row


@router.patch("/writing/{attempt_id}", response_model=WritingOut)
def patch_writing(attempt_id: int, body: WritingPatch, ctx: Ctx) -> WritingOut:
    now = utcnow()
    with ctx.session_factory.begin() as session:
        row = _writing(session, attempt_id)
        if body.prompt is not None:
            row.prompt = body.prompt
        if body.text is not None:
            row.text = body.text
            row.words = count_words(body.text)
        if body.seconds_used is not None:
            row.seconds_used = body.seconds_used
        if body.checklist is not None:
            row.checklist_json = json.dumps(body.checklist)
        if body.tutor_reply is not None:
            row.tutor_reply = body.tutor_reply
        if "tutor_overall" in body.model_fields_set:
            row.tutor_overall = body.tutor_overall
        if body.scores is not None:
            row.scores_json = json.dumps(body.scores)
        if body.model_answer is not None:
            row.model_answer = body.model_answer
        if body.pdf_file is not None:
            row.pdf_file = body.pdf_file
        if body.submit:
            row.status = "submitted"
            row.submitted_at = row.submitted_at or now
        if row.status == "submitted" and (
            "tutor_overall" in body.model_fields_set or body.submit
        ):
            label = f"Writing Task {row.task}" if row.task else "writing"
            _sync_level(session, row, "writing", label)
        row.updated_at = now
        session.flush()
        return _writing_out(row, session)


@router.delete("/writing/{attempt_id}", status_code=204)
def delete_writing(attempt_id: int, ctx: Ctx) -> None:
    """Deletes the answer and the level entry its mark made."""
    with ctx.session_factory.begin() as session:
        row = _writing(session, attempt_id)
        row.tutor_overall = None
        _sync_level(session, row, "writing", "")
        session.delete(row)


class SpeakingIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    part: Literal[0, 1, 2, 3]
    prompt: str = Field(default="", max_length=5000)
    recording: str | None = Field(default=None, max_length=100)
    seconds: int = Field(default=0, ge=0, le=3600)
    transcript: str = Field(default="", max_length=30000)
    self_rating: dict[CRITERIA, int] = Field(default_factory=dict)
    notes: str = Field(default="", max_length=5000)
    plan_task_id: int | None = None
    test_key: str | None = Field(default=None, max_length=200)  # v0.0.14: named test

    @field_validator("recording")
    @classmethod
    def _recording(cls, value: str | None) -> str | None:
        if value is not None and not RECORDING.match(value):
            raise ValueError("not a recording of this app")
        return value

    @field_validator("self_rating")
    @classmethod
    def _rating(cls, value: dict[str, int]) -> dict[str, int]:
        if any(not 1 <= v <= 5 for v in value.values()):
            raise ValueError("self-ratings are 1–5")
        return value


class SpeakingPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str | None = Field(default=None, max_length=5000)
    transcript: str | None = Field(default=None, max_length=30000)
    self_rating: dict[CRITERIA, int] | None = None
    notes: str | None = Field(default=None, max_length=5000)
    tutor_reply: str | None = Field(default=None, max_length=60000)
    tutor_overall: float | None = None
    scores: dict[Literal["fluency", "lexical", "grammar", "pronunciation"], float] | None = None
    model_answer: str | None = Field(default=None, max_length=30000)  # 0013
    model_recording: str | None = Field(default=None, max_length=100)
    pdf_file: str | None = Field(default=None, max_length=200)
    # v0.0.17: a recording made after the answer was opened (the reply pasted first)
    recording: str | None = Field(default=None, max_length=100)
    seconds: int | None = Field(default=None, ge=0, le=3600)

    _overall = field_validator("tutor_overall")(classmethod(lambda cls, v: _band(v)))
    _criteria = field_validator("scores")(classmethod(lambda cls, v: _scores(v)))
    _pdf = field_validator("pdf_file")(classmethod(lambda cls, v: _pdf_name(v)))

    @field_validator("model_recording", "recording")
    @classmethod
    def _model_recording(cls, value: str | None) -> str | None:
        if value is not None and not RECORDING.match(value):
            raise ValueError("not a recording of this app")
        return value

    @field_validator("self_rating")
    @classmethod
    def _rating(cls, value: dict[str, int] | None) -> dict[str, int] | None:
        if value and any(not 1 <= v <= 5 for v in value.values()):
            raise ValueError("self-ratings are 1–5")
        return value


class SpeakingOut(BaseModel):
    id: int
    part: int
    prompt: str
    recording: str | None
    seconds: int
    transcript: str
    self_rating: dict[str, int]
    notes: str
    tutor_reply: str
    tutor_overall: float | None
    scores: dict[str, float]
    level_id: int | None
    test_key: str | None
    test_title: str | None = None  # v0.0.17: the named test's title, for the PDF
    model_answer: str
    model_recording: str | None
    pdf_file: str | None
    plan_task_id: int | None
    created_at: datetime
    updated_at: datetime


def _speaking_out(row: SpeakingAttempt, session) -> SpeakingOut:
    data = {c: getattr(row, c) for c in SpeakingOut.model_fields if hasattr(row, c)}
    data["test_title"] = _test_title(session, row)
    data["self_rating"] = json.loads(row.self_rating_json or "{}")
    data["scores"] = json.loads(row.scores_json or "{}")
    return SpeakingOut(**data)


def _speaking(session, attempt_id: int) -> SpeakingAttempt:
    row = session.get(SpeakingAttempt, attempt_id)
    if row is None:
        raise HTTPException(404, {"error": "not_found", "message": "no such recording"})
    return row


@router.post("/speaking", response_model=SpeakingOut, status_code=201)
def new_speaking(body: SpeakingIn, ctx: Ctx) -> SpeakingOut:
    now = utcnow()
    with ctx.session_factory.begin() as session:
        _check_task(session, body.plan_task_id)
        _check_test(session, body.test_key)
        row = SpeakingAttempt(
            part=body.part, prompt=body.prompt, recording=body.recording, seconds=body.seconds,
            transcript=body.transcript, self_rating_json=json.dumps(body.self_rating),
            notes=body.notes, plan_task_id=body.plan_task_id, test_key=body.test_key,
            created_at=now, updated_at=now,
        )
        session.add(row)
        session.flush()
        return _speaking_out(row, session)


@router.get("/speaking", response_model=list[SpeakingOut])
def list_speaking(
    ctx: Ctx, limit: Annotated[int, Query(ge=1, le=200)] = 30
) -> list[SpeakingOut]:
    with ctx.session_factory() as session:
        rows = session.scalars(select(SpeakingAttempt).order_by(
            SpeakingAttempt.created_at.desc(), SpeakingAttempt.id.desc()).limit(limit))
        return [_speaking_out(r, session) for r in rows]


@router.patch("/speaking/{attempt_id}", response_model=SpeakingOut)
def patch_speaking(attempt_id: int, body: SpeakingPatch, ctx: Ctx) -> SpeakingOut:
    with ctx.session_factory.begin() as session:
        row = _speaking(session, attempt_id)
        for field in ("prompt", "transcript", "notes", "tutor_reply", "model_answer",
                      "model_recording", "pdf_file", "recording", "seconds"):
            value = getattr(body, field)
            if value is not None:
                setattr(row, field, value)
        if body.self_rating is not None:
            row.self_rating_json = json.dumps(body.self_rating)
        if body.scores is not None:
            row.scores_json = json.dumps(body.scores)
        if "tutor_overall" in body.model_fields_set:
            row.tutor_overall = body.tutor_overall
            label = f"Speaking Part {row.part}" if row.part else "speaking"
            _sync_level(session, row, "speaking", label)
        row.updated_at = utcnow()
        session.flush()
        return _speaking_out(row, session)


@router.delete("/speaking/{attempt_id}")
def delete_speaking(attempt_id: int, ctx: Ctx) -> dict:
    """Deletes the attempt; the answer names its audio file for the desktop app to delete."""
    with ctx.session_factory.begin() as session:
        row = _speaking(session, attempt_id)
        recording, model = row.recording, row.model_recording
        row.tutor_overall = None
        _sync_level(session, row, "speaking", "")
        session.delete(row)
    return {"deleted": attempt_id, "recording": recording, "model_recording": model}
