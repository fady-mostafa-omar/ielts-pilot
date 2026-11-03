"""Planner-4: hours-to-goal estimate and day-by-day plan (docs/CURRICULUM.md §4b, §4a).

Planner-4 (v0.0.8, D-035) follows Dalilk's 90-day method: a fixed development hour every
day plus a focus block on one thing per week. The estimate and the final days are planner-2's.

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

GENERATOR = "planner-7"  # v0.0.11: 10 min of word cards a day (D-041)
SKILLS = ("listening", "reading", "writing", "speaking")
DEV_SHARE = {"foundation": 0.75, "development": 0.6, "exam": 0.35}
FINAL_MOCK_OFFSETS = (4, 3, 2)  # days before the exam
REVIEW_OFFSET = 1
LAST_STUDY_OFFSET = 5
MOCK_MINUTES = 165  # 30 + 60 + 60 + ~15
REVIEW_MAX_MINUTES = 120
MIN_BLOCK = 5
BIWEEKLY_MOCK_QUIET_DAYS = 10  # no extra mock this close to the final ones
SPELL_MINUTES = 15  # Dalilk spelling challenge, twice a week outside the exam phase
WEEK_ORDER = (6, 0, 1, 2, 3, 4, 5)  # JS weekdays from Saturday
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
    exam_format: str = "computer"  # D-037: computer | paper

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
        "weekday": {0: "الأحد", 1: "الاتنين", 2: "التلات", 3: "الأربع", 4: "الخميس",
                    5: "الجمعة", 6: "السبت"},
        "and": " و",
        "L-EXT.title": "بودكاست بالمراحل الأربعة",
        "L-EXT.do": "كل بودكاست ساعة: 4 مراحل كل واحدة ربع ساعة — اسمع من غير PDF، اسمع مع الـ PDF، شادوينج، وقراءة بفهم. لو الوقت خلص في نص البودكاست، بكرة بتكمّل من نفس المرحلة.",
        "L-SPELL.title": "تحدي الإملاء",
        "L-SPELL.do": "اسمع واكتب الكلمات بالحروف الصح — الأسماء والأرقام والتواريخ بتضيّع درجات "
        "في الاستماع لو اتكتبت غلط.",
        "L-SPELL.reason": "الإملاء ليه يومين ثابتين في الأسبوع ({days}) في أسابيع التطوير.",
        "R-EXT.title": "قراءة رواية على مستواك",
        "R-EXT.do": "الرواية حوالي نص ساعة. لو الوقت خلص قبلها، بكرة بتكمّل نفس الرواية. الكلمات الجديدة اكتبها في الملاحظات.",
        "S-FLU.title": "محادثة بصوت عالي",
        "S-FLU.do": "ابدأ بتسجيل دقيقة: اتكلم عن يومك أو عرّف نفسك، واسمع نفسك. وبعدين اختار سؤال أو موقف واتكلم بصوت عالي.",
        "W-REV.title": "كتابة حرة",
        "W-REV.do": "اكتب فقرة 120–150 كلمة عن أي موضوع، وبعدين راجعها وصلّح غلطاتك.",
        "dev.reason": "تطوير دليلك بنسب 30 استماع : 20 قراءة : 5 كتابة : 5 محادثة — ساعة على الأقل كل يوم، وبيكبر مع وقتك.",
        "devL.reason": "أسبوع تطوير الاستماع (خطة دليلك): ساعات التركيز كلها بودكاست على مستواك.",
        "devR.reason": "أسبوع تطوير القراءة (خطة دليلك): ساعات التركيز كلها روايات على مستواك.",
        "round.reason": "أسبوع {skill} (الدورة {round} من خطة دليلك): أول يومين تكنيكات، وبعدها تدريب.",
        "overflow.reason": "باقي وقتك النهارده بعد التدريب: استماع وقراءة (العمود الفقري في خطة دليلك).",
        "CARDS.title": "كلمات اليوم",
        "CARDS.do": "كروت الكلمات: المراجعات الأول، وبعدين كلمات جديدة من أهم 350 كلمة. اقلب الكارت، اسمع النطق، واختار قد إيه كنت فاكرها.",
        "CARDS.reason": "كل كلمة بترجعلك قبل ما تنساها بالظبط (تكرار متباعد). 10 دقايق من وقت التركيز، والتطوير زي ما هو.",
        "MOCKREV.title": "مراجعة غلطات الاختبار",
        "MOCKREV.do": "ارجع لكل سؤال غلطت فيه في الاختبار: ليه غلطت؟ واكتب التركة اللي كانت هتحله.",
        "FOCUS-L.title": "ساعات الاستماع",
        "FOCUS-L.do": "بودكاست ورا بودكاست بالمراحل الأربعة، كل مرحلة ربع ساعة. لو تعبت خد 5 دقايق بريك كل نص ساعة وكمّل.",
        "FOCUS-R.title": "ساعات القراءة",
        "FOCUS-R.do": "رواية ورا رواية على مستواك، كل رواية حوالي نص ساعة. الكلمات الجديدة اكتبها في الملاحظات.",
        "DEVVID.title": "إزاي تبدأ: فيديو قصير",
        "VID.title": "فيديوهات تكنيكات {skill}",
        "VID.do": "الفيديوهات بتشتغل ورا بعض ملء الشاشة. اكتب أهم التركات في الملاحظات.",
        "VID-T1.title": "فيديوهات تكنيكات Task 1",
        "VID-T2.title": "فيديوهات تكنيكات Task 2",
        "PVID.title": "تدريب عملي مع الفيديو ({skill})",
        "PVID.do": "حل مع الفيديو، ووقّف وحل لوحدك قبل ما تشوف الإجابة.",
        "TEST.title": "اختبار {skill} تجريبي ({n})",
        "TEST.do": "الاختبار بيفتح على طول. حلّه بالوقت، وبعدين صحّح وارجع لكل غلطة.",
        "W-T1x.do": "اكتب {n} إجابة Task 1: كل واحدة 20 دقيقة (150 كلمة على الأقل) + 10 دقايق مراجعة.",
        "W-T2x.do": "اكتب {n} إجابة Task 2: كل واحدة 40 دقيقة (250 كلمة على الأقل) + 10 دقايق مراجعة.",
        "W-DEV.title": "كتابة يومية",
        "W-DEV.do": "اكتب 5 جمل أو أكتر عن يومك أو عن اللي سمعته وقريته النهارده.",
        "S-PHRASE.title": "العبارات اليومية (فيديو)",
        "S-PHRASE.do": "ابدأ بتسجيل دقيقة عن يومك أو عرّف نفسك، وبعدين فيديو العبارات اليومية بالترتيب وردّد العبارات بصوت عالي.",
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
        "S-PRAC.do": "ابدأ بتسجيل دقيقة عن يومك أو عرّف نفسك. وبعدين جاوب أسئلة Part 1 و2 و3 بصوت عالي بالوقت: Part 2 دقيقة تحضير ودقيقتين كلام.",
        "exam.reason": "أسبوع {skill} في جزء الامتحان (فرقك فيها {gap}). نفس ترتيب جدول دليلك: "
        "تكنيك الأول، وبعدين تدريب.",
        "MOCK.title": "اختبار تجريبي كامل",
        "MOCK.do": "اختبار كامل بالترتيب وبالوقت (استماع، قراءة، كتابة، محادثة) بيفتح على طول. "
        "سجّل درجاتك بعدها في الإعدادات ← المستوى.",
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
        "weekday": {0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday",
                    5: "Friday", 6: "Saturday"},
        "and": " and ",
        "L-EXT.title": "Podcast in four stages",
        "L-EXT.do": "Each podcast is an hour: four 15-minute stages — listen without the PDF, listen with it, shadowing, then read it for meaning. If time runs out mid-podcast, tomorrow carries on from the same stage.",
        "L-SPELL.title": "Spelling challenge",
        "L-SPELL.do": "Listen and write the words with the right spelling — names, numbers and "
        "dates cost Listening marks when misspelt.",
        "L-SPELL.reason": "Spelling has two fixed days a week ({days}) in the development weeks.",
        "R-EXT.title": "Read a story at your level",
        "R-EXT.do": "A novel takes about half an hour. If time runs out first, tomorrow carries on with the same one. Note new words.",
        "S-FLU.title": "Speak out loud",
        "S-FLU.do": "Start with a one-minute recording: talk about your day or introduce "
        "yourself, and listen to it. Then pick a question or situation and speak out loud.",
        "W-REV.title": "Free writing",
        "W-REV.do": "Write 120–150 words on any topic, then review and fix mistakes.",
        "dev.reason": "Dalilk's development, 30 listening : 20 reading : 5 writing : 5 speaking — at least an hour every day, growing with your time.",
        "devL.reason": "Listening development week (Dalilk's plan): the focus hours are podcasts at your level.",
        "devR.reason": "Reading development week (Dalilk's plan): the focus hours are novels at your level.",
        "round.reason": "{skill} week (round {round} of Dalilk's plan): two days of techniques, then practice.",
        "overflow.reason": "The rest of today's time after practice: listening and reading (the backbone of Dalilk's plan).",
        "CARDS.title": "Today's words",
        "CARDS.do": "Word cards: reviews first, then new words from the 350. Flip the card, hear it, and say how well you knew it.",
        "CARDS.reason": "Each word comes back just before you would forget it (spaced repetition). 10 minutes from the focus time; development stays as it is.",
        "MOCKREV.title": "Review the test's mistakes",
        "MOCKREV.do": "Go back to every question you missed: why? Note the trick that would have solved it.",
        "FOCUS-L.title": "Listening hours",
        "FOCUS-L.do": "Podcast after podcast in four stages of 15 minutes. If tired, take 5 minutes every half hour.",
        "FOCUS-R.title": "Reading hours",
        "FOCUS-R.do": "Novel after novel at your level, about half an hour each. Note new words.",
        "DEVVID.title": "How to start: a short video",
        "VID.title": "{skill} technique videos",
        "VID.do": "The videos play one after another, full screen. Note the key tricks.",
        "VID-T1.title": "Task 1 technique videos",
        "VID-T2.title": "Task 2 technique videos",
        "PVID.title": "Practice with the video ({skill})",
        "PVID.do": "Solve along; pause and try on your own before the answer.",
        "TEST.title": "{skill} practice test ({n})",
        "TEST.do": "The test opens directly. Do it on time, then check and go back to each mistake.",
        "W-T1x.do": "Write {n} Task 1 answers: 20 minutes each (at least 150 words) + 10 minutes review.",
        "W-T2x.do": "Write {n} Task 2 answers: 40 minutes each (at least 250 words) + 10 minutes review.",
        "W-DEV.title": "Daily writing",
        "W-DEV.do": "Write 5 sentences or more about your day or what you heard and read today.",
        "S-PHRASE.title": "Daily phrases (video)",
        "S-PHRASE.do": "Start with a one-minute recording about your day or yourself, then the next daily-phrases video. Repeat the phrases out loud.",
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
        "S-PRAC.do": "Start with a one-minute recording about your day or yourself. Then answer "
        "Part 1, 2 and 3 questions out loud on time: Part 2 is one minute to prepare and two "
        "to speak.",
        "exam.reason": "{skill} week in the exam part (your gap: {gap}). Same order as Dalilk's "
        "plan: technique first, then practice.",
        "MOCK.title": "Full practice test",
        "MOCK.do": "A full test in order and on time (Listening, Reading, Writing, Speaking) opens "
        "directly. Record your scores in Settings → Level afterwards.",
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
WORDS = "DLK-04"
SPELLING = "DLK-21"
SPEAK_EASY, SPEAK_IELTS = "DLK-13", "DLK-19"
TECHNIQUES = "DLK-17"
PRACTICE_TESTS = ("OFF-01", "ENG-01", "OFF-02")

# planner-4 (CURRICULUM §4b)
DEV_HOUR = 60
STAGE_MINUTES = 15  # one of the podcast's four stages (owner, 2026-11-03)
PODCAST_MINUTES = 4 * STAGE_MINUTES
NOVEL_MINUTES = 30  # a Dalilk novel, on average (owner, 2026-11-03)
CARDS_MINUTES = 10  # word cards every study day, from the focus time (D-041)
WRITE_DEV = SPEAK_DEV = 5
PHRASE_VIDEO_MINUTES = 20  # Dalilk's daily-phrases videos average ~19 min
TEST_MINUTES = {"listening": 40, "reading": 75, "writing": 70, "speaking": 20}
REAL_TEST_MINUTES = {"listening": 30, "reading": 60}  # the exam's own time
# caps per day, so a very long day does not become 14 tests in a row; the rest of the
# focus time goes to podcast + novels (Dalilk: listening/reading input is the backbone)
MAX_TECH_VIDEO = 240
MAX_TESTS = 4
# focus time in the exam weeks is shared, not given to one thing (owner 2026-11-03)
TECH_SHARE = 0.6  # technique days: 60 % videos, 40 % practice right away
TEST_SHARE = 0.5  # test days: about half the focus time in tests (review included)
WRITE_SHARE = 0.6  # writing days: about 60 % writing answers
MOCK_REVIEW_MAX = 60  # final test days: mistakes review after the full test
MAX_PRACTICE_VIDEO = 120
MAX_WRITING_TASKS = 4
MAX_SPEAKING = 60
T1_MINUTES, T2_MINUTES = 30, 50  # 20 + 10 review, 40 + 10 review
EXAM_ROUND = ("listening", "reading", "writing", "speaking")
DEFAULT_WEEKS = 12
SKILL_CODE = {"listening": "L", "reading": "R", "speaking": "S"}


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
    content: dict | None = None


def _mean_level(inputs: PlanInputs) -> float | None:
    known = known_bands(inputs)
    return sum(known.values()) / len(known) if known else None


def _round5(x: float) -> int:
    return int(5 * round(x / 5))


def spelling_weekdays(inputs: PlanInputs) -> frozenset[int]:
    """Fixed spelling days: the 2nd and 4th study day of the week (one day with 1-3)."""
    days = [w for w in WEEK_ORDER if w in inputs.weekdays]
    if not days:
        return frozenset()
    if len(days) >= 4:
        return frozenset((days[1], days[3]))
    return frozenset((days[min(1, len(days) - 1)],))


def _weekday_names(t: dict, weekdays: frozenset[int]) -> str:
    return t["and"].join(t["weekday"][w] for w in WEEK_ORDER if w in weekdays)


# ------------------------------------------------------------------ weeks (planner-4)


def study_weeks(inputs: PlanInputs) -> int | None:
    """Calendar weeks (from Saturday) from the plan start to the last study day."""
    last = last_study_date(inputs)
    if last is None:
        return None
    start = week_start(inputs.plan_start)
    if last < inputs.plan_start:
        return 0
    return (week_start(last) - start).days // 7 + 1


def _dev_weeks(count: int) -> list[str]:
    out: list[str] = []
    while count > 0:
        if count >= 4:
            out += ["devL", "devL", "devR", "devR"]
            count -= 4
        elif count == 3:
            out += ["devL", "devL", "devR"]
            count = 0
        elif count == 2:
            out += ["devL", "devR"]
            count = 0
        else:
            out += ["devL"]
            count = 0
    return out


def week_plan(inputs: PlanInputs) -> dict:
    """The sequence of week types and what had to be cut (shown on My plan)."""
    weeks = study_weeks(inputs)
    total = DEFAULT_WEEKS if weeks is None else weeks
    notes: list[str] = []
    if total >= 8:
        seq = [(w, 0) for w in _dev_weeks(total - 8)]
        seq += [(s, 1) for s in EXAM_ROUND] + [(s, 2) for s in EXAM_ROUND]
    elif total >= 4:
        seq = [(w, 0) for w in _dev_weeks(total - 4)] + [(s, 1) for s in EXAM_ROUND]
        notes.append("no_consolidation")
    else:
        seq = []
        notes.append("squeezed")
    if total < 12:
        notes.append("short_plan")
    return {"weeks": total, "default": weeks is None, "sequence": seq, "notes": notes}


def _study_days_between(inputs: PlanInputs, start: date, end: date) -> list[date]:
    return [
        start + timedelta(i)
        for i in range((end - start).days + 1)
        if is_study_day(inputs, start + timedelta(i))
    ]


def week_info(inputs: PlanInputs, d: date) -> tuple[str, int, int, int]:
    """(week type, round, k = study-day index in that run, n = study days in the run)."""
    plan = week_plan(inputs)
    last = last_study_date(inputs)
    if "squeezed" in plan["notes"] and last is not None:
        days = _study_days_between(inputs, inputs.plan_start, last)
        if d not in days:
            return "L", 1, 0, 1
        idx = days.index(d)
        total = len(days)
        bounds = [round(i * total / 4) for i in range(5)]
        part = max(i for i in range(4) if bounds[i] <= idx)
        run = max(1, bounds[part + 1] - bounds[part])
        return EXAM_ROUND[part][0].upper(), 1, idx - bounds[part], run
    i = (week_start(d) - week_start(inputs.plan_start)).days // 7
    seq = plan["sequence"]
    if i < len(seq):
        wtype, rnd = seq[i]
    else:  # no exam date: keep repeating the consolidation round
        j = (i - len(seq)) % 4
        wtype, rnd = EXAM_ROUND[j], 2
    ws = week_start(d)
    lo = max(ws, inputs.plan_start)
    hi = ws + timedelta(days=6)
    if last is not None:
        hi = min(hi, last)
    days = _study_days_between(inputs, lo, hi)
    k = days.index(d) if d in days else 0
    code = wtype if wtype.startswith("dev") else wtype[0].upper()
    return code, rnd, k, max(1, len(days))


def phase_of(inputs: PlanInputs) -> str:
    code, _, _, _ = week_info(inputs, inputs.today)
    if code.startswith("dev"):
        level = _mean_level(inputs)
        return "foundation" if level is not None and level < 5.5 else "development"
    return "exam"


def split_dev(dev: int) -> dict[str, int]:
    """Development minutes split 30:20:5:5 (writing and speaking each 1/12, at least 5)."""
    out = max(WRITE_DEV, _round5(dev / 12)) if dev >= 30 else 0
    listening = _round5((dev - 2 * out) * 0.6)
    reading = dev - 2 * out - listening
    return {"listening": listening, "reading": reading, "writing": out, "speaking": out}


def dev_minutes(daily: int) -> dict[str, int]:
    """Development time on Dalilk's ratio (his 3-hour day: 1 h development + 2 h on the
    week's skill) and never under one hour (D-039, owner 2026-11-03): 2 h -> 30/20/5/5 + 1 h
    focus, 3 h -> 30/20/5/5 + 2 h, 6 h -> 60/40/10/10 + 4 h."""
    dev = min(daily, max(DEV_HOUR, _round5(daily / 3)))
    return split_dev(dev)


def daily_split(inputs: PlanInputs) -> dict[str, int]:
    """Today's minutes by part, for the charts: development hour + focus block."""
    dev = dev_minutes(inputs.daily_minutes)
    focus = max(0, inputs.daily_minutes - sum(dev.values()))
    code, _, _, _ = week_info(inputs, inputs.today)
    split = {
        "listening": dev["listening"],
        "reading": dev["reading"],
        "output": dev["writing"] + dev["speaking"],
        "exam": 0,
    }
    if code == "devL":
        split["listening"] += focus
    elif code == "devR":
        split["reading"] += focus
    else:
        split["exam"] += focus
    return split


