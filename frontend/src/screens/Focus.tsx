// Focus mode (D-025): today's tasks one at a time, full window, with breaks.
// "Continue learning" opens this at the first unfinished task.

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { Confetti } from "../charts";
import { useI18n } from "../i18n";
import { Icon } from "../icons";
import { formatHM, todayIso } from "../plan";
import type { AppSettings, DayKind, PlanTask, Resource } from "../types";
import { isQueueContent, NOVEL_MINUTES } from "./ContentQueue";
import { Interlude, interludeSeconds } from "./Interlude";
import { podcastFeedOf } from "./Library";
import { STAGE_MINUTES } from "./Listening";
import { StudyScreen, type StudyTarget } from "./Study";

function targetFor(task: PlanTask, resource: Resource | null): StudyTarget {
  const content = task.content;
  if (isQueueContent(content)) {
    // planner-4: the task's own videos / novel / tests, opened directly; v0.0.10: a novel
    // is about 30 minutes, so a longer task holds several, one after the other
    return {
      title: task.title,
      target: null,
      resource,
      skill: task.skill,
      activityCode: task.activity_code,
      timer: true,
      queue:
        content.kind === "novel"
          ? { ...content, count: Math.max(1, Math.round(task.planned_minutes / NOVEL_MINUTES)) }
          : content,
    };
  }
  if (content?.kind === "cards") {
    // v0.0.11: today's word cards (D-041)
    return {
      title: task.title,
      target: null,
      resource,
      skill: task.skill,
      activityCode: task.activity_code,
      timer: true,
      cards: content.deck,
    };
  }
  if (content?.kind === "writing" && content.task !== 0) {
    // v0.0.12: Task 1 / Task 2 answers in the writing lab (D-042)
    return {
      title: task.title,
      target: null,
      resource: null,
      skill: "writing",
      activityCode: task.activity_code,
      timer: true,
      lab: "writing",
      labTask: content.task,
      labCount: content.count,
      labTest: content.test === true, // v0.0.14: on named questions (D-044)
    };
  }
  if (content?.kind === "writing") {
    return {
      title: task.title,
      target: null,
      resource: null,
      skill: "writing",
      activityCode: task.activity_code,
      timer: true,
    };
  }
  const feed = content?.kind === "podcast" ? content.feed : podcastFeedOf(resource);
  if (feed) {
    return {
      title: task.title,
      target: null,
      resource,
      skill: task.skill,
      activityCode: task.activity_code,
      timer: true,
      podcast: feed,
      podcastStages: Math.max(1, Math.round(task.planned_minutes / STAGE_MINUTES)),
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
    // v0.0.12: speaking practice in the speaking lab, Dalilk's questions one tab away;
    // v0.0.13: the plan says which parts (the lab grows step by step)
    ...(content?.kind === "speaking" || task.activity_code === "S-PRAC"
      ? {
          lab: "speaking" as const,
          labParts: content?.kind === "speaking" ? content.parts : undefined,
          labTest: content?.kind === "speaking" && content.test === true,
        }
      : {}),
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

/** How the day went, honestly: tasks closed early (skipped, or "done" with less than half
 * of their planned time) are not celebrated and can be brought back. */
export function dayOutcome(tasks: PlanTask[]) {
  const planned = tasks.reduce((a, x) => a + x.planned_minutes, 0);
  const minutes = tasks.reduce((a, x) => a + x.done_minutes, 0);
  const short = tasks.filter(
    (x) => x.status === "skipped" || (x.status === "done" && x.done_minutes < x.planned_minutes / 2),
  );
  return { planned, minutes, short, celebrate: tasks.length > 0 && short.length === 0 };
}

export async function reopenTasks(tasks: PlanTask[]): Promise<void> {
  for (const task of tasks) await api.taskReset(task.id);
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
  const [interlude, setInterlude] = useState(false);
  const pauseSeconds = interludeSeconds(props.settings.interlude_seconds);
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
    if (current && current.status === "pending" && !interlude) {
      void api.taskStart(current.id).then((started) =>
        setTasks((list) => (list ?? []).map((x) => (x.id === started.id ? started : x))),
      );
    }
  }, [current, interlude]);

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
    const outcome = dayOutcome(tasks);
    const finished = tasks.length > 0;
    return (
      <div className="center-screen day-end">
        {outcome.celebrate && <Confetti />}
        <div className={`day-end-badge${finished && !outcome.celebrate ? " early" : ""}`}>
          <Icon
            name={outcome.celebrate ? "check" : finished ? "clock" : kind === "rest" ? "coffee" : "flag"}
            size={40}
            color="#FFFFFF"
          />
        </div>
        <h1>
          {outcome.celebrate
            ? t("focus_day_done")
            : finished
              ? t("day_closed_early")
              : t(`focus_kind_${kind}`)}
        </h1>
        {finished ? (
          <>
            <p className="lead">
              {t("focus_day_stats", { done: done.length, total: tasks.length })}{" "}
              {t("day_studied", { done: formatHM(outcome.minutes), planned: formatHM(outcome.planned) })}
            </p>
            {!outcome.celebrate && (
              <p className="muted">{t("day_short_tasks", { n: outcome.short.length })}</p>
            )}
          </>
        ) : (
          <p className="muted">{t(`focus_kind_${kind}_body`)}</p>
        )}
        <div className="row wrap">
          {finished && !outcome.celebrate && (
            <button
              className="btn primary big-btn"
              onClick={async () => {
                await reopenTasks(outcome.short);
                setInterlude(false);
                await load();
              }}
            >
              <Icon name="reload" size={14} /> {t("day_reopen")}
            </button>
          )}
          <button
            className={`btn big-btn${finished && !outcome.celebrate ? "" : " primary"}`}
            onClick={() => void exit()}
          >
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
  if (interlude) {
    return (
      <Interlude
        seconds={pauseSeconds}
        done={tasks.filter((x) => x.status === "done" || x.status === "skipped").length}
        total={tasks.length}
        nextTitle={current.title}
        onNext={() => setInterlude(false)}
        onExit={() => void exit()}
      />
    );
  }
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
          if (pauseSeconds > 0) setInterlude(true);
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
