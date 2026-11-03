// Home (Sprint 1b): today's goal in hours, overall level over time, this week's hours,
// where you stopped, your skills with their sources, and today's time split.

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api";
import { Confetti, Donut, Hourglass, LevelChart, SkillBar, WeekBars, type DayBar } from "../charts";
import { useI18n } from "../i18n";
import { Icon, type IconName, SKILL_STYLE, SkillBadge } from "../icons";
import {
  CATEGORY_COLOR,
  addDays,
  categoryOf,
  counted,
  dailySplit,
  dayKey,
  daysUntil,
  formatHM,
  hoursLabel,
  minutesOf,
  overallHistory,
  startOfDay,
  startOfWeek,
  todayIso,
  type Category,
} from "../plan";
import {
  RESOURCE_SKILLS,
  SKILLS,
  type Achievements,
  type DayPlan,
  type PlanSummary,
  type Levels,
  type Placement,
  type Profile,
  type Resource,
  type ResourceSkill,
  type StudySession,
} from "../types";
import { dayOutcome, nextTask, reopenTasks } from "./Focus";
import { studyTargetFor } from "./Library";
import type { StudyTarget } from "./Study";

interface HomeData {
  sessions: StudySession[];
  open: StudySession[];
  placements: Placement[];
  resources: Resource[];
  summary: PlanSummary | null;
  today: DayPlan | null;
  achievements: Achievements | null;
}

const SPLIT_ROWS = ["listening", "reading", "output", "exam"] as const;
const SPLIT_ICON = {
  listening: "headphones",
  reading: "book",
  output: "pen",
  exam: "target",
} as const;

