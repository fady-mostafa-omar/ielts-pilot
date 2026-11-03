// Study view: the study panel (a sandboxed browser view drawn by the main process over
// the placeholder below) next to a sidebar with the session timer, notes and progress.
// Also used without a timer to sign in to sites and to take Dalilk's placement tests,
// and — with `focus` — as the distraction-free task screen of the daily plan (D-025).

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../api";
import { useI18n } from "../i18n";
import { Icon, SKILL_STYLE, SkillBadge } from "../icons";
import {
  QueueSide,
  queueTarget,
  useContentQueue,
  useNovelPage,
  useVideoEnded,
  type QueueContent,
} from "./ContentQueue";
import { SpeakingRecorder } from "./Recorder";
import { formatClock } from "../plan";
import {
  ListeningSide,
  PlayerBar,
  STEP_SHOWS_TRANSCRIPT,
  usePodcast,
  type ListenStep,
} from "./Listening";
import type {
  PanelState,
  PanelTarget,
  PlanTask,
  PodcastFeed,
  Resource,
  ResourceSkill,
  StudySession,
} from "../types";

export interface StudyTarget {
  title: string;
  target: PanelTarget | null; // null: timer only (paper book, writing pad, …)
  resource: Resource | null;
  skill: ResourceSkill;
  activityCode: string | null;
  timer: boolean;
  podcast?: PodcastFeed; // the listening player instead of a web page
  podcastStages?: number; // v0.0.10: the task's time in 15-minute stages
  queue?: QueueContent; // planner-4: videos / novel / practice tests opened directly
}

export interface FocusOptions {
  task: PlanTask;
  index: number;
  total: number;
  breakDueAt: number; // this task's active seconds at which the next break is due
  breakMinutes: number;
  onBreakTaken: (activeSeconds: number) => void;
  onNext: (activeSeconds: number) => Promise<void>;
  onSkip: (reason: string) => Promise<void>;
  onExit: () => void;
  fullScreen: boolean;
  onToggleFullScreen: () => void;
}

const HEARTBEAT_MS = 30_000;
const ACTIVITY_MS = 5_000;
const IDLE_LIMIT_S = 300; // no keyboard/mouse for 5 min and no sound -> not counted
const MIN_WORDS: Record<string, number> = { "W-T1": 150, "W-T2": 250, "W-REV": 120, "W-DEV": 40 };

/* ---------- the panel area ---------- */

function useStudyPanel(target: PanelTarget | null, keepSignIn: boolean, visible: boolean) {
  const holder = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<PanelState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bridge = window.ipBridge;

  useLayoutEffect(() => {
    if (!bridge || !target || !holder.current) return;
    const el = holder.current;
    const push = () => {
      const r = el.getBoundingClientRect();
      void bridge.panel.setBounds({ x: r.left, y: r.top, width: r.width, height: r.height });
    };
    push();
    const observer = new ResizeObserver(push);
    observer.observe(el);
    window.addEventListener("resize", push);
    const off = bridge.panel.onState(setState);
    bridge.panel
      .open(target, keepSignIn)
      .then(setState)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", push);
      off();
      void bridge.panel.close();
    };
    // target identity is fixed for the life of the view
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (bridge && target) void bridge.panel.setVisible(visible);
  }, [bridge, target, visible]);

  return { holder, state, error, bridge };
}

function shownUrl(url: string): string {
  if (!url.startsWith("file:")) return url;
  try {
    return decodeURIComponent(url.split("/").pop() ?? url);
  } catch {
    return url;
  }
}

