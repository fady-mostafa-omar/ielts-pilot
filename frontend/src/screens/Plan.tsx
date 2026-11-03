// "My plan": hours to the goal (D-023), the road to the exam (D-024), today and the week.

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { useI18n } from "../i18n";
import { ExamFormatPicker } from "../forms";
import { Icon, type IconName, SKILL_STYLE } from "../icons";
import { addDays, dayKey, formatHM, todayIso, CATEGORY_COLOR } from "../plan";
import { RestartCard } from "./Restart";
import {
  SKILLS,
  type ContentTotals,
  type DayPlan,
  type PlanSummary,
  type PlanTask,
  type Profile,
  type ProfileInput,
  type WeekPlan,
} from "../types";

export function profileToInput(p: Profile): ProfileInput {
  return {
    display_name: p.display_name,
    interface_language: p.interface_language,
    explanation_language: p.explanation_language,
    target_overall: p.target_overall,
    target_listening: p.target_listening,
    target_reading: p.target_reading,
    target_writing: p.target_writing,
    target_speaking: p.target_speaking,
    minimum_per_skill: p.minimum_per_skill,
    exam_date: p.exam_date,
    study_days_per_week: p.study_days_per_week,
    study_minutes_per_day: p.study_minutes_per_day,
  };
}

/** Three honest ways out of a plan that does not fit (D-023). */
export function Feasibility(props: {
  estimate: {
    feasible: boolean | null;
    impossible: boolean;
    needed_minutes_per_day: number | null;
    suggested_daily_minutes: number | null;
    earliest_exam_date: string | null;
    reachable_band: number | null;
    daily_minutes: number;
    exam_date: string | null;
    total_hours: number | null;
  };
  onDaily?: (minutes: number) => void;
  onExamDate?: (date: string) => void;
  onTarget?: (band: number) => void;
}) {
  const { t, formatHours, formatDate, formatBand } = useI18n();
  const e = props.estimate;
  if (e.total_hours === null) return <p className="note">{t("plan_need_level")}</p>;
  if (!e.exam_date) return <p className="info-strip">{t("plan_no_exam")}</p>;
  if (e.feasible) {
    return (
      <p className="ok-box row">
        <Icon name="check" />
        {t("plan_fits", {
          need: formatHours(Math.max(30, Math.ceil((e.needed_minutes_per_day ?? 0) / 30) * 30)),
          have: formatHours(e.daily_minutes),
        })}
      </p>
    );
  }
  return (
    <div className="feasibility stack">
      <p>
        <strong>{e.impossible ? t("plan_impossible") : t("plan_too_tight")}</strong>{" "}
        {t("plan_need_per_day", {
          need: formatHM(e.needed_minutes_per_day ?? 0),
          have: formatHM(e.daily_minutes),
        })}
      </p>
      <div className="options-row">
        {e.suggested_daily_minutes !== null && !e.impossible && props.onDaily && (
          <button className="option" onClick={() => props.onDaily?.(e.suggested_daily_minutes!)}>
            <Icon name="clock" color="#B45309" />
            <span>{t("plan_opt_hours", { hours: formatHours(e.suggested_daily_minutes) })}</span>
          </button>
        )}
        {e.earliest_exam_date && props.onExamDate && (
          <button className="option" onClick={() => props.onExamDate?.(e.earliest_exam_date!)}>
            <Icon name="calendar" color="#1D4ED8" />
            <span>{t("plan_opt_date", { date: formatDate(e.earliest_exam_date) })}</span>
          </button>
        )}
        {e.reachable_band !== null && props.onTarget && (
          <button className="option" onClick={() => props.onTarget?.(e.reachable_band!)}>
            <Icon name="target" color="#7C3AED" />
            <span>{t("plan_opt_target", { band: formatBand(e.reachable_band) })}</span>
          </button>
        )}
      </div>
    </div>
  );
}

