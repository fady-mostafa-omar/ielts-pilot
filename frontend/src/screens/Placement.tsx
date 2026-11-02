// Dalilk's free placement tests (13English, 3-minute speaking): open the test in the
// study panel, then record the result the page showed. The plan starts from it.

import { useState } from "react";
import { api, ApiError } from "../api";
import { BandSelect, bands } from "../forms";
import { useI18n } from "../i18n";
import { Icon } from "../icons";
import { todayIso } from "../plan";
import { SKILLS, type Placement, type PlacementTest, type Skill } from "../types";
import { StudyScreen, type StudyTarget } from "./Study";

export const TESTS: Record<
  PlacementTest,
  { url: string; minutes: number; defaultSkills: Skill[]; icon: "compass" | "mic" }
> = {
  dalilk_13english: {
    url: "https://dalilk.com/tests/13english",
    minutes: 13,
    defaultSkills: ["listening", "reading", "writing", "speaking"],
    icon: "compass",
  },
  dalilk_3min: {
    url: "https://dalilk.com/tests/3min",
    minutes: 3,
    defaultSkills: ["speaking"],
    icon: "mic",
  },
};

const LEVEL_SUGGESTIONS = [
  "A1",
  "A2",
  "B1",
  "B2",
  "C1",
  "C2",
  "Beginner",
  "Elementary",
  "Pre-Intermediate",
  "Intermediate",
  "Upper-Intermediate",
  "Advanced",
  "Proficient",
];

export function PlacementForm(props: {
  test: PlacementTest;
  existing: Placement[];
  onSaved: (p: Placement) => void;
}) {
  const { t } = useI18n();
  const hasSpeaking = props.existing.some((p) => p.test === "dalilk_3min");
  const defaults =
    props.test === "dalilk_13english" && hasSpeaking
      ? TESTS[props.test].defaultSkills.filter((s) => s !== "speaking")
      : TESTS[props.test].defaultSkills;
  const [label, setLabel] = useState("");
  const [band, setBand] = useState<number | null>(null);
  const [takenOn, setTakenOn] = useState(todayIso());
  const [apply, setApply] = useState<Skill[]>(defaults);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const listId = `levels-${props.test}`;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const saved = await api.addPlacement({
        test: props.test,
        level_label: label.trim(),
        approx_band: band,
        taken_on: takenOn,
        notes,
        apply_to_skills: band === null ? [] : apply,
      });
      props.onSaved(saved);
      setLabel("");
      setBand(null);
      setNotes("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack placement-form">
      <h3>{t("pl_result_title")}</h3>
      <p className="muted small">{t("pl_result_hint")}</p>
      <label className="field">
        <span className="field-label">{t("pl_level_label")}</span>
        <input
          dir="auto"
          list={listId}
          value={label}
          maxLength={40}
          placeholder={t("pl_level_ph")}
          onChange={(e) => setLabel(e.target.value)}
        />
        <datalist id={listId}>
          {LEVEL_SUGGESTIONS.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </label>
      <label className="field">
        <span className="field-label">{t("pl_band")}</span>
        <BandSelect
          label={t("pl_band")}
          value={band}
          options={bands(1, 9)}
          emptyLabel={t("pl_band_none")}
          onChange={setBand}
        />
      </label>
      {band !== null && (
        <fieldset className="field plain">
          <legend className="field-label">{t("pl_apply")}</legend>
          <div className="row wrap">
            {SKILLS.map((s) => (
              <label key={s} className="check">
                <input
                  type="checkbox"
                  checked={apply.includes(s)}
                  onChange={(e) =>
                    setApply(e.target.checked ? [...apply, s] : apply.filter((x) => x !== s))
                  }
                />
                {t(`skill_${s}`)}
              </label>
            ))}
          </div>
          <span className="field-hint">{t("pl_apply_hint")}</span>
        </fieldset>
      )}
      <label className="field">
        <span className="field-label">{t("pl_date")}</span>
        <input type="date" value={takenOn} max={todayIso()} onChange={(e) => setTakenOn(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">
          {t("pl_notes")} ({t("optional")})
        </span>
        <input value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <button
        className="btn primary"
        disabled={busy || !label.trim()}
        onClick={() => void save()}
      >
        {t("pl_save")}
      </button>
    </div>
  );
}

export function placementStudyTarget(test: PlacementTest, title: string): StudyTarget {
  return {
    title,
    target: { url: TESTS[test].url },
    resource: null,
    skill: test === "dalilk_3min" ? "speaking" : "general",
    activityCode: "PLACEMENT",
    timer: false,
  };
}

/** Full-window test view: the test on one side, the result form on the other. */
export function PlacementTestView(props: {
  test: PlacementTest;
  keepSignIn: boolean;
  existing: Placement[];
  onSaved: (p: Placement) => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const [saved, setSaved] = useState<Placement | null>(null);
  return (
    <StudyScreen
      study={placementStudyTarget(props.test, t(`pl_${props.test}_name`))}
      keepSignIn={props.keepSignIn}
      onBack={props.onBack}
      sidebar={
        saved ? (
          <div className="stack ok-box">
            <p>
              <Icon name="check" /> {t("pl_saved", { label: saved.level_label })}
            </p>
            <button className="btn primary" onClick={props.onBack}>
              {t("pl_back_to_app")}
            </button>
          </div>
        ) : (
          <>
            <p className="muted small">{t(`pl_${props.test}_steps`)}</p>
            <PlacementForm
              test={props.test}
              existing={props.existing}
              onSaved={(p) => {
                setSaved(p);
                props.onSaved(p);
              }}
            />
          </>
        )
      }
    />
  );
}

/** The two test cards with their latest result. */
export function PlacementCards(props: {
  placements: Placement[];
  onOpen: (test: PlacementTest) => void;
}) {
  const { t, formatBand, formatDate } = useI18n();
  return (
    <div className="grid-2">
      {(Object.keys(TESTS) as PlacementTest[]).map((test) => {
        const last = props.placements.find((p) => p.test === test);
        return (
          <article key={test} className="test-card">
            <div className="row gap-md">
              <span className="skill-badge" style={{ background: "#E8EEFC", width: 40, height: 40 }}>
                <Icon name={TESTS[test].icon} color="#1D4ED8" />
              </span>
              <div className="stack-xs">
                <h3>{t(`pl_${test}_name`)}</h3>
                <span className="muted small">
                  {t(`pl_${test}_desc`, { m: TESTS[test].minutes })}
                </span>
              </div>
            </div>
            {last ? (
              <p className="ok small">
                <Icon name="check" size={14} /> {t("pl_last")} <bdi>{last.level_label}</bdi>
                {last.approx_band !== null && <> · ≈{formatBand(last.approx_band)}</>} ·{" "}
                {formatDate(last.taken_on)}
              </p>
            ) : (
              <p className="muted small">{t("pl_not_taken")}</p>
            )}
            <button className="btn primary self-start" onClick={() => props.onOpen(test)}>
              <Icon name="play" size={12} /> {last ? t("pl_retake") : t("pl_open")}
            </button>
          </article>
        );
      })}
    </div>
  );
}
