// "Start the plan again" (owner's request, v0.0.6): back after a break, the plan starts
// from today. History stays; the hours to the goal are counted again from now.

import { useState } from "react";
import { api, ApiError } from "../api";
import { useI18n } from "../i18n";
import { Icon } from "../icons";
import { todayIso } from "../plan";
import type { Profile } from "../types";

const DAILY_CHOICES = Array.from({ length: 28 }, (_, i) => (i + 1) * 30); // 30 min … 14 h

export function RestartCard(props: {
  profile: Profile;
  initiallyOpen?: boolean;
  onDone: (profile: Profile) => void;
  onOpenLevels: () => void;
  onStartOver: () => void;
}) {
  const { t, formatHours } = useI18n();
  const [open, setOpen] = useState(!!props.initiallyOpen);
  const [exam, setExam] = useState(props.profile.exam_date ?? "");
  const [daily, setDaily] = useState(props.profile.study_minutes_per_day);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = todayIso();

  async function confirm() {
    setError(null);
    if (exam && exam <= today) {
      setError(t("restart_exam_past"));
      return;
    }
    setBusy(true);
    try {
      await api.restartPlan({ today, exam_date: exam || null, study_minutes_per_day: daily });
      props.onDone(await api.profile());
      setOpen(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`card stack restart-card${open ? " open" : ""}`} id="restart">
      <div className="card-head">
        <h2 className="row">
          <Icon name="reload" color="#1D4ED8" /> {t("restart_title")}
        </h2>
        {!open && (
          <button className="btn small" onClick={() => setOpen(true)}>
            {t("restart_open")}
          </button>
        )}
      </div>
      <p className="muted small">{t("restart_body")}</p>
      {open && (
        <>
          <div className="grid-3">
            <label className="field">
              <span className="field-label">{t("restart_exam")}</span>
              <input
                type="date"
                dir="ltr"
                value={exam}
                min={today}
                onChange={(e) => setExam(e.target.value)}
              />
              <button className="linkish small self-start" onClick={() => setExam("")}>
                {t("restart_no_exam")}
              </button>
            </label>
            <label className="field">
              <span className="field-label">{t("restart_daily")}</span>
              <select value={daily} onChange={(e) => setDaily(Number(e.target.value))}>
                {DAILY_CHOICES.map((m) => (
                  <option key={m} value={m}>
                    {formatHours(m)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="info-strip">
            <Icon name="info" size={16} /> {t("restart_levels_hint")}{" "}
            <button className="linkish" onClick={props.onOpenLevels}>
              {t("restart_levels_btn")}
            </button>
          </p>
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          <p className="muted small">
            {t("restart_zero_hint")}{" "}
            <button className="linkish" onClick={props.onStartOver}>
              {t("restart_zero_btn")}
            </button>
          </p>
          <div className="row wrap">
            <button className="btn primary" disabled={busy} onClick={() => void confirm()}>
              <Icon name="play" size={14} /> {t("restart_confirm")}
            </button>
            <button className="btn subtle" disabled={busy} onClick={() => setOpen(false)}>
              {t("cancel")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
