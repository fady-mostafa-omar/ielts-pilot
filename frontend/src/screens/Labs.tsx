// v0.0.12 (PRD F6/F7/F8, D-026, D-042): the writing lab, the speaking lab and the AI tutor.
// The tutor works through a prompt the app copies; the owner pastes it into the site and
// pastes the reply back. The reply's marks are an opinion only and never change the levels;
// its mistakes can go to the mistakes notebook (cards reviewed with "Today's words").

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../api";
import { useI18n } from "../i18n";
import { Icon } from "../icons";
import { formatClock, todayIso } from "../plan";
import {
  copyAndOpen,
  copyOnly,
  ERROR_CODES,
  readTutorReply,
  readTutorScores,
  speakingAnswerMessage,
  speakingStarterPrompt,
  speakingTestPrompt,
  TUTOR_SITES,
  writingAnswerMessage,
  writingStarterPrompt,
  writingTestPrompt,
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

/** What the tutor needs to know: level, target, language of the explanations, words. */
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
        target: profile.target_overall,
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

/* ---------- the tutor ---------- */

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

export function TutorPanel(props: {
  site: TutorSite;
  skill: "writing" | "speaking";
  prompt?: () => string; // v0.0.13: optional; the starter prompt now opens the chat
  reply: string;
  onReply: (text: string, overall: number | null) => void;
  disabledReason?: string | null;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState<boolean | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [manual, setManual] = useState<MistakeInput[]>([]);
  const [added, setAdded] = useState(0);
  const [busy, setBusy] = useState(false);
  const parsed = readTutorReply(props.reply);
  const all = [...parsed.mistakes, ...manual];
  const name = TUTOR_SITES[props.site].name;

  useEffect(() => {
    // every mistake read from a new reply starts ticked
    setPicked(new Set(parsed.mistakes.map((_, i) => i)));
    setAdded(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.reply]);

  const save = async () => {
    const items = all
      .map((m, i) => (picked.has(i) || i >= parsed.mistakes.length ? m : null))
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
    <section className="lab-card stack">
      <h3>
        <Icon name="flag" size={16} /> {t("lab_mistakes_title")}
      </h3>
      <p className="muted small">{t("lab_mistakes_hint", { site: name })}</p>
      <ol className="tutor-steps">
        {props.prompt && (
          <li>
            <button
              className="btn primary"
              disabled={!!props.disabledReason}
              onClick={async () => setCopied(await copyAndOpen(props.prompt!(), props.site))}
            >
              <Icon name="external" size={14} /> {t("tutor_copy_open", { site: name })}
            </button>
            {props.disabledReason && <p className="muted small">{props.disabledReason}</p>}
            {copied === true && <p className="ok small">✓ {t("tutor_copied", { site: name })}</p>}
            {copied === false && <p className="error-box small">{t("tutor_copy_failed")}</p>}
          </li>
        )}
        <li>
          <span className="field-label">{t("tutor_paste_reply", { site: name })}</span>
          <textarea
            className="tutor-reply"
            dir="auto"
            value={props.reply}
            placeholder={t("tutor_reply_ph")}
            onChange={(e) => props.onReply(e.target.value, readTutorReply(e.target.value).overall)}
          />
        </li>
      </ol>
      {parsed.overall !== null && (
        <p className="opinion">
          <strong>{t("tutor_opinion", { band: parsed.overall.toFixed(1) })}</strong>{" "}
          <span className="muted small">{t("tutor_opinion_note")}</span>
        </p>
      )}
      {props.reply.trim() && parsed.mistakes.length === 0 && (
        <p className="note small">{t("tutor_no_mistakes_found")}</p>
      )}
      {all.length > 0 && (
        <div className="stack-xs">
          <span className="field-label">{t("tutor_mistakes_found", { n: all.length })}</span>
          <ul className="mistake-list">
            {all.map((m, i) => (
              <li key={i}>
                <label dir="ltr">
                  <input
                    type="checkbox"
                    checked={i >= parsed.mistakes.length || picked.has(i)}
                    disabled={i >= parsed.mistakes.length}
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
                  <p className="muted small" dir="auto">
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
        </div>
      )}
      <details className="manual-mistake">
        <summary>{t("lab_mistake_manual")}</summary>
        <MistakeForm onAdd={(m) => setManual((list) => [...list, m])} />
      </details>
    </section>
  );
}

/* ---------- v0.0.13: the tutor's chat and the marks typed in by the owner ---------- */

/** Step 1: one short prompt opens the chat; the tutor sends a question only and waits. */
function StarterCard(props: { site: TutorSite; prompt: () => string | null; hint: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState<boolean | null>(null);
  const name = TUTOR_SITES[props.site].name;
  return (
    <section className="lab-card stack-xs">
      <span className="field-label">
        <span className="step-no">1</span> {t("lab_step_start", { site: name })}
      </span>
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

/** Step 1 with a named question: open it beside the lab and copy it in. */
function QuestionCard(props: {
  test: ContentItem;
  hint: string;
  onShow?: () => void;
  extra?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <section className="lab-card stack-xs">
      <span className="field-label">
        <span className="step-no">1</span> {t("lab_step_question")}
      </span>
      <strong dir="ltr" className="small">
        {props.test.title}
      </strong>
      <p className="muted small">{props.hint}</p>
      <div className="row wrap">
        {props.onShow && (
          <button className="btn primary" onClick={props.onShow}>
            <Icon name="globe" size={14} /> {t("lab_open_question")}
          </button>
        )}
        {props.extra}
      </div>
    </section>
  );
}

const BANDS = Array.from({ length: 19 }, (_, i) => i / 2);

export function overallOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.round(mean * 2) / 2; // .25 up to .5, .75 up to the next band
}

/** The tutor's marks, typed in by the owner; saving them updates his level (D-043). */
function ScoreBoxes(props: {
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
      <span className="field-label">
        <span className="step-no">4</span> {t("lab_scores_title")}
      </span>
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
  const [checks, setChecks] = useState<string[]>([]);
  const [answerCopied, setAnswerCopied] = useState<boolean | null>(null);
  const creating = useRef<Promise<WritingAttempt> | null>(null);
  const submitted = attempt?.status === "submitted";
  const test = props.test ?? null;
  const named = !!test && task !== 0;
  const limit = LIMITS[task] ?? 0;
  const words = countWords(text);
  const min = MIN_WORDS[task] ?? 0;
  const name = TUTOR_SITES[site].name;

  const show = useCallback((a: WritingAttempt | null) => {
    setAttempt(a);
    setPrompt(a?.prompt ?? "");
    setText(a?.text ?? "");
    setSeconds(a?.seconds_used ?? 0);
    setReply(a?.tutor_reply ?? "");
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
      creating.current = api.writingNew(task, prompt, props.planTaskId, test?.key ?? null).then((a) => {
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

  const saveReview = (patch: { checklist?: string[]; reply?: string }) => {
    if (!attempt) return;
    void api
      .writingPatch(attempt.id, {
        ...(patch.checklist ? { checklist: patch.checklist } : {}),
        ...(patch.reply !== undefined ? { tutor_reply: patch.reply } : {}),
      })
      .then((a) => {
        setAttempt(a);
        props.onChanged?.();
      });
  };

  const left = limit ? limit - seconds : 0;
  const number = Math.min(props.count, submittedCount + (submitted ? 0 : 1));
  const first = task === 1 ? "TA" : "TR";
  const pastedScores = readTutorScores(reply);

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

      {!submitted && named && test && (
        <QuestionCard
          test={test}
          hint={task === 1 ? t("lab_question_hint_t1") : t("lab_question_hint_t2")}
          onShow={props.onShowQuestion}
        />
      )}
      {!submitted && task !== 0 && !named && (
        <StarterCard
          site={site}
          hint={t("lab_starter_hint_writing", { site: name })}
          prompt={() => (learner ? writingStarterPrompt(task as 1 | 2, learner) : null)}
        />
      )}

      <section className="lab-card stack-xs">
        <span className="field-label">
          {task !== 0 && <span className="step-no">2</span>} {t("lab_question")}
        </span>
        <textarea
          className="lab-question"
          dir="ltr"
          lang="en"
          value={prompt}
          readOnly={submitted}
          placeholder={named ? t("lab_question_copy_ph") : t("lab_question_paste_ph", { site: name })}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </section>

      <section className="lab-card stack-xs">
        <div className="row wrap">
          <span className="field-label">
            {task !== 0 && <span className="step-no">3</span>} {t("lab_answer")}
          </span>
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
            {task !== 0 && (
              <>
                {named && test ? (
                  <>
                    <button
                      className="btn primary self-start"
                      disabled={!learner}
                      onClick={async () =>
                        learner &&
                        setAnswerCopied(
                          await copyAndOpen(
                            writingTestPrompt(
                              task as 1 | 2,
                              test.title,
                              prompt,
                              text,
                              words,
                              Math.round(seconds / 60),
                              learner,
                            ),
                            site,
                          ),
                        )
                      }
                    >
                      <Icon name="external" size={14} /> {t("lab_copy_marking", { site: name })}
                    </button>
                    {task === 1 && <p className="note small">{t("lab_t1_screenshot")}</p>}
                    {test.meta?.answer_url && (
                      <button
                        className="btn subtle small self-start"
                        onClick={() => void window.ipBridge?.openExternal(test.meta!.answer_url!)}
                      >
                        <Icon name="book" size={12} /> {t("lab_examiner_answers")}
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    className="btn primary self-start"
                    onClick={async () =>
                      setAnswerCopied(
                        await copyOnly(writingAnswerMessage(text, words, Math.round(seconds / 60))),
                      )
                    }
                  >
                    <Icon name="cards" size={14} /> {t("lab_copy_answer")}
                  </button>
                )}
                {answerCopied === true && (
                  <p className="ok small">
                    ✓ {named ? t("lab_marking_copied", { site: name }) : t("lab_answer_copied", { site: name })}
                  </p>
                )}
                {answerCopied === false && <p className="error-box small">{t("tutor_copy_failed")}</p>}
              </>
            )}
          </>
        )}
      </section>

      {submitted && task !== 0 && attempt && (
        <ScoreBoxes
          criteria={[
            { key: "task", label: first },
            { key: "coherence", label: "CC" },
            { key: "lexical", label: "LR" },
            { key: "grammar", label: "GRA" },
          ]}
          scores={Object.keys(attempt.scores ?? {}).length ? attempt.scores : pastedScores}
          overall={attempt.tutor_overall}
          saved={attempt.tutor_overall !== null}
          note={t("lab_scores_note", { site: name })}
          onSave={async (scores, overall) => {
            const a = await api.writingPatch(attempt.id, { scores, tutor_overall: overall });
            setAttempt(a);
            props.onChanged?.();
          }}
        />
      )}

      {submitted && task !== 0 && (
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
                      saveReview({ checklist: next });
                    }}
                  />{" "}
                  {t(id as "chk_paragraphs")}
                </label>
              ))}
            </div>
          ))}
        </details>
      )}

      {submitted && (
        <details className="lab-card">
          <summary>{t("lab_mistakes_optional")}</summary>
          <TutorPanel
            site={site}
            skill="writing"
            reply={reply}
            onReply={(value) => {
              setReply(value);
              saveReview({ reply: value });
            }}
          />
        </details>
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
  const [copied, setCopied] = useState<boolean | null>(null);
  const rec = useRecorder(SPEAK_LIMIT, "speaking");
  const recStart = rec.start;
  const name = TUTOR_SITES[site].name;
  const test = props.test ?? null;

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
    setAttempt(null);
    setTranscript("");
    ratingRef.current = {};
    setRating({});
    setNotes("");
    setReply("");
    setCopied(null);
  };

  const save = async (): Promise<SpeakingAttempt> => {
    if (attempt) return attempt;
    const a = await api.speakingNew({
      part,
      prompt,
      recording: rec.fileName,
      seconds: rec.seconds,
      transcript,
      self_rating: rating,
      notes,
      plan_task_id: props.planTaskId,
      test_key: test?.key ?? null,
    });
    setAttempt(a);
    props.onChanged?.();
    return a;
  };

  const patch = (p: Parameters<typeof api.speakingPatch>[1]) => {
    if (!attempt) return;
    void api.speakingPatch(attempt.id, p).then((a) => {
      setAttempt(a);
      props.onChanged?.();
    });
  };

  const recording = rec.state === "recording";
  const done = rec.state === "done";

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
              disabled={recording || prep !== null}
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

      {test ? (
        <QuestionCard
          test={test}
          hint={t("lab_question_hint_speaking", { part })}
          onShow={props.onShowQuestion}
        />
      ) : (
        <StarterCard
          site={site}
          hint={t("lab_starter_hint_speaking", { site: name, part })}
          prompt={() => (learner ? speakingStarterPrompt(part, learner) : null)}
        />
      )}

      <section className="lab-card stack-xs">
        <span className="field-label">
          <span className="step-no">2</span> {t("lab_question")}
        </span>
        <textarea
          className="lab-question"
          dir="ltr"
          lang="en"
          value={prompt}
          placeholder={test ? t("lab_question_copy_ph") : t("lab_question_paste_ph", { site: name })}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </section>

      <section className="lab-card stack-xs lab-rec">
        <span className="field-label self-start">
          <span className="step-no">3</span> {t("lab_step_record")}
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
        {rec.state === "error" && <p className="error-box">{t("rec_no_mic")}</p>}
        {done && rec.audioUrl && (
          <>
            <audio className="rec-audio" controls src={rec.audioUrl} />
            {rec.fileName && <span className="muted small">{t("rec_saved")}</span>}
          </>
        )}
      </section>

      {done && (
        <section className="lab-card stack-xs">
          <span className="field-label">{t("lab_transcript")}</span>
          <p className="muted small">{t("lab_transcript_hint")}</p>
          <textarea
            className="lab-answer short"
            dir="ltr"
            lang="en"
            value={transcript}
            onChange={(e) => {
              setTranscript(e.target.value);
              if (attempt) patch({ transcript: e.target.value });
            }}
          />
          <button
            className="btn primary self-start"
            disabled={!transcript.trim() || (!!test && !learner)}
            onClick={async () => {
              await save();
              if (test && learner) {
                setCopied(
                  await copyAndOpen(
                    speakingTestPrompt(part, test.title, prompt, transcript, rec.seconds, learner),
                    site,
                  ),
                );
              } else {
                setCopied(await copyOnly(speakingAnswerMessage(transcript, rec.seconds)));
              }
            }}
          >
            <Icon name={test ? "external" : "cards"} size={14} />{" "}
            {test ? t("lab_copy_marking", { site: name }) : t("lab_copy_transcript")}
          </button>
          {copied === true && (
            <p className="ok small">
              ✓ {test ? t("lab_marking_copied", { site: name }) : t("lab_answer_copied", { site: name })}
            </p>
          )}
          {copied === false && <p className="error-box small">{t("tutor_copy_failed")}</p>}
          <details>
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
                        if (attempt) patch({ self_rating: next as Record<string, number> });
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
                if (attempt) patch({ notes: e.target.value });
              }}
            />
          </details>
        </section>
      )}

      {done && (
        <ScoreBoxes
          criteria={[
            { key: "fluency", label: "FC" },
            { key: "lexical", label: "LR" },
            { key: "grammar", label: "GRA" },
          ]}
          scores={attempt && Object.keys(attempt.scores ?? {}).length ? attempt.scores : readTutorScores(reply)}
          overall={attempt?.tutor_overall ?? null}
          saved={!!attempt && attempt.tutor_overall !== null}
          note={t("lab_scores_note_speaking", { site: name })}
          onSave={async (scores, overall) => {
            const a = await save();
            const updated = await api.speakingPatch(a.id, { scores, tutor_overall: overall });
            setAttempt(updated);
            props.onChanged?.();
          }}
        />
      )}

      {done && (
        <details className="lab-card">
          <summary>{t("lab_mistakes_optional")}</summary>
          <TutorPanel
            site={site}
            skill="speaking"
            reply={reply}
            onReply={(value) => {
              setReply(value);
              if (attempt) patch({ tutor_reply: value });
            }}
          />
        </details>
      )}

      {done && (
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
              if (r.recording) await window.ipBridge?.deleteRecording?.(r.recording).catch(() => false);
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