export function HomeScreen(props: {
  profile: Profile;
  levels: Levels | null;
  onStudy: (target: StudyTarget) => void;
  onOpenLibrary: (skill?: ResourceSkill) => void;
  onOpenSettings: (tab?: "levels") => void;
  onContinue: () => void;
  onOpenPlan: (restart?: boolean) => void;
}) {
  const { t, lang, formatBand, formatDate, formatShortDate, formatHours, formatDays } = useI18n();
  const { profile, levels } = props;
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const weekStart = useMemo(() => startOfWeek(new Date()), []);

  const load = useCallback(async () => {
    try {
      const iso = todayIso();
      const [sessions, open, placements, resources, summary, today, achievements] =
        await Promise.all([
          api.sessions(weekStart),
          api.openSessions(),
          api.placements(),
          api.resources(),
          api.planSummary(iso).catch(() => null),
          api.planDay(iso, iso).catch(() => null),
          api.achievements().catch(() => null),
        ]);
      setData({ sessions, open, placements, resources, summary, today, achievements });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }, [weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  const fallbackSplit = useMemo(() => dailySplit(profile, levels), [profile, levels]);
  const split = data?.summary
    ? { phase: data.summary.phase, total: data.summary.daily_minutes, minutes: data.summary.split }
    : fallbackSplit;
  const todayTasks = data?.today && !data.today.preview ? data.today.tasks : [];
  const upNext = nextTask(todayTasks);
  const tasksDone = todayTasks.filter((x) => x.status === "done").length;
  const outcome = dayOutcome(todayTasks);
  const away = awayDays(data?.summary ?? null, profile.created_at);
  const [awayDismissed, setAwayDismissed] = useState(() => readDismissed() === todayIso());
  const now = new Date();
  const todayKey = dayKey(now);
  const sessions = counted(data?.sessions ?? []);
  const todaySessions = sessions.filter((s) => dayKey(new Date(s.started_at)) === todayKey);
  const doneToday = minutesOf(todaySessions);
  const target = profile.study_minutes_per_day;
  const left = Math.max(0, target - doneToday);
  const byCategory = (cat: Category) =>
    minutesOf(todaySessions.filter((s) => categoryOf(s.skill, s.activity_code) === cat));

  const dayNames = t("week_days").split(",");
  const days: DayBar[] = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(weekStart, i);
    const key = dayKey(day);
    return {
      label: dayNames[i],
      minutes: minutesOf(sessions.filter((s) => dayKey(new Date(s.started_at)) === key)),
      state: key === todayKey ? "today" : day < startOfDay(now) ? "past" : "future",
    };
  });
  const weekDone = days.reduce((a, d) => a + d.minutes, 0);
  const createdDay = startOfDay(new Date(profile.created_at));
  const studyWeekdays = data?.summary?.weekdays;
  const elapsedDays = days.filter((d, i) => {
    const day = addDays(weekStart, i);
    return (
      d.state !== "future" &&
      day >= createdDay &&
      (!studyWeekdays || studyWeekdays.includes(day.getDay()))
    );
  });
  const metDays = elapsedDays.filter((d) => d.minutes >= target).length;

  const points = overallHistory(levels, data?.placements ?? []);
  const latest = points.at(-1) ?? null;
  const first = points[0] ?? null;
  const examDays = profile.exam_date ? daysUntil(profile.exam_date) : null;

  const lastOpened = [...(data?.resources ?? [])]
    .filter((r) => r.last_opened_at)
    .sort((a, b) => (b.last_opened_at ?? "").localeCompare(a.last_opened_at ?? ""))[0];

  const greetingKey = now.getHours() < 12 ? "greet_morning" : "greet_evening";
  const weekdayFmt = new Intl.DateTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="page wide stack-lg">
      <header className="page-head">
        <div className="stack-xs">
          <h1>
            {t(greetingKey)}
            {profile.display_name ? ` ${t("greet_name", { name: profile.display_name })}` : ""}
          </h1>
          <p className="muted row">
            <Icon name="flag" color="#1D4ED8" />
            {examDays === null ? (
              <span>{t("home_no_exam")}</span>
            ) : examDays === 0 ? (
              <strong>{t("home_exam_today")}</strong>
            ) : (
              <span>
                {t("home_exam_in")} <strong className="ink">{formatDays(examDays)}</strong>{" "}
                · {formatDate(profile.exam_date)}
              </span>
            )}
          </p>
        </div>
        <p className="muted small">{weekdayFmt.format(now)}</p>
      </header>

      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}

      {data && away !== null && !awayDismissed && (
        <section className="card notice away-card row wrap">
          <Icon name="calendar" size={28} color="#B45309" />
          <div className="stack-xs grow">
            <h2>{t("away_title", { days: formatDays(away) })}</h2>
            <p className="muted">{t("away_body")}</p>
          </div>
          <button className="btn primary" onClick={() => props.onOpenPlan(true)}>
            {t("away_restart")}
          </button>
          <button
            className="btn subtle"
            onClick={() => {
              writeDismissed(todayIso());
              setAwayDismissed(true);
            }}
          >
            {t("away_dismiss")}
          </button>
        </section>
      )}

      {data && data.open.some((s) => s.state === "unconfirmed") && (
        <OpenSessions sessions={data.open} resources={data.resources} onChanged={load} />
      )}

      {data && (
        <section className="hero hero-home">
          <div className="hero-main">
            <span className="hero-kicker">
              <Icon name="route" color="#FFFFFF" /> {t("hero_kicker")}
              {(data.summary?.streak_days ?? 0) > 0 && (
                <span className="streak">
                  <Icon name="flame" size={16} color="#FDBA74" />
                  {t("streak", { days: formatDays(data.summary!.streak_days) })}
                </span>
              )}
            </span>
            {upNext ? (
              <>
                <h2 className="hero-title">{upNext.title}</h2>
                <p className="hero-sub">
                  {t(`cat_${upNext.category}`)} · <bdi dir="ltr">{formatHM(upNext.planned_minutes)}</bdi>{" "}
                  · {t("plan_tasks_done", { n: tasksDone, total: todayTasks.length })}
                </p>
              </>
            ) : todayTasks.length > 0 ? (
              <>
                <h2 className="hero-title">
                  {outcome.celebrate ? t("focus_day_done") : t("day_closed_early")}
                </h2>
                <p className="hero-sub">
                  {t("day_studied", {
                    done: formatHM(outcome.minutes),
                    planned: formatHM(outcome.planned),
                  })}
                  {!outcome.celebrate && ` · ${t("day_short_tasks", { n: outcome.short.length })}`}
                </p>
              </>
            ) : (
              <>
                <h2 className="hero-title">
                  {t(`focus_kind_${data.today?.kind ?? "study"}`)}
                </h2>
                <p className="hero-sub">{t(`focus_kind_${data.today?.kind ?? "study"}_body`)}</p>
              </>
            )}
            <div className="hero-dots" aria-hidden="true">
              {todayTasks.map((x) => (
                <span key={x.id} className={`hd-${x.status}`} />
              ))}
            </div>
          </div>
          <div className="hero-actions">
            {upNext && (
              <button className="btn hero-btn" onClick={props.onContinue}>
                <Icon name="play" size={16} /> {t("continue_learning")}
              </button>
            )}
            {!upNext && outcome.short.length > 0 && (
              <button
                className="btn hero-btn"
                onClick={async () => {
                  await reopenTasks(outcome.short);
                  await load();
                }}
              >
                <Icon name="reload" size={16} /> {t("day_reopen")}
              </button>
            )}
            <button className="btn hero-link" onClick={() => props.onOpenPlan()}>
              {t("hero_see_plan")}
            </button>
          </div>
        </section>
      )}

      {data?.achievements && <AchievementStrip a={data.achievements} />}

      <section className="cards-3">
        {/* today's goal */}
        <article className="card">
          <div className="card-head">
            <h2>{t("home_today")}</h2>
            <span className={`pill ${left === 0 ? "pill-ok" : "pill-warn"}`}>
              {left === 0
                ? t("home_goal_met")
                : t("home_left", { hm: formatHM(left) })}
            </span>
          </div>
          {left === 0 && doneToday > 0 && <Confetti />}
          <div className="row gap-lg">
            <Hourglass
              fraction={target ? doneToday / target : 0}
              label={t("home_hourglass_label", { pct: Math.round((doneToday / target) * 100) })}
            />
            <div className="stack-xs">
              <div className="big-number" dir="ltr">
                {formatHM(doneToday)} <span className="of">/ {formatHM(target)}</span>
              </div>
              <span className="muted">{t("home_today_sub")}</span>
            </div>
          </div>
          <div className="meter meter-warn" aria-hidden="true">
            <span style={{ width: `${Math.min(100, (doneToday / Math.max(1, target)) * 100)}%` }} />
          </div>
          <ul className="split-list">
            {SPLIT_ROWS.map((cat) => (
              <li key={cat}>
                <Icon name={SPLIT_ICON[cat]} color={CATEGORY_COLOR[cat]} />
                <span className="grow">{t(`cat_${cat}`)}</span>
                <span dir="ltr" className="muted">
                  {formatHM(byCategory(cat))} / {formatHM(split.minutes[cat])}
                </span>
              </li>
            ))}
            {byCategory("support") > 0 && (
              <li>
                <Icon name="grammar" color={CATEGORY_COLOR.support} />
                <span className="grow">{t("cat_support")}</span>
                <span dir="ltr" className="muted">
                  {formatHM(byCategory("support"))}
                </span>
              </li>
            )}
          </ul>
          <button className="btn subtle small self-start" onClick={() => setManualOpen(!manualOpen)}>
            <Icon name="plus" size={14} /> {t("home_log_manual")}
          </button>
          {manualOpen && (
            <ManualLog
              onDone={() => {
                setManualOpen(false);
                void load();
              }}
            />
          )}
        </article>

        {/* overall level */}
        <article className="card">
          <div className="card-head">
            <h2>{t("home_overall_title")}</h2>
            {latest && first && latest !== first && latest.band !== first.band && (
              <span className={`pill ${latest.band > first.band ? "pill-ok" : "pill-warn"}`}>
                <bdi dir="ltr">
                  {latest.band > first.band ? "+" : ""}
                  {(latest.band - first.band).toFixed(1)}
                </bdi>{" "}
                {t("home_since_first")}
              </span>
            )}
          </div>
          {latest ? (
            <>
              <div className="row baseline">
                <span className="huge teal">{formatBand(latest.band)}</span>
                <span className="muted small">
                  {t(latest.kind === "official" ? "home_from_official" : "home_from_estimate")} ·{" "}
                  {t("home_target")} <strong className="ink">{formatBand(profile.target_overall)}</strong>
                </span>
              </div>
              <LevelChart
                points={points}
                target={profile.target_overall}
                label={t("home_chart_label")}
                targetLabel={t("home_target_line", { b: formatBand(profile.target_overall) })}
                formatDate={formatShortDate}
              />
              <div className="legend">
                <span>
                  <i className="dot hollow" /> {t("legend_estimate")}
                </span>
                <span>
                  <i className="dot solid" /> {t("legend_official")}
                </span>
              </div>
            </>
          ) : (
            <div className="stack empty-state">
              <Icon name="trend" size={36} color="#94A3B8" />
              <p>{t("home_no_level")}</p>
              <button className="btn primary self-start" onClick={() => props.onOpenSettings("levels")}>
                {t("home_take_test")}
              </button>
            </div>
          )}
          <p className="info-strip">
            <Icon name="info" size={16} /> {t("home_level_moves")}
          </p>
        </article>

        {/* this week */}
        <article className="card">
          <div className="card-head">
            <h2 className="row">
              <Icon name="calendar" color="#1D4ED8" /> {t("home_week_title")}
            </h2>
            <span className="muted small" dir="ltr">
              {formatHM(weekDone)} / {formatHM(target * profile.study_days_per_week)}
            </span>
          </div>
          <WeekBars
            days={days}
            targetMinutes={target}
            targetLabel={t("home_week_target", { hours: formatHours(target) })}
            label={t("home_week_label")}
            rtl={lang === "ar"}
          />
          <div className="row wrap">
            <span className={`pill ${metDays > 0 ? "pill-ok" : ""}`}>
              {metDays > 0 && <Icon name="check" size={14} />}
              {t("home_met_days", { n: metDays, of: elapsedDays.length })}
            </span>
            <span className="muted small">
              {t("home_week_plan", {
                days: formatDays(profile.study_days_per_week),
                hours: formatHours(target),
              })}
            </span>
          </div>
        </article>
      </section>

      <section className="cards-3">
        {/* continue / start */}
        <article className="card span-2 stack">
          {lastOpened ? (
            <>
              <div className="row gap-md">
                <SkillBadge skill={lastOpened.skill} size={22} />
                <div className="stack-xs grow">
                  <span className="muted small">
                    {t("home_continue")} · {t(`rskill_${lastOpened.skill}`)}
                  </span>
                  <h2 className="title-lg">{lastOpened.title}</h2>
                  {lastOpened.progress_position && (
                    <span className="small">
                      {t("lib_progress")} {lastOpened.progress_position}
                    </span>
                  )}
                </div>
              </div>
              <div className="row wrap">
                <button
                  className="btn primary big-btn"
                  onClick={() => props.onStudy(studyTargetFor(lastOpened))}
                >
                  <Icon name="play" size={16} /> {t("home_continue_btn")}
                </button>
                <button className="btn big-btn" onClick={() => props.onOpenLibrary()}>
                  {t("home_pick_other")}
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="title-lg">{t("home_free_title")}</h2>
              <p className="muted">{t("home_free_body")}</p>
            </>
          )}
          <div className="quick-skills">
            {(["listening", "reading", "writing", "speaking", "techniques"] as const).map((s) => (
              <button key={s} className="quick-skill" onClick={() => props.onOpenLibrary(s)}>
                <Icon name={SKILL_STYLE[s].icon} color={SKILL_STYLE[s].color} />
                {t(`rskill_${s}`)}
              </button>
            ))}
            <button
              className="quick-skill"
              onClick={() =>
                props.onStudy({
                  title: t("home_timer_only"),
                  target: null,
                  resource: null,
                  skill: "general",
                  activityCode: null,
                  timer: true,
                })
              }
            >
              <Icon name="clock" color="#475569" />
              {t("home_timer_only")}
            </button>
          </div>
        </article>

        {/* time split */}
        <article className="card stack">
          <h2>{t("home_split_title")}</h2>
          <div className="row gap-lg">
            <Donut
              segments={SPLIT_ROWS.map((c) => ({
                value: split.minutes[c],
                color: CATEGORY_COLOR[c],
                label: `${t(`cat_${c}`)} ${formatHM(split.minutes[c])}`,
              }))}
              center={hoursLabel(target)}
              sub={
                lang === "en" || (target % 60 === 0 && target >= 180 && target <= 600)
                  ? t("hours_word")
                  : t("hour_word")
              }
              label={t("home_split_label", { hours: formatHours(target) })}
            />
            <ul className="split-list grow">
              {SPLIT_ROWS.map((c) => (
                <li key={c}>
                  <i className="swatch" style={{ background: CATEGORY_COLOR[c] }} />
                  <span className="grow">{t(`cat_${c}`)}</span>
                  <span dir="ltr">{formatHM(split.minutes[c])}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="info-strip">{t(`home_split_rule_${split.phase}`)}</p>
        </article>
      </section>

      {/* skills */}
      <section className="card stack">
        <div className="card-head">
          <h2>{t("home_skills")}</h2>
          <span className="muted small">{t("home_skills_scale")}</span>
        </div>
        <div className="skills-grid">
          {SKILLS.map((s) => {
            const level = levels?.current[s] ?? null;
            const tgt = profile[`target_${s}`];
            const estimate = !!level && !["official_practice", "external_marker"].includes(level.source_type);
            return (
              <div className="skills-row" key={s}>
                <span className="row strong">
                  <Icon name={SKILL_STYLE[s].icon} color={SKILL_STYLE[s].color} />
                  {t(`skill_${s}`)}
                </span>
                <SkillBar
                  band={level?.band ?? null}
                  target={tgt}
                  color={SKILL_STYLE[s].color}
                  estimate={estimate}
                  label={t("home_skill_label", {
                    skill: t(`skill_${s}`),
                    b: formatBand(level?.band),
                    t: formatBand(tgt),
                  })}
                />
                {level ? (
                  <span dir="ltr">
                    <strong>{formatBand(level.band)}</strong> → {formatBand(tgt)}
                  </span>
                ) : (
                  <span className="warn-text small">{t("home_not_measured")}</span>
                )}
                <span className="muted small skills-source">
                  {level
                    ? `${t(`source_${level.source_type}`)}${level.source_note ? ` · ${level.source_note}` : ""}`
                    : ""}
                </span>
              </div>
            );
          })}
        </div>
        <div className="row wrap">
          <span className="muted small">{t("home_skills_note")}</span>
          <span className="spacer" />
          <button className="btn small" onClick={() => props.onOpenSettings("levels")}>
            {t("home_record_level")}
          </button>
        </div>
      </section>
    </div>
  );
}

/** Days since the owner last studied, when it is long enough to offer a fresh start
 * (and the plan was not restarted since). */
export const AWAY_DAYS = 4;

function awayDays(summary: PlanSummary | null, createdAt: string): number | null {
  if (!summary) return null;
  const last = summary.last_study_at ?? createdAt;
  const restarted = summary.plan_restarted_at;
  if (restarted && restarted > last) return null;
  const days = Math.floor((Date.now() - Date.parse(last)) / 86_400_000);
  return days >= AWAY_DAYS ? days : null;
}

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem("ip-away-dismissed");
  } catch {
    return null;
  }
}

