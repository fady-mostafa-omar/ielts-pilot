"""Resource library: the shipped catalogue plus links and files the owner adds."""

from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import select

from app.context import AppContext, Ctx
from app.db import utcnow
from app.models import Resource
from app.schemas import ResourceIn, ResourceOut, ResourcePatch

router = APIRouter(prefix="/api/v1")


def _out(row: Resource) -> ResourceOut:
    return ResourceOut.model_validate(row, from_attributes=True)


def _get(session, resource_id: int) -> Resource:
    row = session.get(Resource, resource_id)
    if row is None:
        raise HTTPException(404, {"error": "not_found", "message": "no such resource"})
    return row


def _library_file(ctx: AppContext, name: str):
    path = (ctx.settings.library_dir / name).resolve()
    if path.parent != ctx.settings.library_dir.resolve():
        raise HTTPException(400, {"error": "bad_path", "message": "file must be in library"})
    return path


@router.get("/resources", response_model=list[ResourceOut])
def list_resources(ctx: Ctx, include_archived: bool = False) -> list[ResourceOut]:
    with ctx.session_factory() as session:
        query = select(Resource).order_by(Resource.skill, Resource.catalog_id, Resource.id)
        if not include_archived:
            query = query.where(Resource.status == "active")
        return [_out(r) for r in session.scalars(query)]


@router.post("/resources", response_model=ResourceOut, status_code=201)
def add_resource(body: ResourceIn, ctx: Ctx) -> ResourceOut:
    if body.local_path is not None and not _library_file(ctx, body.local_path).is_file():
        raise HTTPException(
            400, {"error": "missing_file", "message": "copy the file into library first"}
        )
    now = utcnow()
    with ctx.session_factory.begin() as session:
        row = Resource(
            catalog_id=None,
            title=body.title,
            provider="Mine",
            track="",
            skill=body.skill,
            activity_codes="",
            resource_type=body.resource_type,
            format=body.format,
            url=body.url,
            local_path=body.local_path,
            needs_internet=body.url is not None,
            notes=body.notes,
            status="active",
            created_at=now,
            updated_at=now,
        )
        session.add(row)
        session.flush()
        return _out(row)


@router.patch("/resources/{resource_id}", response_model=ResourceOut)
def patch_resource(resource_id: int, body: ResourcePatch, ctx: Ctx) -> ResourceOut:
    now = utcnow()
    changes = body.model_dump(exclude_unset=True)
    with ctx.session_factory.begin() as session:
        row = _get(session, resource_id)
        if "notes" in changes and body.notes is not None:
            row.notes = body.notes
        if "progress_position" in changes:
            row.progress_position = body.progress_position
        if body.status is not None:
            row.status = body.status
        if body.completed is not None:
            row.completed_at = now if body.completed else None
        row.updated_at = now
        session.flush()
        return _out(row)


@router.post("/resources/{resource_id}/opened", response_model=ResourceOut)
def mark_opened(resource_id: int, ctx: Ctx) -> ResourceOut:
    with ctx.session_factory.begin() as session:
        row = _get(session, resource_id)
        row.last_opened_at = utcnow()
        session.flush()
        return _out(row)


@router.delete("/resources/{resource_id}", status_code=204)
def delete_resource(resource_id: int, ctx: Ctx) -> Response:
    """Only resources the owner added can be deleted; catalogue items are archived instead."""
    with ctx.session_factory.begin() as session:
        row = _get(session, resource_id)
        if row.catalog_id is not None:
            raise HTTPException(
                409, {"error": "catalog_item", "message": "archive catalogue items instead"}
            )
        local = row.local_path
        session.delete(row)
    if local:
        path = _library_file(ctx, local)
        path.unlink(missing_ok=True)
    return Response(status_code=204)
