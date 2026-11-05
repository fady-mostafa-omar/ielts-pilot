// v0.0.12 (PRD F6/F7/F8, D-026, D-042): the writing lab, the speaking lab and the AI tutor.
// v0.0.17 (owner, 2026-11-05, D-048): one opening message sets the whole ChatGPT chat — a
// question, wait, mark it like IELTS, then a model answer at the learner's own target band
// that keeps his ideas — always under the same headings. The learner pastes the reply into
// one box and the app splits it: marks into the score boxes, mistakes for the notebook, the
// model answer into its own box. No API: copy and paste only. Each answer can be kept as a
// PDF (with its recordings) in Documents/IELTS Band Up/إجاباتي.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../api";
import { answerStem, saveAnswer, toWav, type AnswerDoc } from "../answers";
import { useI18n } from "../i18n";
import { LINUX } from "../platform";
import { Icon } from "../icons";
import { formatClock, todayIso } from "../plan";
import {
  copyAndOpen,
  copyOnly,
  ERROR_CODES,
  readModelAnswer,
  readTutorReply,
  readTutorScores,
  speakingAnswerMessage,
  speakingSessionPrompt,
  splitTutorReply,
  textDir,
  TUTOR_SITES,
  writingAnswerMessage,
  writingSessionPrompt,
  type Learner,
} from "../tutor";
import type {
  Card,
  ContentItem,
  MistakeInput,
  SpeakingAttempt,
  SpeakingCriterion,
  TutorSite,
  WritingAttempt,
} from "../types";
import { useRecorder } from "./Recorder";

const LIMITS: Record<number, number> = { 1: 20 * 60, 2: 40 * 60 };
const MIN_WORDS: Record<number, number> = { 0: 0, 1: 150, 2: 250 };

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/** What the tutor needs to know: level, the skill's target, language of the explanations. */
export function useLearner(skill: "writing" | "speaking") {
  const [learner, setLearner] = useState<Learner | null>(null);
  const [site, setSite] = useState<TutorSite>("chatgpt");
  useEffect(() => {
    let alive = true;
    void Promise.all([
      api.profile(),
      api.levels(),
      api.settings(),
      api.cardsRecent().catch(() => []),
    ]).then(([profile, levels, settings, words]) => {
      if (!alive) return;
      setSite(settings.tutor ?? "chatgpt");
      setLearner({
        band: levels.current[skill]?.band ?? null,
        // v0.0.17: the model answer aims at the target set for this skill in the setup
        target:
          (skill === "writing" ? profile.target_writing : profile.target_speaking) ??
          profile.target_overall,
        explain: profile.explanation_language,
        examFormat: settings.exam_format,
        words: words.map((w) => w.front).slice(0, 8),
      });
    });
    return () => {
      alive = false;
    };
  }, [skill]);
  return { learner, site };
}

/** Saves a value a moment after the last change, and on leaving. */
function useSaveLater<T>(save: (value: T) => void, ms = 900) {
  const timer = useRef<number | null>(null);
  const pending = useRef<{ value: T } | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
      if (pending.current) saveRef.current(pending.current.value);
    },
    [],
  );
  return useCallback(
    (value: T) => {
      pending.current = { value };
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        pending.current = null;
        saveRef.current(value);
      }, ms);
    },
    [ms],
  );
}

/** The reply split under its headings, and what the app reads from each part. Without the
 *  headings, the whole reply is read as before (marks and WRONG/RIGHT lines). */
function useReply(reply: string) {
  return useMemo(() => {
    const parts = splitTutorReply(reply);
    const headed = Object.keys(parts).length > 0;
    const scoresText = parts.scores ?? (headed ? "" : reply);
    const mistakesText = parts.mistakes ?? (headed ? "" : reply);
    return {
      parts,
      headed,
      scores: readTutorScores(scoresText),
      overall: readTutorReply(scoresText).overall,
      mistakes: readTutorReply(mistakesText).mistakes,
    };
  }, [reply]);
}

/* ---------- the steps ---------- */

function StepLabel(props: { no?: number; children: ReactNode }) {
  return (
    <span className="field-label">
      {props.no !== undefined && <span className="step-no">{props.no}</span>} {props.children}
    </span>
  );
}

