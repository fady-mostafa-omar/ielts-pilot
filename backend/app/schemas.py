"""Request/response models."""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models import SKILLS

Band = Annotated[float, Field(ge=0, le=9, multiple_of=0.5)]
Skill = Literal["listening", "reading", "writing", "speaking"]
SourceType = Literal["official_practice", "external_marker", "self_estimate"]


class ProfileIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, max_length=60)
    interface_language: Literal["ar", "en"] = "ar"
    explanation_language: Literal["ar_heavy", "balanced", "en_heavy"] = "balanced"
    target_overall: Band
    # Per-skill targets default to the overall target when omitted.
    target_listening: Band | None = None
    target_reading: Band | None = None
    target_writing: Band | None = None
    target_speaking: Band | None = None
    minimum_per_skill: Band
    exam_date: date | None = None
    study_days_per_week: int = Field(ge=1, le=7)
    study_minutes_per_day: int = Field(ge=10, le=600)

    @field_validator("display_name")
    @classmethod
    def _strip_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    def target_for(self, skill: str) -> float:
        value = getattr(self, f"target_{skill}")
        return self.target_overall if value is None else value

    @model_validator(mode="after")
    def _check(self) -> "ProfileIn":
        for skill in SKILLS:
            target = self.target_for(skill)
            if target < self.minimum_per_skill:
                raise ValueError(
                    f"target_{skill} ({target}) is below minimum_per_skill "
                    f"({self.minimum_per_skill})"
                )
        if self.exam_date is not None and self.exam_date < date.today():
            raise ValueError("exam_date is in the past")
        return self


class ProfileOut(BaseModel):
    display_name: str | None
    interface_language: str
    explanation_language: str
    target_overall: float
    target_listening: float
    target_reading: float
    target_writing: float
    target_speaking: float
    minimum_per_skill: float
    exam_date: date | None
    study_days_per_week: int
    study_minutes_per_day: int
    created_at: datetime
    updated_at: datetime


class LevelEntryIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    skill: Skill
    band: Band
    source_type: SourceType
    source_note: str = Field(default="", max_length=200)

    @model_validator(mode="after")
    def _note_required(self) -> "LevelEntryIn":
        self.source_note = self.source_note.strip()
        if self.source_type != "self_estimate" and not self.source_note:
            raise ValueError(
                f"source_note is required for {self.source_type} (e.g. the test's name)"
            )
        return self


class LevelsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entries: list[LevelEntryIn] = Field(min_length=1, max_length=4)

    @model_validator(mode="after")
    def _unique_skills(self) -> "LevelsIn":
        skills = [e.skill for e in self.entries]
        if len(skills) != len(set(skills)):
            raise ValueError("each skill may appear only once")
        return self


class LevelOut(BaseModel):
    id: int
    skill: str
    band: float
    source_type: str
    source_note: str
    recorded_at: datetime


class LevelsOut(BaseModel):
    current: dict[str, LevelOut | None]
    history: list[LevelOut]


class BackupInfo(BaseModel):
    name: str
    kind: str | None
    created_at: datetime | None
    app_version: str | None
    schema_revision: str | None
    size_bytes: int
    valid: bool
    problem: str | None = None


class RestoreOut(BaseModel):
    restored: str
    safety_backup: str


class DeleteAllIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    confirm: Literal["DELETE"]


class DeleteAllOut(BaseModel):
    safety_backup: str


class SystemInfo(BaseModel):
    version: str
    schema_revision: str | None
    data_dir: str
    backups_dir: str
    db_size_bytes: int
    free_bytes: int
    low_disk: bool