function writeDismissed(day: string): void {
  try {
    window.localStorage.setItem("ip-away-dismissed", day);
  } catch {
    // private storage unavailable: the banner just shows again next time
  }
}

function OpenSessions(props: {
  sessions: StudySession[];
  resources: Resource[];
  onChanged: () => Promise<void>;
}) {
  const { t, formatDate } = useI18n();
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await props.onChanged();
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card notice stack">
      <h2 className="row">
        <Icon name="clock" color="#B45309" /> {t("open_title")}
      </h2>
      <p className="muted small">{t("open_body")}</p>
      {props.sessions
        .filter((s) => s.state === "unconfirmed")
        .map((s) => {
          const res = props.resources.find((r) => r.id === s.resource_id);
          return (
            <div key={s.id} className="row wrap open-row">
              <span className="grow">
                <strong dir="ltr">{formatHM(s.active_seconds / 60)}</strong> ·{" "}
                {t(`rskill_${s.skill}`)}
                {res ? ` · ${res.title}` : ""} · {formatDate(s.started_at)}
              </span>
              <button
                className="btn small primary"
                disabled={busy}
                onClick={() => void act(() => api.patchSession(s.id, { state: "confirmed" }))}
              >
                {t("open_confirm")}
              </button>
              <button
                className="btn small subtle"
                disabled={busy}
                onClick={() => void act(() => api.patchSession(s.id, { state: "discarded" }))}
              >
                {t("open_discard")}
              </button>
            </div>
          );
        })}
    </section>
  );
}

