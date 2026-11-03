"""ORM models (docs/DATABASE.md)."""

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, UTCDateTime

SKILLS = ("listening", "reading", "writing", "speaking")
LEVEL_SOURCES = ("official_practice", "external_marker", "placement_quiz", "self_estimate")
RESOURCE_SKILLS = (*SKILLS, "grammar", "vocabulary", "techniques", "general")
PLACEMENT_TESTS = ("dalilk_13english", "dalilk_3min")
SESSION_STATES = ("running", "confirmed", "unconfirmed", "discarded")
SESSION_ORIGINS = ("timer", "manual")


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
        CheckConstraint(
            "study_minutes_per_day BETWEEN 30 AND 840 AND study_minutes_per_day % 30 = 0",
            name="study_minutes",
        ),
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
            "source_type IN "
            "('official_practice', 'external_marker', 'placement_quiz', 'self_estimate')",
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


class PlacementResult(Base):
    """A result from one of Dalilk's placement tests, as the owner read it off the page."""

    __tablename__ = "placement_results"
    __table_args__ = (
        CheckConstraint("test IN ('dalilk_13english', 'dalilk_3min')", name="test"),
        CheckConstraint(
            f"approx_band IS NULL OR ({_band_check('approx_band')})", name="approx_band"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    test: Mapped[str] = mapped_column(String(20))
    level_label: Mapped[str] = mapped_column(String(40))
    approx_band: Mapped[float | None] = mapped_column(Float)
    taken_on: Mapped[date] = mapped_column(Date)
    notes: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)


class Resource(Base):
    __tablename__ = "resources"
    __table_args__ = (
        CheckConstraint(
            "skill IN ('listening', 'reading', 'writing', 'speaking', 'grammar', "
            "'vocabulary', 'techniques', 'general')",
            name="skill",
        ),
        CheckConstraint("status IN ('active', 'archived')", name="status"),
        CheckConstraint("url IS NOT NULL OR local_path IS NOT NULL", name="has_location"),
        Index("ix_resources_skill_status", "skill", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    catalog_id: Mapped[str | None] = mapped_column(String(20), unique=True)
    title: Mapped[str] = mapped_column(String(200))
    provider: Mapped[str] = mapped_column(String(40))
    # Dalilk track: foundation / fluency / ielts ("" for the owner's own resources)
    track: Mapped[str] = mapped_column(String(12), default="")
    skill: Mapped[str] = mapped_column(String(12))
    activity_codes: Mapped[str] = mapped_column(String(100), default="")
    resource_type: Mapped[str] = mapped_column(String(20))
    format: Mapped[str] = mapped_column(String(10))
    url: Mapped[str | None] = mapped_column(String(500))
    local_path: Mapped[str | None] = mapped_column(String(300))
    needs_internet: Mapped[bool] = mapped_column(Boolean, default=True)
    relevance: Mapped[str] = mapped_column(String(10), default="")
    licence_note: Mapped[str] = mapped_column(String(300), default="")
    description: Mapped[str] = mapped_column(String(500), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    progress_position: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(10), default="active")
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    last_opened_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)


class StudySession(Base):
    __tablename__ = "study_sessions"
    __table_args__ = (
        CheckConstraint(
            "skill IN ('listening', 'reading', 'writing', 'speaking', 'grammar', "
            "'vocabulary', 'techniques', 'general')",
            name="skill",
        ),
        CheckConstraint(
            "state IN ('running', 'confirmed', 'unconfirmed', 'discarded')", name="state"
        ),
        CheckConstraint("active_seconds >= 0", name="active_seconds"),
        CheckConstraint("origin IN ('timer', 'manual')", name="origin"),
        Index("ix_study_sessions_started", "started_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    started_at: Mapped[datetime] = mapped_column(UTCDateTime)
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    last_heartbeat_at: Mapped[datetime] = mapped_column(UTCDateTime)
    active_seconds: Mapped[int] = mapped_column(Integer, default=0)
    skill: Mapped[str] = mapped_column(String(12))
    activity_code: Mapped[str | None] = mapped_column(String(20))
    resource_id: Mapped[int | None] = mapped_column(
        ForeignKey("resources.id", ondelete="SET NULL")
    )
    plan_task_id: Mapped[int | None] = mapped_column(
        ForeignKey("plan_tasks.id", ondelete="SET NULL", name="fk_study_sessions_plan_task")
    )
    state: Mapped[str] = mapped_column(String(12), default="running")
    # timer = measured by the app; manual = hours the owner logged by hand (shown as such)
    origin: Mapped[str] = mapped_column(String(8), default="timer")
    notes: Mapped[str] = mapped_column(Text, default="")


class PlanTask(Base):
    """One block of a day's plan (generated by app/planner.py, docs/CURRICULUM.md)."""

    __tablename__ = "plan_tasks"
    __table_args__ = (
        CheckConstraint(
            "category IN ('listening', 'reading', 'output', 'exam', 'support')", name="category"
        ),
        CheckConstraint("status IN ('pending', 'in_progress', 'done', 'skipped')", name="status"),
        CheckConstraint("day_type IN ('study', 'mock', 'review', 'final_mock')", name="day_type"),
        CheckConstraint("planned_minutes > 0", name="planned_minutes"),
        UniqueConstraint("plan_date", "order_in_day", name="uq_plan_tasks_day_order"),
        Index("ix_plan_tasks_date_status", "plan_date", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plan_date: Mapped[date] = mapped_column(Date)
    order_in_day: Mapped[int] = mapped_column(Integer)
    day_type: Mapped[str] = mapped_column(String(12))
    category: Mapped[str] = mapped_column(String(10))
    skill: Mapped[str] = mapped_column(String(12))
    activity_code: Mapped[str] = mapped_column(String(20))
    planned_minutes: Mapped[int] = mapped_column(Integer)
    resource_id: Mapped[int | None] = mapped_column(
        ForeignKey("resources.id", ondelete="SET NULL")
    )
    title: Mapped[str] = mapped_column(String(200))
    instructions: Mapped[str] = mapped_column(Text, default="")
    reason: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(12), default="pending")
    skip_reason: Mapped[str | None] = mapped_column(String(300))
    inputs_hash: Mapped[str] = mapped_column(String(64))
    generator_version: Mapped[str] = mapped_column(String(20))
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    # planner-4 (0007): which content the task opens, e.g. {"kind": "videos", ...}
    content_json: Mapped[str | None] = mapped_column(Text)


CONTENT_KINDS = ("video", "novel", "test")


class ContentItem(Base):
    """A video, novel or practice test from the shipped catalogue (facts only, D-036),
    with the owner's progress. Catalogue fields are refreshed at start; progress is kept."""

    __tablename__ = "content_items"
    __table_args__ = (
        UniqueConstraint("kind", "key", name="uq_content_kind_key"),
        CheckConstraint("kind IN ('video', 'novel', 'test')", name="kind"),
        Index("ix_content_kind_sort", "kind", "sort"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(10))
    key: Mapped[str] = mapped_column(String(200))
    title: Mapped[str] = mapped_column(String(300))
    grp: Mapped[str] = mapped_column(String(20), default="")
    skill: Mapped[str] = mapped_column(String(12), default="")
    level: Mapped[str] = mapped_column(String(12), default="")
    provider: Mapped[str] = mapped_column(String(30), default="")
    sort: Mapped[int] = mapped_column(Integer)
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    url: Mapped[str] = mapped_column(String(1000))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    position_url: Mapped[str | None] = mapped_column(String(1000))  # 0008: novel's last page
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)


PODCAST_FEEDS = ("dalilk_ielts", "dalilk_english")


class PodcastEpisode(Base):
    """An episode of a podcast feed the listening player knows (imported from its RSS).

    Feeds: Dalilk IELTS podcast (SoundCloud) and Daily English Listening (Spotify for
    Podcasters); each episode description links its Google Drive script.
    """

    __tablename__ = "podcast_episodes"
    __table_args__ = (
        UniqueConstraint("feed", "guid", name="uq_podcast_feed_guid"),
        CheckConstraint("feed IN ('dalilk_ielts', 'dalilk_english')", name="feed"),
        CheckConstraint(
            "comprehension IS NULL OR comprehension BETWEEN 1 AND 5", name="comprehension"
        ),
        CheckConstraint("position_seconds >= 0", name="position"),
        CheckConstraint("stage BETWEEN 1 AND 4", name="stage"),
        Index("ix_podcast_feed_number", "feed", "number"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    feed: Mapped[str] = mapped_column(String(30))
    guid: Mapped[str] = mapped_column(String(300))
    number: Mapped[int | None] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(300))
    published_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    audio_url: Mapped[str] = mapped_column(String(1000))
    page_url: Mapped[str | None] = mapped_column(String(1000))
    transcript_id: Mapped[str | None] = mapped_column(String(100))  # Google Drive file id
    summary: Mapped[str] = mapped_column(Text, default="")
    position_seconds: Mapped[int] = mapped_column(Integer, default=0)
    # 0008: the stage reached (1 listen, 2 listen + PDF, 3 shadowing, 4 reading)
    stage: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    plays: Mapped[int] = mapped_column(Integer, default=0)
    comprehension: Mapped[int | None] = mapped_column(Integer)  # owner's 1–5 rating
    listened_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)


class Card(Base):
    """A flashcard (0009): Dalilk's 350 words and 150 phrases, read from Dalilk's pages on the
    owner's computer (D-041, never shipped), and the owner's own words. Spaced review by SM-2.
    """

    __tablename__ = "cards"
    __table_args__ = (
        UniqueConstraint("kind", "key", name="uq_card_kind_key"),
        CheckConstraint("kind IN ('word', 'phrase', 'mine', 'mistake')", name="kind"),
        CheckConstraint("ease >= 1.3", name="ease"),
        Index("ix_card_kind_due", "kind", "due"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(10))
    key: Mapped[str] = mapped_column(String(100))
    section: Mapped[str] = mapped_column(String(20), default="")  # basic, nouns, … emails, …
    situation: Mapped[str] = mapped_column(String(200), default="")  # phrases: the situation
    sort: Mapped[int] = mapped_column(Integer, default=0)
    front: Mapped[str] = mapped_column(String(300))  # English
    meaning: Mapped[str] = mapped_column(String(500), default="")  # Arabic
    example: Mapped[str] = mapped_column(String(500), default="")
    example_ar: Mapped[str] = mapped_column(String(500), default="")
    reps: Mapped[int] = mapped_column(Integer, default=0)
    lapses: Mapped[int] = mapped_column(Integer, default=0)
    ease: Mapped[float] = mapped_column(Float, default=2.5)
    interval_days: Mapped[int] = mapped_column(Integer, default=0)
    due: Mapped[date | None] = mapped_column(Date)  # NULL: not learned yet
    learned_on: Mapped[date | None] = mapped_column(Date)  # the day it was first reviewed
    reviewed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    shown_at: Mapped[datetime | None] = mapped_column(UTCDateTime)  # phrases: last pause shown
    # 0010: mistakes notebook (kind "mistake": front = what I wrote, meaning = the right form,
    # example = why, situation = context, section = writing / speaking)
    code: Mapped[str] = mapped_column(String(20), default="")  # CURRICULUM §6 error code
    source: Mapped[str] = mapped_column(String(100), default="")  # e.g. "AI tutor (opinion)"
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)


class WritingAttempt(Base):
    """An answer written in the writing lab (0010, PRD F6): the question, the text, time used,
    the self-review, and the AI tutor's reply kept as an opinion (D-026, D-008)."""

    __tablename__ = "writing_attempts"
    __table_args__ = (
        CheckConstraint("task IN (0, 1, 2)", name="task"),
        CheckConstraint("status IN ('draft', 'submitted')", name="status"),
        Index("ix_writing_created", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task: Mapped[int] = mapped_column(Integer)  # 1 = Task 1, 2 = Task 2, 0 = free writing
    prompt: Mapped[str] = mapped_column(Text, default="")
    text: Mapped[str] = mapped_column(Text, default="")
    words: Mapped[int] = mapped_column(Integer, default=0)
    seconds_used: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(10), default="draft")
    checklist_json: Mapped[str] = mapped_column(Text, default="[]")
    tutor_reply: Mapped[str] = mapped_column(Text, default="")
    tutor_overall: Mapped[float | None] = mapped_column(Float)  # AI opinion only
    plan_task_id: Mapped[int | None] = mapped_column(
        ForeignKey("plan_tasks.id", ondelete="SET NULL")
    )
    submitted_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)


class SpeakingAttempt(Base):
    """A recorded answer in the speaking lab (0010, PRD F7). The audio file stays in the data
    folder ("recordings"); deleting the attempt deletes it (done by the desktop app)."""

    __tablename__ = "speaking_attempts"
    __table_args__ = (
        CheckConstraint("part IN (0, 1, 2, 3)", name="part"),
        Index("ix_speaking_created", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    part: Mapped[int] = mapped_column(Integer)  # 0 = free speaking
    prompt: Mapped[str] = mapped_column(Text, default="")
    recording: Mapped[str | None] = mapped_column(String(100))  # file name in recordings/
    seconds: Mapped[int] = mapped_column(Integer, default=0)
    transcript: Mapped[str] = mapped_column(Text, default="")
    self_rating_json: Mapped[str] = mapped_column(Text, default="{}")
    notes: Mapped[str] = mapped_column(Text, default="")
    tutor_reply: Mapped[str] = mapped_column(Text, default="")
    tutor_overall: Mapped[float | None] = mapped_column(Float)  # AI opinion only
    plan_task_id: Mapped[int | None] = mapped_column(
        ForeignKey("plan_tasks.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)
