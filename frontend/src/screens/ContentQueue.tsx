// planner-4: a task's content opened directly, one item at a time like the podcast player
// (owner, 2026-11-03): the technique videos one after another, the next novel at the
// learner's level, the next practice tests. No list to choose from; each item once
// (D-036). Progress is kept by the backend.

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import { useI18n } from "../i18n";
import { Icon } from "../icons";
import { formatClock } from "../plan";
import type {
  ContentItem,
  ExamFormat,
  Levels,
  NovelLevel,
  PanelTarget,
  TaskContent,
} from "../types";

export type QueueContent = Extract<TaskContent, { kind: "videos" | "novel" | "tests" }> & {
  /** from the Library: keeps going to the next item instead of ending the task */
  endless?: boolean;
};

export function isQueueContent(c: TaskContent | null | undefined): c is QueueContent {
  return !!c && (c.kind === "videos" || c.kind === "novel" || c.kind === "tests");
}

/** Dalilk's novel levels from the learner's mean band (same rule as the planner). */
export function novelLevelOf(levels: Levels | null): NovelLevel {
  const bands = Object.values(levels?.current ?? {})
    .filter((l) => l !== null)
    .map((l) => l!.band);
  if (bands.length === 0) return "beginner";
  const mean = bands.reduce((a, b) => a + b, 0) / bands.length;
  if (mean < 5) return "beginner";
  if (mean <= 6) return "intermediate";
  return "upper";
}

/** Library series that open one item at a time instead of the website. */
export function libraryQueue(
  catalogId: string | null,
  levels: Levels | null,
  format: ExamFormat | null,
): QueueContent | null {
  if (catalogId === "DLK-07") return { kind: "novel", level: novelLevelOf(levels), endless: true };
  if (catalogId === "DLK-06") {
    return { kind: "videos", groups: ["phrases"], skills: ["S"], count: 1, endless: true };
  }
  if (catalogId === "DLK-17") {
    return {
      kind: "videos",
      groups: ["dev", "core", format === "paper" ? "paper" : "computer", "low", "high", "practice"],
      skills: ["L", "R", "W1", "W2", "S"],
      count: 1,
      endless: true,
    };
  }
  return null;
}

function params(c: QueueContent): Record<string, string | number | boolean | undefined> {
  if (c.kind === "novel") return { kind: "novel", level: c.level, limit: 1 };
  if (c.kind === "tests") {
    return {
      kind: "test",
      skills: c.skills.join(","),
      providers: c.providers.join(","),
      limit: Math.max(1, c.count),
    };
  }
  return {
    kind: "video",
    groups: c.groups.join(","),
    skills: c.skills.join(","),
    minutes: c.count ? undefined : c.minutes,
    limit: c.count ?? undefined,
    review: c.review ? true : undefined,
  };
}

export function queueTarget(item: ContentItem): PanelTarget {
  return item.kind === "video" ? { video: item.key } : { url: item.url };
}

