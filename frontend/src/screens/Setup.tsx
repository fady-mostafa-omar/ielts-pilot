// First-run setup wizard (PRD F1).

import { useState } from "react";
import { api, ApiError } from "../api";
import {
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
import { Icon } from "../icons";
import { SKILLS, type Lang, type Placement, type PlacementTest, type Profile } from "../types";
import { PlacementCards, PlacementTestView } from "./Placement";

const STEPS = ["welcome", "tests", "goals", "levels", "time", "review"] as const;

export function SetupScreen(props: {
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  onDone: (profile: Profile) => void;
}) {
  const { t, formatBand, formatDays, formatHours } = useI18n();
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

  const goalErrors = validateGoals(goals, t);
  const levelErrors = validateLevels(levels, t);
  const current = STEPS[step];
  const stepValid =
    current === "goals"
      ? Object.keys(goalErrors).length === 0
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
      await api.saveSettings({ web_keep_signin: keepSignIn });
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
            <h1>{t("welcome_title")}</h1>
            <p>{t("welcome_body")}</p>
            <p className="note">{t("welcome_local")}</p>
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
            <GoalsFields value={goals} onChange={setGoals} errors={showErrors ? goalErrors : {}} />
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

        {current === "time" && (
          <section className="stack">
            <h1>{t("time_title")}</h1>
            <TimeFields value={time} onChange={setTime} />
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
              <dd>{goals.exam_date || t("not_set")}</dd>
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
                  days: formatDays(time.study_days_per_week),
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
