// Settings: goals and time, level history, data and backups (PRD F1 edit, F12).

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";
import {
  Field,
  GoalsFields,
  LevelsFields,
  TimeFields,
  defaultWeekdays,
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
import { Icon } from "../icons";
import {
  SKILLS,
  type AppSettings,
  type BackupInfo,
  type Lang,
  type Levels,
  type Placement,
  type PlacementTest,
  type Profile,
  type ReleaseInfo,
  type SourceType,
  type SystemInfo,
  type UpdateState,
} from "../types";
import { PlacementCards } from "./Placement";
import type { StudyTarget } from "./Study";

export type SettingsTab = "profile" | "levels" | "accounts" | "update" | "data";

// Sites the owner may want to stay signed in to inside the study panel.
const SITES = [
  { id: "dalilk", name: "Dalilk", url: "https://dalilk.com/", use: "acc_use_dalilk" },
  { id: "engnovate", name: "engnovate", url: "https://engnovate.com/", use: "acc_use_engnovate" },
  { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com/", use: "acc_use_ai" },
  { id: "claude", name: "Claude", url: "https://claude.ai/", use: "acc_use_ai" },
  { id: "gemini", name: "Gemini", url: "https://gemini.google.com/", use: "acc_use_ai" },
] as const;

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
  settings: AppSettings;
  initialTab?: SettingsTab;
  onProfileSaved: (p: Profile) => void;
  onLevelsChanged: (l: Levels) => void;
  onSettingsChanged: (s: AppSettings) => void;
  onDataReplaced: () => Promise<void>;
  onOpenTest: (test: PlacementTest) => void;
  onOpenSite: (target: StudyTarget) => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<SettingsTab>(props.initialTab ?? "profile");
  return (
    <div className="page stack-lg">
      <h1>{t("settings_title")}</h1>
      <div className="tabs" role="tablist">
        {(["profile", "levels", "accounts", "update", "data"] as const).map((k) => (
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
        <ProfileTab
          profile={props.profile}
          settings={props.settings}
          onSaved={props.onProfileSaved}
          onSettingsChanged={props.onSettingsChanged}
        />
      )}
      {tab === "update" && <UpdateTab />}
      {tab === "levels" && (
        <LevelsTab
          levels={props.levels}
          onChanged={props.onLevelsChanged}
          onOpenTest={props.onOpenTest}
        />
      )}
      {tab === "accounts" && (
        <AccountsTab
          settings={props.settings}
          onChanged={props.onSettingsChanged}
          onOpenSite={props.onOpenSite}
        />
      )}
      {tab === "data" && <DataTab onDataReplaced={props.onDataReplaced} />}
    </div>
  );
}

function ProfileTab(props: {
  profile: Profile;
  settings: AppSettings;
  onSaved: (p: Profile) => void;
  onSettingsChanged: (s: AppSettings) => void;
}) {
  const { t } = useI18n();
  const p = props.profile;
  const [name, setName] = useState(p.display_name ?? "");
  const [lang, setLang] = useState<Lang>(p.interface_language);
  const [goals, setGoals] = useState<GoalsDraft>(() => goalsFromProfile(p));
  const [time, setTime] = useState<TimeDraft>({
    weekdays:
      props.settings.study_weekdays && props.settings.study_weekdays.length === p.study_days_per_week
        ? props.settings.study_weekdays
        : defaultWeekdays(p.study_days_per_week),
    study_minutes_per_day: p.study_minutes_per_day,
    explanation_language: p.explanation_language,
  });
  const [perBand, setPerBand] = useState(props.settings.hours_per_band ?? 200);
  const [breakEvery, setBreakEvery] = useState(props.settings.break_every_minutes ?? 50);
  const [breakMinutes, setBreakMinutes] = useState(props.settings.break_minutes ?? 10);
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
      props.onSettingsChanged(
        await api.saveSettings({
          study_weekdays: time.weekdays,
          hours_per_band: perBand,
          break_every_minutes: breakEvery,
          break_minutes: breakMinutes,
        }),
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
      <section className="card stack">
        <h2>{t("set_plan_title")}</h2>
        <div className="grid-3">
          <Field label={t("est_per_band")} hint={t("est_per_band_hint")}>
            <input
              type="number"
              min={50}
              max={600}
              step={10}
              value={perBand}
              onChange={(e) => setPerBand(Math.min(600, Math.max(50, Number(e.target.value) || 200)))}
            />
          </Field>
          <Field label={t("set_break_every")} icon={<Icon name="coffee" color="#0F766E" />}>
            <select value={breakEvery} onChange={(e) => setBreakEvery(Number(e.target.value))}>
              {[25, 30, 40, 50, 60, 75, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {t("n_minutes", { n: m })}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("set_break_len")}>
            <select value={breakMinutes} onChange={(e) => setBreakMinutes(Number(e.target.value))}>
              {[3, 5, 7, 10, 15, 20, 30].map((m) => (
                <option key={m} value={m}>
                  {t("n_minutes", { n: m })}
                </option>
              ))}
            </select>
          </Field>
        </div>
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

function LevelsTab(props: {
  levels: Levels | null;
  onChanged: (l: Levels) => void;
  onOpenTest: (test: PlacementTest) => void;
}) {
  const { t, formatBand, formatDate } = useI18n();
  const [placements, setPlacements] = useState<Placement[]>([]);
  useEffect(() => {
    void api.placements().then(setPlacements);
  }, []);
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

  const sourceLabel = (s: SourceType) => t(`source_${s}`);

  return (
    <div className="stack-lg">
      <section className="card stack">
        <h2>{t("tests_title")}</h2>
        <p className="muted">{t("tests_body")}</p>
        <PlacementCards placements={placements} onOpen={props.onOpenTest} />
      </section>
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

function AccountsTab(props: {
  settings: AppSettings;
  onChanged: (s: AppSettings) => void;
  onOpenSite: (target: StudyTarget) => void;
}) {
  const { t } = useI18n();
  const bridge = window.ipBridge;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const keep = props.settings.web_keep_signin === true;

  async function setKeep(value: boolean) {
    setBusy(true);
    try {
      props.onChanged(await api.saveSettings({ web_keep_signin: value }));
      if (!value && bridge) await bridge.clearWebData();
      setMessage(value ? t("acc_keep_on") : t("acc_keep_off"));
    } catch (e) {
      setMessage(t("err_generic", { msg: errorText(e) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack-lg">
      <section className="card stack">
        <h2 className="row">
          <Icon name="key" color="#1D4ED8" /> {t("acc_title")}
        </h2>
        <label className="check">
          <input
            type="checkbox"
            checked={keep}
            disabled={busy}
            onChange={(e) => void setKeep(e.target.checked)}
          />
          <strong>{t("consent_label")}</strong>
        </label>
        <p className="muted small">{t("consent_body")}</p>
        {message && <p className="ok small">{message}</p>}
      </section>

      <section className="card stack">
        <h2>{t("acc_sites")}</h2>
        <p className="muted small">{keep ? t("acc_sites_hint_keep") : t("acc_sites_hint_temp")}</p>
        <ul className="site-list">
          {SITES.map((site) => (
            <li key={site.id}>
              <span className="skill-badge" style={{ background: "#EEF1F5", width: 36, height: 36 }}>
                <Icon name="globe" color="#475569" />
              </span>
              <div className="grow stack-xs">
                <strong dir="ltr" className="self-start">{site.name}</strong>
                <span className="muted small">{t(site.use)}</span>
              </div>
              <button
                className="btn small"
                onClick={() =>
                  props.onOpenSite({
                    title: site.name,
                    target: { url: site.url },
                    resource: null,
                    skill: "general",
                    activityCode: null,
                    timer: false,
                  })
                }
              >
                {t("acc_open")}
              </button>
            </li>
          ))}
        </ul>
        <p className="note small">{t("acc_google_note")}</p>
      </section>

      <section className="card stack">
        <h2>{t("acc_clear_title")}</h2>
        <p className="muted small">{t("acc_clear_body")}</p>
        <div className="row">
          <button
            className="btn"
            disabled={busy || !bridge}
            onClick={async () => {
              if (!bridge) return;
              setBusy(true);
              try {
                await bridge.clearWebData();
                setMessage(t("acc_cleared"));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("acc_clear_btn")}
          </button>
        </div>
      </section>
    </div>
  );
}

function UpdateTab() {
  const { t, formatDate } = useI18n();
  const bridge = window.ipBridge;
  const [state, setState] = useState<UpdateState | null>(null);
  const [releases, setReleases] = useState<ReleaseInfo[] | null>(null);
  const [chosen, setChosen] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    void bridge.updates.state().then(setState);
    return bridge.updates.onState(setState);
  }, [bridge]);

  if (!bridge) return <p className="muted">{t("bridge_missing")}</p>;
  if (!state) return <div className="spinner" aria-hidden="true" />;
  if (state.status === "unsupported") return <p className="muted">{t("upd_unsupported")}</p>;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const chosenRelease = releases?.find((r) => r.version === chosen) ?? null;
  const older = chosen !== "" && compareVersions(chosen, state.current) < 0;

  return (
    <div className="stack-lg">
      <section className="card stack">
        <h2 className="row">
          <Icon name="download" color="#1D4ED8" /> {t("upd_title")}
        </h2>
        <p>
          {t("upd_current")} <strong dir="ltr">{state.current}</strong>
        </p>
        {state.status === "checking" && <p className="muted">{t("upd_checking")}</p>}
        {state.status === "none" && <p className="ok">{t("upd_latest")}</p>}
        {state.status === "error" && (
          <p className="error-box">
            {t("upd_error")} <bdi dir="ltr">{state.error}</bdi>
          </p>
        )}
        {state.status === "available" && (
          <div className="stack">
            <p className="ok-box">
              {state.downgrade
                ? t("upd_ready_older", { v: state.version ?? "" })
                : t("upd_available", { v: state.version ?? "" })}
            </p>
            {state.notes && <pre className="release-notes">{state.notes}</pre>}
            <button
              className="btn primary self-start"
              disabled={busy}
              onClick={() => void run(() => bridge.updates.download())}
            >
              <Icon name="download" size={16} /> {t("upd_download", { v: state.version ?? "" })}
            </button>
          </div>
        )}
        {state.status === "downloading" && (
          <div className="stack-xs">
            <span>{t("upd_downloading", { p: state.percent })}</span>
            <div className="meter" aria-hidden="true">
              <span style={{ width: `${state.percent}%` }} />
            </div>
          </div>
        )}
        {state.status === "downloaded" && (
          <div className="stack">
            <p className="ok-box">{t("upd_downloaded", { v: state.version ?? "" })}</p>
            <button
              className="btn primary self-start"
              onClick={() => void bridge.updates.install()}
            >
              {t("upd_install")}
            </button>
          </div>
        )}
        {["idle", "none", "error"].includes(state.status) && (
          <button
            className="btn self-start"
            disabled={busy}
            onClick={() => void run(() => bridge.updates.check())}
          >
            {t("upd_check")}
          </button>
        )}
        <p className="muted small">{t("upd_how")}</p>
      </section>

      <section className="card stack">
        <h2>{t("upd_pick_title")}</h2>
        <p className="muted small">{t("upd_pick_body")}</p>
        {releases === null ? (
          <button
            className="btn self-start"
            disabled={busy}
            onClick={() => void run(async () => setReleases(await bridge.updates.releases()))}
          >
            {t("upd_list")}
          </button>
        ) : releases.length === 0 ? (
          <p className="muted">{t("upd_none_published")}</p>
        ) : (
          <>
            <select value={chosen} onChange={(e) => setChosen(e.target.value)}>
              <option value="">{t("upd_choose")}</option>
              {releases.map((r) => (
                <option key={r.version} value={r.version} disabled={r.version === state.current}>
                  {r.version} · {formatDate(r.publishedAt)}
                  {r.version === state.current ? ` (${t("upd_installed")})` : ""}
                </option>
              ))}
            </select>
            {chosenRelease?.notes && <pre className="release-notes">{chosenRelease.notes}</pre>}
            {older && <p className="note small">{t("upd_older_warning")}</p>}
            <button
              className="btn self-start"
              disabled={busy || !chosen}
              onClick={() =>
                void run(async () => {
                  if (older) await api.createBackup();
                  await bridge.updates.check(chosen);
                })
              }
            >
              {t("upd_get_version", { v: chosen || "…" })}
            </button>
          </>
        )}
      </section>
      {error && <p className="error-box">{error}</p>}
    </div>
  );
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}
