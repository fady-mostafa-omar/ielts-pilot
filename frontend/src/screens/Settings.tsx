// Settings: goals and time, level history, data and backups (PRD F1 edit, F12).

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";
import {
  Field,
  GoalsFields,
  LevelsFields,
  TimeFields,
  goalsFromProfile,
  levelsDefault,
  levelsToEntries,
  toProfileInput,
  validateGoals,
  validateLevels,
  type GoalsDraft,
  type LevelsDraft,
  type TimeDraft,
} from "../forms";
import { useI18n } from "../i18n";
import {
  SKILLS,
  type BackupInfo,
  type Lang,
  type Levels,
  type Profile,
  type SystemInfo,
} from "../types";

type Tab = "profile" | "levels" | "data";

function errorText(e: unknown): string {
  return e instanceof ApiError ? e.message : String(e);
}

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function SettingsScreen(props: {
  profile: Profile;
  levels: Levels | null;
  onProfileSaved: (p: Profile) => void;
  onLevelsChanged: (l: Levels) => void;
  onDataReplaced: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("profile");
  return (
    <div className="page stack-lg">
      <h1>{t("settings_title")}</h1>
      <div className="tabs" role="tablist">
        {(["profile", "levels", "data"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={tab === k ? "active" : ""}
            onClick={() => setTab(k)}
          >
            {t(`tab_${k}`)}
          </button>
        ))}
      </div>
      {tab === "profile" && (
        <ProfileTab profile={props.profile} onSaved={props.onProfileSaved} />
      )}
      {tab === "levels" && (
        <LevelsTab levels={props.levels} onChanged={props.onLevelsChanged} />
      )}
      {tab === "data" && <DataTab onDataReplaced={props.onDataReplaced} />}
    </div>
  );
}

function ProfileTab(props: { profile: Profile; onSaved: (p: Profile) => void }) {
  const { t } = useI18n();
  const p = props.profile;
  const [name, setName] = useState(p.display_name ?? "");
  const [lang, setLang] = useState<Lang>(p.interface_language);
  const [goals, setGoals] = useState<GoalsDraft>(() => goalsFromProfile(p));
  const [time, setTime] = useState<TimeDraft>({
    study_days_per_week: p.study_days_per_week,
    study_minutes_per_day: p.study_minutes_per_day,
    explanation_language: p.explanation_language,
  });
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const goalErrors = validateGoals(goals, t);

  async function save() {
    if (Object.keys(goalErrors).length > 0) return;
    setStatus("saving");
    setError(null);
    try {
      const saved = await api.saveProfile(
        toProfileInput({ display_name: name, interface_language: lang }, goals, time),
      );
      setStatus("saved");
      props.onSaved(saved);
    } catch (e) {
      setStatus("idle");
      setError(t("err_generic", { msg: errorText(e) }));
    }
  }

  return (
    <div className="stack-lg">
      <section className="card stack">
        <div className="grid-2">
          <Field label={`${t("field_name")} (${t("optional")})`}>
            <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t("field_language")}>
            <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
              <option value="ar">{t("lang_ar")}</option>
              <option value="en">{t("lang_en")}</option>
            </select>
          </Field>
        </div>
      </section>
      <section className="card stack">
        <h2>{t("goals_title")}</h2>
        <GoalsFields value={goals} onChange={setGoals} errors={goalErrors} />
      </section>
      <section className="card stack">
        <h2>{t("time_title")}</h2>
        <TimeFields value={time} onChange={setTime} />
      </section>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button
          className="btn primary"
          disabled={status === "saving" || Object.keys(goalErrors).length > 0}
          onClick={() => void save()}
        >
          {status === "saving" ? t("saving") : t("save")}
        </button>
        {status === "saved" && <span className="ok">{t("saved")}</span>}
      </div>
    </div>
  );
}

