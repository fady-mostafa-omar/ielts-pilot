// v0.0.17 (owner, 2026-11-05): «إجاباتي» — the answers kept as PDF from the writing and
// speaking labs, with their recordings, in Documents/IELTS Band Up/إجاباتي on this computer.
// The page lists that folder and opens a file or the folder; nothing leaves the computer.

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { Icon } from "../icons";
import { dayKey } from "../plan";
import type { AnswerFile } from "../types";

type Filter = "all" | "writing" | "speaking";

interface Group {
  pdf: AnswerFile | null;
  stem: string;
  audio: AnswerFile[];
  modified: number;
}

/** Each PDF with the recordings saved beside it ("<stem> · إجابتي.wav"). */
function groupFiles(files: AnswerFile[]): Group[] {
  const groups = new Map<string, Group>();
  for (const f of files.filter((f) => f.name.toLowerCase().endsWith(".pdf"))) {
    const stem = f.name.slice(0, -4);
    groups.set(stem, { pdf: f, stem, audio: [], modified: f.modified });
  }
  for (const f of files.filter((f) => f.name.toLowerCase().endsWith(".wav"))) {
    const cut = f.name.lastIndexOf(" · ");
    const stem = cut > 0 ? f.name.slice(0, cut) : f.name.slice(0, -4);
    const group = groups.get(stem) ?? { pdf: null, stem, audio: [], modified: f.modified };
    group.audio.push(f);
    group.modified = Math.max(group.modified, f.modified);
    groups.set(stem, group);
  }
  return [...groups.values()].sort((a, b) => b.modified - a.modified);
}

function size(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function AnswersScreen() {
  const { t, formatDate } = useI18n();
  const bridge = window.ipBridge?.answers;
  const [files, setFiles] = useState<AnswerFile[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const load = useCallback(() => {
    if (!bridge) return;
    setFailed(false);
    bridge
      .list()
      .then(setFiles)
      .catch(() => {
        setFiles([]);
        setFailed(true);
      });
  }, [bridge]);
  useEffect(() => load(), [load]);

  const groups = groupFiles(files ?? []).filter(
    (g) =>
      filter === "all" ||
      (filter === "writing" ? /\bWriting\b/i.test(g.stem) : /\bSpeaking\b/i.test(g.stem)),
  );
  const open = (name: string) => void bridge?.open(name).then((ok) => ok || load());

  return (
    <div className="page wide stack-lg">
      <header className="stack-xs">
        <div className="row wrap">
          <h1>{t("answers_title")}</h1>
          <span className="spacer" />
          {bridge && (
            <>
              <button className="btn subtle small" onClick={load} title={t("answers_refresh")}>
                <Icon name="reload" size={14} />
              </button>
              <button className="btn" onClick={() => void window.ipBridge?.openFolder("answers")}>
                <Icon name="library" size={14} /> {t("answers_open_folder")}
              </button>
            </>
          )}
        </div>
        <p className="muted">{t("answers_intro")}</p>
      </header>

      {!bridge ? (
        <p className="note">{t("answers_desktop_only")}</p>
      ) : files === null ? (
        <div className="spinner" aria-hidden="true" />
      ) : (
        <section className="card stack">
          <div className="seg self-start" role="radiogroup" aria-label={t("answers_title")}>
            {(["all", "writing", "speaking"] as const).map((f) => (
              <button
                key={f}
                role="radio"
                aria-checked={filter === f}
                className={filter === f ? "on" : ""}
                onClick={() => setFilter(f)}
              >
                {t(`answers_${f}`)}
              </button>
            ))}
          </div>
          {failed && <p className="error-box small">{t("answers_failed")}</p>}
          {groups.length === 0 ? (
            <p className="note small">{t("answers_empty")}</p>
          ) : (
            <ul className="answer-list">
              {groups.map((g) => (
                <li key={g.stem} className="answer-item">
                  <div className="row wrap">
                    <Icon name={g.pdf ? "file" : "volume"} size={18} />
                    <span className="grow answer-name" dir="auto">
                      {g.stem}
                    </span>
                    <span className="muted small">
                      {formatDate(dayKey(new Date(g.modified)))}
                    </span>
                    {g.pdf && (
                      <>
                        <span className="muted small" dir="ltr">
                          {size(g.pdf.size)}
                        </span>
                        <button className="btn small" onClick={() => open(g.pdf!.name)}>
                          <Icon name="external" size={12} /> {t("answers_open")}
                        </button>
                      </>
                    )}
                  </div>
                  {g.audio.length > 0 && (
                    <ul className="answer-audio">
                      {g.audio.map((a) => (
                        <li key={a.name} className="row wrap">
                          <Icon name="mic" size={14} />
                          <span className="grow small" dir="auto">
                            {a.name.slice(g.stem.length).replace(/^ · /, "").replace(/\.wav$/i, "") ||
                              a.name}
                          </span>
                          <span className="muted small" dir="ltr">
                            {size(a.size)}
                          </span>
                          <button className="btn subtle small" onClick={() => open(a.name)}>
                            <Icon name="play" size={12} /> {t("answers_play")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
