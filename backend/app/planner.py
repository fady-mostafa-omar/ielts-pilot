"""Planner-2: hours-to-goal estimate and day-by-day plan (docs/CURRICULUM.md §4a).

Pure functions over PlanInputs, so every rule is unit-tested and explainable:

* Estimate (D-023): total gap in bands × hours per band (default 200, editable) gives the
  hours needed; they are spread over the study days left before the goal date.
* Countdown (D-024): goal date = exam − 4 days; exam −4, −3, −2 are full practice tests;
  exam −1 is a light techniques review; a full practice test every second week before.
* Daily split (D-019): the phase picks the development share; each development hour is
  30 min listening + 20 reading + 10 writing/speaking. The exam share follows Dalilk's
  30-day order — one skill per week (biggest gap first): a technique video on the first
  study day of the week, practice on the others.
"""

import hashlib
import json
import math
from dataclasses import asdict, dataclass, field
from datetime import date, timedelta

GENERATOR = "planner-2"
SKILLS = ("listening", "reading", "writing", "speaking")
DEV_SHARE = {"foundation": 0.75, "development": 0.6, "exam": 0.35}
FINAL_MOCK_OFFSETS = (4, 3, 2)  # days before the exam
REVIEW_OFFSET = 1
LAST_STUDY_OFFSET = 5
MOCK_MINUTES = 165  # 30 + 60 + 60 + ~15
REVIEW_MAX_MINUTES = 120
MIN_BLOCK = 10
BIWEEKLY_MOCK_QUIET_DAYS = 10  # no extra mock this close to the final ones
# JavaScript weekday numbers (0 = Sunday … 6 = Saturday); rest days are taken in this
# order when only "days per week" is known: Friday first.
DEFAULT_REST_ORDER = (5, 4, 3, 2, 1, 0, 6)


def js_weekday(d: date) -> int:
    return (d.weekday() + 1) % 7


def week_start(d: date) -> date:
    """Weeks start on Saturday."""
    return d - timedelta(days=(js_weekday(d) + 1) % 7)


def default_weekdays(days_per_week: int) -> frozenset[int]:
    rest = DEFAULT_REST_ORDER[: 7 - max(1, min(7, days_per_week))]
    return frozenset(set(range(7)) - set(rest))


def ielts_overall(bands: list[float]) -> float:
    """IELTS rounding: x.25 goes up to x.5, x.75 up to the next whole band."""
    mean = sum(bands) / len(bands)
    whole = math.floor(mean)
    frac = mean - whole
    if frac < 0.25:
        return float(whole)
    if frac < 0.75:
        return whole + 0.5
    return float(whole + 1)


@dataclass(frozen=True)
class PlanInputs:
    today: date
    lang: str
    target_overall: float
    targets: dict[str, float]
    current: dict[str, float | None]
    exam_date: date | None
    daily_minutes: int
    weekdays: frozenset[int]
    hours_per_band: int
    plan_start: date
    hours_done: float = 0.0

    def key(self) -> dict:
        data = asdict(self)
        data.pop("hours_done")
        data.pop("today")
        data["weekdays"] = sorted(self.weekdays)
        return data