def focus_skill(inputs: PlanInputs, d: date) -> str:
    code, _, _, _ = week_info(inputs, d)
    return {"devL": "listening", "devR": "reading", "L": "listening", "R": "reading",
            "W": "writing", "S": "speaking"}[code]


# ------------------------------------------------------------------ day blocks


def _video_groups(inputs: PlanInputs, rnd: int) -> list[str]:
    level = _mean_level(inputs)
    groups = ["core", "computer" if inputs.exam_format == "computer" else "paper"]
    if level is not None and level < 5.5:
        groups.append("low")
    if rnd >= 2 or inputs.target_overall >= 7.0:
        groups.append("high")
    if rnd >= 2:
        groups.append("practice")
    return groups


def _videos(t: dict, skills: list[str], groups: list[str], minutes: int, reason: str,
            skill: str, title_key: str = "VID.title") -> Block:
    return Block("exam", skill, "T-VID", minutes, TECHNIQUES,
                 t[title_key].format(skill=t["skill"].get(skill, skill)),
                 t["VID.do"], reason,
                 {"kind": "videos", "groups": groups, "skills": skills, "minutes": minutes})


def _overflow(inputs: PlanInputs, t: dict, minutes: int, reason: str) -> list[Block]:
    """Focus time beyond the day's caps: listening and reading input (60 / 40)."""
    if minutes < MIN_BLOCK:
        return []
    level = _mean_level(inputs)
    feed = "dalilk_english" if level is not None and level < 5.0 else "dalilk_ielts"
    listen = _round5(minutes * 0.6)
    out = [Block("listening", "listening", "L-EXT", listen,
                 LISTEN_EASY if feed == "dalilk_english" else LISTEN_IELTS,
                 t["FOCUS-L.title"], t["FOCUS-L.do"], t["overflow.reason"],
                 {"kind": "podcast", "feed": feed})]
    if minutes - listen >= MIN_BLOCK:
        out.append(Block("reading", "reading", "R-EXT", minutes - listen, STORIES,
                         t["FOCUS-R.title"], t["FOCUS-R.do"], t["overflow.reason"],
                         {"kind": "novel", "level": novel_level(level)}))
    del reason
    return out


