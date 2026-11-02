"""Resource catalogue: keeps the `resources` table in step with the CSV files that ship
with the app (content/catalog/*.csv). Catalogue fields are refreshed on every start;
the owner's own fields (notes, progress, status, last opened) are never touched.
"""

import csv
import logging
import sys
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import utcnow
from app.models import RESOURCE_SKILLS, Resource

log = logging.getLogger("ielts_pilot.catalog")

PROVIDERS = {"DLK": "Dalilk", "OFF": "Official", "ENG": "engnovate"}


def catalog_dir() -> Path:
    bundle_root = getattr(sys, "_MEIPASS", None)
    if bundle_root:
        return Path(bundle_root) / "catalog"
    return Path(__file__).resolve().parents[2] / "content" / "catalog"


def _rows(directory: Path) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for path in sorted(directory.glob("*.csv")):
        with path.open(encoding="utf-8", newline="") as fh:
            rows.extend(csv.DictReader(fh))
    return rows


def _values(row: dict[str, str]) -> dict:
    skill = row["skill"].strip()
    if skill not in RESOURCE_SKILLS:
        raise ValueError(f"{row['catalog_id']}: unknown skill {skill!r}")
    return {
        "title": row["title_ar"].strip(),
        "provider": PROVIDERS.get(row["catalog_id"].split("-")[0], "Other"),
        "track": row["track"].strip(),
        "skill": skill,
        "activity_codes": row["activity_codes"].strip(),
        "resource_type": row["resource_type"].strip(),
        "format": row["format"].strip(),
        "url": row["url"].strip() or None,
        "needs_internet": row["needs_internet"].strip() != "no",
        "relevance": row["ielts_relevance_our_judgement"].strip(),
        "licence_note": row["licence_note"].strip(),
        "description": row.get("description_ar", "").strip(),
    }


def sync(session: Session, directory: Path | None = None) -> int:
    """Insert new catalogue rows and refresh catalogue fields of existing ones."""
    directory = directory or catalog_dir()
    if not directory.exists():
        log.warning("catalogue folder missing: %s", directory)
        return 0
    now = utcnow()
    existing = {
        r.catalog_id: r
        for r in session.scalars(select(Resource).where(Resource.catalog_id.is_not(None)))
    }
    changed = 0
    for row in _rows(directory):
        catalog_id = row["catalog_id"].strip()
        values = _values(row)
        current = existing.get(catalog_id)
        if current is None:
            session.add(Resource(catalog_id=catalog_id, created_at=now, updated_at=now, **values))
            changed += 1
        elif any(getattr(current, k) != v for k, v in values.items()):
            for key, value in values.items():
                setattr(current, key, value)
            current.updated_at = now
            changed += 1
    return changed
