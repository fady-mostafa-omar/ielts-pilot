"""ORM models (docs/DATABASE.md). Sprint 1a: profile, skill levels, settings."""

from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, Float, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, UTCDateTime

SKILLS = ("listening", "reading", "writing", "speaking")
LEVEL_SOURCES = ("official_practice", "external_marker", "self_estimate")


def _band_check(column: str) -> str:
    # 0–9 in steps of 0.5
    return f"{column} >= 0 AND {column} <= 9 AND ({column} * 2) = CAST({column} * 2 AS INTEGER)"


class LearnerProfile(Base):
    __tablename__ = "learner_profile"
    __table_args__ = (
        CheckConstraint("id = 1", name="single_row"),
        CheckConstraint("interface_language IN ('ar', 'en')", name="interface_language"),
        CheckConstraint(
            "explanation_language IN ('ar_heavy', 'balanced', 'en_heavy')",
            name="explanation_language",
        ),
        CheckConstraint(_band_check("target_overall"), name="target_overall_band"),
        CheckConstraint(_band_check("target_listening"), name="target_listening_band"),
        CheckConstraint(_band_check("target_reading"), name="target_reading_band"),
        CheckConstraint(_band_check("target_writing"), name="target_writing_band"),
        CheckConstraint(_band_check("target_speaking"), name="target_speaking_band"),
        CheckConstraint(_band_check("minimum_per_skill"), name="minimum_per_skill_band"),
        CheckConstraint("study_days_per_week BETWEEN 1 AND 7", name="study_days"),
        CheckConstraint("study_minutes_per_day BETWEEN 10 AND 600", name="study_minutes"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    display_name: Mapped[str | None] = mapped_column(String(60))
    interface_language: Mapped[str] = mapped_column(String(2))
    explanation_language: Mapped[str] = mapped_column(String(10))
    target_overall: Mapped[float] = mapped_column(Float)
    target_listening: Mapped[float] = mapped_column(Float)
    target_reading: Mapped[float] = mapped_column(Float)
    target_writing: Mapped[float] = mapped_column(Float)
    target_speaking: Mapped[float] = mapped_column(Float)
    minimum_per_skill: Mapped[float] = mapped_column(Float)
    exam_date: Mapped[date | None] = mapped_column(Date)
    study_days_per_week: Mapped[int] = mapped_column(Integer)
    study_minutes_per_day: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)


class SkillLevel(Base):
    __tablename__ = "skill_levels"
    __table_args__ = (
        CheckConstraint(
            "skill IN ('listening', 'reading', 'writing', 'speaking')", name="skill"
        ),
        CheckConstraint(_band_check("band"), name="band"),
        CheckConstraint(
            "source_type IN ('official_practice', 'external_marker', 'self_estimate')",
            name="source_type",
        ),
        Index("ix_skill_levels_skill_recorded", "skill", "recorded_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    skill: Mapped[str] = mapped_column(String(10))
    band: Mapped[float] = mapped_column(Float)
    source_type: Mapped[str] = mapped_column(String(20))
    source_note: Mapped[str] = mapped_column(String(200), default="")
    recorded_at: Mapped[datetime] = mapped_column(UTCDateTime)


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value_json: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)
