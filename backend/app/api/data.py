"""System info, backups, restore and delete-all (PRD F12)."""

from fastapi import APIRouter

from app import __version__, backup
from app.config import MIN_FREE_BYTES
from app.context import Ctx
from app.migrate import current_revision
from app.schemas import BackupInfo, DeleteAllIn, DeleteAllOut, RestoreOut, SystemInfo
from app.startup import prepare_data

router = APIRouter(prefix="/api/v1")


@router.get("/health")
def health(ctx: Ctx) -> dict:
    return {
        "status": "ok",
        "version": __version__,
        "schema_revision": ctx.schema_revision,
        "data_dir": str(ctx.settings.data_dir),
    }


@router.post("/shutdown")
def shutdown(ctx: Ctx) -> dict:
    ctx.request_shutdown()
    return {"status": "stopping"}


@router.get("/system", response_model=SystemInfo)
def system(ctx: Ctx) -> SystemInfo:
    s = ctx.settings
    free = backup.free_bytes(s.data_dir)
    return SystemInfo(
        version=__version__,
        schema_revision=current_revision(ctx.engine),
        data_dir=str(s.data_dir),
        backups_dir=str(s.backups_dir),
        db_size_bytes=s.db_path.stat().st_size if s.db_path.exists() else 0,
        free_bytes=free,
        low_disk=free < MIN_FREE_BYTES,
    )


@router.get("/backups", response_model=list[BackupInfo])
def list_backups(ctx: Ctx) -> list[BackupInfo]:
    return [BackupInfo(**item) for item in backup.list_backups(ctx.settings)]


@router.post("/backups", response_model=BackupInfo)
def create_backup(ctx: Ctx) -> BackupInfo:
    revision = current_revision(ctx.engine)
    path = backup.create_backup(ctx.settings, "manual", revision, __version__)
    items = backup.list_backups(ctx.settings)
    return next(BackupInfo(**item) for item in items if item["name"] == path.name)


@router.post("/backups/{name}/restore", response_model=RestoreOut)
def restore_backup(name: str, ctx: Ctx) -> RestoreOut:
    restored, safety = backup.restore(ctx.settings, ctx.engine, name, __version__)
    prepare_data(ctx)
    return RestoreOut(restored=restored, safety_backup=safety)


@router.delete("/backups/{name}")
def delete_backup(name: str, ctx: Ctx) -> dict:
    backup.delete_backup(ctx.settings, name)
    return {"deleted": name}


@router.post("/data/delete-all", response_model=DeleteAllOut)
def delete_all(body: DeleteAllIn, ctx: Ctx) -> DeleteAllOut:
    del body  # the literal "DELETE" confirmation is enforced by the schema
    safety = backup.delete_all(ctx.settings, ctx.engine, __version__)
    prepare_data(ctx)
    return DeleteAllOut(safety_backup=safety)
