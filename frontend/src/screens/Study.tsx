// Study view: the study panel (a sandboxed browser view drawn by the main process over
// the placeholder below) next to a sidebar with the session timer, notes and progress.
// Also used without a timer to sign in to sites and to take Dalilk's placement tests.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../api";
import { useI18n } from "../i18n";
import { Icon, SKILL_STYLE, SkillBadge } from "../icons";
import { formatClock } from "../plan";
import type { PanelState, PanelTarget, Resource, ResourceSkill, StudySession } from "../types";

export interface StudyTarget {
  title: string;
  target: PanelTarget | null; // null: timer only (paper book, class, …)
  resource: Resource | null;
  skill: ResourceSkill;
  activityCode: string | null;
  timer: boolean;
}

const HEARTBEAT_MS = 30_000;
const ACTIVITY_MS = 5_000;
const IDLE_LIMIT_S = 300; // no keyboard/mouse for 5 min and no sound -> not counted

/* ---------- the panel area ---------- */

function useStudyPanel(target: PanelTarget | null, keepSignIn: boolean) {
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

function PanelArea(props: { target: PanelTarget | null; keepSignIn: boolean }) {
  const { t } = useI18n();
  const { holder, state, error, bridge } = useStudyPanel(props.target, props.keepSignIn);

  if (!props.target) {
    return (
      <div className="panel-empty">
        <Icon name="clock" size={48} color="#94A3B8" />
        <p className="lead">{t("study_offline_title")}</p>
        <p className="muted">{t("study_offline_body")}</p>
      </div>
    );
  }
  if (!bridge) {
    return (
      <div className="panel-empty">
        <p className="muted">{t("bridge_missing")}</p>
      </div>
    );
  }
  return (
    <div className="panel-area">
      <div className="panel-toolbar">
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

/* ---------- session timer ---------- */

function useSessionTimer(enabled: boolean, skill: ResourceSkill, resourceId: number | null,
  activityCode: string | null) {
  const [session, setSession] = useState<StudySession | null>(null);
  const [paused, setPaused] = useState(false);
  const [activeNow, setActiveNow] = useState(true);
  const [display, setDisplay] = useState(0);
  const pending = useRef(0);
  const sessionRef = useRef<StudySession | null>(null);
  const finished = useRef(false);
  const pausedRef = useRef(false);
  const activeRef = useRef(true);
  pausedRef.current = paused;
  activeRef.current = activeNow;

  // start on mount, stop on unmount (navigating away confirms the session)
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void api.startSession(skill, resourceId, activityCode).then((s) => {
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
}) {
  const { t } = useI18n();
  const { study } = props;
  const timer = useSessionTimer(
    study.timer,
    study.skill,
    study.resource?.id ?? null,
    study.activityCode,
  );
  const [resource, setResource] = useState<Resource | null>(study.resource);
  const [notes, setNotes] = useState(study.resource?.notes ?? "");
  const [progress, setProgress] = useState(study.resource?.progress_position ?? "");
  const [finishing, setFinishing] = useState(false);
  const [summary, setSummary] = useState<StudySession | null>(null);
  const [minutes, setMinutes] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (study.resource) {
      void api.resourceOpened(study.resource.id).then((r) => {
        setResource(r);
        props.onResourceChanged?.(r);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveResource(patch: Parameters<typeof api.patchResource>[1]) {
    if (!resource) return;
    const r = await api.patchResource(resource.id, patch);
    setResource(r);
    props.onResourceChanged?.(r);
  }

  async function finish() {
    setBusy(true);
    try {
      if (resource) {
        await saveResource({ notes, progress_position: progress.trim() || null });
      }
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
    : timer.paused
      ? t("study_paused")
      : timer.activeNow
        ? t("study_running")
        : t("study_idle");

  return (
    <div className="study">
      <aside className="study-side">
        <div className="study-head">
          <button className="btn subtle small" onClick={props.onBack}>
            <Icon name="arrowRight" size={16} className="flip-ltr" /> {t("back")}
          </button>
        </div>
        <div className="study-title">
          <SkillBadge skill={study.skill} />
          <div>
            <span className="muted small">{t(`rskill_${study.skill}`)}</span>
            <h2>{study.title}</h2>
          </div>
        </div>

        {props.sidebar}

        {study.timer && !finishing && (
          <>
            <div className={`timer-box${timer.paused || !timer.activeNow ? " is-paused" : ""}`}>
              <Icon name="clock" size={22} color={skillStyle.color} />
              <span className="timer-clock" dir="ltr">
                {formatClock(timer.display)}
              </span>
              <span className="timer-status">{status}</span>
            </div>
            <div className="row">
              <button
                className="btn"
                disabled={!timer.session}
                onClick={() => timer.setPaused(!timer.paused)}
              >
                <Icon name={timer.paused ? "play" : "pause"} size={14} />
                {timer.paused ? t("study_resume") : t("study_pause")}
              </button>
              <span className="spacer" />
              <button
                className="btn primary"
                disabled={!timer.session || busy}
                onClick={() => void finish()}
              >
                <Icon name="stop" size={14} /> {t("study_finish")}
              </button>
            </div>
            <p className="muted small">{t("study_idle_hint")}</p>

            {resource && (
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
            <label className="field grow">
              <span className="field-label">{t("study_notes")}</span>
              <textarea
                value={notes}
                maxLength={5000}
                placeholder={t("study_notes_ph")}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => (resource ? void saveResource({ notes }) : undefined)}
              />
            </label>
            {resource && (
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
        <PanelArea target={study.target} keepSignIn={props.keepSignIn} />
      </section>
    </div>
  );
}
