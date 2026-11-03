"""Request/response models."""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models import SKILLS

Band = Annotated[float, Field(ge=0, le=9, multiple_of=0.5)]
Skill = Literal["listening", "reading", "writing", "speaking"]
SourceType = Literal["official_practice", "external_marker", "placement_quiz", "self_estimate"]
ResourceSkill = Literal[
    "listening", "reading", "writing", "speaking", "grammar", "vocabulary", "techniques", "general"
]
PlacementTest = Literal["dalilk_13english", "dalilk_3min"]

# Daily study time is chosen in half hours, from 0.5 h to 14 h.
MIN_DAY_MINUTES = 30
MAX_DAY_MINUTES = 14 * 60


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
    study_minutes_per_day: int = Field(
        ge=MIN_DAY_MINUTES, le=MAX_DAY_MINUTES, multiple_of=30
    )

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


class RestartIn(BaseModel):
    """Start the plan again from today (owner back after a break). Fields left out keep
    their current value; exam_date may be set to null to remove it."""

    model_config = ConfigDict(extra="forbid")

    today: date
    exam_date: date | None = None
    study_minutes_per_day: int | None = Field(
        default=None, ge=MIN_DAY_MINUTES, le=MAX_DAY_MINUTES, multiple_of=30
    )

    @model_validator(mode="after")
    def _exam_after_today(self) -> "RestartIn":
        if self.exam_date is not None and self.exam_date <= self.today:
            raise ValueError("exam_date must be after today")
        return self


class SettingsIO(BaseModel):
    """Owner preferences kept in app_settings. Every field is optional on write."""

    model_config = ConfigDict(extra="forbid")

    # Owner's consent to keep sites' sign-in cookies on this computer (Accounts tab).
    web_keep_signin: bool | None = None
    # Planner (D-023, D-025). Weekday numbers as in JavaScript: 0 = Sunday … 6 = Saturday.
    hours_per_band: int | None = Field(default=None, ge=50, le=600)
    study_weekdays: list[int] | None = Field(default=None, min_length=1, max_length=7)
    break_every_minutes: int | None = Field(default=None, ge=20, le=120)
    break_minutes: int | None = Field(default=None, ge=3, le=30)
    plan_start: date | None = None
    # One-minute pause between tasks (0 = off).
    interlude_seconds: int | None = Field(default=None, ge=0, le=180)

    @field_validator("study_weekdays")
    @classmethod
    def _weekdays(cls, value: list[int] | None) -> list[int] | None:
        if value is None:
            return None
        if any(d < 0 or d > 6 for d in value) or len(set(value)) != len(value):
            raise ValueError("study_weekdays must be distinct numbers 0-6")
        return sorted(value)


# --- placement tests -------------------------------------------------------------


def _not_future(value: date) -> date:
    if value > date.today():
        raise ValueError("date is in the future")
    return value


class PlacementIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    test: PlacementTest
    level_label: str = Field(min_length=1, max_length=40)
    approx_band: Band | None = None
    taken_on: date
    notes: str = Field(default="", max_length=300)
    # Also record approx_band as the current level of these skills (source: placement_quiz).
    apply_to_skills: list[Skill] = Field(default_factory=list, max_length=4)

    _check_date = field_validator("taken_on")(_not_future)

    @model_validator(mode="after")
    def _check(self) -> "PlacementIn":
        self.level_label = self.level_label.strip()
        self.notes = self.notes.strip()
        if not self.level_label:
            raise ValueError("level_label is empty")
        if self.apply_to_skills and self.approx_band is None:
            raise ValueError("apply_to_skills needs approx_band")
        if len(set(self.apply_to_skills)) != len(self.apply_to_skills):
            raise ValueError("each skill may appear only once")
        return self


class PlacementOut(BaseModel):
    id: int
    test: str
    level_label: str
    approx_band: float | None
    taken_on: date
    notes: str
    created_at: datetime


# --- resources --------------------------------------------------------------------

LOCAL_NAME = r"^[A-Za-z0-9][A-Za-z0-9._ ()\-]{0,200}$"


