// planner-4 (v0.0.8): a task's content opened directly — technique videos one after
// another, the next novel at the learner's level, the next practice tests. Each item once
// (D-036); progress is kept by the backend.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../api";
import { useI18n } from "../i18n";
import { Icon } from "../icons";
import { formatClock } from "../plan";
import type { ContentItem, PanelTarget, TaskContent } from "../types";

export type QueueContent = Extract<TaskContent, { kind: "videos" | "novel" | "tests" }>;

export function isQueueContent(c: TaskContent | null | undefined): c is QueueContent {
  return !!c && (c.kind === "videos" || c.kind === "novel" || c.kind === "tests");
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
  const key = content ? JSON.stringify(content) : "";

  const load = useCallback(async () => {
    if (!content) return;
    setError(null);
    try {
      const list = await api.contentQueue(params(content));
      setItems(list);
      setCurrentId(list.find((i) => !i.completed_at || content.kind === "videos")?.id ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = items?.find((i) => i.id === currentId) ?? null;

  useEffect(() => {
    if (current && !current.started_at) {
      void api.contentStart(current.id).catch(() => undefined);
    }
  }, [current]);

  const finish = useCallback(
    async (item: ContentItem) => {
      const done = await api.contentDone(item.id);
      setItems((list) => (list ?? []).map((x) => (x.id === done.id ? done : x)));
      const list = items ?? [];
      const at = list.findIndex((x) => x.id === item.id);
      const next = list.slice(at + 1).find((x) => !x.completed_at || content?.kind === "videos");
      setCurrentId(next?.id ?? null);
    },
    [items, content],
  );

  return { items, current, error, finish, pick: setCurrentId, reload: load };
}

/** Moves to the next video when the one shown alone in the panel ends. */
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

export function QueueSide(props: {
  content: QueueContent;
  queue: ReturnType<typeof useContentQueue>;
  position: { current: number; duration: number } | null;
}) {
  const { t } = useI18n();
  const { content, queue } = props;
  const [busy, setBusy] = useState(false);
  const kind = content.kind;
  const totalSeconds = useMemo(
    () => (queue.items ?? []).reduce((a, i) => a + (i.duration_seconds ?? 0), 0),
    [queue.items],
  );

  if (queue.error) return <p className="error-box">{queue.error}</p>;
  if (!queue.items) return <div className="spinner" aria-hidden="true" />;
  if (queue.items.length === 0) {
    return <p className="note small">{t(`q_empty_${kind}`)}</p>;
  }

  const finish = async () => {
    if (!queue.current) return;
    setBusy(true);
    try {
      await queue.finish(queue.current);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack queue-side">
      <div className="row wrap small muted">
        <Icon name={kind === "videos" ? "play" : kind === "novel" ? "book" : "target"} size={16} />
        {t(`q_title_${kind}`)}
        {kind === "videos" && totalSeconds > 0 && (
          <bdi dir="ltr">· {formatClock(totalSeconds)}</bdi>
        )}
      </div>
      {content.kind === "videos" && content.review && (
        <p className="note small">{t("q_review")}</p>
      )}
      <ol className="queue-list">
        {queue.items.map((item) => (
          <li
            key={item.id}
            className={
              item.id === queue.current?.id ? "now" : item.completed_at ? "done" : undefined
            }
          >
            <button className="queue-item" onClick={() => queue.pick(item.id)}>
              <span className="queue-mark" aria-hidden="true">
                {item.completed_at ? <Icon name="check" size={14} /> : null}
              </span>
              <span className="queue-title" dir="auto">
                {item.title}
              </span>
              {item.duration_seconds ? (
                <bdi className="queue-time" dir="ltr">
                  {formatClock(item.duration_seconds)}
                </bdi>
              ) : null}
            </button>
          </li>
        ))}
      </ol>
      {queue.current && kind === "videos" && props.position && props.position.duration > 0 && (
        <div className="meter" aria-hidden="true">
          <span
            style={{ width: `${Math.min(100, (props.position.current / props.position.duration) * 100)}%` }}
          />
        </div>
      )}
      <p className="muted small">{t(`q_note_${kind}`)}</p>
      {queue.current ? (
        <button className="btn primary self-start" disabled={busy} onClick={() => void finish()}>
          <Icon name="check" size={16} /> {t(`q_done_${kind}`)}
        </button>
      ) : (
        <p className="ok-box">{t("q_all_done")}</p>
      )}
    </div>
  );
}