def _tests(inputs: PlanInputs, t: dict, skill: str, rnd: int, minutes: int,
           reason: str) -> list[Block]:
    per = TEST_MINUTES[skill]
    if minutes < REAL_TEST_MINUTES.get(skill, 0):
        # no time for a whole test today: a practice video instead of a cut-down test
        return [Block("exam", skill, "P-VID", minutes, TECHNIQUES,
                      t["PVID.title"].format(skill=t["skill"][skill]), t["PVID.do"], reason,
                      {"kind": "videos", "groups": ["practice", "high"],
                       "skills": [SKILL_CODE.get(skill, "W1")], "minutes": minutes})]
    count = max(1, min(MAX_TESTS, round(minutes * TEST_SHARE / per)))
    providers = ["engnovate", "ieltsonlinetests"] if rnd >= 2 else ["ieltsonlinetests"]
    test_minutes = min(minutes, count * per)
    title = t["TEST.title"].format(skill=t["skill"][skill], n=count)
    content = {"kind": "tests", "skills": [skill], "providers": providers, "count": count}
    blocks = [Block("exam", skill, "P-TEST", test_minutes, None, title, t["TEST.do"], reason,
                    content)]
    rest = minutes - test_minutes
    video = min(_round5(rest / 2) if rest >= 40 else rest, MAX_PRACTICE_VIDEO)
    if video >= 10:
        blocks.append(Block("exam", skill, "P-VID", video, TECHNIQUES,
                            t["PVID.title"].format(skill=t["skill"][skill]), t["PVID.do"], reason,
                            {"kind": "videos", "groups": ["practice", "high"],
                             "skills": [SKILL_CODE.get(skill, "W1")], "minutes": video}))
        rest -= video
    return blocks + _overflow(inputs, t, rest, reason)