function ManualLog(props: { onDone: () => void }) {
  const { t } = useI18n();
  const [skill, setSkill] = useState<ResourceSkill>("reading");
  const [minutes, setMinutes] = useState(30);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setError(null);
    try {
      const start = new Date(Date.now() - minutes * 60_000);
      await api.logManual(skill, start, minutes, notes);
      props.onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }
  return (
    <div className="stack manual-log">
      <p className="muted small">{t("manual_hint")}</p>
      <div className="row wrap">
        <select value={skill} onChange={(e) => setSkill(e.target.value as ResourceSkill)}>
          {RESOURCE_SKILLS.map((s) => (
            <option key={s} value={s}>
              {t(`rskill_${s}`)}
            </option>
          ))}
        </select>
        <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
          {[10, 15, 20, 30, 45, 60, 90, 120, 180].map((m) => (
            <option key={m} value={m}>
              {t("n_minutes", { n: m })}
            </option>
          ))}
        </select>
        <input
          className="grow"
          placeholder={t("manual_notes_ph")}
          value={notes}
          maxLength={2000}
          onChange={(e) => setNotes(e.target.value)}
        />
        <button className="btn primary small" onClick={() => void save()}>
          {t("save")}
        </button>
      </div>
      {error && <p className="field-message">{error}</p>}
    </div>
  );
}