function Timeline(props: { s: PlanSummary }) {
  const { t, formatShortDate } = useI18n();
  const { s } = props;
  if (!s.exam_date) return null;
  const items: { key: string; date: string; label: string; tone: string }[] = [
    { key: "today", date: todayIso(), label: t("tl_today"), tone: "blue" },
  ];
  if (s.next_mock_date && s.next_mock_date !== s.final_mock_dates[0]) {
    items.push({ key: "mock", date: s.next_mock_date, label: t("tl_next_mock"), tone: "violet" });
  }
  if (s.goal_date) {
    // the goal date is also the first of the three final full tests (D-024)
    items.push({ key: "goal", date: s.goal_date, label: t("tl_goal"), tone: "teal" });
  }
  if (s.review_date) {
    items.push({ key: "review", date: s.review_date, label: t("tl_review"), tone: "amber" });
  }
  items.push({ key: "exam", date: s.exam_date, label: t("tl_exam"), tone: "red" });
  return (
    <ol className="timeline">
      {items.map((it) => (
        <li key={it.key} className={`tl-${it.tone}`}>
          <span className="tl-dot" />
          <span className="tl-label">{it.label}</span>
          <span className="tl-date">{formatShortDate(it.date)}</span>
        </li>
      ))}
    </ol>
  );
}

export function TaskList(props: { tasks: PlanTask[] }) {
  const { t } = useI18n();
  return (
    <ul className="task-list">
      {props.tasks.map((task) => (
        <li key={task.id} className={`task task-${task.status}`}>
          <span className="task-icon" style={{ background: SKILL_STYLE[task.skill].bg }}>
            <Icon
              name={task.status === "done" ? "check" : SKILL_STYLE[task.skill].icon}
              color={task.status === "done" ? "#0F766E" : SKILL_STYLE[task.skill].color}
            />
          </span>
          <span className="grow stack-xs">
            <strong>{task.title}</strong>
            <span className="muted small">{t(`cat_${task.category}`)}</span>
          </span>
          <span className="small muted" dir="ltr">
            {task.status === "done" || task.done_minutes > 0
              ? `${formatHM(task.done_minutes)} / ${formatHM(task.planned_minutes)}`
              : formatHM(task.planned_minutes)}
          </span>
          <span className={`pill task-status-${task.status}`}>{t(`task_${task.status}`)}</span>
        </li>
      ))}
    </ul>
  );
}

