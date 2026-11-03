// Focus mode (D-025): today's tasks one at a time, full window, with breaks.
// "Continue learning" opens this at the first unfinished task.

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { Confetti } from "../charts";
import { useI18n } from "../i18n";
import { Icon } from "../icons";
import { formatHM, todayIso } from "../plan";
import type { AppSettings, DayKind, PlanTask, Resource } from "../types";
import { PODCAST_RESOURCE } from "./Library";
import { StudyScreen, type StudyTarget } from "./Study";

function targetFor(task: PlanTask, resource: Resource | null): StudyTarget {
  if (resource?.catalog_id === PODCAST_RESOURCE) {
    return {
      title: task.title,
      target: null,
      resource,
      skill: task.skill,
      activityCode: task.activity_code,
      timer: true,
      podcast: "dalilk_ielts",
    };
  }
  return {
    title: task.title,
    target: resource
      ? resource.local_path
        ? { library: resource.local_path }
        : resource.url
          ? { url: resource.url }
          : null
      : null,
    resource,
    skill: task.skill,
    activityCode: task.activity_code,
    timer: true,
  };
}

/** Test hook for the screen walkthrough: localStorage "ip-test-break-seconds". */
function testBreakSeconds(): number | null {
  try {
    const raw = window.localStorage.getItem("ip-test-break-seconds");
    return raw ? Math.max(5, Number(raw)) : null;
  } catch {
    return null;
  }
}

export function nextTask(tasks: PlanTask[]): PlanTask | null {
  return (
    tasks.find((t) => t.status === "in_progress") ??
    tasks.find((t) => t.status === "pending") ??
    null
  );
}

export function FocusRunner(props: {
  keepSignIn: boolean;
  settings: AppSettings;
  onExit: () => void;
  onOpenLibrary: () => void;
}) {
  const { t } = useI18n();
  const today = todayIso();
  const [tasks, setTasks] = useState<PlanTask[] | null>(null);
  const [kind, setKind] = useState<DayKind>("study");
  const [resources, setResources] = useState<Map<number, Resource>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const [cumulative, setCumulative] = useState(0); // active seconds of finished tasks
  const [lastBreakAt, setLastBreakAt] = useState(0);
  const breakEvery = testBreakSeconds() ?? (props.settings.break_every_minutes ?? 50) * 60;
  const breakMinutes = props.settings.break_minutes ?? 10;

  const load = useCallback(async () => {
    try {
      const [day, list] = await Promise.all([api.planDay(today, today), api.resources(true)]);
      setResources(new Map(list.map((r) => [r.id, r])));
      setKind(day.kind);
      setTasks(day.preview ? [] : day.tasks);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }, [today]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = tasks ? nextTask(tasks) : null;

  useEffect(() => {
    if (current && current.status === "pending") {
      void api.taskStart(current.id).then((started) =>
        setTasks((list) => (list ?? []).map((x) => (x.id === started.id ? started : x))),
      );
    }
  }, [current]);

  const exit = async () => {
    if (fullScreen && window.ipBridge) await window.ipBridge.setFullScreen(false);
    props.onExit();
  };

  const toggleFullScreen = async () => {
    if (!window.ipBridge) return;
    setFullScreen(await window.ipBridge.setFullScreen(!fullScreen));
  };

  if (error) {
    return (
      <div className="center-screen">
        <p className="error-box">{error}</p>
        <button className="btn" onClick={() => void exit()}>
          {t("back")}
        </button>
      </div>
    );
  }
  if (tasks === null) {
    return (
      <div className="center-screen">
        <div className="spinner" aria-hidden="true" />
      </div>
    );
  }

  if (!current) {
    const done = tasks.filter((x) => x.status === "done");
    const minutes = tasks.reduce((a, x) => a + x.done_minutes, 0);
    const finished = tasks.length > 0;
    return (
      <div className="center-screen day-end">
        {finished && <Confetti />}
        <div className="day-end-badge">
          <Icon name={finished ? "check" : kind === "rest" ? "coffee" : "flag"} size={40}
            color="#FFFFFF" />
        </div>
        <h1>{finished ? t("focus_day_done") : t(`focus_kind_${kind}`)}</h1>
        {finished ? (
          <p className="lead">
            {t("focus_day_stats", { done: done.length, total: tasks.length })}{" "}
            <bdi dir="ltr">{formatHM(minutes)}</bdi>
          </p>
        ) : (
          <p className="muted">{t(`focus_kind_${kind}_body`)}</p>
        )}
        <div className="row wrap">
          <button className="btn primary big-btn" onClick={() => void exit()}>
            {t("focus_back_home")}
          </button>
          {!finished && (
            <button className="btn big-btn" onClick={props.onOpenLibrary}>
              {t("focus_study_anyway")}
            </button>
          )}
        </div>
      </div>
    );
  }

  const index = tasks.findIndex((x) => x.id === current.id);
  const resource = current.resource_id ? (resources.get(current.resource_id) ?? null) : null;
  const sinceBreak = cumulative - lastBreakAt;

  return (
    <StudyScreen
      key={current.id}
      study={targetFor(current, resource)}
      keepSignIn={props.keepSignIn}
      onBack={() => void exit()}
      focus={{
        task: current,
        index,
        total: tasks.length,
        breakDueAt: Math.max(Math.min(60, breakEvery), breakEvery - sinceBreak),
        breakMinutes,
        onBreakTaken: (seconds) => setLastBreakAt(cumulative + seconds),
        onNext: async (seconds) => {
          await api.taskDone(current.id);
          setCumulative((c) => c + seconds);
          await load();
        },
        onSkip: async (reason) => {
          await api.taskSkip(current.id, reason);
          await load();
        },
        onExit: () => void exit(),
        fullScreen,
        onToggleFullScreen: () => void toggleFullScreen(),
      }}
    />
  );
}