def inputs_hash(inputs: PlanInputs, day: date) -> str:
    raw = json.dumps({"day": day, "generator": GENERATOR, **inputs.key()}, default=str,
                     sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()


# --------------------------------------------------------------------- level and gap


def known_bands(inputs: PlanInputs) -> dict[str, float]:
    return {s: b for s, b in inputs.current.items() if b is not None and s in SKILLS}


def current_overall(inputs: PlanInputs) -> float | None:
    known = known_bands(inputs)
    return ielts_overall(list(known.values())) if known else None


def skill_gaps(inputs: PlanInputs) -> dict[str, float | None]:
    known = known_bands(inputs)
    return {
        s: (max(0.0, inputs.targets[s] - known[s]) if s in known else None) for s in SKILLS
    }


def exam_weights(inputs: PlanInputs) -> dict[str, float]:
    """Weight w = 0.10 + 0.60 × gap / Σgap (CURRICULUM §4 step 3); 0.25 each if no gap."""
    gaps = {s: (g if g is not None else 0.0) for s, g in skill_gaps(inputs).items()}
    total = sum(gaps.values())
    if total == 0:
        return dict.fromkeys(SKILLS, 0.25)
    return {s: round(0.10 + 0.60 * g / total, 4) for s, g in gaps.items()}


def phase_of(inputs: PlanInputs) -> str:
    if inputs.exam_date and (inputs.exam_date - inputs.today).days <= 28:
        return "exam"
    known = known_bands(inputs)
    if len(known) < len(SKILLS):
        return "development"
    mean = sum(known.values()) / len(known)
    if mean < 5.5:
        return "foundation"
    if mean < 6.5:
        return "development"
    return "exam"


def daily_split(inputs: PlanInputs) -> dict[str, int]:
    total = inputs.daily_minutes
    dev = total * DEV_SHARE[phase_of(inputs)]

    def round5(x: float) -> int:
        return int(5 * round(x / 5))

    split = {
        "listening": round5(dev * 30 / 60),
        "reading": round5(dev * 20 / 60),
        "output": round5(dev * 10 / 60),
    }
    split["exam"] = max(0, total - sum(split.values()))
    return split


# ------------------------------------------------------------------------ calendar


def is_study_day(inputs: PlanInputs, d: date) -> bool:
    return js_weekday(d) in inputs.weekdays


def study_days(inputs: PlanInputs, start: date, end: date) -> int:
    if end < start:
        return 0
    return sum(
        1 for i in range((end - start).days + 1) if is_study_day(inputs, start + timedelta(i))
    )


def goal_date(inputs: PlanInputs) -> date | None:
    if inputs.exam_date is None:
        return None
    return inputs.exam_date - timedelta(days=max(FINAL_MOCK_OFFSETS))


def last_study_date(inputs: PlanInputs) -> date | None:
    if inputs.exam_date is None:
        return None
    return inputs.exam_date - timedelta(days=LAST_STUDY_OFFSET)


def is_biweekly_mock(inputs: PlanInputs, d: date) -> bool:
    """Last study day of every second week after the plan started."""
    if not is_study_day(inputs, d):
        return False
    weeks = (week_start(d) - week_start(inputs.plan_start)).days // 7
    if weeks % 2 != 1:
        return False
    if inputs.exam_date and (inputs.exam_date - d).days <= BIWEEKLY_MOCK_QUIET_DAYS:
        return False
    end = week_start(d) + timedelta(days=6)
    later = [end - timedelta(i) for i in range((end - d).days)]
    return not any(is_study_day(inputs, x) for x in later)


def day_kind(inputs: PlanInputs, d: date) -> str:
    if inputs.exam_date is not None:
        offset = (inputs.exam_date - d).days
        if offset == 0:
            return "exam"
        if offset < 0:
            return "after_exam"
        if offset in FINAL_MOCK_OFFSETS:
            return "final_mock"
        if offset == REVIEW_OFFSET:
            return "review"
    if not is_study_day(inputs, d):
        return "rest"
    if is_biweekly_mock(inputs, d):
        return "mock"
    return "study"


def next_mock_date(inputs: PlanInputs) -> date | None:
    for i in range(0, 120):
        d = inputs.today + timedelta(days=i)
        if day_kind(inputs, d) in ("mock", "final_mock"):
            return d
    return None


# ------------------------------------------------------------------------ estimate


@dataclass
class Estimate:
    current_overall: float | None
    current_complete: bool
    target_overall: float
    gap_bands: float | None
    hours_per_band: int
    total_hours: float | None
    hours_done: float
    remaining_hours: float | None
    skill_gaps: dict[str, float | None]
    exam_weights: dict[str, float]
    phase: str
    daily_minutes: int
    split: dict[str, int]
    exam_date: date | None
    goal_date: date | None
    final_mock_dates: list[date]
    review_date: date | None
    study_days_left: int | None
    needed_minutes_per_day: int | None
    feasible: bool | None
    impossible: bool
    suggested_daily_minutes: int | None
    earliest_exam_date: date | None
    reachable_band: float | None
    next_mock_date: date | None = None
    notes: list[str] = field(default_factory=list)


def _ceil_to(value: float, step: int) -> int:
    return int(step * math.ceil(value / step))


def _floor_half(value: float) -> float:
    return math.floor(value * 2) / 2


def earliest_exam(inputs: PlanInputs, remaining_hours: float) -> date | None:
    if inputs.daily_minutes <= 0 or not inputs.weekdays:
        return None
    needed_days = math.ceil(remaining_hours * 60 / inputs.daily_minutes)
    if needed_days == 0:
        return inputs.today + timedelta(days=LAST_STUDY_OFFSET)
    count = 0
    for i in range(0, 3 * 366):
        d = inputs.today + timedelta(days=i)
        if is_study_day(inputs, d):
            count += 1
            if count == needed_days:
                return d + timedelta(days=LAST_STUDY_OFFSET)
    return None


def estimate(inputs: PlanInputs) -> Estimate:
    overall = current_overall(inputs)
    gaps = skill_gaps(inputs)
    known_gaps = [g for g in gaps.values() if g is not None]
    gap = None
    if overall is not None:
        mean_skill_gap = sum(known_gaps) / len(known_gaps) if known_gaps else 0.0
        gap = max(0.0, inputs.target_overall - overall, mean_skill_gap)
    total = None if gap is None else gap * inputs.hours_per_band
    remaining = None if total is None else max(0.0, total - inputs.hours_done)

    last = last_study_date(inputs)
    days_left = None if last is None else study_days(inputs, inputs.today, last)
    needed = feasible = suggested = earliest = reachable = None
    impossible = False
    notes: list[str] = []
    if remaining is not None and days_left is not None:
        if days_left == 0:
            notes.append("no_study_days_left")
            feasible = remaining == 0
        else:
            needed = math.ceil(remaining * 60 / days_left)
            feasible = needed <= inputs.daily_minutes
            impossible = needed > 14 * 60
            if not feasible:
                suggested = min(14 * 60, _ceil_to(needed, 30))
        if not feasible:
            earliest = earliest_exam(inputs, remaining)
            available = days_left * inputs.daily_minutes / 60
            reachable = _floor_half(
                (overall or 0) + (inputs.hours_done + available) / inputs.hours_per_band
            )
            reachable = min(reachable, inputs.target_overall)
    if overall is None:
        notes.append("no_level")
    elif len(known_bands(inputs)) < len(SKILLS):
        notes.append("partial_level")

    return Estimate(
        current_overall=overall,
        current_complete=len(known_bands(inputs)) == len(SKILLS),
        target_overall=inputs.target_overall,
        gap_bands=gap,
        hours_per_band=inputs.hours_per_band,
        total_hours=total,
        hours_done=round(inputs.hours_done, 2),
        remaining_hours=None if remaining is None else round(remaining, 2),
        skill_gaps=gaps,
        exam_weights=exam_weights(inputs),
        phase=phase_of(inputs),
        daily_minutes=inputs.daily_minutes,
        split=daily_split(inputs),
        exam_date=inputs.exam_date,
        goal_date=goal_date(inputs),
        final_mock_dates=(
            [inputs.exam_date - timedelta(days=o) for o in FINAL_MOCK_OFFSETS]
            if inputs.exam_date
            else []
        ),
        review_date=(
            inputs.exam_date - timedelta(days=REVIEW_OFFSET) if inputs.exam_date else None
        ),
        study_days_left=days_left,
        needed_minutes_per_day=needed,
        feasible=feasible,
        impossible=impossible,
        suggested_daily_minutes=suggested,
        earliest_exam_date=earliest,
        reachable_band=reachable,
        next_mock_date=next_mock_date(inputs),
        notes=notes,
    )


# ------------------------------------------------------------------------ day plan

TEXT = {
    "ar": {
        "skill": {
            "listening": "الاستماع",
            "reading": "القراءة",
            "writing": "الكتابة",
            "speaking": "المحادثة",
        },
        "phase": {"foundation": "التأسيس", "development": "التطوير", "exam": "الامتحان"},
        "L-EXT.title": "استماع ممتد",
        "L-EXT.do": "اسمع حلقة كاملة من غير ما توقف كتير. أي كلمة جديدة اكتبها في الملاحظات.",
        "R-EXT.title": "قراءة قصة على مستواك",
        "R-EXT.do": "اقرأ من قصة على مستواك واستمتع بيها. الكلمات الجديدة اكتبها في الملاحظات.",
        "S-FLU.title": "محادثة بصوت عالي",
        "S-FLU.do": "اختار سؤال أو موقف واتكلم بصوت عالي دقيقتين في كل مرة. كرّر بإجابة أحسن.",
        "W-REV.title": "كتابة حرة",
        "W-REV.do": "اكتب فقرة 120–150 كلمة عن أي موضوع، وبعدين راجعها وصلّح غلطاتك.",
        "dev.reason": "مرحلة {phase}: {pct}% من وقتك تطوير لغة، وكل ساعة تطوير = 30 دقيقة "
        "استماع + 20 قراءة + 10 كتابة وتحدث (تقسيم أ. حجازي).",
        "T-STRAT.title": "تكنيكات {skill}",
        "T-STRAT.do": "اتفرج على فيديو تكنيكات {skill} من سلسلة أهم التكنيكات، واكتب أهم 3 تركات "
        "في الملاحظات.",
        "L-PRAC.title": "تدريب استماع بالوقت",
        "L-PRAC.do": "حل Part أو أكتر من اختبار استماع بالوقت، وبعدين صحّح وشوف السكريبت للأسئلة "
        "اللي غلطت فيها.",
        "R-PRAC.title": "تدريب قراءة بالوقت",
        "R-PRAC.do": "حل قطعة قراءة في 20 دقيقة، وبعدين صحّح وارجع للنص في كل غلطة.",
        "W-T1.title": "تدريب Writing Task 1",
        "W-T1.do": "اكتب Task 1 في 20 دقيقة (150 كلمة على الأقل). بعدها قارنها بنموذج رسمي "
        "من المكتبة.",
        "W-T2.title": "تدريب Writing Task 2",
        "W-T2.do": "اكتب Task 2 في 40 دقيقة (250 كلمة على الأقل). بعدها قارنها بنموذج رسمي "
        "من المكتبة.",
        "S-PRAC.title": "تدريب Speaking بالوقت",
        "S-PRAC.do": "جاوب أسئلة Part 1 و2 و3 بصوت عالي بالوقت: Part 2 دقيقة تحضير ودقيقتين كلام.",
        "exam.reason": "أسبوع {skill} في جزء الامتحان (فرقك فيها {gap}). نفس ترتيب جدول دليلك: "
        "تكنيك الأول، وبعدين تدريب.",
        "MOCK.title": "اختبار تجريبي كامل",
        "MOCK.do": "اختبار كامل بالترتيب وبالوقت: استماع 30 د، قراءة 60 د، كتابة 60 د، محادثة "
        "11–14 د. سجّل درجاتك بعدها في الإعدادات ← المستوى.",
        "MOCK.reason": "اختبار كل أسبوعين عشان نقيس تقدمك بأرقام حقيقية.",
        "FINAL.reason": "آخر 4 أيام: المفروض تكون وصلت لهدفك، والأيام دي اختبارات كاملة.",
        "REVIEW.title": "مراجعة التكنيكات",
        "REVIEW.do": "مراجعة خفيفة لأهم التكنيكات والتركات في كل قسم بس — "
        "مفيش حاجة جديدة النهارده. نام بدري.",
        "REVIEW.reason": "آخر يوم قبل الامتحان: مراجعة بس.",
    },
    "en": {
        "skill": {
            "listening": "Listening",
            "reading": "Reading",
            "writing": "Writing",
            "speaking": "Speaking",
        },
        "phase": {"foundation": "Foundation", "development": "Development", "exam": "Exam"},
        "L-EXT.title": "Extended listening",
        "L-EXT.do": "Listen to a whole episode without stopping much. Note new words.",
        "R-EXT.title": "Read a story at your level",
        "R-EXT.do": "Read from a story at your level and enjoy it. Note new words.",
        "S-FLU.title": "Speak out loud",
        "S-FLU.do": "Pick a question or situation and speak out loud for two minutes at a time. "
        "Repeat with a better answer.",
        "W-REV.title": "Free writing",
        "W-REV.do": "Write 120–150 words on any topic, then review and fix mistakes.",
        "dev.reason": "{phase} phase: {pct}% of your time is English development; each "
        "development hour = 30 min listening + 20 reading + 10 writing and speaking "
        "(Hegazy's split).",
        "T-STRAT.title": "{skill} techniques",
        "T-STRAT.do": "Watch the {skill} techniques video and note the top 3 tricks.",
        "L-PRAC.title": "Timed listening practice",
        "L-PRAC.do": "Do one or more Listening parts on time, then check and read the transcript "
        "for the questions you missed.",
        "R-PRAC.title": "Timed reading practice",
        "R-PRAC.do": "Do one passage in 20 minutes, then check and go back to the text for each "
        "mistake.",
        "W-T1.title": "Writing Task 1 practice",
        "W-T1.do": "Write Task 1 in 20 minutes (at least 150 words), then compare with an "
        "official sample from the library.",
        "W-T2.title": "Writing Task 2 practice",
        "W-T2.do": "Write Task 2 in 40 minutes (at least 250 words), then compare with an "
        "official sample from the library.",
        "S-PRAC.title": "Timed speaking practice",
        "S-PRAC.do": "Answer Part 1, 2 and 3 questions out loud on time: Part 2 is one minute to "
        "prepare and two to speak.",
        "exam.reason": "{skill} week in the exam part (your gap: {gap}). Same order as Dalilk's "
        "plan: technique first, then practice.",
        "MOCK.title": "Full practice test",
        "MOCK.do": "A full test in order and on time: Listening 30 min, Reading 60, Writing 60, "
        "Speaking 11–14. Record your scores in Settings → Level afterwards.",
        "MOCK.reason": "A full test every two weeks measures your progress with real numbers.",
        "FINAL.reason": "Last 4 days: you should have reached your goal; "
        "these days are full tests.",
        "REVIEW.title": "Techniques review",
        "REVIEW.do": "Light review of the key techniques and tricks for each section only — "
        "nothing new today. Sleep early.",
        "REVIEW.reason": "The day before the exam: review only.",
    },
}

LISTEN_EASY, LISTEN_IELTS = "DLK-11", "DLK-20"
STORIES = "DLK-07"
SPEAK_EASY, SPEAK_IELTS = "DLK-13", "DLK-19"
TECHNIQUES = "DLK-17"
PRACTICE_TESTS = ("OFF-01", "ENG-01", "OFF-02")


@dataclass
class Block:
    category: str
    skill: str
    activity_code: str
    minutes: int
    catalog_id: str | None
    title: str
    instructions: str
    reason: str


def _mean_level(inputs: PlanInputs) -> float | None:
    known = known_bands(inputs)
    return sum(known.values()) / len(known) if known else None


def focus_skill(inputs: PlanInputs, d: date) -> str:
    """Skill of the week for the exam part: biggest gap first, then Dalilk's order."""
    gaps = skill_gaps(inputs)
    order = sorted(SKILLS, key=lambda s: (-(gaps[s] or 0.0), SKILLS.index(s)))
    weeks = (week_start(d) - week_start(inputs.plan_start)).days // 7
    return order[weeks % len(order)]


def _first_study_day_of_week(inputs: PlanInputs, d: date) -> bool:
    start = week_start(d)
    return not any(
        is_study_day(inputs, start + timedelta(i)) for i in range((d - start).days)
    )


def _day_number(inputs: PlanInputs, d: date) -> int:
    return (d - inputs.plan_start).days


def day_blocks(inputs: PlanInputs, d: date) -> tuple[str, list[Block]]:
    t = TEXT.get(inputs.lang, TEXT["ar"])
    kind = day_kind(inputs, d)
    n = _day_number(inputs, d)

    if kind in ("exam", "after_exam", "rest"):
        return kind, []
    if kind in ("mock", "final_mock"):
        test = PRACTICE_TESTS[n % 2]
        reason = t["FINAL.reason"] if kind == "final_mock" else t["MOCK.reason"]
        return kind, [Block("exam", "general", "MOCK", MOCK_MINUTES, test, t["MOCK.title"],
                            t["MOCK.do"], reason)]
    if kind == "review":
        minutes = min(REVIEW_MAX_MINUTES, max(30, inputs.daily_minutes))
        return kind, [Block("exam", "techniques", "T-STRAT", minutes, TECHNIQUES,
                            t["REVIEW.title"], t["REVIEW.do"], t["REVIEW.reason"])]

    split = daily_split(inputs)
    phase = phase_of(inputs)
    level = _mean_level(inputs)
    dev_reason = t["dev.reason"].format(
        phase=t["phase"][phase], pct=round(DEV_SHARE[phase] * 100)
    )
    easy = level is not None and level < 5.5
    blocks = [
        Block("listening", "listening", "L-EXT", split["listening"],
              LISTEN_EASY if level is not None and level < 5.0 else LISTEN_IELTS,
              t["L-EXT.title"], t["L-EXT.do"], dev_reason),
        Block("reading", "reading", "R-EXT", split["reading"], STORIES,
              t["R-EXT.title"], t["R-EXT.do"], dev_reason),
    ]
    if n % 2 == 0:
        blocks.append(Block("output", "speaking", "S-FLU", split["output"],
                            SPEAK_EASY if easy else SPEAK_IELTS,
                            t["S-FLU.title"], t["S-FLU.do"], dev_reason))
    else:
        blocks.append(Block("output", "writing", "W-REV", split["output"], None,
                            t["W-REV.title"], t["W-REV.do"], dev_reason))

    if split["exam"] > 0:
        skill = focus_skill(inputs, d)
        gap = skill_gaps(inputs)[skill]
        reason = t["exam.reason"].format(
            skill=t["skill"][skill], gap="—" if gap is None else f"{gap:.1f}"
        )
        if _first_study_day_of_week(inputs, d):
            blocks.append(Block("exam", "techniques", "T-STRAT", split["exam"], TECHNIQUES,
                                t["T-STRAT.title"].format(skill=t["skill"][skill]),
                                t["T-STRAT.do"].format(skill=t["skill"][skill]), reason))
        else:
            code, cat_id = {
                "listening": ("L-PRAC", PRACTICE_TESTS[n % 2]),
                "reading": ("R-PRAC", PRACTICE_TESTS[n % 2]),
                # written on the app's writing pad; official samples are in the library
                "writing": ("W-T2" if split["exam"] >= 40 else "W-T1", None),
                "speaking": ("S-PRAC", SPEAK_IELTS),
            }[skill]
            blocks.append(Block("exam", skill, code, split["exam"], cat_id,
                                t[f"{code}.title"], t[f"{code}.do"], reason))

    # Blocks shorter than MIN_BLOCK minutes go into the longest development block.
    kept = [b for b in blocks if b.minutes >= MIN_BLOCK]
    spare = sum(b.minutes for b in blocks if b.minutes < MIN_BLOCK)
    if not kept:
        kept = [blocks[0]]
        kept[0].minutes = inputs.daily_minutes
    elif spare:
        longest = max((b for b in kept if b.category != "exam"), key=lambda b: b.minutes,
                      default=kept[0])
        longest.minutes += spare
    return kind, kept
