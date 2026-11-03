"""Content catalogue for planner-4 (D-036): videos, novels and practice tests.

The CSV files in content/catalog/items/ hold facts only (ids, titles, durations, levels,
URLs). They are synced into `content_items` at start; the owner's progress (started,
completed) is never touched by a sync. Items that disappear from the catalogue are kept
but marked inactive.
"""

import csv
import logging
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.catalog import catalog_dir
from app.db import utcnow
from app.models import ContentItem

log = logging.getLogger("ielts_pilot.content")

NOVEL_LEVELS = ("beginner", "intermediate", "upper")
PUBLUU = "https://publuu.com/flip-book/232773/{id}/page/1?embed"
YOUTUBE = "https://www.youtube.com/watch?v={id}"


def items_dir() -> Path:
    return catalog_dir() / "items"


def _read(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        log.warning("content catalogue missing: %s", path)
        return []
    with path.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def catalogue(directory: Path | None = None) -> list[dict]:
    directory = directory or items_dir()
    rows: list[dict] = []
    for r in _read(directory / "videos.csv"):
        rows.append(
            {
                "kind": "video",
                "key": r["video_id"].strip(),
                "title": r["title"].strip(),
                "grp": r["group"].strip(),
                "skill": r["skill"].strip(),
                "level": "",
                "provider": "youtube",
                "sort": int(r["order"]),
                "duration_seconds": int(r["duration_seconds"]),
                "url": YOUTUBE.format(id=r["video_id"].strip()),
            }
        )
    for r in _read(directory / "novels.csv"):
        rows.append(
            {
                "kind": "novel",
                "key": r["book_id"].strip(),
                "title": r["title"].strip(),
                "grp": "",
                "skill": "reading",
                "level": r["level"].strip(),
                "provider": "dalilk",
                "sort": int(r["order"]),
                "duration_seconds": None,
                "url": PUBLUU.format(id=r["book_id"].strip()),
            }
        )
    for r in _read(directory / "practice_tests.csv"):
        rows.append(
            {
                "kind": "test",
                "key": r["test_key"].strip(),
                "title": r["title"].strip(),
                "grp": "",
                "skill": r["skill"].strip(),
                "level": "",
                "provider": r["provider"].strip(),
                "sort": int(r["order"]),
                "duration_seconds": int(r["minutes"]) * 60,
                "url": r["url"].strip(),
            }
        )
    return rows


def sync(session: Session, directory: Path | None = None) -> int:
    now = utcnow()
    existing = {(c.kind, c.key): c for c in session.scalars(select(ContentItem))}
    seen: set[tuple[str, str]] = set()
    changed = 0
    for row in catalogue(directory):
        k = (row["kind"], row["key"])
        seen.add(k)
        current = existing.get(k)
        if current is None:
            session.add(ContentItem(active=True, created_at=now, updated_at=now, **row))
            changed += 1
        elif not current.active or any(getattr(current, f) != v for f, v in row.items()):
            for f, v in row.items():
                setattr(current, f, v)
            current.active = True
            current.updated_at = now
            changed += 1
    for k, item in existing.items():
        if k not in seen and item.active:
            item.active = False
            item.updated_at = now
            changed += 1
    return changed


def novel_level(mean_band: float | None) -> str:
    """Dalilk's three novel levels from the learner's mean band (CURRICULUM §4b)."""
    if mean_band is None or mean_band < 5.0:
        return "beginner"
    if mean_band <= 6.0:
        return "intermediate"
    return "upper"


def queue(
    session: Session,
    kind: str,
    *,
    groups: list[str] | None = None,
    skills: list[str] | None = None,
    providers: list[str] | None = None,
    level: str | None = None,
    minutes: int | None = None,
    limit: int | None = None,
    include_done: bool = False,
) -> list[ContentItem]:
    """The next unfinished items of a kind, in catalogue order (each item once).

    Videos: filtered by group and skill, taken until `minutes` is filled (at least one).
    Tests: by skill, providers in the given order. Novels: the level asked for, else the
    next level up when that level is finished.
    """
    base = select(ContentItem).where(ContentItem.kind == kind, ContentItem.active.is_(True))
    if not include_done:  # the review day may show watched technique videos again
        base = base.where(ContentItem.completed_at.is_(None))
    if skills:
        base = base.where(ContentItem.skill.in_(skills))
    if groups:
        base = base.where(ContentItem.grp.in_(groups))
    if kind == "novel":
        levels = list(NOVEL_LEVELS[NOVEL_LEVELS.index(level) :]) if level else list(NOVEL_LEVELS)
        for lv in levels:
            found = list(
                session.scalars(base.where(ContentItem.level == lv).order_by(ContentItem.sort))
            )
            if found:
                return found[: limit or 1]
        return []
    rows = list(session.scalars(base.order_by(ContentItem.sort)))
    if kind == "test" and providers:
        rank = {p: i for i, p in enumerate(providers)}
        rows = [r for r in rows if r.provider in rank]
        rows.sort(key=lambda r: (rank[r.provider], r.sort))
    if kind == "video" and groups:
        rank = {g: i for i, g in enumerate(groups)}
        rows.sort(key=lambda r: (rank.get(r.grp, 99), r.sort))
    if minutes is not None and kind == "video":
        # in order, skipping videos that do not fit the time left (they come on a day
        # with more time); when none fits, the next one comes alone
        picked: list[ContentItem] = []
        left = minutes * 60
        for r in rows:
            length = r.duration_seconds or 0
            if length <= left:
                picked.append(r)
                left -= length
        rows = picked or rows[:1]
    return rows[:limit] if limit else rows