class ResourceIn(BaseModel):
    """A resource the owner adds by hand (a link, or a file already copied into library/)."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    skill: ResourceSkill
    url: str | None = Field(default=None, max_length=500, pattern=r"^https://\S+$")
    local_path: str | None = Field(default=None, pattern=LOCAL_NAME)
    resource_type: str = Field(default="other", max_length=20)
    format: str = Field(default="web", max_length=10)
    notes: str = Field(default="", max_length=5000)

    @model_validator(mode="after")
    def _one_location(self) -> "ResourceIn":
        self.title = self.title.strip()
        if not self.title:
            raise ValueError("title is empty")
        if (self.url is None) == (self.local_path is None):
            raise ValueError("give exactly one of url or local_path")
        return self


class ResourcePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    notes: str | None = Field(default=None, max_length=5000)
    progress_position: str | None = Field(default=None, max_length=100)
    status: Literal["active", "archived"] | None = None
    completed: bool | None = None


class ResourceOut(BaseModel):
    id: int
    catalog_id: str | None
    title: str
    provider: str
    track: str
    skill: str
    activity_codes: str
    resource_type: str
    format: str
    url: str | None
    local_path: str | None
    needs_internet: bool
    relevance: str
    licence_note: str
    description: str
    notes: str
    progress_position: str | None
    status: str
    completed_at: datetime | None
    last_opened_at: datetime | None
    created_at: datetime
    updated_at: datetime


# --- study sessions ---------------------------------------------------------------


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        raise ValueError("datetime must include a UTC offset")
    return value


class SessionStartIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    skill: ResourceSkill
    activity_code: str | None = Field(default=None, max_length=20)
    resource_id: int | None = None
    plan_task_id: int | None = None


class HeartbeatIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Seconds of real activity since the previous heartbeat (the app sends one every
    # 30 s and leaves out time the computer was idle).
    active_delta_seconds: int = Field(ge=0, le=120)


class SessionStopIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    notes: str = Field(default="", max_length=20000)  # may hold a whole essay


class SessionPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    state: Literal["confirmed", "discarded"] | None = None
    active_seconds: int | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=20000)


class ManualSessionIn(BaseModel):
    """Study done away from the app (a paper book, a class) logged by hand."""

    model_config = ConfigDict(extra="forbid")

    skill: ResourceSkill
    started_at: datetime
    minutes: int = Field(ge=1, le=MAX_DAY_MINUTES)
    notes: str = Field(default="", max_length=2000)
    # v0.0.7: time the owner says he spent on a plan task beyond what the timer counted
    plan_task_id: int | None = None

    _check_start = field_validator("started_at")(_aware)


class SessionOut(BaseModel):
    id: int
    started_at: datetime
    ended_at: datetime | None
    last_heartbeat_at: datetime
    active_seconds: int
    skill: str
    activity_code: str | None
    resource_id: int | None
    state: str
    origin: str
    notes: str
    plan_task_id: int | None = None


# --- plan ---------------------------------------------------------------------------


class EstimateIn(BaseModel):
    """Inputs for a what-if estimate during setup (nothing is saved)."""

    model_config = ConfigDict(extra="forbid")

    today: date
    target_overall: Band
    targets: dict[Skill, Band] | None = None
    current: dict[Skill, Band | None]
    exam_date: date | None = None
    study_weekdays: list[int] = Field(min_length=1, max_length=7)
    daily_minutes: int = Field(ge=MIN_DAY_MINUTES, le=MAX_DAY_MINUTES)
    hours_per_band: int = Field(default=200, ge=50, le=600)


class PlanTaskOut(BaseModel):
    id: int
    plan_date: date
    order_in_day: int
    day_type: str
    category: str
    skill: str
    activity_code: str
    planned_minutes: int
    resource_id: int | None
    title: str
    instructions: str
    reason: str
    status: str
    skip_reason: str | None
    started_at: datetime | None
    completed_at: datetime | None
    done_minutes: float = 0.0


class SkipIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str = Field(default="", max_length=300)
