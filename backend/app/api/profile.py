"""Learner profile and current skill levels (PRD F1)."""

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.context import AppContext, Ctx
from app.db import utcnow
from app.models import SKILLS, LearnerProfile, SkillLevel
from app.schemas import LevelOut, LevelsIn, LevelsOut, ProfileIn, ProfileOut

router = APIRouter(prefix="/api/v1")

HISTORY_LIMIT = 50


def _profile_out(row: LearnerProfile) -> ProfileOut:
    return ProfileOut.model_validate(row, from_attributes=True)


@router.get("/profile", response_model=ProfileOut)
def get_profile(ctx: Ctx) -> ProfileOut:
    with ctx.session_factory() as session:
        row = session.get(LearnerProfile, 1)
        if row is None:
            raise HTTPException(404, {"error": "no_profile", "message": "setup not completed"})
        return _profile_out(row)


@router.put("/profile", response_model=ProfileOut)
def put_profile(body: ProfileIn, ctx: Ctx) -> ProfileOut:
    now = utcnow()
    values = {
        "display_name": body.display_name,
        "interface_language": body.interface_language,
        "explanation_language": body.explanation_language,
        "target_overall": body.target_overall,
        "minimum_per_skill": body.minimum_per_skill,
        "exam_date": body.exam_date,
        "study_days_per_week": body.study_days_per_week,
        "study_minutes_per_day": body.study_minutes_per_day,
        **{f"target_{skill}": body.target_for(skill) for skill in SKILLS},
    }
    with ctx.session_factory.begin() as session:
        row = session.get(LearnerProfile, 1)
        if row is None:
            row = LearnerProfile(id=1, created_at=now, updated_at=now, **values)
            session.add(row)
        else:
            for key, value in values.items():
                setattr(row, key, value)
            row.updated_at = now
        session.flush()
        return _profile_out(row)


def _levels(ctx: AppContext) -> LevelsOut:
    with ctx.session_factory() as session:
        history = session.scalars(
            select(SkillLevel)
            .order_by(SkillLevel.recorded_at.desc(), SkillLevel.id.desc())
            .limit(HISTORY_LIMIT)
        ).all()
        current: dict[str, LevelOut | None] = {}
        for skill in SKILLS:
            latest = session.scalars(
                select(SkillLevel)
                .where(SkillLevel.skill == skill)
                .order_by(SkillLevel.recorded_at.desc(), SkillLevel.id.desc())
                .limit(1)
            ).first()
            current[skill] = (
                LevelOut.model_validate(latest, from_attributes=True) if latest else None
            )
        return LevelsOut(
            current=current,
            history=[LevelOut.model_validate(h, from_attributes=True) for h in history],
        )


@router.get("/skill-levels", response_model=LevelsOut)
def get_levels(ctx: Ctx) -> LevelsOut:
    return _levels(ctx)


@router.post("/skill-levels", response_model=LevelsOut)
def add_levels(body: LevelsIn, ctx: Ctx) -> LevelsOut:
    now = utcnow()
    with ctx.session_factory.begin() as session:
        for entry in body.entries:
            session.add(
                SkillLevel(
                    skill=entry.skill,
                    band=entry.band,
                    source_type=entry.source_type,
                    source_note=entry.source_note,
                    recorded_at=now,
                )
            )
    return _levels(ctx)
