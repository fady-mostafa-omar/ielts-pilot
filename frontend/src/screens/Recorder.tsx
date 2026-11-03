// v0.0.10 (owner, 2026-11-03): every speaking task starts with a one-minute recording —
// "talk about your day or introduce yourself" — then the rest of the task (the videos).
// The recording stays on this computer: the desktop app saves it in the data folder
// ("recordings"); nothing is uploaded anywhere.

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { Icon } from "../icons";
import { formatClock } from "../plan";

const LIMIT_SECONDS = 60;

type RecState = "idle" | "recording" | "done" | "error";

export function SpeakingRecorder(props: { continueLabel: string; onContinue: () => void }) {
  const { t } = useI18n();
  const [state, setState] = useState<RecState>("idle");
  const [left, setLeft] = useState(LIMIT_SECONDS);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);

  const stop = useCallback(() => {
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }, []);

  // release the microphone and the recording when leaving
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

  async function start() {
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
        setAudioUrl(URL.createObjectURL(blob));
        setState("done");
        setSaved(false);
        void blob
          .arrayBuffer()
          .then((data) => window.ipBridge?.saveRecording?.(data))
          .then((name) => setSaved(!!name))
          .catch(() => setSaved(false));
      };
      recorder.current = rec;
      rec.start();
      setLeft(LIMIT_SECONDS);
      setState("recording");
    } catch {
      setState("error");
    }
  }

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
          <p className="error-box">{t("rec_no_mic")}</p>
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