function LevelsTab(props: { levels: Levels | null; onChanged: (l: Levels) => void }) {
  const { t, formatBand, formatDate } = useI18n();
  const [draft, setDraft] = useState<LevelsDraft>(levelsDefault);
  const [showErrors, setShowErrors] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const errors = validateLevels(draft, t);
  const entries = levelsToEntries(draft);

  async function add() {
    if (entries.length === 0) {
      setError(t("err_no_levels"));
      return;
    }
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    setStatus("saving");
    setError(null);
    try {
      props.onChanged(await api.addLevels(entries));
      setDraft(levelsDefault());
      setShowErrors(false);
      setStatus("saved");
    } catch (e) {
      setStatus("idle");
      setError(t("err_generic", { msg: errorText(e) }));
    }
  }

  const sourceLabel = (s: string) =>
    t(`source_${s as "official_practice" | "external_marker" | "self_estimate"}`);

  return (
    <div className="stack-lg">
      <section className="card">
        <h2>{t("levels_current")}</h2>
        <table className="skills-table">
          <tbody>
            {SKILLS.map((s) => {
              const level = props.levels?.current[s] ?? null;
              return (
                <tr key={s}>
                  <th scope="row">{t(`skill_${s}`)}</th>
                  <td>
                    <span className="band">{formatBand(level?.band)}</span>
                  </td>
                  <td>{level ? sourceLabel(level.source_type) : t("not_set")}</td>
                  <td className="muted">{level?.source_note}</td>
                  <td className="muted">{level ? formatDate(level.recorded_at) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card stack">
        <h2>{t("levels_add")}</h2>
        <p className="muted">{t("levels_add_hint")}</p>
        <LevelsFields value={draft} onChange={setDraft} errors={showErrors ? errors : {}} />
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button
            className="btn primary"
            disabled={status === "saving"}
            onClick={() => void add()}
          >
            {status === "saving" ? t("saving") : t("save")}
          </button>
          {status === "saved" && <span className="ok">{t("levels_added")}</span>}
        </div>
      </section>

      <section className="card">
        <h2>{t("levels_history")}</h2>
        {!props.levels || props.levels.history.length === 0 ? (
          <p className="muted">{t("levels_empty")}</p>
        ) : (
          <table className="history-table">
            <tbody>
              {props.levels.history.map((h) => (
                <tr key={h.id}>
                  <td>{formatDate(h.recorded_at)}</td>
                  <td>{t(`skill_${h.skill}`)}</td>
                  <td className="band">{formatBand(h.band)}</td>
                  <td>{sourceLabel(h.source_type)}</td>
                  <td className="muted">{h.source_note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function DataTab(props: { onDataReplaced: () => Promise<void> }) {
  const { t, formatDate } = useI18n();
  const bridge = window.ipBridge;
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [confirmWord, setConfirmWord] = useState("");

  const refresh = useCallback(async () => {
    const [sys, list] = await Promise.all([api.system(), api.backups()]);
    setSystem(sys);
    setBackups(list);
  }, []);

  useEffect(() => {
    refresh().catch((e: unknown) =>
      setMessage({ kind: "error", text: t("err_generic", { msg: errorText(e) }) }),
    );
  }, [refresh, t]);

  async function run(action: () => Promise<string | null>) {
    setBusy(true);
    setMessage(null);
    try {
      const ok = await action();
      if (ok) setMessage({ kind: "ok", text: ok });
      await refresh();
    } catch (e) {
      setMessage({ kind: "error", text: t("err_generic", { msg: errorText(e) }) });
    } finally {
      setBusy(false);
    }
  }

  const kindLabel = (b: BackupInfo): string => {
    if (b.name.includes("-imported-")) return t("backup_kind_imported");
    switch (b.kind) {
      case "manual":
        return t("backup_kind_manual");
      case "pre-migration":
        return t("backup_kind_pre_migration");
      case "pre-restore":
        return t("backup_kind_pre_restore");
      case "pre-delete":
        return t("backup_kind_pre_delete");
      default:
        return b.kind ?? "—";
    }
  };

  const word = t("danger_word");

  return (
    <div className="stack-lg">
      {message && (
        <p className={message.kind === "ok" ? "ok-box" : "error-box"} role="status">
          {message.text}
        </p>
      )}

      <section className="card stack">
        <h2>{t("data_where")}</h2>
        {system && (
          <>
            <p className="path" dir="ltr">
              {system.data_dir}
            </p>
            <p className="muted">
              {t("data_free")}: <bdi dir="ltr">{formatBytes(system.free_bytes)}</bdi> ·{" "}
              <bdi>{t("version_info", { v: system.version, r: system.schema_revision ?? "—" })}</bdi>
            </p>
            {system.low_disk && <p className="error-box">{t("data_low_disk")}</p>}
          </>
        )}
        {bridge && (
          <div className="row">
            <button className="btn" onClick={() => void bridge.openFolder("data")}>
              {t("open_data_folder")}
            </button>
          </div>
        )}
      </section>

      <section className="card stack">
        <h2>{t("backups_title")}</h2>
        <p className="muted">{t("backups_hint")}</p>
        <div className="row wrap">
          <button
            className="btn primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api.createBackup();
                return t("backup_created");
              })
            }
          >
            {t("backup_now")}
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (!bridge) return t("bridge_missing");
                const name = await bridge.importBackup();
                return name ? t("imported_ok") : null;
              })
            }
          >
            {t("backup_import")}
          </button>
          {bridge && (
            <button className="btn" onClick={() => void bridge.openFolder("backups")}>
              {t("backup_open_folder")}
            </button>
          )}
        </div>

        {backups.length === 0 ? (
          <p className="muted">{t("backups_empty")}</p>
        ) : (
          <ul className="backup-list">
            {backups.map((b) => (
              <li key={b.name} className={b.valid ? "" : "invalid"}>
                <div className="backup-meta">
                  <strong>{formatDate(b.created_at)}</strong>
                  <span className="tag">{kindLabel(b)}</span>
                  <bdi className="muted" dir="ltr">
                    {formatBytes(b.size_bytes)}
                    {b.app_version ? ` · v${b.app_version}` : ""}
                  </bdi>
                  {!b.valid && <span className="tag tag-error">{t("backup_invalid")}</span>}
                  <span className="muted small" dir="ltr">
                    {b.name}
                  </span>
                </div>
                <div className="row">
                  <button
                    className="btn small"
                    disabled={busy || !b.valid}
                    onClick={() => {
                      if (!window.confirm(t("confirm_restore"))) return;
                      void run(async () => {
                        const res = await api.restoreBackup(b.name);
                        await props.onDataReplaced();
                        return t("restored_ok", { name: res.safety_backup });
                      });
                    }}
                  >
                    {t("backup_restore")}
                  </button>
                  {bridge && (
                    <button
                      className="btn small"
                      disabled={busy}
                      onClick={() =>
                        void run(async () =>
                          (await bridge.exportBackup(b.name)) ? t("exported_ok") : null,
                        )
                      }
                    >
                      {t("backup_export")}
                    </button>
                  )}
                  <button
                    className="btn small subtle"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(t("confirm_delete_backup"))) return;
                      void run(async () => {
                        await api.deleteBackup(b.name);
                        return null;
                      });
                    }}
                  >
                    {t("backup_delete")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card stack danger">
        <h2>{t("danger_title")}</h2>
        <p>{t("danger_body")}</p>
        <Field label={t("danger_type", { word })}>
          <input value={confirmWord} onChange={(e) => setConfirmWord(e.target.value)} />
        </Field>
        <div className="row">
          <button
            className="btn danger"
            disabled={busy || confirmWord.trim() !== word}
            onClick={() =>
              void run(async () => {
                await api.deleteAll();
                setConfirmWord("");
                await props.onDataReplaced();
                return null;
              })
            }
          >
            {t("danger_button")}
          </button>
        </div>
      </section>
    </div>
  );
}
