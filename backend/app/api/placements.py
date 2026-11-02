"""Dalilk placement test results (13English, 3-minute speaking test) and owner settings."""

import json

from fastapi import APIRouter
from sqlalchemy import select

from app.context import Ctx
from app.db import utcnow
from app.models import AppSetting, PlacementResult, SkillLevel
from app.schemas import PlacementIn, PlacementOut, SettingsIO

router = APIRouter(prefix="/api/v1")

TEST_NAMES = {"dalilk_13english": "Dalilk 13English", "dalilk_3min": "Dalilk 3-min speaking"}


@router.get("/placements", response_model=list[PlacementOut])
def list_placements(ctx: Ctx) -> list[PlacementOut]:
    with ctx.session_factory() as session:
        rows = session.scalars(
            select(PlacementResult).order_by(
                PlacementResult.taken_on.desc(), PlacementResult.id.desc()
            )
        ).all()
        return [PlacementOut.model_validate(r, from_attributes=True) for r in rows]


@router.post("/placements", response_model=PlacementOut, status_code=201)
def add_placement(body: PlacementIn, ctx: Ctx) -> PlacementOut:
    now = utcnow()
    with ctx.session_factory.begin() as session:
        row = PlacementResult(
            test=body.test,
            level_label=body.level_label,
            approx_band=body.approx_band,
            taken_on=body.taken_on,
            notes=body.notes,
            created_at=now,
        )
        session.add(row)
        note = f"{TEST_NAMES[body.test]}: {body.level_label}"[:200]
        for skill in body.apply_to_skills:
            session.add(
                SkillLevel(
                    skill=skill,
                    band=body.approx_band,
                    source_type="placement_quiz",
                    source_note=note,
                    recorded_at=now,
                )
            )
        session.flush()
        return PlacementOut.model_validate(row, from_attributes=True)


DEFAULT_SETTINGS = SettingsIO(web_keep_signin=None)


@router.get("/settings", response_model=SettingsIO)
def get_settings(ctx: Ctx) -> SettingsIO:
    values = DEFAULT_SETTINGS.model_dump()
    with ctx.session_factory() as session:
        for row in session.scalars(select(AppSetting)):
            if row.key in values:
                values[row.key] = json.loads(row.value_json)
    return SettingsIO(**values)


@router.put("/settings", response_model=SettingsIO)
def put_settings(body: SettingsIO, ctx: Ctx) -> SettingsIO:
    now = utcnow()
    with ctx.session_factory.begin() as session:
        for key, value in body.model_dump(exclude_unset=True).items():
            row = session.get(AppSetting, key)
            if row is None:
                session.add(AppSetting(key=key, value_json=json.dumps(value), updated_at=now))
            else:
                row.value_json = json.dumps(value)
                row.updated_at = now
    return get_settings(ctx)
