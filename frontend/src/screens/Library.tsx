// Library: Dalilk's resources, free official practice, and the owner's own links and files.

import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api";
import { useI18n } from "../i18n";
import { Icon, SkillBadge } from "../icons";
import { RESOURCE_SKILLS, type Resource, type ResourceSkill } from "../types";
import type { StudyTarget } from "./Study";

type Filter = "all" | ResourceSkill;

const GROUPS = ["foundation", "fluency", "ielts", "practice", "mine"] as const;
type Group = (typeof GROUPS)[number];

function groupOf(r: Resource): Group {
  if (r.provider === "Mine") return "mine";
  if (r.provider !== "Dalilk") return "practice";
  if (r.track === "foundation" || r.track === "fluency") return r.track;
  return "ielts";
}

const FORMATS = {
  audio: { icon: "headphones", label: "fmt_audio" },
  pdf: { icon: "file", label: "fmt_pdf" },
  video: { icon: "play", label: "fmt_video" },
  web: { icon: "globe", label: "fmt_web" },
  text: { icon: "file", label: "fmt_text" },
} as const;

function formatInfo(format: string) {
  return format in FORMATS ? FORMATS[format as keyof typeof FORMATS] : FORMATS.web;
}

/** The Dalilk IELTS podcast opens the listening player (Sprint 2b-1). */
export const PODCAST_RESOURCE = "DLK-20";

export function studyTargetFor(r: Resource): StudyTarget {
  const exam = r.resource_type === "practice_test" || r.resource_type === "placement_test";
  if (r.catalog_id === PODCAST_RESOURCE) {
    return {
      title: r.title,
      target: null,
      resource: r,
      skill: r.skill,
      activityCode: "L-EXT",
      timer: true,
      podcast: "dalilk_ielts",
    };
  }
  return {
    title: r.title,
    target: r.local_path ? { library: r.local_path } : { url: r.url ?? "" },
    resource: r,
    skill: r.skill,
    activityCode: exam
      ? r.resource_type === "placement_test"
        ? "PLACEMENT"
        : "PRAC"
      : (r.activity_codes.split(";")[0] || null),
    timer: true,
  };
}

