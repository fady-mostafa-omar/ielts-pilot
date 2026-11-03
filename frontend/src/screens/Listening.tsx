// Listening player (Sprint 2b-1): the episode's transcript (Google Drive, shown from Drive
// itself) above a player with play/pause, ±5 s, seek and speed, plus the four steps of
// active listening. Audio streams from the podcast's public feed; nothing is copied.

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import { useI18n } from "../i18n";
import { Icon } from "../icons";
import { formatClock } from "../plan";
import type { Episode, EpisodeList, PodcastFeed } from "../types";
import { CompactRecorder } from "./Recorder";

const STALE_MS = 12 * 3600 * 1000;
export const STEPS = [1, 2, 3, 4] as const;
/** v0.0.10 (owner, 2026-11-03): each stage takes 15 minutes, so a podcast is an hour. */
export const STAGE_MINUTES = 15;
export type ListenStep = (typeof STEPS)[number];
export const STEP_SHOWS_TRANSCRIPT: Record<ListenStep, boolean> = {
  1: false,
  2: true,
  3: true,
  4: true, // reading for meaning
};

/* ---------- episodes ---------- */

export function usePodcast(feed: PodcastFeed | null) {
  const [list, setList] = useState<EpisodeList | null>(null);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(
    async (force = false) => {
      if (!feed) return;
      setLoading(true);
      setError(null);
      try {
        let current = await api.podcastList(feed);
        const stale =
          !current.refreshed_at || Date.now() - Date.parse(current.refreshed_at) > STALE_MS;
        if ((force || stale || current.total === 0) && window.ipBridge) {
          try {
            const xml = await window.ipBridge.podcastFeed(feed);
            await api.podcastImport(feed, xml);
            current = await api.podcastList(feed);
          } catch (e) {
            // offline or feed unreachable: keep what we have
            if (current.total === 0) throw e;
          }
        }
        setList(current);
        const next = await api.podcastNext(feed).catch((e: unknown) => {
          if (e instanceof ApiError && e.code === "no_episodes") return null;
          throw e;
        });
        setEpisode(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [feed],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pick = useCallback(
    (id: number) => {
      const found = list?.episodes.find((e) => e.id === id);
      if (found) setEpisode(found);
    },
    [list],
  );

  const finish = useCallback(
    async (comprehension: number | null) => {
      if (!episode || !feed) return;
      await api.podcastPatch(episode.id, {
        listened: true,
        ...(comprehension ? { comprehension } : {}),
      });
      setList(await api.podcastList(feed));
      setEpisode(await api.podcastNext(feed).catch(() => null));
    },
    [episode, feed],
  );

  /** Saves the stage reached; `restart` also sends the audio back to the beginning. */
  const setStage = useCallback(
    async (stage: number, restart: boolean) => {
      if (!episode) return;
      try {
        const updated = await api.podcastPatch(
          episode.id,
          restart ? { stage, position_seconds: 0 } : { stage },
        );
        setEpisode(updated);
      } catch {
        // offline backend: the stage is still shown, only not kept
      }
    },
    [episode],
  );

  return { list, episode, error, loading, refresh, pick, finish, setStage };
}

/* ---------- player bar ---------- */

const RATES = [0.75, 0.9, 1, 1.1, 1.25];
const RATINGS = [1, 2, 3, 4, 5] as const;
type Rating = (typeof RATINGS)[number];

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" ||
    el.isContentEditable);
}

export function PlayerBar(props: { episode: Episode; hold: boolean; fromStart?: boolean }) {
  const { t } = useI18n();
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const startAt = props.fromStart ? 0 : props.episode.position_seconds;
  const [current, setCurrent] = useState(startAt);
  const [duration, setDuration] = useState(props.episode.duration_seconds ?? 0);
  const [rate, setRate] = useState(1);
  const [error, setError] = useState(false);
  const started = useRef(false);
  const lastSaved = useRef(startAt);
  const id = props.episode.id;

  const save = useCallback(
    (seconds: number) => {
      const s = Math.max(0, Math.floor(seconds));
      if (Math.abs(s - lastSaved.current) < 3) return;
      lastSaved.current = s;
      void api.podcastPatch(id, { position_seconds: s }).catch(() => undefined);
    },
    [id],
  );

  const toggle = useCallback(() => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      void a.play().catch(() => setError(true));
    } else {
      a.pause();
    }
  }, []);

  const skip = useCallback((delta: number) => {
    const a = audio.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(a.duration || Infinity, a.currentTime + delta));
    setCurrent(a.currentTime);
  }, []);

  // a break pauses the audio
  useEffect(() => {
    if (props.hold && audio.current && !audio.current.paused) audio.current.pause();
  }, [props.hold]);

  // keyboard: space = play/pause, ← / → = 5 s back / forward
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        skip(-5);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        skip(5);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, skip]);

  // remember where we stopped
  useEffect(() => {
    const a = audio.current;
    return () => {
      if (a) save(a.currentTime);
    };
  }, [save]);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = rate;
  }, [rate]);

  return (
    <div className="player" dir="ltr">
      <audio
        ref={audio}
        src={props.episode.audio_url}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const a = e.currentTarget;
          setDuration(a.duration || props.episode.duration_seconds || 0);
          if (startAt > 0 && startAt < a.duration - 5) {
            a.currentTime = startAt;
          }
          a.playbackRate = rate;
        }}
        onTimeUpdate={(e) => {
          setCurrent(e.currentTarget.currentTime);
          if (Math.abs(e.currentTarget.currentTime - lastSaved.current) >= 10) {
            save(e.currentTarget.currentTime);
          }
        }}
        onPlay={() => {
          setPlaying(true);
          setError(false);
          if (!started.current) {
            started.current = true;
            void api.podcastPatch(id, { started: true }).catch(() => undefined);
          }
        }}
        onPause={(e) => {
          setPlaying(false);
          save(e.currentTarget.currentTime);
        }}
        onEnded={() => setPlaying(false)}
        onError={() => setError(true)}
      />
      <button className="pl-btn" title={t("pl_back5")} onClick={() => skip(-5)}>
        <Icon name="rewind" size={20} />
        <span>5</span>
      </button>
      <button
        className="pl-play"
        title={playing ? t("study_pause") : t("pl_play")}
        onClick={toggle}
      >
        <Icon name={playing ? "pause" : "play"} size={24} />
      </button>
      <button className="pl-btn" title={t("pl_fwd5")} onClick={() => skip(5)}>
        <span>5</span>
        <Icon name="forward" size={20} />
      </button>
      <span className="pl-time">{formatClock(current)}</span>
      <input
        className="pl-seek"
        type="range"
        min={0}
        max={Math.max(1, Math.floor(duration))}
        step={1}
        value={Math.floor(current)}
        aria-label={t("pl_seek")}
        onChange={(e) => {
          const a = audio.current;
          if (a) a.currentTime = Number(e.target.value);
          setCurrent(Number(e.target.value));
        }}
      />
      <span className="pl-time">{formatClock(duration)}</span>
      <select
        className="pl-rate"
        value={rate}
        aria-label={t("pl_speed")}
        onChange={(e) => setRate(Number(e.target.value))}
      >
        {RATES.map((r) => (
          <option key={r} value={r}>
            {r}×
          </option>
        ))}
      </select>
      {error && (
        <span className="pl-error" dir="auto">
          {t("pl_audio_error")}{" "}
          {props.episode.page_url && (
            <button
              className="linkish"
              onClick={() => void window.ipBridge?.openExternal(props.episode.page_url!)}
            >
              {t("pl_open_soundcloud")}
            </button>
          )}
        </span>
      )}
    </div>
  );
}

