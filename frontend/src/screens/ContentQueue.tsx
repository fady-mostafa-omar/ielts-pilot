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

/** A Dalilk novel takes about half an hour (owner, 2026-11-03). */
export const NOVEL_MINUTES = 30;

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
  if (c.kind === "novel") return { kind: "novel", level: c.level, limit: c.count ?? 1 };
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
  if (item.kind === "video") return { video: item.key };
  // a novel opens at the page where it was left (when the site shows the page in its link)
  return { url: item.kind === "novel" && item.position_url ? item.position_url : item.url };
}

const PAGE = /\/page\/\d+/;

/** Remembers the page a novel was left at, when the reader's link shows it. */
export function useNovelPage(item: ContentItem | null) {
  const last = useRef<string | null>(null);
  useEffect(() => {
    last.current = item?.position_url ?? null;
  }, [item]);
  return useCallback(
    (url: string) => {
      if (!item || item.kind !== "novel" || !PAGE.test(url) || url === last.current) return;
      if (!url.startsWith(item.url.split("/page/")[0] + "/")) return;
      last.current = url;
      void api.contentPosition(item.id, url).catch(() => undefined);
    },
    [item],
  );
}

export function useContentQueue(content: QueueContent | null) {
  const [items, setItems] = useState<ContentItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [finishedNovel, setFinishedNovel] = useState<ContentItem | null>(null);
  // v0.0.13: the videos finished in this task count by their length (owner, 2026-11-03)
  const [finishedSeconds, setFinishedSeconds] = useState(0);
  const [series, setSeries] = useState<{ total: number; done: number } | null>(null);
  const key = content ? JSON.stringify(content) : "";

  const load = useCallback(async () => {
    if (!content) return;
    setError(null);
    setFinishedNovel(null);
    try {
      const list = await api.contentQueue(params(content));
      setItems(list);
      setCurrentId(list[0]?.id ?? null);
      if (content.kind === "videos" && content.endless) {
        setSeries(
          await api
            .contentCount({ kind: "video", groups: content.groups.join(","), skills: content.skills.join(",") })
            .catch(() => null),
        );
      }
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
      if (item.kind === "video" && !item.completed_at) {
        setFinishedSeconds((s) => s + (item.duration_seconds ?? 0));
      }
      const list = (items ?? []).map((x) => (x.id === done.id ? done : x));
      setItems(list);
      const at = list.findIndex((x) => x.id === item.id);
      const next = list.slice(at + 1).find((x) => !x.completed_at || content?.kind === "videos");
      if (next) {
        setCurrentId(next.id);
      } else if (item.kind === "novel" && content?.endless) {
        // the Library's novels: ask before opening the next one
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

  /** A novel left for later: on to the next one (it comes back next time). */
  const skip = useCallback(
    (item: ContentItem) => {
      const list = items ?? [];
      const at = list.findIndex((x) => x.id === item.id);
      const next = list.slice(at + 1).find((x) => !x.completed_at);
      setCurrentId(next ? next.id : null);
    },
    [items],
  );

  return {
    items,
    current,
    index,
    error,
    finish,
    skip,
    finishedNovel,
    finishedSeconds,
    series,
    nextNovel: load,
  };
}

/** Marks a video watched at its last second, before YouTube's own end screen comes up. */
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
      const atEnd = m.ended || (m.duration > 5 && m.current >= m.duration - 1.2);
      if (atEnd && fired.current !== current.id) {
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

/** Time spent on the novel shown now (v0.0.13: half an hour each, owner 2026-11-03). */
function useNovelClock(item: ContentItem | null) {
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setStartedAt(Date.now());
    setNow(Date.now());
  }, [item?.id]);
  useEffect(() => {
    if (!item || item.kind !== "novel") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [item]);
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

export function QueueSide(props: {
  content: QueueContent;
  queue: ReturnType<typeof useContentQueue>;
  position: { current: number; duration: number } | null;
  onNextTask?: () => void; // in a plan task: "Next" goes on with the path
}) {
  const { t } = useI18n();
  const { content, queue } = props;
  const [busy, setBusy] = useState(false);
  const [bonus, setBonus] = useState<number | null>(null);
  const kind = content.kind;
  const item = queue.current;
  const total = queue.items?.length ?? 0;
  const novelSeconds = useNovelClock(item);

  if (queue.error) return <p className="error-box">{queue.error}</p>;
  if (!queue.items) return <div className="spinner" aria-hidden="true" />;

  const bonusLine =
    bonus !== null ? (
      <p className="ok-box small" role="status">
        {t("q_novel_early", { n: bonus })}
      </p>
    ) : null;

  if (queue.finishedNovel) {
    return (
      <div className="queue-now stack">
        {bonusLine}
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
  if (!item) {
    return (
      <div className="stack-xs">
        {bonusLine}
        <p className="ok-box">{t("q_all_done")}</p>
      </div>
    );
  }

  const last = !queue.items.slice(queue.index + 1).some((x) => !x.completed_at);
  const overTime = kind === "novel" && novelSeconds > NOVEL_MINUTES * 60;

  const finish = async () => {
    setBusy(true);
    try {
      if (item.kind === "novel") {
        const early = NOVEL_MINUTES - Math.ceil(novelSeconds / 60);
        setBonus(early >= 1 ? early : null);
      }
      await queue.finish(item);
      // the task's last novel: straight on with the path (owner, 2026-11-03)
      if (item.kind === "novel" && last && props.onNextTask && !content.endless) {
        props.onNextTask();
      }
    } finally {
      setBusy(false);
    }
  };

  const novelLevel = content.kind === "novel" ? content.level : "beginner";
  const counter =
    kind === "novel"
      ? total > 1
        ? t("q_novel_of", { n: queue.index + 1, m: total, level: t(`q_lvl_${novelLevel}`) })
        : t(LEVEL_KEY[novelLevel])
      : content.endless
        ? kind === "videos" && queue.series
          ? t("q_video_of", { n: Math.min(queue.series.total, queue.series.done + 1), m: queue.series.total })
          : t(kind === "videos" ? "q_next_lesson" : "q_next_test")
        : t(kind === "videos" ? "q_lesson_of" : "q_test_of", { n: queue.index + 1, m: total });

  return (
    <div className="queue-now stack">
      {bonusLine}
      <span className="queue-counter">
        <Icon name={kind === "videos" ? "play" : kind === "novel" ? "book" : "target"} size={14} />
        {counter}
      </span>
      <strong className="queue-current" dir="auto">
        {item.title}
      </strong>
      {item.kind === "video" && item.note && (
        <p className="video-note small" dir="auto">
          {item.note}
        </p>
      )}
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
      {kind === "novel" && (
        <div className={`novel-clock${overTime ? " over" : ""}`}>
          <Icon name="clock" size={14} />
          <bdi dir="ltr">
            {formatClock(novelSeconds)} / {formatClock(NOVEL_MINUTES * 60)}
          </bdi>
        </div>
      )}
      {overTime && <p className="warn-box small">{t("q_novel_late")}</p>}
      {kind === "tests" && <p className="muted small">{t("q_note_tests")}</p>}
      {/* videos are marked at their last second: no button (owner, 2026-11-03) */}
      {kind !== "videos" && (
        <button className="btn primary self-start" disabled={busy} onClick={() => void finish()}>
          <Icon name="check" size={16} />{" "}
          {kind === "novel" && last && props.onNextTask && !content.endless
            ? t("q_done_novel_next")
            : t(`q_done_${kind}`)}
        </button>
      )}
      {overTime && props.onNextTask && !content.endless && (
        <button
          className="btn subtle small self-start"
          onClick={() => (last ? props.onNextTask?.() : queue.skip(item))}
        >
          {t("q_novel_skip")}
        </button>
      )}
    </div>
  );
}