/** The opening message: ChatGPT keeps its steps and headings for the whole chat. */
function SessionCard(props: {
  no: number;
  site: TutorSite;
  prompt: () => string | null;
  hint: string;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState<boolean | null>(null);
  const name = TUTOR_SITES[props.site].name;
  return (
    <section className="lab-card stack-xs">
      <StepLabel no={props.no}>{t("lab_step_session", { site: name })}</StepLabel>
      <p className="muted small">{props.hint}</p>
      <button
        className="btn primary self-start"
        onClick={async () => {
          const text = props.prompt();
          if (text) setCopied(await copyAndOpen(text, props.site));
        }}
      >
        <Icon name="external" size={14} /> {t("lab_copy_starter", { site: name })}
      </button>
      {copied === true && <p className="ok small">✓ {t("lab_starter_copied", { site: name })}</p>}
      {copied === false && <p className="error-box small">{t("tutor_copy_failed")}</p>}
    </section>
  );
}

/** The question: a named test's question opens beside the lab and is copied in here;
 *  otherwise ChatGPT's question is pasted here. */
function QuestionStep(props: {
  no?: number;
  test: ContentItem | null;
  testTitle: string | null;
  hint: string;
  onShow?: () => void;
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  placeholder: string;
}) {
  const { t } = useI18n();
  return (
    <section className="lab-card stack-xs">
      <StepLabel no={props.no}>{t("lab_question")}</StepLabel>
      {props.testTitle && (
        <strong dir="ltr" className="small">
          {props.testTitle}
        </strong>
      )}
      {!props.readOnly && <p className="muted small">{props.hint}</p>}
      {!props.readOnly && props.test && props.onShow && (
        <button className="btn self-start" onClick={props.onShow}>
          <Icon name="globe" size={14} /> {t("lab_open_question")}
        </button>
      )}
      <textarea
        className="lab-question"
        dir="ltr"
        lang="en"
        value={props.value}
        readOnly={props.readOnly}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </section>
  );
}

/** One box for ChatGPT's whole reply; the app says what it found in it. */
function ReplyStep(props: {
  no: number;
  site: TutorSite;
  speaking: boolean;
  reply: string;
  onReply: (value: string) => void;
  info: ReturnType<typeof useReply>;
}) {
  const { t } = useI18n();
  const name = TUTOR_SITES[props.site].name;
  const { parts, headed, mistakes } = props.info;
  const found: [boolean, string][] = [
    ...(props.speaking ? [[!!parts.my_answer, t("reply_part_answer")] as [boolean, string]] : []),
    [!!parts.scores, t("reply_part_scores")],
    [!!parts.mistakes, t("reply_part_mistakes", { n: mistakes.length })],
    [!!parts.model_answer, t("reply_part_model")],
  ];
  return (
    <section className="lab-card stack-xs">
      <StepLabel no={props.no}>{t("tutor_paste_reply", { site: name })}</StepLabel>
      <p className="muted small">{t("reply_hint", { site: name })}</p>
      <textarea
        className="tutor-reply"
        dir="auto"
        value={props.reply}
        placeholder={t("tutor_reply_ph")}
        onChange={(e) => props.onReply(e.target.value)}
      />
      {props.reply.trim() !== "" &&
        (headed ? (
          <ul className="reply-found">
            {found.map(([ok, label]) => (
              <li key={label} className={ok ? "ok" : "muted"}>
                {ok ? "✓" : "—"} {label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="note small">{t("reply_no_headings")}</p>
        ))}
    </section>
  );
}

function MistakeForm(props: { onAdd: (m: MistakeInput) => void }) {
  const { t } = useI18n();
  const [m, setM] = useState<MistakeInput>({ wrong: "", right: "", why: "", code: "" });
  return (
    <div className="stack-xs mistake-form">
      <input
        dir="ltr"
        placeholder={t("lab_mistake_wrong")}
        value={m.wrong}
        maxLength={300}
        onChange={(e) => setM({ ...m, wrong: e.target.value })}
      />
      <input
        dir="ltr"
        placeholder={t("lab_mistake_right")}
        value={m.right}
        maxLength={500}
        onChange={(e) => setM({ ...m, right: e.target.value })}
      />
      <input
        dir="auto"
        placeholder={t("lab_mistake_why")}
        value={m.why}
        maxLength={500}
        onChange={(e) => setM({ ...m, why: e.target.value })}
      />
      <div className="row wrap">
        <select value={m.code} onChange={(e) => setM({ ...m, code: e.target.value })}>
          <option value="">{t("lab_mistake_code")}</option>
          {ERROR_CODES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          className="btn small"
          disabled={!m.wrong.trim() || !m.right.trim()}
          onClick={() => {
            props.onAdd(m);
            setM({ wrong: "", right: "", why: "", code: "" });
          }}
        >
          <Icon name="plus" size={12} /> {t("lab_mistake_add")}
        </button>
      </div>
    </div>
  );
}

/** The reply's mistakes: the ticked ones go to the mistakes notebook (cards). */
function MistakesStep(props: {
  no: number;
  site: TutorSite;
  skill: "writing" | "speaking";
  mistakes: MistakeInput[];
}) {
  const { t } = useI18n();
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [manual, setManual] = useState<MistakeInput[]>([]);
  const [added, setAdded] = useState(0);
  const [busy, setBusy] = useState(false);
  const all = [...props.mistakes, ...manual];
  const name = TUTOR_SITES[props.site].name;
  const key = JSON.stringify(props.mistakes);

  useEffect(() => {
    // every mistake read from a new reply starts ticked
    setPicked(new Set((JSON.parse(key) as MistakeInput[]).map((_, i) => i)));
    setAdded(0);
  }, [key]);

  const save = async () => {
    const items = all
      .map((m, i) => (picked.has(i) || i >= props.mistakes.length ? m : null))
      .filter((m): m is MistakeInput => m !== null)
      .map((m) => ({ ...m, skill: props.skill }));
    if (items.length === 0) return;
    setBusy(true);
    try {
      await api.mistakesAdd(items, `AI tutor (${name}) — opinion`, todayIso());
      setAdded(items.length);
      setManual([]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="lab-card stack-xs">
      <StepLabel no={props.no}>{t("lab_mistakes_step")}</StepLabel>
      {all.length === 0 ? (
        <p className="muted small">{t("lab_mistakes_none")}</p>
      ) : (
        <>
          <p className="muted small">{t("lab_mistakes_pick")}</p>
          <ul className="mistake-list">
            {all.map((m, i) => (
              <li key={i}>
                <label dir="ltr">
                  <input
                    type="checkbox"
                    checked={i >= props.mistakes.length || picked.has(i)}
                    disabled={i >= props.mistakes.length}
                    onChange={(e) => {
                      const next = new Set(picked);
                      if (e.target.checked) next.add(i);
                      else next.delete(i);
                      setPicked(next);
                    }}
                  />
                  <span dir="ltr" className="m-wrong">
                    {m.wrong}
                  </span>
                  <span aria-hidden="true">→</span>
                  <span dir="ltr" className="m-right">
                    {m.right}
                  </span>
                  {m.code && <span className="pill">{m.code}</span>}
                </label>
                {m.why && (
                  <p className="muted small" dir={textDir(m.why)}>
                    {m.why}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <button className="btn primary self-start" disabled={busy || added > 0} onClick={save}>
            <Icon name="cards" size={14} /> {t("tutor_save_mistakes")}
          </button>
          {added > 0 && <p className="ok small">✓ {t("tutor_mistakes_saved", { n: added })}</p>}
        </>
      )}
      <details className="manual-mistake">
        <summary>{t("lab_mistake_manual")}</summary>
        <MistakeForm onAdd={(m) => setManual((list) => [...list, m])} />
      </details>
    </section>
  );
}

/** The model answer: the learner's own answer at his target band, part by part. Shown
 *  tidily when it follows the agreed format; editable at any time. */
function ModelStep(props: {
  no: number;
  site: TutorSite;
  target: number;
  value: string;
  onChange: (value: string) => void;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const model = useMemo(() => readModelAnswer(props.value), [props.value]);
  const tidy = model.parts.length > 0;
  const [editing, setEditing] = useState(false);
  const name = TUTOR_SITES[props.site].name;
  return (
    <section className="lab-card stack-xs">
      <div className="row wrap">
        <StepLabel no={props.no}>{t("lab_model_title")}</StepLabel>
        <span className="spacer" />
        {props.value.trim() !== "" && tidy && (
          <button className="btn subtle small" onClick={() => setEditing((e) => !e)}>
            <Icon name={editing ? "check" : "pen"} size={12} />{" "}
            {editing ? t("lab_model_done") : t("lab_model_edit")}
          </button>
        )}
      </div>
      <p className="muted small">
        {t("lab_model_hint", { site: name, band: props.target.toFixed(1) })}
      </p>
      {tidy && !editing ? (
        <div className="model-view">
          {model.parts.map((p, i) => (
            <div key={i} className="model-part">
              <p className="mine" dir="ltr" lang="en">
                {p.mine}
              </p>
              <p className="better" dir="ltr" lang="en">
                {p.better}
              </p>
              {p.why && (
                <p className="why muted small" dir={textDir(p.why)}>
                  {p.why}
                </p>
              )}
            </div>
          ))}
          {model.full && (
            <>
              <span className="field-label">{t("pdf_full_answer")}</span>
              <p className="model-full" dir="ltr" lang="en">
                {model.full}
              </p>
            </>
          )}
        </div>
      ) : (
        <textarea
          className="lab-answer short"
          dir="ltr"
          lang="en"
          value={props.value}
          placeholder={t("lab_model_ph")}
          onChange={(e) => props.onChange(e.target.value)}
        />
      )}
      {props.children}
    </section>
  );
}

/** Speaking: the learner reads the model answer aloud and keeps his best try. */
function ModelVoice(props: {
  text: string;
  saved: string | null;
  onSaved: (name: string) => void;
}) {
  const { t } = useI18n();
  const rec = useRecorder(MODEL_LIMIT, "model");
  const [again, setAgain] = useState(false);
  const { fileName } = rec;
  const onSaved = props.onSaved;
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (fileName && fileName !== last.current) {
      last.current = fileName;
      onSaved(fileName);
    }
  }, [fileName, onSaved]);
  const recording = rec.state === "recording";
  return (
    <div className="stack-xs model-voice">
      <span className="field-label">
        <Icon name="mic" size={14} /> {t("lab_model_voice")}
      </span>
      <p className="muted small">{t("lab_model_voice_hint")}</p>
      {recording && props.text && (
        <p className="read-aloud" dir="ltr" lang="en">
          {props.text}
        </p>
      )}
      {recording ? (
        <div className="row wrap">
          <span className="rec-clock small-clock" dir="ltr">
            {formatClock(Math.max(0, MODEL_LIMIT - rec.left))}
          </span>
          <button className="btn danger" onClick={rec.stop}>
            <Icon name="stop" size={14} /> {t("rec_stop")}
          </button>
        </div>
      ) : rec.state === "done" && rec.audioUrl ? (
        <>
          <audio className="rec-audio" controls src={rec.audioUrl} />
          {rec.fileName && <span className="muted small">{t("rec_saved")}</span>}
          <button className="btn self-start" onClick={() => rec.reset()}>
            <Icon name="mic" size={14} /> {t("lab_model_voice_again")}
          </button>
        </>
      ) : props.saved && !again ? (
        <div className="row wrap">
          <PlayRecording name={props.saved} />
          <button className="btn small" onClick={() => setAgain(true)}>
            <Icon name="mic" size={12} /> {t("lab_model_voice_again")}
          </button>
        </div>
      ) : (
        <button
          className="btn primary self-start"
          disabled={!props.text.trim()}
          onClick={() => void rec.start()}
        >
          <Icon name="mic" size={14} /> {t("lab_model_voice")}
        </button>
      )}
      {rec.state === "error" && (
        <p className="error-box">{t(LINUX ? "rec_no_mic_linux" : "rec_no_mic")}</p>
      )}
    </div>
  );
}

/** "احفظ PDF": the whole answer in one file in Documents/IELTS Band Up/إجاباتي. */
function PdfStep(props: {
  no: number;
  current: string | null;
  build: () => { doc: AnswerDoc; recordings: { label: "mine" | "model"; name: string }[] } | null;
  onSaved: (pdf: string) => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const bridge = window.ipBridge?.answers;
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const save = async () => {
    const input = props.build();
    if (!input) return;
    setBusy(true);
    setFailed(false);
    try {
      const result = await saveAnswer(input.doc, input.recordings, props.current, i18n);
      setSaved(result.pdf);
      props.onSaved(result.pdf);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const name = saved ?? props.current;
  return (
    <section className="lab-card stack-xs">
      <StepLabel no={props.no}>{t("pdf_step")}</StepLabel>
      <p className="muted small">{t("pdf_where")}</p>
      {!bridge ? (
        <p className="note small">{t("pdf_desktop_only")}</p>
      ) : (
        <>
          <button className="btn primary self-start" disabled={busy} onClick={() => void save()}>
            <Icon name="file" size={14} />{" "}
            {busy ? t("pdf_saving") : props.current ? t("pdf_save_again") : t("pdf_save")}
          </button>
          {failed && <p className="error-box small">{t("pdf_failed")}</p>}
          {name && !busy && (
            <div className="stack-xs">
              {saved && <p className="ok small">✓ {t("pdf_saved")}</p>}
              <span className="small" dir="auto">
                {name}
              </span>
              <div className="row wrap">
                <button className="btn small" onClick={() => void bridge.open(name)}>
                  <Icon name="external" size={12} /> {t("answers_open")}
                </button>
                <button
                  className="btn subtle small"
                  onClick={() => void window.ipBridge?.openFolder("answers")}
                >
                  <Icon name="library" size={12} /> {t("answers_open_folder")}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** Speaking: the recording as a file for ChatGPT, and the message that goes with it. */
function SendRecording(props: {
  blob: Blob | null;
  seconds: number;
  part: number;
  site: TutorSite;
  named: { title: string; question: string; part: number } | null;
}) {
  const { t } = useI18n();
  const bridge = window.ipBridge?.answers;
  const name = TUTOR_SITES[props.site].name;
  const [exported, setExported] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<boolean | null>(null);
  return (
    <div className="stack-xs send-recording">
      <p className="muted small">{t("lab_send_hint", { site: name })}</p>
      <div className="row wrap">
        {bridge && (
          <button
            className="btn primary"
            disabled={!props.blob || busy}
            onClick={async () => {
              if (!props.blob) return;
              setBusy(true);
              setFailed(false);
              try {
                const wav = await toWav(await props.blob.arrayBuffer());
                const file = await bridge.exportAudio(
                  wav,
                  answerStem(new Date(), `Speaking Part ${props.part}`, props.named?.title ?? null),
                );
                if (file) setExported(file);
              } catch {
                setFailed(true);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Icon name="download" size={14} /> {t("lab_download_recording")}
          </button>
        )}
        <button
          className="btn"
          onClick={async () =>
            setCopied(await copyOnly(speakingAnswerMessage(props.seconds, props.named)))
          }
        >
          <Icon name="cards" size={14} /> {t("lab_copy_send_message")}
        </button>
      </div>
      {exported && <p className="ok small">✓ {t("lab_recording_exported", { file: exported, site: name })}</p>}
      {failed && <p className="error-box small">{t("lab_recording_export_failed")}</p>}
      {copied === true && <p className="ok small">✓ {t("lab_send_copied", { site: name })}</p>}
      {copied === false && <p className="error-box small">{t("tutor_copy_failed")}</p>}
      <p className="note small">{t("lab_send_fallback", { site: name })}</p>
    </div>
  );
}

/** v0.0.14 (D-044): the lab's named question — the official one first, then Cambridge
 *  21, 20, 19, then ieltsonlinetests; each answered once. `undefined` while loading. */
export function useLabTest(
  skill: "writing" | "speaking",
  task: number,
  planTaskId: number | null,
  enabled: boolean,
) {
  const [test, setTest] = useState<ContentItem | null | undefined>(enabled ? undefined : null);
  const reload = useCallback(() => {
    if (!enabled) {
      setTest(null);
      return;
    }
    void api
      .labTest(skill, task, planTaskId)
      .then(setTest)
      .catch(() => setTest(null));
  }, [skill, task, planTaskId, enabled]);
  useEffect(() => reload(), [reload]);
  return { test, reload };
}

const BANDS = Array.from({ length: 19 }, (_, i) => i / 2);

export function overallOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.round(mean * 2) / 2; // .25 up to .5, .75 up to the next band
}

/** The tutor's marks, typed in by the owner; saving them updates his level (D-043). */
function ScoreBoxes(props: {
  no: number;
  criteria: { key: string; label: string }[];
  scores: Record<string, number>;
  overall: number | null;
  saved: boolean;
  onSave: (scores: Record<string, number>, overall: number) => Promise<void>;
  note: string;
}) {
  const { t } = useI18n();
  const [scores, setScores] = useState<Record<string, number>>(props.scores);
  const [overall, setOverall] = useState<number | null>(props.overall);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(props.saved);
  // the parent builds a new object on each render: follow its content, not its identity
  const incoming = JSON.stringify(props.scores);
  useEffect(() => setScores(JSON.parse(incoming) as Record<string, number>), [incoming]);
  useEffect(() => setOverall(props.overall), [props.overall]);
  const suggested = overallOf(props.criteria.map((c) => scores[c.key]).filter((v) => v !== undefined));
  const value = overall ?? suggested;
  return (
    <section className="lab-card stack-xs">
      <StepLabel no={props.no}>{t("lab_scores_title")}</StepLabel>
      <p className="muted small">{props.note}</p>
      <div className="score-grid">
        {props.criteria.map((c) => (
          <label key={c.key} className="score-box">
            <span>{c.label}</span>
            <select
              value={scores[c.key] ?? ""}
              onChange={(e) => {
                setDone(false);
                const next = { ...scores };
                if (e.target.value === "") delete next[c.key];
                else next[c.key] = Number(e.target.value);
                setScores(next);
              }}
            >
              <option value="">—</option>
              {BANDS.map((b) => (
                <option key={b} value={b}>
                  {b.toFixed(1)}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="score-box overall">
          <span>{t("lab_score_overall")}</span>
          <select
            value={value ?? ""}
            onChange={(e) => {
              setDone(false);
              setOverall(e.target.value === "" ? null : Number(e.target.value));
            }}
          >
            <option value="">—</option>
            {BANDS.map((b) => (
              <option key={b} value={b}>
                {b.toFixed(1)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        className="btn primary self-start"
        disabled={busy || value === null}
        onClick={async () => {
          if (value === null) return;
          setBusy(true);
          try {
            await props.onSave(scores, value);
            setDone(true);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Icon name="check" size={14} /> {t("lab_save_scores")}
      </button>
      {done && value !== null && (
        <p className="ok small">✓ {t("lab_scores_saved", { band: value.toFixed(1) })}</p>
      )}
    </section>
  );
}

/* ---------- writing lab ---------- */

const CHECKLIST: Record<number, { group: string; items: string[] }[]> = {
  1: [
    { group: "chk_g_task", items: ["chk_t1_overview", "chk_t1_data", "chk_t1_compare"] },
    { group: "chk_g_coh", items: ["chk_paragraphs", "chk_linking"] },
    { group: "chk_g_lex", items: ["chk_variety", "chk_spelling"] },
    { group: "chk_g_gram", items: ["chk_sentences", "chk_grammar"] },
  ],
  2: [
    { group: "chk_g_task", items: ["chk_t2_all_parts", "chk_t2_position", "chk_t2_support"] },
    { group: "chk_g_coh", items: ["chk_paragraphs", "chk_linking"] },
    { group: "chk_g_lex", items: ["chk_variety", "chk_spelling"] },
    { group: "chk_g_gram", items: ["chk_sentences", "chk_grammar"] },
  ],
};

export function WritingLab(props: {
  task: 0 | 1 | 2 | null; // null: the owner picks Task 1 or Task 2
  count: number;
  planTaskId: number | null;
  opened?: WritingAttempt | null; // an earlier answer chosen in the side list
  onChanged?: () => void;
  test?: ContentItem | null; // v0.0.14: the named question (D-044)
  onShowQuestion?: () => void;
  onNextQuestion?: () => void; // a new answer: the next named question
}) {
  const { t } = useI18n();
  const { learner, site } = useLearner("writing");
  const [task, setTask] = useState<0 | 1 | 2>(props.task ?? 2);
  const [attempt, setAttempt] = useState<WritingAttempt | null>(null);
  const [prompt, setPrompt] = useState("");
  const [text, setText] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [reply, setReply] = useState("");
  const [model, setModel] = useState("");
  const [checks, setChecks] = useState<string[]>([]);
  const [answerCopied, setAnswerCopied] = useState<boolean | null>(null);
  const creating = useRef<Promise<WritingAttempt> | null>(null);
  const submitted = attempt?.status === "submitted";
  const test = props.test ?? null;
  // the named question: the answer's own once it exists, otherwise the next one
  const testTitle = attempt ? attempt.test_title : task !== 0 ? (test?.title ?? null) : null;
  const limit = LIMITS[task] ?? 0;
  const words = countWords(text);
  const min = MIN_WORDS[task] ?? 0;
  const name = TUTOR_SITES[site].name;
  const info = useReply(reply);

  const show = useCallback((a: WritingAttempt | null) => {
    setAttempt(a);
    setPrompt(a?.prompt ?? "");
    setText(a?.text ?? "");
    setSeconds(a?.seconds_used ?? 0);
    setReply(a?.tutor_reply ?? "");
    setModel(a?.model_answer ?? "");
    setChecks(a?.checklist ?? []);
    setRunning(false);
    setAnswerCopied(null);
    if (a) setTask(a.task);
  }, []);

  // carry on with this task's draft, if any
  useEffect(() => {
    if (props.planTaskId === null) return;
    void api.writingList({ plan_task_id: props.planTaskId, limit: 20 }).then((list) => {
      setSubmittedCount(list.filter((a) => a.status === "submitted").length);
      const draft = list.find((a) => a.status === "draft");
      if (draft) show(draft);
    });
  }, [props.planTaskId, show]);

  useEffect(() => {
    if (props.opened) show(props.opened);
  }, [props.opened, show]);

  // the task's clock runs while writing
  useEffect(() => {
    if (!running || submitted) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [running, submitted]);

  const ensure = useCallback(async (): Promise<WritingAttempt> => {
    if (attempt) return attempt;
    if (!creating.current) {
      creating.current = api
        .writingNew(task, prompt, props.planTaskId, task !== 0 ? (test?.key ?? null) : null)
        .then((a) => {
          setAttempt(a);
          return a;
        });
    }
    return creating.current;
  }, [attempt, task, prompt, props.planTaskId, test]);

  // autosave a moment after the last change
  useEffect(() => {
    if (submitted || (!text && !prompt)) return;
    const timer = setTimeout(() => {
      void ensure().then((a) =>
        api.writingPatch(a.id, { prompt, text, seconds_used: seconds }).then(setAttempt),
      );
    }, 1500);
    return () => clearTimeout(timer);
    // seconds are saved with the text, not on every tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, prompt, submitted]);

  const submit = async () => {
    const a = await ensure();
    const done = await api.writingPatch(a.id, { prompt, text, seconds_used: seconds, submit: true });
    show(done);
    setSubmittedCount((n) => n + 1);
    props.onChanged?.();
  };

  const fresh = () => {
    creating.current = null;
    show(null);
    props.onNextQuestion?.();
  };

  const patch = (p: Parameters<typeof api.writingPatch>[1]) => {
    if (!attempt) return;
    void api.writingPatch(attempt.id, p).then((a) => {
      setAttempt(a);
      props.onChanged?.();
    });
  };
  const saveModelLater = useSaveLater((value: string) => patch({ model_answer: value }));

  const onReply = (value: string) => {
    setReply(value);
    const found = splitTutorReply(value).model_answer;
    if (found) setModel(found);
    patch({ tutor_reply: value, ...(found ? { model_answer: found } : {}) });
  };

  const left = limit ? limit - seconds : 0;
  const number = Math.min(props.count, submittedCount + (submitted ? 0 : 1));
  const first = task === 1 ? "TA" : "TR";
  const scores = attempt && Object.keys(attempt.scores ?? {}).length ? attempt.scores : info.scores;
  const criteria = [
    { key: "task", label: first, name: task === 1 ? "Task Achievement" : "Task Response" },
    { key: "coherence", label: "CC", name: "Coherence and Cohesion" },
    { key: "lexical", label: "LR", name: "Lexical Resource" },
    { key: "grammar", label: "GRA", name: "Grammatical Range and Accuracy" },
  ];
  const tutor = task !== 0;

  const pdf = () => {
    if (!attempt || !learner) return null;
    const marks = criteria.map((c) => scores[c.key]).filter((v) => v !== undefined);
    const doc: AnswerDoc = {
      skill: "writing",
      label: `Writing Task ${task}`,
      testTitle: attempt.test_title,
      day: new Date(attempt.submitted_at ?? attempt.created_at),
      target: learner.target,
      question: prompt,
      answer: text,
      answerNote: t("pdf_words_minutes", { w: words, m: Math.round(seconds / 60) }),
      criteria: criteria.map((c) => ({ short: c.label, name: c.name, band: scores[c.key] ?? null })),
      overall: attempt.tutor_overall ?? info.overall ?? overallOf(marks),
      mistakes: info.mistakes,
      model,
      site: name,
    };
    return { doc, recordings: [] };
  };

  return (
    <div className="lab">
      <header className="lab-head">
        {props.task === null && !attempt ? (
          <div className="seg" role="radiogroup" aria-label={t("lab_task")}>
            {([1, 2] as const).map((n) => (
              <button
                key={n}
                role="radio"
                aria-checked={task === n}
                className={task === n ? "on" : ""}
                onClick={() => setTask(n)}
              >
                Task {n}
              </button>
            ))}
          </div>
        ) : (
          <strong>{task === 0 ? t("lab_free_writing") : `Task ${task}`}</strong>
        )}
        {props.count > 1 && (
          <span className="pill">{t("lab_answer_of", { n: number, m: props.count })}</span>
        )}
        <span className="spacer" />
        {limit > 0 && (
          <span className={`lab-clock${left < 0 ? " over" : ""}`} dir="ltr">
            <Icon name="clock" size={16} /> {formatClock(Math.abs(left))}
            {left < 0 ? " +" : ""}
          </span>
        )}
        {!submitted && limit > 0 && (
          <button className="btn small" onClick={() => setRunning((r) => !r)}>
            <Icon name={running ? "pause" : "play"} size={12} />{" "}
            {running ? t("lab_pause_clock") : seconds ? t("lab_resume_clock") : t("lab_start_clock")}
          </button>
        )}
      </header>

      {!submitted && tutor && (
        <SessionCard
          no={1}
          site={site}
          hint={
            testTitle
              ? t("lab_session_hint_named", { site: name })
              : t("lab_session_hint_writing", { site: name, task })
          }
          prompt={() =>
            learner ? writingSessionPrompt(task as 1 | 2, learner, testTitle) : null
          }
        />
      )}

      <QuestionStep
        no={tutor ? 2 : undefined}
        test={!attempt || attempt.test_key ? test : null}
        testTitle={testTitle}
        hint={
          testTitle
            ? task === 1
              ? t(LINUX ? "lab_question_hint_t1_linux" : "lab_question_hint_t1")
              : t("lab_question_hint_t2")
            : t("lab_question_paste_hint", { site: name })
        }
        onShow={props.onShowQuestion}
        value={prompt}
        onChange={setPrompt}
        readOnly={submitted}
        placeholder={testTitle ? t("lab_question_copy_ph") : t("lab_question_paste_ph", { site: name })}
      />

      <section className="lab-card stack-xs">
        <div className="row wrap">
          <StepLabel no={tutor ? 3 : undefined}>{t("lab_answer")}</StepLabel>
          <span className="spacer" />
          {min > 0 && (
            <span className={`pill ${words >= min ? "pill-ok" : ""}`} dir="ltr">
              {words} / {min} {t("pad_words")}
            </span>
          )}
        </div>
        <textarea
          className="lab-answer"
          dir="ltr"
          lang="en"
          spellCheck={false}
          value={text}
          readOnly={submitted}
          placeholder={t("pad_ph")}
          onChange={(e) => {
            setText(e.target.value);
            if (!running && !submitted && limit > 0 && !seconds) setRunning(true);
          }}
        />
        {!submitted && words > 0 && min > 0 && words < min && (
          <p className="note small">{t("lab_under_min", { n: min })}</p>
        )}
        {!submitted && (
          <button className="btn primary self-start" disabled={words === 0} onClick={() => void submit()}>
            <Icon name="check" size={14} /> {t("lab_submit")}
          </button>
        )}
        {submitted && (
          <>
            <p className="ok small">
              ✓ {t("lab_submitted", { w: attempt?.words ?? words, m: Math.round(seconds / 60) })}
            </p>
            {tutor && (
              <>
                <button
                  className="btn primary self-start"
                  onClick={async () =>
                    setAnswerCopied(
                      await copyOnly(
                        writingAnswerMessage(
                          text,
                          words,
                          Math.round(seconds / 60),
                          testTitle ? { title: testTitle, question: prompt, task } : null,
                        ),
                      ),
                    )
                  }
                >
                  <Icon name="cards" size={14} /> {t("lab_copy_answer")}
                </button>
                {answerCopied === true && (
                  <p className="ok small">✓ {t("lab_answer_copied", { site: name })}</p>
                )}
                {answerCopied === false && <p className="error-box small">{t("tutor_copy_failed")}</p>}
                {testTitle && task === 1 && <p className="note small">{t("lab_t1_screenshot")}</p>}
                {test?.meta?.answer_url && attempt?.test_key === test.key && (
                  <button
                    className="btn subtle small self-start"
                    onClick={() => void window.ipBridge?.openExternal(test.meta!.answer_url!)}
                  >
                    <Icon name="book" size={12} /> {t("lab_examiner_answers")}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </section>

      {submitted && tutor && attempt && (
        <>
          <ReplyStep no={4} site={site} speaking={false} reply={reply} onReply={onReply} info={info} />
          <ScoreBoxes
            no={5}
            criteria={criteria}
            scores={scores}
            overall={attempt.tutor_overall ?? info.overall}
            saved={attempt.tutor_overall !== null}
            note={t("lab_scores_note", { site: name })}
            onSave={async (s, overall) => {
              const a = await api.writingPatch(attempt.id, { scores: s, tutor_overall: overall });
              setAttempt(a);
              props.onChanged?.();
            }}
          />
          <MistakesStep no={6} site={site} skill="writing" mistakes={info.mistakes} />
          <ModelStep
            no={7}
            site={site}
            target={learner?.target ?? 7}
            value={model}
            onChange={(value) => {
              setModel(value);
              saveModelLater(value);
            }}
          />
          <PdfStep
            no={8}
            current={attempt.pdf_file}
            build={pdf}
            onSaved={(file) => patch({ pdf_file: file })}
          />
          <details className="lab-card">
            <summary>{t("chk_title")}</summary>
            <p className="muted small">{t("chk_note")}</p>
            {(CHECKLIST[task] ?? []).map((g) => (
              <div key={g.group} className="chk-group">
                <strong className="small">{t(g.group as "chk_g_task")}</strong>
                {g.items.map((id) => (
                  <label key={id} className="chk-item">
                    <input
                      type="checkbox"
                      checked={checks.includes(id)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...checks, id]
                          : checks.filter((x) => x !== id);
                        setChecks(next);
                        patch({ checklist: next });
                      }}
                    />{" "}
                    {t(id as "chk_paragraphs")}
                  </label>
                ))}
              </div>
            ))}
          </details>
        </>
      )}

      {submitted && (
        <button className="btn self-start" onClick={fresh}>
          <Icon name="plus" size={14} />{" "}
          {submittedCount < props.count
            ? t("lab_next_answer", { n: submittedCount + 1, m: props.count })
            : t("lab_new_answer")}
        </button>
      )}
    </div>
  );
}

export function WritingHistory(props: {
  task: 0 | 1 | 2 | null;
  refresh: number;
  onOpen: (a: WritingAttempt) => void;
}) {
  const { t } = useI18n();
  const [list, setList] = useState<WritingAttempt[]>([]);
  useEffect(() => {
    void api
      .writingList({ ...(props.task !== null ? { task: props.task } : {}), limit: 8 })
      .then((rows) => setList(rows.filter((r) => r.status === "submitted")));
  }, [props.task, props.refresh]);
  if (list.length === 0) return null;
  return (
    <div className="stack-xs lab-history">
      <span className="field-label">{t("lab_history")}</span>
      {list.map((a) => (
        <button key={a.id} className="history-row" onClick={() => props.onOpen(a)}>
          <span>{new Date(a.created_at).toLocaleDateString()}</span>
          <span>{a.task ? `Task ${a.task}` : t("lab_free_writing")}</span>
          <span>{t("lab_words_n", { n: a.words })}</span>
          {a.tutor_overall !== null && (
            <span className="pill">{t("lab_opinion_short", { band: a.tutor_overall.toFixed(1) })}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ---------- speaking lab ---------- */

const CRITERIA: SpeakingCriterion[] = ["fluency", "lexical", "grammar", "pronunciation"];
const PREP_SECONDS = 60;
const SPEAK_LIMIT = 120;
const MODEL_LIMIT = 240; // reading the model answer aloud
const SPEAKING_CRITERIA = [
  { key: "fluency", label: "FC", name: "Fluency and Coherence" },
  { key: "lexical", label: "LR", name: "Lexical Resource" },
  { key: "grammar", label: "GRA", name: "Grammatical Range and Accuracy" },
  { key: "pronunciation", label: "P", name: "Pronunciation" },
];

export function SpeakingLab(props: {
  planTaskId: number | null;
  parts?: (1 | 2 | 3)[]; // v0.0.13: the parts this plan task practises
  onChanged?: () => void;
  test?: ContentItem | null; // v0.0.14: the named test whose questions are answered
  onShowQuestion?: () => void;
}) {
  const { t } = useI18n();
  const { learner, site } = useLearner("speaking");
  const parts = props.parts && props.parts.length ? props.parts : ([1, 2, 3] as const);
  const [part, setPart] = useState<1 | 2 | 3>(parts.includes(2) && parts.length === 1 ? 2 : parts[0]);
  const [prompt, setPrompt] = useState("");
  const [prep, setPrep] = useState<number | null>(null);
  const [transcript, setTranscript] = useState("");
  const [rating, setRating] = useState<Partial<Record<SpeakingCriterion, number>>>({});
  const ratingRef = useRef(rating); // several quick clicks build on each other
  const [notes, setNotes] = useState("");
  const [attempt, setAttempt] = useState<SpeakingAttempt | null>(null);
  const [reply, setReply] = useState("");
  const [model, setModel] = useState("");
  const creating = useRef<Promise<SpeakingAttempt> | null>(null);
  const rec = useRecorder(SPEAK_LIMIT, "speaking");
  const recStart = rec.start;
  const name = TUTOR_SITES[site].name;
  const test = props.test ?? null;
  const testTitle = attempt ? attempt.test_title : (test?.title ?? null);
  const info = useReply(reply);

  // Part 2: one minute to prepare, then the recording starts by itself
  useEffect(() => {
    if (prep === null) return;
    if (prep <= 0) {
      setPrep(null);
      void recStart();
      return;
    }
    const timer = setTimeout(() => setPrep((p) => (p === null ? null : p - 1)), 1000);
    return () => clearTimeout(timer);
  }, [prep, recStart]);

  const begin = () => {
    if (part === 2) setPrep(PREP_SECONDS);
    else void rec.start();
  };

  const again = () => {
    rec.reset();
    creating.current = null;
    setAttempt(null);
    setTranscript("");
    ratingRef.current = {};
    setRating({});
    setNotes("");
    setReply("");
    setModel("");
  };

  /** The answer is kept from the first thing worth keeping (a reply, marks, a recording). */
  const ensure = async (): Promise<SpeakingAttempt> => {
    if (attempt) return attempt;
    creating.current ??= api
      .speakingNew({
        part,
        prompt,
        recording: rec.fileName,
        seconds: rec.seconds,
        transcript,
        self_rating: ratingRef.current as Record<string, number>,
        notes,
        plan_task_id: props.planTaskId,
        test_key: test?.key ?? null,
      })
      .then((a) => {
        setAttempt(a);
        props.onChanged?.();
        return a;
      });
    return creating.current;
  };

  const patch = (p: Parameters<typeof api.speakingPatch>[1]) => {
    void ensure()
      .then((a) => api.speakingPatch(a.id, p))
      .then((a) => {
        setAttempt(a);
        props.onChanged?.();
      });
  };
  const saveLater = useSaveLater((p: Parameters<typeof api.speakingPatch>[1]) => {
    if (attempt || creating.current) patch(p);
  });

  // a recording made after the answer was opened (the reply pasted first) joins it
  useEffect(() => {
    if (attempt && rec.fileName && !attempt.recording) {
      void api
        .speakingPatch(attempt.id, { recording: rec.fileName, seconds: rec.seconds })
        .then(setAttempt);
    }
  }, [attempt, rec.fileName, rec.seconds]);

  const onReply = (value: string) => {
    setReply(value);
    const split = splitTutorReply(value);
    if (split.my_answer) setTranscript(split.my_answer);
    if (split.model_answer) setModel(split.model_answer);
    if (!value.trim() && !attempt) return;
    patch({
      tutor_reply: value,
      ...(split.my_answer ? { transcript: split.my_answer } : {}),
      ...(split.model_answer ? { model_answer: split.model_answer } : {}),
    });
  };

  const onModelVoice = useCallback(
    (file: string) => {
      const old = attempt?.model_recording;
      patch({ model_recording: file });
      if (old && old !== file) void window.ipBridge?.deleteRecording?.(old).catch(() => false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attempt?.model_recording, attempt?.id],
  );

  const recording = rec.state === "recording";
  const done = rec.state === "done";
  const answered = reply.trim() !== "";
  const seconds = attempt?.seconds || rec.seconds;
  const scores = attempt && Object.keys(attempt.scores ?? {}).length ? attempt.scores : info.scores;
  const named = testTitle ? { title: testTitle, question: prompt, part } : null;
  const fullModel = readModelAnswer(model).full || model;

  const pdf = () => {
    if (!attempt || !learner) return null;
    const marks = SPEAKING_CRITERIA.map((c) => scores[c.key]).filter((v) => v !== undefined);
    const doc: AnswerDoc = {
      skill: "speaking",
      label: `Speaking Part ${attempt.part || part}`,
      testTitle: attempt.test_title,
      day: new Date(attempt.created_at),
      target: learner.target,
      question: prompt,
      answer: transcript,
      answerNote: t("pdf_spoken", { d: formatClock(seconds) }),
      criteria: SPEAKING_CRITERIA.map((c) => ({
        short: c.label,
        name: c.name,
        band: scores[c.key] ?? null,
      })),
      overall: attempt.tutor_overall ?? info.overall ?? overallOf(marks),
      mistakes: info.mistakes,
      model,
      site: name,
    };
    const recordings = [
      ...(attempt.recording ? [{ label: "mine" as const, name: attempt.recording }] : []),
      ...(attempt.model_recording ? [{ label: "model" as const, name: attempt.model_recording }] : []),
    ];
    return { doc, recordings };
  };

  return (
    <div className="lab">
      <header className="lab-head">
        <div className="seg" role="radiogroup" aria-label={t("lab_part")}>
          {parts.map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={part === n}
              className={part === n ? "on" : ""}
              disabled={recording || prep !== null || !!attempt}
              onClick={() => setPart(n)}
            >
              Part {n}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <span className="muted small">
          {part === 2 ? t("lab_part2_rule") : t("lab_part13_rule")}
        </span>
      </header>

      <SessionCard
        no={1}
        site={site}
        hint={
          testTitle
            ? t("lab_session_hint_named_speaking", { site: name, part })
            : t("lab_session_hint_speaking", { site: name, part })
        }
        prompt={() => (learner ? speakingSessionPrompt(part, learner, testTitle) : null)}
      />

      <QuestionStep
        no={2}
        test={test}
        testTitle={testTitle}
        hint={
          testTitle
            ? t("lab_question_hint_speaking", { part })
            : t("lab_question_paste_hint", { site: name })
        }
        onShow={props.onShowQuestion}
        value={prompt}
        onChange={(value) => {
          setPrompt(value);
          saveLater({ prompt: value });
        }}
        readOnly={false}
        placeholder={testTitle ? t("lab_question_copy_ph") : t("lab_question_paste_ph", { site: name })}
      />

      <section className="lab-card stack-xs lab-rec">
        <span className="self-start">
          <StepLabel no={3}>{t("lab_step_record")}</StepLabel>
        </span>
        {prep !== null && (
          <>
            <p className="rec-clock prep" dir="ltr">
              {formatClock(prep)}
            </p>
            <p className="muted">{t("lab_prep_now")}</p>
            <button className="btn" onClick={() => setPrep(0)}>
              {t("lab_prep_skip")}
            </button>
          </>
        )}
        {prep === null && rec.state === "idle" && (
          <button className="btn primary big-btn" onClick={begin}>
            <Icon name="mic" size={16} /> {part === 2 ? t("lab_start_prep") : t("rec_start")}
          </button>
        )}
        {recording && (
          <>
            <p className="rec-clock" dir="ltr">
              {formatClock(Math.max(0, SPEAK_LIMIT - rec.left))} / {formatClock(SPEAK_LIMIT)}
            </p>
            <button className="btn danger big-btn" onClick={rec.stop}>
              <Icon name="stop" size={14} /> {t("rec_stop")}
            </button>
          </>
        )}
        {rec.state === "error" && <p className="error-box">{t(LINUX ? "rec_no_mic_linux" : "rec_no_mic")}</p>}
        {done && rec.audioUrl && (
          <>
            <audio className="rec-audio" controls src={rec.audioUrl} />
            {rec.fileName && <span className="muted small">{t("rec_saved")}</span>}
            <SendRecording
              blob={rec.blob}
              seconds={rec.seconds}
              part={part}
              site={site}
              named={named}
            />
            <details className="self-stretch">
              <summary className="small">{t("lab_self_rating")}</summary>
              {CRITERIA.map((c) => (
                <div key={c} className="rating-row">
                  <span>{t(`lab_crit_${c}`)}</span>
                  <div className="stars">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        className={(rating[c] ?? 0) >= n ? "on" : ""}
                        onClick={() => {
                          const next = { ...ratingRef.current, [c]: n };
                          ratingRef.current = next;
                          setRating(next);
                          saveLater({ self_rating: next as Record<string, number> });
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <input
                dir="auto"
                placeholder={t("lab_notes_ph")}
                value={notes}
                maxLength={5000}
                onChange={(e) => {
                  setNotes(e.target.value);
                  saveLater({ notes: e.target.value });
                }}
              />
            </details>
          </>
        )}
      </section>

      <ReplyStep no={4} site={site} speaking reply={reply} onReply={onReply} info={info} />

      {answered && (
        <>
          <section className="lab-card stack-xs">
            <StepLabel no={5}>{t("lab_what_you_said")}</StepLabel>
            <p className="muted small">{t("lab_what_you_said_hint", { site: name })}</p>
            <textarea
              className="lab-answer short"
              dir="ltr"
              lang="en"
              value={transcript}
              onChange={(e) => {
                setTranscript(e.target.value);
                saveLater({ transcript: e.target.value });
              }}
            />
          </section>

          <ScoreBoxes
            no={6}
            criteria={SPEAKING_CRITERIA}
            scores={scores}
            overall={attempt?.tutor_overall ?? info.overall}
            saved={!!attempt && attempt.tutor_overall !== null}
            note={t("lab_scores_note_speaking", { site: name })}
            onSave={async (s, overall) => {
              const a = await ensure();
              const updated = await api.speakingPatch(a.id, { scores: s, tutor_overall: overall });
              setAttempt(updated);
              props.onChanged?.();
            }}
          />

          <MistakesStep no={7} site={site} skill="speaking" mistakes={info.mistakes} />

          <ModelStep
            no={8}
            site={site}
            target={learner?.target ?? 7}
            value={model}
            onChange={(value) => {
              setModel(value);
              saveLater({ model_answer: value });
            }}
          >
            <ModelVoice
              text={fullModel}
              saved={attempt?.model_recording ?? null}
              onSaved={onModelVoice}
            />
          </ModelStep>

          <PdfStep
            no={9}
            current={attempt?.pdf_file ?? null}
            build={pdf}
            onSaved={(file) => patch({ pdf_file: file })}
          />
        </>
      )}

      {(done || answered) && (
        <button className="btn self-start" onClick={again}>
          <Icon name="mic" size={14} /> {t("lab_new_attempt")}
        </button>
      )}
    </div>
  );
}

function PlayRecording(props: { name: string }) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  if (url) return <audio className="rec-audio small" controls autoPlay src={url} />;
  return (
    <button
      className="btn subtle small"
      onClick={async () => {
        try {
          const data = await window.ipBridge?.readRecording?.(props.name);
          if (!data) throw new Error("no file");
          setUrl(URL.createObjectURL(new Blob([data], { type: "audio/webm" })));
        } catch {
          setFailed(true);
        }
      }}
    >
      <Icon name="play" size={12} /> {failed ? t("lab_file_missing") : t("lab_play")}
    </button>
  );
}

export function SpeakingHistory(props: { refresh: number }) {
  const { t } = useI18n();
  const [list, setList] = useState<SpeakingAttempt[]>([]);
  const load = useCallback(() => void api.speakingList().then((rows) => setList(rows.slice(0, 8))), []);
  useEffect(() => load(), [load, props.refresh]);
  if (list.length === 0) return null;
  return (
    <div className="stack-xs lab-history">
      <span className="field-label">{t("lab_recordings")}</span>
      {list.map((a) => (
        <div key={a.id} className="history-row static">
          <span>{new Date(a.created_at).toLocaleDateString()}</span>
          <span>{a.part ? `Part ${a.part}` : t("lab_free_speaking")}</span>
          <span dir="ltr">{formatClock(a.seconds)}</span>
          {a.tutor_overall !== null && (
            <span className="pill">{t("lab_opinion_short", { band: a.tutor_overall.toFixed(1) })}</span>
          )}
          {a.recording && <PlayRecording name={a.recording} />}
          <button
            className="btn subtle small"
            title={t("lab_delete")}
            onClick={async () => {
              const r = await api.speakingDelete(a.id);
              for (const file of [r.recording, r.model_recording]) {
                if (file) await window.ipBridge?.deleteRecording?.(file).catch(() => false);
              }
              load();
            }}
          >
            <Icon name="trash" size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** A lab with a page beside it (Dalilk's questions, or since v0.0.14 the named test's
 *  question), one shown at a time. */
export function SpeakingArea(props: {
  page: ((visible: boolean) => ReactNode) | null;
  lab: ReactNode | ((showPage: () => void) => ReactNode);
  hidden: boolean; // a break covers everything
  pageLabel?: string;
  labLabel?: string;
  labIcon?: "mic" | "pen";
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"lab" | "page">("lab");
  const lab = typeof props.lab === "function" ? props.lab(() => setTab("page")) : props.lab;
  return (
    <div className="lab-tabs-area">
      {props.page && (
        <div className="seg lab-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "lab"} className={tab === "lab" ? "on" : ""} onClick={() => setTab("lab")}>
            <Icon name={props.labIcon ?? "mic"} size={14} /> {props.labLabel ?? t("lab_tab_lab")}
          </button>
          <button role="tab" aria-selected={tab === "page"} className={tab === "page" ? "on" : ""} onClick={() => setTab("page")}>
            <Icon name="globe" size={14} /> {props.pageLabel ?? t("lab_tab_page")}
          </button>
        </div>
      )}
      <div className={tab === "lab" ? "lab-scroll" : "hidden-under"}>{lab}</div>
      {props.page && (
        <div className={tab === "page" && !props.hidden ? "fill" : "hidden-under"}>
          {props.page(tab === "page" && !props.hidden)}
        </div>
      )}
    </div>
  );
}

/* ---------- the mistakes notebook (PRD F8) ---------- */

export function MistakesNotebook(props: { onClose: () => void }) {
  const { t } = useI18n();
  const [list, setList] = useState<Card[] | null>(null);
  const [code, setCode] = useState("");
  const load = useCallback(() => void api.mistakes().then(setList).catch(() => setList([])), []);
  useEffect(() => load(), [load]);
  const codes = Array.from(new Set((list ?? []).map((m) => m.code).filter(Boolean))).sort();
  const shown = (list ?? []).filter((m) => !code || m.code === code);
  return (
    <section className="card stack mistakes-notebook">
      <div className="row wrap">
        <h2>
          <Icon name="flag" size={18} /> {t("nb_title")}
        </h2>
        <span className="spacer" />
        {codes.length > 0 && (
          <select value={code} onChange={(e) => setCode(e.target.value)} aria-label={t("nb_filter")}>
            <option value="">{t("nb_all", { n: list?.length ?? 0 })}</option>
            {codes.map((c) => (
              <option key={c} value={c}>
                {c} ({(list ?? []).filter((m) => m.code === c).length})
              </option>
            ))}
          </select>
        )}
        <button className="btn subtle small" onClick={props.onClose}>
          {t("cards_close")}
        </button>
      </div>
      <p className="muted small">{t("nb_note")}</p>
      {list === null ? (
        <div className="spinner" aria-hidden="true" />
      ) : shown.length === 0 ? (
        <p className="note small">{t("nb_empty")}</p>
      ) : (
        <ul className="mistake-list">
          {shown.map((m) => (
            <li key={m.id}>
              <div className="row wrap" dir="ltr">
                <span className="m-wrong">{m.front}</span>
                <span aria-hidden="true">→</span>
                <span className="m-right">{m.meaning}</span>
                {m.code && <span className="pill">{m.code}</span>}
                <span className="spacer" />
                <span className="muted small">
                  {m.due ? t("nb_due", { d: m.due }) : t("nb_new")}
                </span>
                <button
                  className="btn subtle small"
                  title={t("lab_delete")}
                  onClick={async () => {
                    await api.cardDelete(m.id);
                    load();
                  }}
                >
                  <Icon name="trash" size={12} />
                </button>
              </div>
              {(m.example || m.situation) && (
                <p className="muted small" dir="auto">
                  {[m.situation, m.example].filter(Boolean).join(" · ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
