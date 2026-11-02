"""ORM models.

Packaging spike: a single key/value table to prove that data written through the
packaged app survives a restart. Replaced by the real schema (docs/DATABASE.md)
in Sprint 1.
"""

from datetime import datetime

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class SpikeKV(Base):
    __tablename__ = "spike_kv"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