export function LibraryScreen(props: {
  initialFilter?: Filter;
  onStudy: (target: StudyTarget) => void;
}) {
  const { t, formatDate } = useI18n();
  const [items, setItems] = useState<Resource[] | null>(null);
  const [filter, setFilter] = useState<Filter>(props.initialFilter ?? "all");
  const [showArchived, setShowArchived] = useState(false);
  const [adding, setAdding] = useState<null | "link" | { fileName: string; format: string }>(
    null,
  );
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [skill, setSkill] = useState<ResourceSkill>("reading");
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .resources(showArchived)
      .then(setItems)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : String(e)));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  const visible = useMemo(
    () => (items ?? []).filter((r) => filter === "all" || r.skill === filter),
    [items, filter],
  );

  const replace = (r: Resource) =>
    setItems((list) => (list ?? []).map((x) => (x.id === r.id ? r : x)));

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }

  async function startFile() {
    const bridge = window.ipBridge;
    if (!bridge) return setError(t("bridge_missing"));
    const picked = await bridge.addLibraryFile();
    if (!picked) return;
    setTitle(picked.title);
    setAdding({ fileName: picked.fileName, format: picked.format });
  }

  async function saveNew() {
    if (!adding || !title.trim()) return;
    await act(async () => {
      if (adding === "link") {
        await api.addResource({ title, skill, url: url.trim(), format: "web" });
      } else {
        await api.addResource({
          title,
          skill,
          local_path: adding.fileName,
          format: adding.format,
          resource_type: "file",
        });
      }
      setAdding(null);
      setTitle("");
      setUrl("");
    });
  }

  return (
    <div className="page wide stack-lg">
      <header className="page-head">
        <div>
          <h1>{t("lib_title")}</h1>
          <p className="muted">{t("lib_sub")}</p>
        </div>
        <div className="row wrap">
          <button className="btn" onClick={() => setAdding("link")}>
            <Icon name="link" size={16} /> {t("lib_add_link")}
          </button>
          <button className="btn" onClick={() => void startFile()}>
            <Icon name="file" size={16} /> {t("lib_add_file")}
          </button>
        </div>
      </header>

      {adding && (
        <section className="card stack">
          <h2>{adding === "link" ? t("lib_add_link") : t("lib_add_file")}</h2>
          <div className="grid-3">
            <label className="field">
              <span className="field-label">{t("lib_field_title")}</span>
              <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
            </label>
            {adding === "link" && (
              <label className="field">
                <span className="field-label">{t("lib_field_url")}</span>
                <input
                  dir="ltr"
                  value={url}
                  placeholder="https://"
                  onChange={(e) => setUrl(e.target.value)}
                />
              </label>
            )}
            <label className="field">
              <span className="field-label">{t("lib_field_skill")}</span>
              <select value={skill} onChange={(e) => setSkill(e.target.value as ResourceSkill)}>
                {RESOURCE_SKILLS.map((s) => (
                  <option key={s} value={s}>
                    {t(`rskill_${s}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {adding !== "link" && (
            <p className="muted small">
              {t("lib_file_copied")} <bdi dir="ltr">{adding.fileName}</bdi>
            </p>
          )}
          <div className="row">
            <button
              className="btn primary"
              disabled={!title.trim() || (adding === "link" && !url.trim().startsWith("https://"))}
              onClick={() => void saveNew()}
            >
              {t("save")}
            </button>
            <button className="btn subtle" onClick={() => setAdding(null)}>
              {t("cancel")}
            </button>
          </div>
        </section>
      )}

      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}

      <div className="chips" role="toolbar" aria-label={t("lib_filter")}>
        {(["all", ...RESOURCE_SKILLS] as const).map((f) => (
          <button
            key={f}
            className={`chip-btn${filter === f ? " active" : ""}`}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? t("lib_all") : t(`rskill_${f}`)}
          </button>
        ))}
        <span className="spacer" />
        <label className="check small">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          {t("lib_show_archived")}
        </label>
      </div>

      {items === null && !error && <div className="spinner" aria-hidden="true" />}

      {GROUPS.map((g) => {
        const list = visible.filter((r) => groupOf(r) === g);
        if (list.length === 0) return null;
        return (
          <section key={g} className="stack">
            <h2 className="group-title">{t(`lib_group_${g}`)}</h2>
            <div className="resource-grid">
              {list.map((r) => (
                <article
                  key={r.id}
                  className={`resource-card${r.status === "archived" ? " archived" : ""}`}
                >
                  <div className="resource-top">
                    <SkillBadge skill={r.skill} size={18} />
                    <div className="resource-text">
                      <h3>{r.title}</h3>
                      <div className="resource-meta">
                        <span>
                          <Icon name={formatInfo(r.format).icon} size={14} />{" "}
                          {t(formatInfo(r.format).label)}
                        </span>
                        <span>{r.provider === "Mine" ? t("lib_mine") : r.provider}</span>
                        {r.needs_internet && (
                          <span>
                            <Icon name="globe" size={14} /> {t("lib_needs_net")}
                          </span>
                        )}
                        {r.completed_at && (
                          <span className="ok">
                            <Icon name="check" size={14} /> {t("lib_done")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {r.progress_position && (
                    <p className="small">
                      <strong>{t("lib_progress")}</strong> {r.progress_position}
                    </p>
                  )}
                  {r.description && <p className="muted small clamp-2">{r.description}</p>}
                  {r.last_opened_at && (
                    <p className="muted small">
                      {t("lib_last_opened", { date: formatDate(r.last_opened_at) })}
                    </p>
                  )}
                  <div className="row wrap resource-actions">
                    <button className="btn primary small" onClick={() => props.onStudy(studyTargetFor(r))}>
                      <Icon name="play" size={12} /> {t("lib_study")}
                    </button>
                    <button
                      className="btn small subtle"
                      title={r.status === "archived" ? t("lib_unarchive") : t("lib_archive")}
                      onClick={() =>
                        void act(async () =>
                          replace(
                            await api.patchResource(r.id, {
                              status: r.status === "archived" ? "active" : "archived",
                            }),
                          ),
                        )
                      }
                    >
                      <Icon name="archive" size={14} />
                      {r.status === "archived" ? t("lib_unarchive") : t("lib_archive")}
                    </button>
                    {r.provider === "Mine" && (
                      <button
                        className="btn small subtle"
                        onClick={() => {
                          if (window.confirm(t("lib_confirm_delete"))) {
                            void act(() => api.deleteResource(r.id));
                          }
                        }}
                      >
                        <Icon name="trash" size={14} /> {t("lib_delete")}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
      {items !== null && visible.length === 0 && <p className="muted">{t("lib_empty")}</p>}
      <p className="muted small">{t("lib_licence_note")}</p>
    </div>
  );
}