/** What has been done so far (owner's request, v0.0.7): finished things, not only hours. */
function AchievementStrip(props: { a: Achievements }) {
  const { t } = useI18n();
  const a = props.a;
  const tiles: { icon: IconName; color: string; value: string; label: string; hint?: string }[] = [
    {
      icon: "headphones",
      color: "#2563EB",
      value: String(a.episodes.dalilk_ielts),
      label: t("ach_ep_ielts"),
    },
    {
      icon: "headphones",
      color: "#0E7490",
      value: String(a.episodes.dalilk_english),
      label: t("ach_ep_english"),
    },
    { icon: "check", color: "#15803D", value: String(a.tasks_done), label: t("ach_tasks") },
    {
      icon: "clock",
      color: "#B45309",
      value: formatHM(Math.round(a.hours * 60)),
      label: t("ach_hours"),
      hint:
        a.hours_self_logged > 0
          ? t("ach_self_logged", { h: formatHM(Math.round(a.hours_self_logged * 60)) })
          : undefined,
    },
    { icon: "calendar", color: "#7C3AED", value: String(a.study_days), label: t("ach_days") },
  ];
  return (
    <section className="card achievements" aria-label={t("ach_title")}>
      <h2 className="row">
        <Icon name="trend" color="#15803D" /> {t("ach_title")}
      </h2>
      <div className="ach-grid">
        {tiles.map((tile) => (
          <div className="ach-tile" key={tile.label}>
            <span className="ach-icon" style={{ color: tile.color }}>
              <Icon name={tile.icon} size={20} />
            </span>
            <strong className="ach-value">
              <bdi dir="ltr">{tile.value}</bdi>
            </strong>
            <span className="ach-label">{tile.label}</span>
            {tile.hint && <span className="muted small">{tile.hint}</span>}
          </div>
        ))}
      </div>
      <p className="muted small">{t("ach_more_soon")}</p>
    </section>
  );
}
