// v0.0.14 (owner, 2026-11-03, D-044): a test by name and the box for its result.
// - an official sample (a part of a test): right answers out of its questions, recorded only
// - a whole Listening / Reading test: right answers out of 40 and the band the site showed,
//   which goes into the level; the app never turns right answers into a band itself
// - a final full test: the band of each skill

import { useState } from "react";
import { api, ApiError } from "../api";
import { useI18n } from "../i18n";
import { Icon } from "../icons";
import { BANDS, FULL_QUESTIONS, PROVIDER_LABEL, QTYPES, qtypeLabel } from "../tests";
import type { ContentItem, PracticeResult, Skill } from "../types";
import type { TestView } from "./ContentQueue";

const SKILL_SHORT: Skill[] = ["listening", "reading", "writing", "speaking"];

function BandSelect(props: { value: number | null; onChange: (v: number | null) => void; label: string }) {
  return (
    <label className="score-box">
      <span>{props.label}</span>
      <select
        value={props.value ?? ""}
        onChange={(e) => props.onChange(e.target.value === "" ? null : Number(e.target.value))}
      >
        <option value="">—</option>
        {BANDS.map((b) => (
          <option key={b} value={b}>
            {b.toFixed(1)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The test's name, part and question type, and the buttons for its answer key/transcript. */
export function TestDetails(props: {
  item: ContentItem;
  view: TestView;
  onView: (v: TestView) => void;
}) {
  const { t } = useI18n();
  const { item } = props;
  const meta = item.meta ?? {};
  const sample = item.test_kind === "sample";
  return (
    <div className="stack-xs">
      <div className="row wrap">
        <span className={`pill ${sample ? "" : "pill-ok"}`}>
          {sample ? t("tq_sample") : item.skill === "full" ? t("tq_mock") : t("tq_full")}
        </span>
        <span className="muted small" dir="ltr">
          {PROVIDER_LABEL[item.provider] ?? item.provider}
        </span>
      </div>
      {(meta.part || meta.qtype) && (
        <span className="small" dir="ltr">
          {meta.part ? `Part ${meta.part}` : ""}
          {meta.part && meta.qtype ? " · " : ""}
          {meta.qtype ? qtypeLabel(item.skill, meta.qtype) : ""}
        </span>
      )}
      {(meta.answer_url || meta.transcript_url) && (
        <div className="row wrap">
          {props.view !== "test" ? (
            <button className="btn small" onClick={() => props.onView("test")}>
              <Icon name="arrowRight" size={12} className="flip-ltr" /> {t("tq_back_to_test")}
            </button>
          ) : null}
          {meta.answer_url && props.view !== "answers" && (
            <button className="btn small" onClick={() => props.onView("answers")}>
              <Icon name="check" size={12} /> {t("tq_answers")}
            </button>
          )}
          {meta.transcript_url && props.view !== "transcript" && (
            <button className="btn small" onClick={() => props.onView("transcript")}>
              <Icon name="book" size={12} /> {t("tq_transcript")}
            </button>
          )}
        </div>
      )}
      {(meta.answer_url || meta.transcript_url) && props.view === "test" && (
        <p className="muted small">{t("tq_answers_hint")}</p>
      )}
      {!sample && !meta.answer_url && item.skill !== "full" && (
        <p className="muted small">{t("tq_site_marks")}</p>
      )}
    </div>
  );
}

/** The result box under a test. `onSaved` goes on to the next test. */
export function TestScoreForm(props: {
  item: ContentItem;
  planTaskId: number | null;
  onSaved: (result: PracticeResult) => void;
  onSkip: () => void;
  busy?: boolean;
}) {
  const { t } = useI18n();
  const { item } = props;
  const sample = item.test_kind === "sample";
  const mock = item.skill === "full";
  const objective = item.skill === "listening" || item.skill === "reading";
  const [correct, setCorrect] = useState("");
  const [total, setTotal] = useState(sample ? "" : objective ? String(FULL_QUESTIONS) : "");
  const [band, setBand] = useState<number | null>(null);
  const [bands, setBands] = useState<Partial<Record<Skill, number>>>({});
  const [wrong, setWrong] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const c = correct.trim() === "" ? null : Number(correct);
  const n = total.trim() === "" ? null : Number(total);
  const marksOk =
    (c === null && n === null) ||
    (c !== null && n !== null && Number.isInteger(c) && Number.isInteger(n) && n > 0 && c >= 0 && c <= n);
  const anything = mock ? Object.keys(bands).length > 0 : sample ? c !== null && n !== null : c !== null || band !== null;
  const canSave = marksOk && anything && !(c !== null && n === null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await api.practiceSave({
        content_id: item.id,
        ...(c !== null && n !== null ? { correct: c, total: n } : {}),
        ...(!sample && !mock && band !== null ? { band } : {}),
        ...(mock ? { bands } : {}),
        ...(wrong.length ? { wrong_types: wrong } : {}),
        plan_task_id: props.planTaskId,
      });
      props.onSaved(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="test-score stack-xs">
      <span className="field-label">{t("tq_score_title")}</span>
      {!mock && (objective || sample) && (
        <div className="row wrap test-marks">
          <span>{t("tq_correct")}</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={200}
            value={correct}
            onChange={(e) => setCorrect(e.target.value)}
            aria-label={t("tq_correct")}
          />
          <span>{t("tq_of")}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={200}
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            aria-label={t("tq_questions")}
          />
        </div>
      )}
      {!sample && !mock && (
        <div className="score-grid">
          <BandSelect value={band} onChange={setBand} label={t("tq_site_band")} />
        </div>
      )}
      {mock && (
        <div className="score-grid">
          {SKILL_SHORT.map((s) => (
            <BandSelect
              key={s}
              label={t(`skill_${s}`)}
              value={bands[s] ?? null}
              onChange={(v) => {
                const next = { ...bands };
                if (v === null) delete next[s];
                else next[s] = v;
                setBands(next);
              }}
            />
          ))}
        </div>
      )}
      {!sample && objective && (
        <details>
          <summary className="small">{t("tq_wrong_types")}</summary>
          <div className="chips">
            {QTYPES[item.skill as "listening" | "reading"].map((q) => (
              <button
                key={q.key}
                type="button"
                className={`chip-btn small${wrong.includes(q.key) ? " active" : ""}`}
                dir="ltr"
                onClick={() =>
                  setWrong((w) => (w.includes(q.key) ? w.filter((x) => x !== q.key) : [...w, q.key]))
                }
              >
                {q.label}
              </button>
            ))}
          </div>
        </details>
      )}
      <p className="muted small">
        {sample ? t("tq_note_sample") : mock ? t("tq_note_mock") : t("tq_note_full")}
      </p>
      {!marksOk && <p className="error-box small">{t("tq_bad_marks")}</p>}
      {error && <p className="error-box small">{error}</p>}
      <div className="row wrap">
        <button
          className="btn primary"
          disabled={!canSave || saving || props.busy}
          onClick={() => void save()}
        >
          <Icon name="check" size={14} /> {t("tq_save")}
        </button>
        <button className="btn subtle small" disabled={saving || props.busy} onClick={props.onSkip}>
          {t("tq_done_no_score")}
        </button>
      </div>
    </section>
  );
}

/** One line about the result just saved, shown above the next test. */
export function savedLine(r: PracticeResult, t: ReturnType<typeof useI18n>["t"]): string {
  const marks = r.correct !== null && r.total !== null ? `${r.correct} / ${r.total}` : "";
  if (r.kind === "sample") return t("tq_saved_sample", { m: marks });
  const bands = Object.values(r.bands).length
    ? Object.entries(r.bands)
        .map(([s, b]) => `${t(`skill_${s as Skill}`)} ${(b as number).toFixed(1)}`)
        .join(" · ")
    : r.band !== null
      ? r.band.toFixed(1)
      : "";
  if (bands && marks) return t("tq_saved_full", { m: marks, b: bands });
  return bands ? t("tq_saved_band", { b: bands }) : t("tq_saved_marks", { m: marks });
}