/* ---------- sidebar part ---------- */

export function ListeningSide(props: {
  list: EpisodeList | null;
  episode: Episode | null;
  step: ListenStep;
  onStep: (s: ListenStep) => void;
  onPick: (id: number) => void;
  onFinish: (rating: number | null) => Promise<void>;
  onStageDone: () => Promise<void>;
  /** in a plan task: the task's stages, how many are done, the stage it started at */
  today: { total: number; done: number; start: number } | null;
}) {
  const { t } = useI18n();
  const [rating, setRating] = useState<Rating | null>(null);
  const [busy, setBusy] = useState(false);
  const ep = props.episode;
  const today = props.today;
  const offset = today ? today.start - 1 : 0;
  const podcasts = today ? Math.max(1, Math.ceil((offset + today.total) / 4)) : 0;
  const podcastNo = today ? Math.min(podcasts, Math.floor((offset + today.done) / 4) + 1) : 0;
  // v0.0.13 (owner): once the task's stages are done only "Next" is left
  const todayDone = !!today && today.done >= today.total;

  useEffect(
    () => setRating((ep?.comprehension as Rating | null | undefined) ?? null),
    [ep?.id, ep?.comprehension],
  );

  return (
    <div className="stack listen-side">
      {today && ep && (
        <div className="queue-now stack">
          <span className="queue-counter">
            <Icon name="headphones" size={14} />
            {t("pl_podcast_of", { n: podcastNo, m: podcasts, s: props.step })}
          </span>
          <strong className="queue-current" dir="auto">
            {ep.title}
          </strong>
          <span className="muted small">
            {t("pl_stages_today", { done: Math.min(today.done, today.total), total: today.total })}
          </span>
          <div className="meter" aria-hidden="true">
            <span style={{ width: `${Math.min(100, (today.done / today.total) * 100)}%` }} />
          </div>
          {today.done >= today.total && <p className="ok-box small">{t("pl_stages_all_done")}</p>}
        </div>
      )}
      {props.list && (
        <div className="row wrap small muted">
          <Icon name="headphones" size={16} color="#2563EB" />
          {t("pl_progress", { done: props.list.listened, total: props.list.total })}
        </div>
      )}
      {props.list && props.list.episodes.length > 0 && (
        <select
          aria-label={t("pl_pick")}
          value={ep?.id ?? ""}
          onChange={(e) => props.onPick(Number(e.target.value))}
        >
          {props.list.episodes.map((e) => (
            <option key={e.id} value={e.id}>
              {e.listened_at ? "✓ " : ""}
              {e.title}
            </option>
          ))}
        </select>
      )}
      <div className="listen-steps" role="tablist" aria-label={t("pl_steps")}>
        {STEPS.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={props.step === s}
            className={props.step === s ? "on" : s < props.step ? "done" : ""}
            onClick={() => props.onStep(s)}
          >
            <b>{s}</b> {t(`pl_step${s}`)}
          </button>
        ))}
      </div>
      <p className="task-brief">{t(`pl_step${props.step}_do`)}</p>
      {props.step === 3 && <CompactRecorder limit={180} label={t("pl_shadow_rec")} />}
      {ep && !ep.transcript_url && <p className="note small">{t("pl_no_transcript")}</p>}
      {ep && props.step < 4 && !todayDone && (
        <button
          className="btn primary self-start"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await props.onStageDone();
            } finally {
              setBusy(false);
            }
          }}
        >
          <Icon name="check" size={16} /> {t("pl_stage_done", { s: props.step })}
        </button>
      )}
      {ep && props.step === 4 && !todayDone && (
        <div className="stack-xs">
          <span className="field-label">{t("pl_rate_title")}</span>
          <div className="stars" role="radiogroup" aria-label={t("pl_rate_title")}>
            {RATINGS.map((n) => (
              <button
                key={n}
                role="radio"
                aria-checked={rating === n}
                className={rating !== null && n <= rating ? "on" : ""}
                onClick={() => setRating(n)}
                title={t(`pl_rate_${n}`)}
              >
                {n}
              </button>
            ))}
          </div>
          {rating !== null && <span className="muted small">{t(`pl_rate_${rating}`)}</span>}
          <button
            className="btn primary self-start"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await props.onFinish(rating);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Icon name="check" size={16} /> {t("pl_finish_episode")}
          </button>
        </div>
      )}
    </div>
  );
}
