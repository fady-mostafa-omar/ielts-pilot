// v0.0.10 (owner, 2026-11-03): every speaking task starts with a one-minute recording —
// "talk about your day or introduce yourself" — then the rest of the task (the videos).
// The recording stays on this computer: the desktop app saves it in the data folder
// ("recordings"); nothing is uploaded anywhere.

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { LINUX } from "../platform";
import { Icon } from "../icons";
import { formatClock } from "../plan";

const LIMIT_SECONDS = 60;

export type RecState = "idle" | "recording" | "done" | "error";

/** Records from the microphone up to `limit` seconds; the file is kept in the data folder
 *  (the desktop app saves it and gives back its name). */
export function useRecorder(limit: number, kind: "speaking" | "shadow" = "speaking") {
  const [state, setState] = useState<RecState>("idle");
  const [left, setLeft] = useState(limit);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);

  const stop = useCallback(() => {
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }, []);

  // release the microphone when leaving
  useEffect(
    () => () => {
      if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );
  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl],
  );

  useEffect(() => {
    if (state !== "recording") return;
    const timer = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [state]);

  useEffect(() => {
    if (state === "recording" && left <= 0) stop();
  }, [state, left, stop]);

  const start = useCallback(async () => {
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      const rec = new MediaRecorder(media);
      chunks.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      rec.onstop = () => {
        media.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        setSeconds(Math.round((Date.now() - startedAt.current) / 1000));
        setAudioUrl(URL.createObjectURL(blob));
        setState("done");
        setFileName(null);
        void blob
          .arrayBuffer()
          .then((data) => window.ipBridge?.saveRecording?.(data, kind))
          .then((name) => setFileName(name ?? null))
          .catch(() => setFileName(null));
      };
      recorder.current = rec;
      rec.start();
      startedAt.current = Date.now();
      setLeft(limit);
      setState("recording");
    } catch {
      setState("error");
    }
  }, [limit, kind]);

  const reset = useCallback(() => {
    setState("idle");
    setAudioUrl(null);
    setFileName(null);
    setSeconds(0);
    setLeft(limit);
  }, [limit]);

  return { state, left, audioUrl, fileName, seconds, start, stop, reset };
}

export function SpeakingRecorder(props: { continueLabel: string; onContinue: () => void }) {
  const { t } = useI18n();
  const rec = useRecorder(LIMIT_SECONDS);
  const { state, left, audioUrl, stop } = rec;
  const saved = !!rec.fileName;
  const start = rec.start;

  return (
    <div className="recorder">
      <div className={`rec-ring${state === "recording" ? " on" : ""}`} aria-hidden="true">
        <Icon name="mic" size={44} color={state === "recording" ? "#DC2626" : "#7C3AED"} />
      </div>
      <h2>{t("rec_title")}</h2>
      <p className="lead" dir="auto">
        {t("rec_prompt")}
      </p>
      {state === "recording" && (
        <>
          <p className="rec-clock" dir="ltr">
            {formatClock(Math.max(0, left))}
          </p>
          <div className="il-meter rec-meter" aria-hidden="true">
            <span style={{ width: `${((LIMIT_SECONDS - left) / LIMIT_SECONDS) * 100}%` }} />
          </div>
          <span className="muted small">{t("rec_left", { s: formatClock(Math.max(0, left)) })}</span>
          <button className="btn danger big-btn" onClick={stop}>
            <Icon name="stop" size={14} /> {t("rec_stop")}
          </button>
        </>
      )}
      {state === "idle" && (
        <button className="btn primary big-btn" onClick={() => void start()}>
          <Icon name="mic" size={16} /> {t("rec_start")}
        </button>
      )}
      {state === "error" && (
        <>
          <p className="error-box">{t(LINUX ? "rec_no_mic_linux" : "rec_no_mic")}</p>
          <button className="btn" onClick={() => void start()}>
            <Icon name="mic" size={16} /> {t("rec_start")}
          </button>
        </>
      )}
      {state === "done" && audioUrl && (
        <>
          <audio className="rec-audio" controls src={audioUrl} />
          {saved && <span className="muted small">{t("rec_saved")}</span>}
          <div className="row wrap rec-actions">
            <button className="btn primary big-btn" onClick={props.onContinue}>
              <Icon name="play" size={14} /> {props.continueLabel}
            </button>
            <button className="btn" onClick={() => void start()}>
              <Icon name="mic" size={14} /> {t("rec_again")}
            </button>
          </div>
        </>
      )}
      {state !== "done" && state !== "recording" && (
        <button className="btn subtle small" onClick={props.onContinue}>
          {t("rec_skip")}
        </button>
      )}
    </div>
  );
}

/** v0.0.12: a small recorder for shadowing (podcast stage 3): record yourself, listen back. */
export function CompactRecorder(props: { limit: number; label: string }) {
  const { t } = useI18n();
  const rec = useRecorder(props.limit, "shadow");
  return (
    <div className="compact-rec stack-xs">
      <span className="field-label">{props.label}</span>
      {rec.state === "recording" ? (
        <button className="btn danger small self-start" onClick={rec.stop}>
          <Icon name="stop" size={12} /> {t("rec_stop")} · <bdi dir="ltr">{formatClock(props.limit - rec.left)}</bdi>
        </button>
      ) : (
        <button className="btn small self-start" onClick={() => void rec.start()}>
          <Icon name="mic" size={12} /> {rec.state === "done" ? t("rec_again") : t("rec_start")}
        </button>
      )}
      {rec.state === "error" && <p className="error-box small">{t(LINUX ? "rec_no_mic_linux" : "rec_no_mic")}</p>}
      {rec.state === "done" && rec.audioUrl && (
        <audio className="rec-audio small" controls src={rec.audioUrl} />
      )}
    </div>
  );
}