export function useContentQueue(content: QueueContent | null) {
  const [items, setItems] = useState<ContentItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [finishedNovel, setFinishedNovel] = useState<ContentItem | null>(null);
  const key = content ? JSON.stringify(content) : "";

  const load = useCallback(async () => {
    if (!content) return;
    setError(null);
    setFinishedNovel(null);
    try {
      const list = await api.contentQueue(params(content));
      setItems(list);
      setCurrentId(list[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = items?.find((i) => i.id === currentId) ?? null;
  const index = current && items ? items.indexOf(current) : -1;

  useEffect(() => {
    if (current && !current.started_at) {
      void api.contentStart(current.id).catch(() => undefined);
    }
  }, [current]);

  const finish = useCallback(
    async (item: ContentItem) => {
      const done = await api.contentDone(item.id);
      const list = (items ?? []).map((x) => (x.id === done.id ? done : x));
      setItems(list);
      const at = list.findIndex((x) => x.id === item.id);
      const next = list.slice(at + 1).find((x) => !x.completed_at || content?.kind === "videos");
      if (next) {
        setCurrentId(next.id);
      } else if (item.kind === "novel") {
        // a novel is its own unit: ask before opening the next one
        setCurrentId(null);
        setFinishedNovel(done);
      } else if (content?.endless) {
        await load();
      } else {
        setCurrentId(null);
      }
    },
    [items, content, load],
  );

  return {
    items,
    current,
    index,
    error,
    finish,
    finishedNovel,
    nextNovel: load,
  };
}

/** Moves to the next video when the one shown in the panel ends. */
export function useVideoEnded(current: ContentItem | null, onEnded: () => void) {
  const fired = useRef<number | null>(null);
  const [position, setPosition] = useState<{ current: number; duration: number } | null>(null);
  useEffect(() => {
    setPosition(null);
    const bridge = window.ipBridge;
    if (!bridge?.panel.onMedia || !current || current.kind !== "video") return;
    return bridge.panel.onMedia((m) => {
      if (m.video !== current.key) return;
      setPosition({ current: m.current, duration: m.duration });
      if (m.ended && fired.current !== current.id) {
        fired.current = current.id;
        onEnded();
      }
    });
  }, [current, onEnded]);
  return position;
}

const LEVEL_KEY = {
  beginner: "q_level_beginner",
  intermediate: "q_level_intermediate",
  upper: "q_level_upper",
} as const;

export function QueueSide(props: {
  content: QueueContent;
  queue: ReturnType<typeof useContentQueue>;
  position: { current: number; duration: number } | null;
  onNextTask?: () => void;
}) {
  const { t } = useI18n();
  const { content, queue } = props;
  const [busy, setBusy] = useState(false);
  const kind = content.kind;
  const item = queue.current;
  const total = queue.items?.length ?? 0;

  if (queue.error) return <p className="error-box">{queue.error}</p>;
  if (!queue.items) return <div className="spinner" aria-hidden="true" />;

  if (queue.finishedNovel) {
    return (
      <div className="queue-now stack">
        <p className="ok-box">
          {t("q_novel_finished")} <bdi dir="ltr">{queue.finishedNovel.title}</bdi> 🎉
        </p>
        <button className="btn primary self-start" onClick={() => void queue.nextNovel()}>
          <Icon name="book" size={16} /> {t("q_next_novel")}
        </button>
        {props.onNextTask && (
          <button className="btn self-start" onClick={props.onNextTask}>
            {t("q_next_task")}
          </button>
        )}
      </div>
    );
  }
  if (queue.items.length === 0) return <p className="note small">{t(`q_empty_${kind}`)}</p>;
  if (!item) return <p className="ok-box">{t("q_all_done")}</p>;

  const finish = async () => {
    setBusy(true);
    try {
      await queue.finish(item);
    } finally {
      setBusy(false);
    }
  };

  const counter =
    kind === "novel"
      ? t(LEVEL_KEY[content.kind === "novel" ? content.level : "beginner"])
      : content.endless
        ? t(kind === "videos" ? "q_next_lesson" : "q_next_test")
        : t(kind === "videos" ? "q_lesson_of" : "q_test_of", { n: queue.index + 1, m: total });

  return (
    <div className="queue-now stack">
      <span className="queue-counter">
        <Icon name={kind === "videos" ? "play" : kind === "novel" ? "book" : "target"} size={14} />
        {counter}
      </span>
      <strong className="queue-current" dir="auto">
        {item.title}
      </strong>
      {item.kind === "video" && item.duration_seconds ? (
        <span className="muted small">
          <bdi dir="ltr">
            {props.position && props.position.duration > 0
              ? `${formatClock(props.position.current)} / ${formatClock(item.duration_seconds)}`
              : formatClock(item.duration_seconds)}
          </bdi>
        </span>
      ) : null}
      {kind === "videos" && props.position && props.position.duration > 0 && (
        <div className="meter" aria-hidden="true">
          <span
            style={{
              width: `${Math.min(100, (props.position.current / props.position.duration) * 100)}%`,
            }}
          />
        </div>
      )}
      {content.kind === "videos" && content.review && (
        <p className="note small">{t("q_review")}</p>
      )}
      <p className="muted small">{t(`q_note_${kind}`)}</p>
      <button className="btn primary self-start" disabled={busy} onClick={() => void finish()}>
        <Icon name="check" size={16} /> {t(`q_done_${kind}`)}
      </button>
    </div>
  );
}