def _techniques(inputs: PlanInputs, t: dict, skills: list[str], groups: list[str],
                minutes: int, reason: str, skill: str, rnd: int,
                title_key: str = "VID.title") -> list[Block]:
    video = min(_round5(minutes * TECH_SHARE) if minutes >= 60 else minutes, MAX_TECH_VIDEO)
    real = REAL_TEST_MINUTES.get(skill)
    if real and 0 < minutes - video < real:
        # never a cut-down test: give the test its real time, or keep the day for videos
        video = minutes - real if minutes - real >= 15 else min(minutes, MAX_TECH_VIDEO)
    blocks = [_videos(t, skills, groups, video, reason, skill, title_key)]
    rest = minutes - video
    if rest >= MIN_BLOCK:
        if skill in ("listening", "reading"):
            blocks += _tests(inputs, t, skill, rnd, rest, reason)
        elif skill == "writing":
            task = 2 if skills == ["W2"] else 1
            blocks += _writing(inputs, t, task, rest, reason)
        else:
            blocks += _speaking(inputs, t, rest, reason)
    return blocks


def _writing(inputs: PlanInputs, t: dict, task: int, minutes: int, reason: str) -> list[Block]:
    per = T1_MINUTES if task == 1 else T2_MINUTES
    count = max(1, min(MAX_WRITING_TASKS, round(minutes * WRITE_SHARE / per)))
    if count * per > minutes:
        count = max(1, minutes // per)
    used = min(minutes, count * per)
    blocks = [Block("exam", "writing", f"W-T{task}", used, None, t[f"W-T{task}.title"],
                    t[f"W-T{task}x.do"].format(n=count), reason,
                    {"kind": "writing", "task": task, "count": count})]
    rest = minutes - used
    video = min(_round5(rest / 2) if rest >= 40 else rest, MAX_PRACTICE_VIDEO)
    if video >= 10:
        blocks.append(Block("exam", "writing", "P-VID", video, TECHNIQUES,
                            t["PVID.title"].format(skill=t["skill"]["writing"]), t["PVID.do"],
                            reason, {"kind": "videos", "groups": ["practice", "high"],
                                     "skills": [f"W{task}"], "minutes": video}))
        rest -= video
    return blocks + _overflow(inputs, t, rest, reason)


def _speaking(inputs: PlanInputs, t: dict, minutes: int, reason: str) -> list[Block]:
    practice = min(MAX_SPEAKING, _round5(minutes / 2) if minutes >= 40 else minutes)
    blocks = [Block("exam", "speaking", "S-PRAC", practice, SPEAK_IELTS,
                    t["S-PRAC.title"], t["S-PRAC.do"], reason, None)]
    rest = minutes - practice
    video = min(_round5(rest / 2) if rest >= 40 else rest, MAX_PRACTICE_VIDEO)
    if video >= 10:
        blocks.append(Block("exam", "speaking", "P-VID", video, TECHNIQUES,
                            t["PVID.title"].format(skill=t["skill"]["speaking"]), t["PVID.do"],
                            reason, {"kind": "videos", "groups": ["practice", "high"],
                                     "skills": ["S"], "minutes": video}))
        rest -= video
    return blocks + _overflow(inputs, t, rest, reason)


def _focus_blocks(inputs: PlanInputs, t: dict, d: date, focus: int) -> list[Block]:
    if focus <= 0:
        return []
    code, rnd, k, n = week_info(inputs, d)
    level = _mean_level(inputs)
    groups = _video_groups(inputs, rnd)
    if code == "devL":
        reason = t["devL.reason"]
        blocks = []
        if k == 0 and focus >= 10 + MIN_BLOCK:
            blocks.append(_videos(t, ["L"], ["dev"], 10, reason, "listening", "DEVVID.title"))
            focus -= 10
        feed = "dalilk_english" if level is not None and level < 5.0 else "dalilk_ielts"
        blocks.append(Block("listening", "listening", "L-EXT", focus,
                            LISTEN_EASY if feed == "dalilk_english" else LISTEN_IELTS,
                            t["FOCUS-L.title"], t["FOCUS-L.do"], reason,
                            {"kind": "podcast", "feed": feed}))
        return [b for b in blocks if b.minutes >= MIN_BLOCK]
    if code == "devR":
        reason = t["devR.reason"]
        blocks = []
        if k == 0 and focus >= 20 + MIN_BLOCK:
            blocks.append(_videos(t, ["R"], ["dev"], 20, reason, "reading", "DEVVID.title"))
            focus -= 20
        blocks.append(Block("reading", "reading", "R-EXT", focus, STORIES,
                            t["FOCUS-R.title"], t["FOCUS-R.do"], reason,
                            {"kind": "novel", "level": novel_level(level)}))
        return [b for b in blocks if b.minutes >= MIN_BLOCK]

    skill = {"L": "listening", "R": "reading", "W": "writing", "S": "speaking"}[code]
    reason = t["round.reason"].format(skill=t["skill"][skill], round=rnd)
    if code in ("L", "R"):
        if k <= 1:
            return _techniques(inputs, t, [code], groups, focus, reason, skill, rnd)
        return _tests(inputs, t, skill, rnd, focus, reason)
    if code == "W":
        t1_days = max(1, -(-3 * n // 7))
        task = 1 if k < t1_days else 2
        first = k == 0 or k == t1_days
        if first:
            return _techniques(inputs, t, [f"W{task}"], groups, focus, reason, "writing", rnd,
                               f"VID-T{task}.title")
        blocks: list[Block] = []
        if k == n - 1 and n >= 3:
            per_test = TEST_MINUTES["writing"]
            blocks.append(Block("exam", "writing", "P-TEST", min(focus, per_test), None,
                                t["TEST.title"].format(skill=t["skill"]["writing"], n=1),
                                t["TEST.do"], reason,
                                {"kind": "tests", "skills": ["writing"],
                                 "providers": (["engnovate", "ieltsonlinetests"] if rnd >= 2
                                               else ["ieltsonlinetests"]), "count": 1}))
            focus -= blocks[0].minutes
            if focus < MIN_BLOCK:
                return blocks
        return blocks + _writing(inputs, t, task, focus, reason)
    # speaking
    if k == 0:
        return _techniques(inputs, t, ["S"], groups, focus, reason, "speaking", rnd)
    return _speaking(inputs, t, focus, reason)


def novel_level(mean_band: float | None) -> str:
    if mean_band is None or mean_band < 5.0:
        return "beginner"
    if mean_band <= 6.0:
        return "intermediate"
    return "upper"


def day_blocks(inputs: PlanInputs, d: date) -> tuple[str, list[Block]]:
    t = TEXT.get(inputs.lang, TEXT["ar"])
    kind = day_kind(inputs, d)

    if kind in ("exam", "after_exam", "rest"):
        return kind, []
    if kind == "final_mock":
        offset = (inputs.exam_date - d).days if inputs.exam_date else 0
        providers = (["britishcouncil", "dalilk"]
                     if inputs.exam_format == "computer" and offset == max(FINAL_MOCK_OFFSETS)
                     else ["dalilk"])
        blocks = [Block("exam", "general", "MOCK", MOCK_MINUTES, None, t["MOCK.title"],
                        t["MOCK.do"], t["FINAL.reason"],
                        {"kind": "tests", "skills": ["full"], "providers": providers,
                         "count": 1})]
        rest = inputs.daily_minutes - MOCK_MINUTES
        if rest >= 20:  # a long day: review the test's mistakes, then development
            review = min(MOCK_REVIEW_MAX, _round5(rest * 0.4))
            blocks.append(Block("exam", "general", "MOCK-REV", review, None,
                                t["MOCKREV.title"], t["MOCKREV.do"], t["FINAL.reason"], None))
            blocks += _dev_tail(inputs, t, d, split_dev(rest - review), False, 0)[0]
        return kind, _units([b for b in blocks if b.minutes >= MIN_BLOCK])
    if kind == "review":
        minutes = min(REVIEW_MAX_MINUTES, max(30, inputs.daily_minutes))
        return kind, [Block("exam", "techniques", "T-STRAT", minutes, TECHNIQUES,
                            t["REVIEW.title"], t["REVIEW.do"], t["REVIEW.reason"],
                            {"kind": "videos", "groups": ["core"], "skills": ["L", "R", "W1",
                             "W2", "S"], "minutes": minutes, "review": True})]

    dev = dev_minutes(inputs.daily_minutes)
    focus = inputs.daily_minutes - sum(dev.values())
    code, _, k, _ = week_info(inputs, d)
    tail, focus = _dev_tail(inputs, t, d, dev, code.startswith("dev"), focus)
    # word cards: from the focus time, or from the novel on a day with no focus time
    reading = next((b for b in tail if b.activity_code == "R-EXT"), None)
    room = focus >= CARDS_MINUTES
    if room:
        focus -= CARDS_MINUTES
    elif reading is not None and reading.minutes >= CARDS_MINUTES + MIN_BLOCK:
        reading.minutes -= CARDS_MINUTES
        room = True
    cards = [Block("support", "vocabulary", "V-CARDS", CARDS_MINUTES, WORDS, t["CARDS.title"],
                   t["CARDS.do"], t["CARDS.reason"], {"kind": "cards", "deck": "word"})
             ] if room else []
    blocks: list[Block] = []
    for b in _focus_blocks(inputs, t, d, focus) + cards + tail:
        same = next((x for x in blocks if x.activity_code == b.activity_code
                     and x.content == b.content and b.activity_code in ("L-EXT", "R-EXT")), None)
        if same is not None:
            same.minutes += b.minutes
        else:
            blocks.append(b)
    blocks = [b for b in blocks if b.minutes >= MIN_BLOCK]
    if not blocks:
        blocks = [tail[0]]
        blocks[0].minutes = inputs.daily_minutes
    return kind, _units(blocks)


def _dev_tail(inputs: PlanInputs, t: dict, d: date, dev: dict[str, int], in_dev_week: bool,
              focus: int) -> tuple[list[Block], int]:
    """The development blocks (podcast, novel, writing, speaking) and the focus time left."""
    level = _mean_level(inputs)
    dev_reason = t["dev.reason"]
    tail: list[Block] = []
    feed = "dalilk_english" if level is not None and level < 5.0 else "dalilk_ielts"
    listen = dev["listening"]
    spell_days = spelling_weekdays(inputs)
    spell = min(SPELL_MINUTES, listen - 10)
    if in_dev_week and js_weekday(d) in spell_days and spell >= 10:
        listen -= spell
    tail.append(Block("listening", "listening", "L-EXT", listen,
                      LISTEN_EASY if feed == "dalilk_english" else LISTEN_IELTS,
                      t["L-EXT.title"], t["L-EXT.do"], dev_reason,
                      {"kind": "podcast", "feed": feed}))
    if listen != dev["listening"]:
        tail.append(Block("listening", "listening", "L-SPELL", dev["listening"] - listen,
                          SPELLING, t["L-SPELL.title"], t["L-SPELL.do"],
                          t["L-SPELL.reason"].format(days=_weekday_names(t, spell_days))))
    tail.append(Block("reading", "reading", "R-EXT", dev["reading"], STORIES,
                      t["R-EXT.title"], t["R-EXT.do"], dev_reason,
                      {"kind": "novel", "level": novel_level(level)}))
    if dev["writing"]:
        tail.append(Block("output", "writing", "W-DEV", dev["writing"], None,
                          t["W-DEV.title"], t["W-DEV.do"], dev_reason,
                          {"kind": "writing", "task": 0, "count": 1}))
    if dev["speaking"]:
        if in_dev_week and focus >= PHRASE_VIDEO_MINUTES:
            focus -= PHRASE_VIDEO_MINUTES - dev["speaking"]
            tail.append(Block("output", "speaking", "S-PHRASE", PHRASE_VIDEO_MINUTES, None,
                              t["S-PHRASE.title"], t["S-PHRASE.do"], dev_reason,
                              {"kind": "videos", "groups": ["phrases"], "skills": ["S"],
                               "count": 1}))
        else:
            tail.append(Block("output", "speaking", "S-FLU", dev["speaking"],
                              SPEAK_EASY if level is not None and level < 5.5 else SPEAK_IELTS,
                              t["S-FLU.title"], t["S-FLU.do"], dev_reason))
    return tail, focus


def _units(blocks: list[Block]) -> list[Block]:
    """Podcast time in whole stages of 15 minutes (a podcast = 4 stages = 1 hour); the
    difference goes to the novel, so the day keeps its length (D-039)."""
    novel = next((b for b in blocks if b.content and b.content.get("kind") == "novel"), None)
    for b in blocks:
        if not b.content or b.content.get("kind") != "podcast" or b.minutes < STAGE_MINUTES:
            continue
        target = round(b.minutes / STAGE_MINUTES) * STAGE_MINUTES
        diff = target - b.minutes
        if diff and novel is not None and novel.minutes - diff >= MIN_BLOCK:
            b.minutes = target
            novel.minutes -= diff
    return blocks


# ------------------------------------------------------------------ content totals


def content_minutes(inputs: PlanInputs, max_days: int = 400) -> dict:
    """Minutes and counts by content kind over the study days left (plan header)."""
    last = last_study_date(inputs)
    if last is None:
        last = week_start(inputs.plan_start) + timedelta(days=7 * DEFAULT_WEEKS - 1)
    end = inputs.exam_date - timedelta(days=1) if inputs.exam_date else last
    out = {"podcast": 0, "novel": 0, "video": 0, "phrase_videos": 0, "tests": 0,
           "test_minutes": 0, "writing_t1": 0, "writing_t2": 0, "full_tests": 0,
           "days": 0}
    day = inputs.today
    for _ in range(max_days):
        if day > end:
            break
        kind, blocks = day_blocks(inputs, day)
        if blocks:
            out["days"] += 1
        for b in blocks:
            c = b.content or {}
            ck = c.get("kind")
            if ck == "podcast":
                out["podcast"] += b.minutes
            elif ck == "novel":
                out["novel"] += b.minutes
            elif ck == "videos":
                if c.get("groups") == ["phrases"]:
                    out["phrase_videos"] += 1
                elif not c.get("review"):
                    out["video"] += b.minutes
            elif ck == "tests":
                if c.get("skills") == ["full"]:
                    out["full_tests"] += 1
                else:
                    out["tests"] += c.get("count", 1)
                    out["test_minutes"] += b.minutes
            elif ck == "writing" and c.get("task") in (1, 2):
                out[f"writing_t{c['task']}"] += c.get("count", 1)
        day += timedelta(days=1)
    return out