export function PlanScreen(props: {
  profile: Profile;
  restart?: boolean;
  onProfileSaved: (p: Profile) => void;
  onContinue: () => void;
  onOpenSettings: () => void;
  onOpenLevels: () => void;
  onOpenData: () => void;
}) {
  const { t, formatHours, formatBand, formatShortDate, lang } = useI18n();
  const [summary, setSummary] = useState<PlanSummary | null>(null);
  const [today, setToday] = useState<DayPlan | null>(null);
  const [week, setWeek] = useState<DayPlan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formatSet, setFormatSet] = useState(true);

  const load = useCallback(async () => {
    try {
      const iso = todayIso();
      const [s, d, settings] = await Promise.all([
        api.planSummary(iso),
        api.planDay(iso, iso),
        api.settings(),
      ]);
      setSummary(s);
      setToday(d);
      setFormatSet(!!settings.exam_format);
      const days = await Promise.all(
        [1, 2, 3, 4, 5, 6].map((n) => api.planDay(dayKey(addDays(new Date(), n)), iso)),
      );
      setWeek(days);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (props.restart && summary) {
      document.getElementById("restart")?.scrollIntoView({ block: "center" });
    }
  }, [props.restart, summary]);

  async function saveProfile(patch: Partial<ProfileInput>) {
    const input = { ...profileToInput(props.profile), ...patch };
    if (patch.target_overall !== undefined) {
      for (const s of SKILLS) input[`target_${s}`] = patch.target_overall;
      input.minimum_per_skill = Math.min(input.minimum_per_skill, patch.target_overall);
    }
    try {
      props.onProfileSaved(await api.saveProfile(input));
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }

  if (error) return <p className="page error-box">{error}</p>;
  if (!summary || !today) {
    return (
      <div className="center-screen">
        <div className="spinner" aria-hidden="true" />
      </div>
    );
  }

  const total = summary.total_hours ?? 0;
  const done = summary.hours_done;
  const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0;
  const todayTasks = today.preview ? [] : today.tasks;
  const doneTasks = todayTasks.filter((x) => x.status === "done").length;
  const weekday = new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", { weekday: "long" });

  return (
    <div className="page wide stack-lg">
      <section className="hero hero-plan">
        <div className="stack-xs">
          <span className="hero-kicker">
            <Icon name="route" color="#FFFFFF" /> {t("plan_title")}
          </span>
          {summary.total_hours !== null ? (
            <>
              <h1>
                {t("plan_hours_headline", {
                  total: Math.round(total),
                  from: formatBand(summary.current_overall),
                  to: formatBand(summary.target_overall),
                })}
              </h1>
              <p>
                {t("plan_hours_rule", {
                  gap: (summary.gap_bands ?? 0).toFixed(2).replace(/\.?0+$/, ""),
                  h: summary.hours_per_band,
                })}
              </p>
            </>
          ) : (
            <h1>{t("plan_need_level")}</h1>
          )}
        </div>
        {summary.total_hours !== null && (
          <div className="hero-progress">
            <div className="hero-numbers">
              <span>
                <strong dir="ltr">{done.toFixed(1)}</strong> {t("plan_done_h")}
              </span>
              <span>
                <strong dir="ltr">{Math.max(0, total - done).toFixed(0)}</strong>{" "}
                {t("plan_left_h")}
              </span>
            </div>
            <div className="meter meter-light" aria-hidden="true">
              <span style={{ width: `${pct}%` }} />
            </div>
            <span className="small">{t("plan_estimate_note")}</span>
          </div>
        )}
      </section>

      {!formatSet && (
        <section className="card notice stack">
          <ExamFormatPicker
            value={null}
            onChange={(f) =>
              void api
                .saveSettings({ exam_format: f })
                .then(load)
                .catch((e: unknown) => setError(String(e)))
            }
          />
          <p className="muted small">{t("fmt_unknown_body")}</p>
        </section>
      )}

      <WeeksStrip plan={summary.week_plan} />
      <ContentCard content={summary.content} />

      <Feasibility
        estimate={summary}
        onDaily={(m) => void saveProfile({ study_minutes_per_day: m })}
        onExamDate={(d) => void saveProfile({ exam_date: d })}
        onTarget={(b) => void saveProfile({ target_overall: b })}
      />

      <div className="cards-3">
        <article className="card span-2 stack">
          <div className="card-head">
            <h2>{t("plan_today")}</h2>
            <span className="pill">
              {t("plan_tasks_done", { n: doneTasks, total: todayTasks.length })}
            </span>
          </div>
          {todayTasks.length > 0 ? (
            <>
              <TaskList tasks={todayTasks} />
              {doneTasks < todayTasks.length && (
                <button className="btn primary big-btn self-start" onClick={props.onContinue}>
                  <Icon name="play" size={14} /> {t("continue_learning")}
                </button>
              )}
            </>
          ) : (
            <p className="muted">{t(`focus_kind_${today.kind}_body`)}</p>
          )}
        </article>

        <article className="card stack">
          <h2>{t("plan_road")}</h2>
          {summary.exam_date ? (
            <Timeline s={summary} />
          ) : (
            <p className="muted">{t("plan_no_exam")}</p>
          )}
          {summary.study_days_left !== null && (
            <p className="muted small">
              {t("plan_days_left", { n: summary.study_days_left })}
            </p>
          )}
        </article>
      </div>

      <div className="cards-3">
        <article className="card span-2 stack">
          <h2>{t("plan_week")}</h2>
          <div className="week-grid">
            {week.map((d) => {
              const minutes = d.tasks.reduce((a, x) => a + x.planned_minutes, 0);
              return (
                <div key={d.date} className={`week-day kind-${d.kind}`}>
                  <span className="strong">{weekday.format(new Date(`${d.date}T12:00:00`))}</span>
                  <span className="muted small">{formatShortDate(d.date)}</span>
                  <span className="small">{t(`kind_${d.kind}`)}</span>
                  {minutes > 0 && (
                    <>
                      <span className="small" dir="ltr">
                        {formatHM(minutes)}
                      </span>
                      <span className="cat-dots">
                        {d.tasks.map((x, i) => (
                          <i key={i} style={{ background: CATEGORY_COLOR[x.category] }} />
                        ))}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </article>

        <article className="card stack">
          <h2>{t("plan_gaps")}</h2>
          <ul className="split-list">
            {SKILLS.map((s) => (
              <li key={s}>
                <Icon name={SKILL_STYLE[s].icon} color={SKILL_STYLE[s].color} />
                <span className="grow">{t(`skill_${s}`)}</span>
                <span dir="ltr">
                  {summary.skill_gaps[s] === null ? "—" : `+${summary.skill_gaps[s]!.toFixed(1)}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="muted small">
            {t("plan_focus_week", { skill: t(`skill_${summary.focus_skill}`) })}
          </p>
          <p className="muted small">
            {t("plan_daily_now", { hours: formatHours(summary.daily_minutes) })}
          </p>
          {summary.spelling_weekdays.length > 0 && summary.phase !== "exam" && (
            <p className="muted small">
              {t("plan_spelling_days", {
                days: summary.spelling_weekdays
                  .map((d) => weekday.format(new Date(2026, 10, 1 + d))) // 1 Nov 2026 = Sunday
                  .join(t("list_and")),
              })}
            </p>
          )}
          <button className="btn small self-start" onClick={props.onOpenSettings}>
            {t("plan_change")}
          </button>
        </article>
      </div>

      <RestartCard
        profile={props.profile}
        initiallyOpen={props.restart}
        onDone={(profile) => {
          props.onProfileSaved(profile);
          void load();
        }}
        onOpenLevels={props.onOpenLevels}
        onStartOver={props.onOpenData}
      />
    </div>
  );
}

const WEEK_TYPES = ["devL", "devR", "listening", "reading", "writing", "speaking"] as const;
const PLAN_NOTES = ["no_consolidation", "squeezed", "short_plan"] as const;

/** Dalilk's method week by week (planner-4), this week highlighted, cuts explained. */
function WeeksStrip(props: { plan: WeekPlan }) {
  const { t } = useI18n();
  const { plan } = props;
  return (
    <section className="card stack">
      <h2 className="row">
        <Icon name="calendar" color="#1D4ED8" /> {t("plan_weeks_title")}
      </h2>
      <ol className="weeks-strip">
        {plan.sequence.map((w, i) => {
          const [raw, round] = w.split(":");
          const type = WEEK_TYPES.find((x) => x === raw) ?? "listening";
          return (
            <li
              key={i}
              className={`week-chip wk-${type}${round === "2" ? " wk-round2" : ""}${
                i === plan.current ? " now" : i < plan.current ? " past" : ""
              }`}
            >
              <span className="week-n">{i + 1}</span>
              <span>{t(`week_${type}`)}</span>
              {round === "2" && <span className="muted small">{t("week_round2")}</span>}
            </li>
          );
        })}
      </ol>
      {PLAN_NOTES.filter((n) => plan.notes.includes(n)).map((n) => (
        <p key={n} className="note small">
          {t(`plan_note_${n}`, { w: plan.weeks })}
        </p>
      ))}
    </section>
  );
}

/** The plan's hours as content (CURRICULUM §4b): each item once, estimates labelled. */
function ContentCard(props: { content: ContentTotals }) {
  const { t } = useI18n();
  const c = props.content;
  const tiles: { icon: IconName; color: string; n: number; label: string }[] = [
    { icon: "headphones", color: "#2563EB", n: c.episodes, label: t("plan_content_episodes") },
    { icon: "book", color: "#0F766E", n: c.novels, label: t("plan_content_novels") },
    {
      icon: "play",
      color: "#7C3AED",
      n: c.videos,
      label: t("plan_content_videos", { h: c.video_hours }),
    },
    { icon: "target", color: "#B45309", n: c.tests, label: t("plan_content_tests") },
    {
      icon: "pen",
      color: "#BE185D",
      n: c.writing_t1 + c.writing_t2,
      label: t("plan_content_writing", { t1: c.writing_t1, t2: c.writing_t2 }),
    },
    { icon: "flag", color: "#DC2626", n: c.full_tests, label: t("plan_content_full") },
  ];
  return (
    <section className="card stack">
      <h2 className="row">
        <Icon name="trend" color="#15803D" /> {t("plan_content_title")}
      </h2>
      <div className="ach-grid">
        {tiles.map((tile) => (
          <div className="ach-tile" key={tile.label}>
            <span className="ach-icon" style={{ color: tile.color }}>
              <Icon name={tile.icon} size={20} />
            </span>
            <strong className="ach-value">
              <bdi dir="ltr">{tile.n}</bdi>
            </strong>
            <span className="ach-label">{tile.label}</span>
          </div>
        ))}
      </div>
      <p className="muted small">
        {t("plan_content_note", {
          m: c.episode_minutes,
          est: c.episode_measured ? "" : t("plan_content_est"),
        })}
      </p>
    </section>
  );
}