export function PanelArea(props: {
  target: PanelTarget;
  keepSignIn: boolean;
  visible: boolean;
  minimal?: boolean; // a video shown alone: no address bar
  onUrl?: (url: string) => void; // v0.0.10: a novel's page, to carry on from there
}) {
  const { t } = useI18n();
  const { holder, state, error, bridge } = useStudyPanel(
    props.target,
    props.keepSignIn,
    props.visible,
  );
  const onUrl = props.onUrl;
  const shown = state?.url;
  useEffect(() => {
    if (onUrl && shown) onUrl(shown);
  }, [onUrl, shown]);
  if (!bridge) {
    return (
      <div className="panel-empty">
        <p className="muted">{t("bridge_missing")}</p>
      </div>
    );
  }
  return (
    <div className="panel-area">
      <div className={`panel-toolbar${props.minimal ? " hidden" : ""}`}>
        <button
          className="icon-btn"
          title={t("panel_back")}
          disabled={!state?.canGoBack}
          onClick={() => void bridge.panel.nav("back")}
        >
          <Icon name="arrowRight" className="flip-ltr" />
        </button>
        <button
          className="icon-btn"
          title={t("panel_forward")}
          disabled={!state?.canGoForward}
          onClick={() => void bridge.panel.nav("forward")}
        >
          <Icon name="arrowLeft" className="flip-ltr" />
        </button>
        <button
          className="icon-btn"
          title={t("panel_reload")}
          onClick={() => void bridge.panel.nav("reload")}
        >
          <Icon name="reload" />
        </button>
        <span className="panel-url" dir="ltr" title={state?.url}>
          {state?.loading && <span className="dot-loading" aria-hidden="true" />}
          {shownUrl(state?.url ?? "")}
        </span>
        <button
          className="icon-btn"
          title={t("panel_external")}
          disabled={!state?.url.startsWith("http")}
          onClick={() => void bridge.panel.openExternally()}
        >
          <Icon name="external" />
        </button>
      </div>
      {(error || state?.error) && (
        <p className="panel-error" role="alert">
          {t("panel_failed")} <bdi dir="ltr">{error ?? state?.error}</bdi>
        </p>
      )}
      <div ref={holder} className="panel-holder">
        <div className="panel-holder-hint">
          <div className="spinner" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

/* ---------- writing pad (timer-only writing tasks) ---------- */

function draftKey(id: string): string {
  return `ip-draft-${id}`;
}

function readDraft(id: string): string {
  try {
    return window.localStorage.getItem(draftKey(id)) ?? "";
  } catch {
    return "";
  }
}

function saveDraft(id: string, text: string): void {
  try {
    if (text) window.localStorage.setItem(draftKey(id), text);
    else window.localStorage.removeItem(draftKey(id));
  } catch {
    // drafts are a convenience only
  }
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function WritingPad(props: { value: string; onChange: (v: string) => void; minWords: number }) {
  const { t } = useI18n();
  const words = countWords(props.value);
  return (
    <div className="writing-pad">
      <div className="writing-head">
        <Icon name="pen" color="#B45309" />
        <strong>{t("pad_title")}</strong>
        <span className="spacer" />
        <span className={`pill ${words >= props.minWords ? "pill-ok" : ""}`} dir="ltr">
          {words} / {props.minWords} {t("pad_words")}
        </span>
      </div>
      <textarea
        dir="ltr"
        lang="en"
        spellCheck={false}
        autoFocus
        value={props.value}
        placeholder={t("pad_ph")}
        onChange={(e) => props.onChange(e.target.value)}
      />
      <p className="muted small">{t("pad_hint")}</p>
    </div>
  );
}

/* ---------- break ---------- */

function BreakView(props: { minutes: number; onDone: () => void }) {
  const { t } = useI18n();
  const [left, setLeft] = useState(props.minutes * 60);
  useEffect(() => {
    const timer = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="break-view">
      <div className="break-ring" aria-hidden="true">
        <Icon name="coffee" size={44} color="#0F766E" />
      </div>
      <h2>{t("break_title")}</h2>
      <p className="break-clock" dir="ltr">
        {formatClock(left)}
      </p>
      <p className="muted">{t("break_body")}</p>
      <ul className="break-tips">
        <li>{t("break_tip_water")}</li>
        <li>{t("break_tip_walk")}</li>
        <li>{t("break_tip_eyes")}</li>
      </ul>
      <button className="btn primary big-btn" onClick={props.onDone}>
        <Icon name="play" size={14} /> {left > 0 ? t("break_back_early") : t("break_back")}
      </button>
    </div>
  );
}

/* ---------- session timer ---------- */

function useSessionTimer(
  enabled: boolean,
  skill: ResourceSkill,
  resourceId: number | null,
  activityCode: string | null,
  planTaskId: number | null,
  hold: boolean, // paused from outside (a break)
) {
  const [session, setSession] = useState<StudySession | null>(null);
  const [paused, setPaused] = useState(false);
  const [activeNow, setActiveNow] = useState(true);
  const [display, setDisplay] = useState(0);
  const pending = useRef(0);
  const sessionRef = useRef<StudySession | null>(null);
  const finished = useRef(false);
  const pausedRef = useRef(false);
  const activeRef = useRef(true);
  pausedRef.current = paused || hold;
  activeRef.current = activeNow;

  // start on mount, stop on unmount (navigating away confirms the session)
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void api.startSession(skill, resourceId, activityCode, planTaskId).then((s) => {
      if (cancelled) {
        void api.stopSession(s.id);
        return;
      }
      sessionRef.current = s;
      setSession(s);
    });
    return () => {
      cancelled = true;
      const s = sessionRef.current;
      if (s && !finished.current) {
        const delta = Math.min(120, Math.round(pending.current));
        pending.current = 0;
        void api
          .heartbeat(s.id, delta)
          .catch(() => undefined)
          .finally(() => void api.stopSession(s.id).catch(() => undefined));
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 1 s tick: count locally while running and active
  useEffect(() => {
    if (!enabled) return;
    const tick = setInterval(() => {
      if (sessionRef.current && !finished.current && !pausedRef.current && activeRef.current) {
        pending.current += 1;
      }
      setDisplay((sessionRef.current?.active_seconds ?? 0) + Math.floor(pending.current));
    }, 1000);
    return () => clearInterval(tick);
  }, [enabled]);

  // activity: keyboard/mouse idle time and whether the panel plays sound
  useEffect(() => {
    if (!enabled || !window.ipBridge) return;
    const bridge = window.ipBridge;
    const check = () =>
      void bridge
        .activity()
        .then((a) => setActiveNow(a.audible || a.idleSeconds < IDLE_LIMIT_S))
        .catch(() => setActiveNow(true));
    const timer = setInterval(check, ACTIVITY_MS);
    return () => clearInterval(timer);
  }, [enabled]);

  const flush = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || finished.current) return;
    const delta = Math.min(120, Math.floor(pending.current));
    pending.current -= delta;
    const next = await api.heartbeat(s.id, delta);
    sessionRef.current = next;
    setSession(next);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => void flush().catch(() => undefined), HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [enabled, flush]);

  const finish = useCallback(
    async (notes: string) => {
      const s = sessionRef.current;
      if (!s) return null;
      await flush().catch(() => undefined);
      finished.current = true;
      const stopped = await api.stopSession(s.id, notes);
      sessionRef.current = stopped;
      setSession(stopped);
      setDisplay(stopped.active_seconds);
      return stopped;
    },
    [flush],
  );

  return { session, display, paused, setPaused, activeNow, finish };
}

/* ---------- the screen ---------- */

export function StudyScreen(props: {
  study: StudyTarget;
  keepSignIn: boolean;
  onBack: () => void;
  onResourceChanged?: (r: Resource) => void;
  sidebar?: ReactNode; // replaces the timer sidebar (sign-in, placement tests)
  focus?: FocusOptions;
}) {
  const { t, lang } = useI18n();
  const { study, focus } = props;
  const [onBreak, setOnBreak] = useState(false);
  const timer = useSessionTimer(
    study.timer,
    study.skill,
    study.resource?.id ?? null,
    study.activityCode,
    focus?.task.id ?? null,
    onBreak,
  );
  const podcast = usePodcast(study.podcast ?? null);
  const queueContent = study.queue ?? null;
  const queue = useContentQueue(queueContent);
  const finishCurrent = queue.finish;
  const currentItem = queue.current;
  // v0.0.10: a short "lesson done" line when a video ends, then the next one plays
  const [videoDone, setVideoDone] = useState(false);
  useEffect(() => {
    if (!videoDone) return;
    const timer = setTimeout(() => setVideoDone(false), 5000);
    return () => clearTimeout(timer);
  }, [videoDone]);
  const onVideoEnded = useCallback(() => {
    if (!currentItem) return;
    setVideoDone(true);
    void finishCurrent(currentItem);
  }, [currentItem, finishCurrent]);
  const onNovelPage = useNovelPage(currentItem?.kind === "novel" ? currentItem : null);
  // v0.0.10: every speaking task starts with a one-minute recording (owner, 2026-11-03)
  const [recorded, setRecorded] = useState(
    !(focus && (study.activityCode ?? "").startsWith("S-")),
  );
  const videoPosition = useVideoEnded(currentItem, onVideoEnded);
  // videos are watched full screen, without distractions (owner's request)
  useEffect(() => {
    if (queueContent?.kind === "videos" && focus && !focus.fullScreen) focus.onToggleFullScreen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [step, setStep] = useState<ListenStep>(1);
  // v0.0.10: a podcast is four 15-minute stages; the stage is kept for the next day
  const [stagesDone, setStagesDone] = useState(0);
  const [startStage, setStartStage] = useState<number | null>(null);
  const [playerRun, setPlayerRun] = useState(0);
  const episodeId = podcast.episode?.id ?? null;
  const episodeStage = podcast.episode?.stage ?? 1;
  useEffect(() => {
    if (episodeId === null) return;
    setStep(Math.min(4, Math.max(1, episodeStage)) as ListenStep);
    setStartStage((s) => s ?? episodeStage);
    // only when another episode comes up
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeId]);
  const pickStage = (s: ListenStep) => {
    setStep(s);
    if (podcast.episode) void podcast.setStage(s, false);
  };
  const stageDone = async () => {
    if (!podcast.episode || step >= 4) return;
    const s = (step + 1) as ListenStep;
    setStep(s);
    setStagesDone((d) => d + 1);
    setPlayerRun((r) => r + 1); // the audio starts again from the beginning
    await new Promise((r) => setTimeout(r, 300));
    await podcast.setStage(s, true);
  };
  const podcastToday =
    focus && study.podcastStages
      ? { total: study.podcastStages, done: stagesDone, start: startStage ?? 1 }
      : null;
  const padId = focus ? String(focus.task.id) : "free";
  const usePad = !study.target && !!study.activityCode?.startsWith("W-");
  const [resource, setResource] = useState<Resource | null>(study.resource);
  const [notes, setNotes] = useState(() =>
    usePad ? readDraft(padId) : (study.resource?.notes ?? ""),
  );
  const [progress, setProgress] = useState(study.resource?.progress_position ?? "");
  const [finishing, setFinishing] = useState(false);
  const [summary, setSummary] = useState<StudySession | null>(null);
  const [minutes, setMinutes] = useState(0);
  const [busy, setBusy] = useState(false);
  const [skipping, setSkipping] = useState(false);
  // v0.0.7: the timer counted less than the task's time -> ask how long he really studied
  const [credit, setCredit] = useState<{ recorded: number; seconds: number } | null>(null);
  const [creditMinutes, setCreditMinutes] = useState(0);
  const [skipReason, setSkipReason] = useState("");

  useEffect(() => {
    if (study.resource) {
      void api.resourceOpened(study.resource.id).then((r) => {
        setResource(r);
        props.onResourceChanged?.(r);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // a break is due: pause the timer, hide the panel
  useEffect(() => {
    if (focus && !onBreak && timer.session && timer.display >= focus.breakDueAt) {
      setOnBreak(true);
    }
  }, [focus, onBreak, timer.session, timer.display]);

  function updateNotes(value: string) {
    setNotes(value);
    if (usePad) saveDraft(padId, value);
  }

  async function saveResource(patch: Parameters<typeof api.patchResource>[1]) {
    if (!resource) return;
    const r = await api.patchResource(resource.id, patch);
    setResource(r);
    props.onResourceChanged?.(r);
  }

  async function saveResourceFields() {
    if (resource) await saveResource({ notes, progress_position: progress.trim() || null });
  }

  async function finish() {
    setBusy(true);
    try {
      await saveResourceFields();
      const stopped = await timer.finish(resource ? "" : notes);
      if (stopped) {
        setSummary(stopped);
        setMinutes(Math.round(stopped.active_seconds / 60));
      }
      setFinishing(true);
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    if (!focus) return;
    setBusy(true);
    try {
      await saveResourceFields();
      const stopped = await timer.finish(resource ? "" : notes);
      if (usePad) saveDraft(padId, "");
      const seconds = stopped?.active_seconds ?? 0;
      const recorded = Math.floor(focus.task.done_minutes + seconds / 60);
      if (recorded < focus.task.planned_minutes - 1) {
        setCredit({ recorded, seconds });
        setCreditMinutes(focus.task.planned_minutes);
        return;
      }
      await focus.onNext(seconds);
    } finally {
      setBusy(false);
    }
  }

  async function confirmCredit(minutes: number) {
    if (!focus || !credit) return;
    setBusy(true);
    try {
      const extra = Math.round(minutes) - credit.recorded;
      if (extra >= 1) {
        const start = new Date(Date.now() - extra * 60_000);
        await api.logManual(study.skill, start, extra, "", focus.task.id);
      }
      await focus.onNext(credit.seconds);
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    if (!focus) return;
    setBusy(true);
    try {
      await saveResourceFields();
      await timer.finish(resource ? "" : notes);
      await focus.onSkip(skipReason);
    } finally {
      setBusy(false);
    }
  }

  async function keepSummary() {
    if (!summary) return props.onBack();
    setBusy(true);
    try {
      const seconds = Math.min(summary.active_seconds, minutes * 60);
      if (seconds !== summary.active_seconds) {
        await api.patchSession(summary.id, { active_seconds: seconds });
      }
    } finally {
      setBusy(false);
      props.onBack();
    }
  }

  async function discardSummary() {
    if (summary) await api.patchSession(summary.id, { state: "discarded" });
    props.onBack();
  }

  const skillStyle = SKILL_STYLE[study.skill];
  const status = !timer.session
    ? t("study_starting")
    : onBreak
      ? t("study_on_break")
      : timer.paused
        ? t("study_paused")
        : timer.activeNow
          ? t("study_running")
          : t("study_idle");
  const planned = focus ? focus.task.planned_minutes * 60 : 0;
  const plannedPct = planned ? Math.min(100, (timer.display / planned) * 100) : 0;

  const main = onBreak ? (
    <BreakView
      minutes={focus?.breakMinutes ?? 10}
      onDone={() => {
        setOnBreak(false);
        focus?.onBreakTaken(timer.display);
      }}
    />
  ) : study.target || study.podcast || queueContent ? null : usePad ? (
    <WritingPad
      value={notes}
      onChange={updateNotes}
      minWords={MIN_WORDS[study.activityCode ?? ""] ?? 120}
    />
  ) : (
    <div className="panel-empty">
      <Icon name="clock" size={48} color="#94A3B8" />
      <p className="lead">{t("study_offline_title")}</p>
      <p className="muted">{t("study_offline_body")}</p>
    </div>
  );

  return (
    <div className={`study${focus ? " focus" : ""}`}>
      <aside className="study-side">
        {focus ? (
          <div className="focus-head">
            <span className="pill pill-focus">
              {t("focus_task_of", { n: focus.index + 1, total: focus.total })}
            </span>
            <span className="spacer" />
            <button
              className="icon-btn"
              title={focus.fullScreen ? t("focus_exit_fullscreen") : t("focus_fullscreen")}
              onClick={focus.onToggleFullScreen}
            >
              <Icon name={focus.fullScreen ? "minimize" : "maximize"} />
            </button>
            <button className="btn subtle small" onClick={focus.onExit}>
              {t("focus_exit")}
            </button>
          </div>
        ) : (
          <div className="study-head">
            <button className="btn subtle small" onClick={props.onBack}>
              <Icon name="arrowRight" size={16} className="flip-ltr" /> {t("back")}
            </button>
          </div>
        )}
        {focus && (
          <div className="focus-dots" aria-hidden="true">
            {Array.from({ length: focus.total }, (_, i) => (
              <span
                key={i}
                className={i < focus.index ? "done" : i === focus.index ? "now" : ""}
              />
            ))}
          </div>
        )}
        <div className="study-title">
          <SkillBadge skill={study.skill} />
          <div>
            <span className="muted small">{t(`rskill_${study.skill}`)}</span>
            <h2>{study.title}</h2>
            {resource && focus && <span className="muted small">{resource.title}</span>}
          </div>
        </div>

        {focus && (
          <div className="task-brief">
            <p>{focus.task.instructions}</p>
            {focus.task.reason && (
              <p className="muted small">
                <strong>{t("focus_why")}</strong> {focus.task.reason}
              </p>
            )}
          </div>
        )}

        {props.sidebar}

        {study.podcast && (
          <ListeningSide
            list={podcast.list}
            episode={podcast.episode}
            step={step}
            onStep={pickStage}
            onPick={(id) => podcast.pick(id)}
            onStageDone={stageDone}
            onFinish={async (rating) => {
              await podcast.finish(rating);
              setStagesDone((d) => d + 1);
            }}
            today={podcastToday}
          />
        )}

        {queueContent && (
          <QueueSide
            content={queueContent}
            queue={queue}
            position={videoPosition}
            onNextTask={focus ? () => void next() : undefined}
            notice={videoDone ? t("q_video_done") : null}
          />
        )}

        {study.timer && !finishing && (
          <>
            <div
              className={`timer-box${timer.paused || onBreak || !timer.activeNow ? " is-paused" : ""}`}
            >
              <Icon name="clock" size={22} color={skillStyle.color} />
              <span className="timer-clock" dir="ltr">
                {formatClock(timer.display)}
              </span>
              <span className="timer-status">{status}</span>
            </div>
            {focus && (
              <div className="stack-xs">
                <div className="meter" aria-hidden="true">
                  <span style={{ width: `${plannedPct}%` }} />
                </div>
                <span className="muted small">
                  {plannedPct >= 100
                    ? t("focus_planned_done")
                    : t("focus_planned", { m: focus.task.planned_minutes })}
                </span>
              </div>
            )}
            {focus && credit && (
              <CreditBox
                recorded={credit.recorded}
                planned={focus.task.planned_minutes}
                minutes={creditMinutes}
                busy={busy}
                onMinutes={setCreditMinutes}
                onSave={() => void confirmCredit(creditMinutes)}
              />
            )}
            <div className={`row${credit ? " hidden" : ""}`}>
              <button
                className="btn"
                disabled={!timer.session || onBreak}
                onClick={() => timer.setPaused(!timer.paused)}
              >
                <Icon name={timer.paused ? "play" : "pause"} size={14} />
                {timer.paused ? t("study_resume") : t("study_pause")}
              </button>
              <span className="spacer" />
              {focus ? (
                <button
                  className="btn primary big-btn"
                  disabled={!timer.session || busy}
                  onClick={() => void next()}
                >
                  {t("focus_next")}{" "}
                  <Icon name={lang === "ar" ? "arrowLeft" : "arrowRight"} size={16} />
                </button>
              ) : (
                <button
                  className="btn primary"
                  disabled={!timer.session || busy}
                  onClick={() => void finish()}
                >
                  <Icon name="stop" size={14} /> {t("study_finish")}
                </button>
              )}
            </div>
            {focus && !skipping && !credit && (
              <button className="btn subtle small self-start" onClick={() => setSkipping(true)}>
                {t("focus_skip")}
              </button>
            )}
            {focus && skipping && (
              <div className="row wrap">
                <input
                  className="grow"
                  value={skipReason}
                  maxLength={300}
                  placeholder={t("focus_skip_reason")}
                  onChange={(e) => setSkipReason(e.target.value)}
                />
                <button className="btn small" disabled={busy} onClick={() => void skip()}>
                  {t("focus_skip_confirm")}
                </button>
                <button className="btn subtle small" onClick={() => setSkipping(false)}>
                  {t("cancel")}
                </button>
              </div>
            )}
            {!focus && <p className="muted small">{t("study_idle_hint")}</p>}

            {resource && !study.podcast && !queueContent && (
              <label className="field">
                <span className="field-label">{t("study_progress")}</span>
                <input
                  value={progress}
                  maxLength={100}
                  placeholder={t("study_progress_ph")}
                  onChange={(e) => setProgress(e.target.value)}
                  onBlur={() =>
                    void saveResource({ progress_position: progress.trim() || null })
                  }
                />
              </label>
            )}
            {!usePad && (
              <label className="field grow">
                <span className="field-label">{t("study_notes")}</span>
                <textarea
                  value={notes}
                  maxLength={5000}
                  placeholder={t("study_notes_ph")}
                  onChange={(e) => updateNotes(e.target.value)}
                  onBlur={() => (resource ? void saveResource({ notes }) : undefined)}
                />
              </label>
            )}
            {resource && !study.podcast && !queueContent && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!resource.completed_at}
                  onChange={(e) => void saveResource({ completed: e.target.checked })}
                />
                {t("study_completed")}
              </label>
            )}
          </>
        )}

        {study.timer && finishing && (
          <div className="stack summary-box">
            <h3>
              <Icon name="check" color="#0F766E" /> {t("study_saved_title")}
            </h3>
            <p>{t("study_saved_body", { m: Math.round((summary?.active_seconds ?? 0) / 60) })}</p>
            <label className="field">
              <span className="field-label">{t("study_adjust")}</span>
              <input
                type="number"
                min={0}
                max={Math.round((summary?.active_seconds ?? 0) / 60)}
                value={minutes}
                onChange={(e) => setMinutes(Math.max(0, Number(e.target.value) || 0))}
              />
              <span className="field-hint">{t("study_adjust_hint")}</span>
            </label>
            <div className="row">
              <button className="btn primary" disabled={busy} onClick={() => void keepSummary()}>
                {t("save")}
              </button>
              <span className="spacer" />
              <button className="btn subtle" disabled={busy} onClick={() => void discardSummary()}>
                {t("study_discard")}
              </button>
            </div>
          </div>
        )}
      </aside>
      <section className="study-main">
        {!recorded && !onBreak ? (
          <SpeakingRecorder
            continueLabel={
              queueContent?.kind === "videos" ? t("rec_continue_video") : t("rec_continue")
            }
            onContinue={() => setRecorded(true)}
          />
        ) : study.podcast ? (
          <>
            <div className={onBreak ? "hidden-under" : "listen-main"}>
              {podcast.episode?.transcript_url && (
                <div className={STEP_SHOWS_TRANSCRIPT[step] ? "fill" : "hidden-under"}>
                  <PanelArea
                    key={podcast.episode.id}
                    target={{ url: podcast.episode.transcript_url }}
                    keepSignIn={props.keepSignIn}
                    visible={STEP_SHOWS_TRANSCRIPT[step] && !onBreak}
                  />
                </div>
              )}
              {(!podcast.episode?.transcript_url || !STEP_SHOWS_TRANSCRIPT[step]) && (
                <div className="listen-placeholder">
                  {podcast.loading && !podcast.episode ? (
                    <div className="spinner" aria-hidden="true" />
                  ) : podcast.error && !podcast.episode ? (
                    <>
                      <p className="error-box">
                        {t("pl_feed_error")} <bdi dir="ltr">{podcast.error}</bdi>
                      </p>
                      <button className="btn" onClick={() => void podcast.refresh(true)}>
                        {t("retry")}
                      </button>
                    </>
                  ) : !podcast.episode ? (
                    <p className="lead">{t("pl_all_done")}</p>
                  ) : (
                    <>
                      <div className="listen-badge">
                        <Icon name="headphones" size={44} color="#2563EB" />
                      </div>
                      <h2 dir="auto">{podcast.episode.title}</h2>
                      <p className="muted">
                        {podcast.episode.transcript_url
                          ? t("pl_hidden_transcript")
                          : t("pl_no_transcript")}
                      </p>
                    </>
                  )}
                </div>
              )}
              {podcast.episode && (
                <PlayerBar
                  key={`${podcast.episode.id}-${playerRun}`}
                  episode={podcast.episode}
                  hold={onBreak}
                  fromStart={playerRun > 0}
                />
              )}
            </div>
            {main}
          </>
        ) : queueContent ? (
          <>
            {queue.current ? (
              <div className={onBreak ? "hidden-under" : "fill"}>
                <PanelArea
                  key={queue.current.id}
                  target={queueTarget(queue.current)}
                  keepSignIn={props.keepSignIn}
                  visible={!onBreak}
                  minimal={queue.current.kind === "video"}
                  onUrl={queue.current.kind === "novel" ? onNovelPage : undefined}
                />
              </div>
            ) : (
              <div className="listen-placeholder">
                {queue.items === null && !queue.error ? (
                  <div className="spinner" aria-hidden="true" />
                ) : (
                  <>
                    <div className="listen-badge">
                      <Icon name="check" size={44} color="#15803D" />
                    </div>
                    <p className="lead">
                      {queue.finishedNovel
                        ? t(focus ? "q_novel_choose_focus" : "q_novel_choose")
                        : queue.items && queue.items.length > 0
                          ? t("q_all_done")
                          : t(`q_empty_${queueContent.kind}`)}
                    </p>
                  </>
                )}
              </div>
            )}
            {main}
          </>
        ) : (
          <>
            {study.target && (
              <div className={onBreak ? "hidden-under" : "fill"}>
                <PanelArea target={study.target} keepSignIn={props.keepSignIn} visible={!onBreak} />
              </div>
            )}
            {main}
          </>
        )}
      </section>
    </div>
  );
}

/** v0.0.7: "How long did you study this task?" when the timer counted less than its time. */
function CreditBox(props: {
  recorded: number;
  planned: number;
  minutes: number;
  busy: boolean;
  onMinutes: (m: number) => void;
  onSave: () => void;
}) {
  const { t, lang } = useI18n();
  const max = props.planned + 120;
  const valid =
    Number.isFinite(props.minutes) && props.minutes >= props.recorded && props.minutes <= max;
  return (
    <div className="credit-box stack" role="dialog" aria-label={t("credit_title")}>
      <strong>{t("credit_title")}</strong>
      <p className="muted small">
        {t("credit_body", { recorded: props.recorded, planned: props.planned })}
      </p>
      <div className="row wrap">
        <label className="field credit-field">
          <span className="field-label">{t("credit_minutes")}</span>
          <input
            type="number"
            dir="ltr"
            min={props.recorded}
            max={max}
            value={props.minutes}
            onChange={(e) => props.onMinutes(Number(e.target.value))}
          />
        </label>
        <button className="btn subtle small" onClick={() => props.onMinutes(props.recorded)}>
          {t("credit_use_timer", { m: props.recorded })}
        </button>
      </div>
      <p className="muted small">{t("credit_note")}</p>
      <button
        className="btn primary big-btn self-start"
        disabled={props.busy || !valid}
        onClick={props.onSave}
      >
        {t("credit_save")} <Icon name={lang === "ar" ? "arrowLeft" : "arrowRight"} size={16} />
      </button>
    </div>
  );
}
