// First-run setup wizard (PRD F1): name → Dalilk tests → target → level → hours estimate
// → exam date and time → plan (owner's order, 2026-11-03).

import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import {
  ExamFormatPicker,
  GoalsFields,
  LevelsFields,
  TimeFields,
  goalsDefault,
  levelsDefault,
  levelsToEntries,
  timeDefault,
  toProfileInput,
  validateGoals,
  validateLevels,
  type GoalsDraft,
  type LevelsDraft,
  type TimeDraft,
} from "../forms";
import { useI18n } from "../i18n";
import { BrandMark, Icon } from "../icons";
import { formatHM, todayIso } from "../plan";

const HOURS_PER_BAND = 100; // owner, 2026-11-03: fixed
import {
  SKILLS,
  type Estimate,
  type ExamFormat,
  type Lang,
  type Placement,
  type PlacementTest,
  type Profile,
  type Skill,
} from "../types";
import { PlacementCards, PlacementTestView } from "./Placement";
import { Feasibility } from "./Plan";

const STEPS = ["welcome", "tests", "goals", "levels", "estimate", "time", "review"] as const;

function useEstimate(input: Parameters<typeof api.estimate>[0] | null): Estimate | null {
  const [value, setValue] = useState<Estimate | null>(null);
  const key = JSON.stringify(input);
  useEffect(() => {
    if (!input) return;
    const timer = setTimeout(() => {
      void api.estimate(input).then(setValue).catch(() => setValue(null));
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return value;
}

export function SetupScreen(props: {
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  onDone: (profile: Profile) => void;
}) {
  const { t, formatBand, formatDate, formatDays, formatHours } = useI18n();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [goals, setGoals] = useState<GoalsDraft>(goalsDefault);
  const [levels, setLevels] = useState<LevelsDraft>(levelsDefault);
  const [time, setTime] = useState<TimeDraft>(timeDefault);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keepSignIn, setKeepSignIn] = useState(false);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [testOpen, setTestOpen] = useState<PlacementTest | null>(null);
  const hoursPerBand = HOURS_PER_BAND; // owner, 2026-11-03: fixed, 100 hours per band
  const [examFormat, setExamFormat] = useState<ExamFormat | null>(null);
  const [saved, setSaved] = useState<Record<Skill, number | null>>({
    listening: null,
    reading: null,
    writing: null,
    speaking: null,
  });

  // Levels saved by the Dalilk tests, overridden by anything typed in the levels step.
  const currentLevels = Object.fromEntries(
    SKILLS.map((s) => [s, levels[s].band ?? saved[s]]),
  ) as Record<Skill, number | null>;
  const planInput =
    STEPS[step] === "estimate" || STEPS[step] === "time" || STEPS[step] === "review"
      ? {
          today: todayIso(),
          target_overall: goals.target_overall,
          targets: goals.custom ? goals.targets : undefined,
          current: currentLevels,
          exam_date: goals.exam_date || null,
          study_weekdays: time.weekdays,
          daily_minutes: time.study_minutes_per_day,
          hours_per_band: hoursPerBand,
        }
      : null;
  const estimate = useEstimate(planInput);

  useEffect(() => {
    if (STEPS[step] !== "estimate") return;
    void api.levels().then((l) =>
      setSaved(
        Object.fromEntries(SKILLS.map((s) => [s, l.current[s]?.band ?? null])) as Record<
          Skill,
          number | null
        >,
      ),
    );
  }, [step]);

  const goalErrors = validateGoals(goals, t);
  const levelErrors = validateLevels(levels, t);
  const current = STEPS[step];
  const stepValid =
    current === "goals"
      ? Object.keys(goalErrors).filter((k) => k !== "exam_date").length === 0
      : current === "time"
        ? !goalErrors.exam_date
        : current === "levels"
          ? Object.keys(levelErrors).length === 0
          : true;

  function next() {
    if (!stepValid) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      const profile = await api.saveProfile(
        toProfileInput({ display_name: name, interface_language: props.lang }, goals, time),
      );
      const entries = levelsToEntries(levels);
      if (entries.length > 0) await api.addLevels(entries);
      await api.saveSettings({
        web_keep_signin: keepSignIn,
        hours_per_band: hoursPerBand,
        study_weekdays: time.weekdays,
        plan_start: todayIso(),
        ...(examFormat ? { exam_format: examFormat } : {}),
      });
      props.onDone(profile);
    } catch (e) {
      setError(t("err_generic", { msg: e instanceof ApiError ? e.message : String(e) }));
    } finally {
      setSaving(false);
    }
  }

  if (testOpen) {
    return (
      <PlacementTestView
        test={testOpen}
        keepSignIn={keepSignIn}
        existing={placements}
        onSaved={(p) => setPlacements((list) => [p, ...list])}
        onBack={() => setTestOpen(null)}
      />
    );
  }

  return (
    <div className="setup">
      <div className="setup-card">
        <div className="progress" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s} className={i <= step ? "done" : ""} />
          ))}
        </div>
        <p className="muted small">{t("step_of", { n: step + 1, total: STEPS.length })}</p>

        {current === "welcome" && (
          <section className="stack">
            <BrandMark size={56} />
            <h1>{t("welcome_title")}</h1>
            <p>{t("welcome_body")}</p>
            <p className="note">{t("welcome_local")}</p>
            <p className="muted small">{t("about_independent")}</p>
            <div className="segmented" role="radiogroup" aria-label={t("field_language")}>
              {(["ar", "en"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={props.lang === l}
                  className={props.lang === l ? "active" : ""}
                  onClick={() => props.onLangChange(l)}
                >
                  {t(`lang_${l}`)}
                </button>
              ))}
            </div>
            <label className="field">
              <span className="field-label">
                {t("field_name")} ({t("optional")})
              </span>
              <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            </label>
            <ExamFormatPicker value={examFormat} onChange={setExamFormat} />
            <div className="consent">
              <label className="check">
                <input
                  type="checkbox"
                  checked={keepSignIn}
                  onChange={(e) => setKeepSignIn(e.target.checked)}
                />
                <strong>{t("consent_label")}</strong>
              </label>
              <p className="muted small">{t("consent_body")}</p>
            </div>
          </section>
        )}

        {current === "tests" && (
          <section className="stack">
            <h1>{t("tests_title")}</h1>
            <p>{t("tests_body")}</p>
            <PlacementCards placements={placements} onOpen={setTestOpen} />
            <p className="muted small row">
              <Icon name="info" size={16} /> {t("tests_skip")}
            </p>
          </section>
        )}

        {current === "goals" && (
          <section className="stack">
            <h1>{t("goals_title")}</h1>
            <GoalsFields
              value={goals}
              onChange={setGoals}
              errors={showErrors ? goalErrors : {}}
              showExamDate={false}
            />
          </section>
        )}

        {current === "levels" && (
          <section className="stack">
            <h1>{t("levels_title")}</h1>
            {placements.some((p) => p.approx_band !== null) && (
              <p className="ok-box small">{t("levels_from_tests")}</p>
            )}
            <p className="muted">{t("levels_hint")}</p>
            <LevelsFields
              value={levels}
              onChange={setLevels}
              errors={showErrors ? levelErrors : {}}
            />
          </section>
        )}

        {current === "estimate" && (
          <section className="stack">
            <h1>{t("est_title")}</h1>
            {estimate && estimate.total_hours !== null ? (
              <>
                <div className="est-equation">
                  <div>
                    <span className="muted small">{t("est_now")}</span>
                    <strong>{formatBand(estimate.current_overall)}</strong>
                  </div>
                  <Icon name="arrowLeft" className="flip-ltr" color="#94A3B8" />
                  <div>
                    <span className="muted small">{t("est_target")}</span>
                    <strong>{formatBand(estimate.target_overall)}</strong>
                  </div>
                  <span className="est-op">=</span>
                  <div className="est-total">
                    <span className="muted small">{t("est_hours")}</span>
                    <strong dir="ltr">{Math.round(estimate.total_hours)}</strong>
                  </div>
                </div>
                <p>
                  {t("est_explain", {
                    gap: (estimate.gap_bands ?? 0).toFixed(2).replace(/\.?0+$/, ""),
                    h: hoursPerBand,
                    total: Math.round(estimate.total_hours),
                  })}
                </p>
                {!estimate.current_complete && <p className="note small">{t("est_partial")}</p>}
              </>
            ) : (
              <p className="note">{t("est_no_level")}</p>
            )}
          </section>
        )}

        {current === "time" && (
          <section className="stack">
            <h1>{t("schedule_title")}</h1>
            <label className={`field${showErrors && goalErrors.exam_date ? " field-error" : ""}`}>
              <span className="field-label row">
                <Icon name="flag" color="#1D4ED8" /> {t("field_exam_date")} ({t("optional")})
              </span>
              <input
                type="date"
                value={goals.exam_date}
                min={todayIso()}
                onChange={(e) => setGoals({ ...goals, exam_date: e.target.value })}
              />
              {showErrors && goalErrors.exam_date && (
                <span className="field-message">{goalErrors.exam_date}</span>
              )}
              <span className="field-hint">{t("schedule_exam_hint")}</span>
            </label>
            <TimeFields value={time} onChange={setTime} />
            {estimate && (
              <Feasibility
                estimate={estimate}
                onDaily={(m) => setTime({ ...time, study_minutes_per_day: m })}
                onExamDate={(d) => setGoals({ ...goals, exam_date: d })}
                onTarget={(b) =>
                  setGoals({
                    ...goals,
                    target_overall: b,
                    custom: false,
                    targets: { listening: b, reading: b, writing: b, speaking: b },
                    minimum_per_skill: Math.min(goals.minimum_per_skill, b),
                  })
                }
              />
            )}
          </section>
        )}

        {current === "review" && (
          <section className="stack">
            <h1>{t("review_title")}</h1>
            <dl className="summary">
              <dt>{t("field_target_overall")}</dt>
              <dd>{formatBand(goals.target_overall)}</dd>
              {goals.custom &&
                SKILLS.map((s) => (
                  <div key={s} className="summary-pair">
                    <dt>{t(`skill_${s}`)}</dt>
                    <dd>{formatBand(goals.targets[s])}</dd>
                  </div>
                ))}
              <dt>{t("field_minimum")}</dt>
              <dd>{formatBand(goals.minimum_per_skill)}</dd>
              <dt>{t("field_exam_date")}</dt>
              <dd>{goals.exam_date ? formatDate(goals.exam_date) : t("not_set")}</dd>
              {SKILLS.some((s) => levels[s].band !== null) && (<>
              <dt>{t("levels_title")}</dt>
              <dd>
                {SKILLS.map((s) => (
                  <span key={s} className="chip">
                    {t(`skill_${s}`)}: {formatBand(levels[s].band)}
                    {levels[s].band !== null && levels[s].source_type === "self_estimate" && (
                      <em> · {t("home_self_tag")}</em>
                    )}
                  </span>
                ))}
              </dd>
              </>)}
              {estimate && estimate.total_hours !== null && (
                <>
                  <dt>{t("est_hours")}</dt>
                  <dd>
                    {Math.round(estimate.total_hours)}
                    {estimate.needed_minutes_per_day !== null && (
                      <> · {t("review_per_day", { hm: formatHM(estimate.needed_minutes_per_day) })}</>
                    )}
                  </dd>
                </>
              )}
              {placements.length > 0 && (
                <>
                  <dt>{t("tests_title")}</dt>
                  <dd>
                    {placements.map((p) => (
                      <span key={p.id} className="chip">
                        {t(`pl_${p.test}_name`)}: <bdi>{p.level_label}</bdi>
                        {p.approx_band !== null && ` · ≈${formatBand(p.approx_band)}`}
                      </span>
                    ))}
                  </dd>
                </>
              )}
              <dt>{t("time_title")}</dt>
              <dd>
                {t("home_week_plan", {
                  days: formatDays(time.weekdays.length),
                  hours: formatHours(time.study_minutes_per_day),
                })}
              </dd>
              <dt>{t("consent_short")}</dt>
              <dd>{keepSignIn ? t("yes") : t("no")}</dd>
            </dl>
            {error && (
              <p className="error-box" role="alert">
                {error}
              </p>
            )}
          </section>
        )}

        <div className="setup-nav">
          {step > 0 && (
            <button className="btn" disabled={saving} onClick={() => setStep((s) => s - 1)}>
              {t("back")}
            </button>
          )}
          <span className="spacer" />
          {current !== "review" ? (
            <button className="btn primary" onClick={next}>
              {t("next")}
            </button>
          ) : (
            <button className="btn primary" disabled={saving} onClick={() => void finish()}>
              {saving ? t("saving") : t("finish")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
