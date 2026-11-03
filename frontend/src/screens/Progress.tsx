// v0.0.14 (owner, 2026-11-03, D-044): «تقدّمي» — every level entry of each skill (tests,
// the AI tutor, estimates, each marked as what it is), the right answers by question type,
// the recent tests and the lab answers the tutor marked.

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { LevelChart } from "../charts";
import { useI18n } from "../i18n";
import { Icon, SkillBadge } from "../icons";
import { dayKey } from "../plan";
import { PROVIDER_LABEL, qtypeLabel } from "../tests";
import { SKILLS, type Profile, type ProgressData, type Skill } from "../types";
import { savedLine } from "./Tests";

const OFFICIAL = new Set(["official_practice", "external_marker"]);

function SkillCard(props: { skill: Skill; data: ProgressData; target: number }) {
  const { t, formatShortDate, formatBand } = useI18n();
  const entries = props.data.levels.filter((l) => l.skill === props.skill);
  const latest = entries[entries.length - 1] ?? null;
  // one point per day (the last entry of the day), solid for official material
  const byDay = new Map<string, { date: string; band: number; kind: "official" | "estimate" }>();
  for (const e of entries) {
    const date = dayKey(new Date(e.recorded_at));
    byDay.set(date, {
      date,
      band: e.band,
      kind: OFFICIAL.has(e.source_type) ? "official" : "estimate",
    });
  }
  const points = [...byDay.values()].map((p) => ({ ...p, source: "skills" as const }));
  return (
    <section className="card stack-xs progress-skill">
      <div className="row">
        <SkillBadge skill={props.skill} />
        <h3>{t(`skill_${props.skill}`)}</h3>
        <span className="spacer" />
        <span className="huge teal">{formatBand(latest?.band)}</span>
      </div>
      {latest && (
        <span className="muted small">
          {t(`source_${latest.source_type}`)}
          {latest.source_note ? (
            <>
              {" · "}
              <bdi dir="auto">{latest.source_note}</bdi>
            </>
          ) : null}
        </span>
      )}
      {points.length > 0 ? (
        <LevelChart
          points={points}
          target={props.target}
          label={t("pr_chart_label", { skill: t(`skill_${props.skill}`) })}
          targetLabel={t("home_target_line", { b: formatBand(props.target) })}
          formatDate={formatShortDate}
        />
      ) : (
        <p className="muted small">{t("pr_no_levels")}</p>
      )}
      {entries.length > 1 && (
        <details>
          <summary className="small">{t("pr_all_entries", { n: entries.length })}</summary>
          <ul className="plain-list small">
            {[...entries].reverse().map((e) => (
              <li key={e.id}>
                <bdi dir="ltr">{e.band.toFixed(1)}</bdi> · {formatShortDate(dayKey(new Date(e.recorded_at)))}{" "}
                · {t(`source_${e.source_type}`)}
                {e.source_note ? (
                  <>
                    {" · "}
                    <bdi dir="auto">{e.source_note}</bdi>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function QuestionTypes(props: { data: ProgressData }) {
  const { t } = useI18n();
  const rows = props.data.question_types;
  return (
    <section className="card stack">
      <h2 className="row">
        <Icon name="target" color="#B45309" /> {t("pr_types_title")}
      </h2>
      <p className="muted small">{t("pr_types_note")}</p>
      {rows.length === 0 ? (
        <p className="note small">{t("pr_types_empty")}</p>
      ) : (
        (["listening", "reading"] as const).map((skill) => {
          const list = rows
            .filter((r) => r.skill === skill)
            .sort((a, b) => {
              const pa = a.total ? a.correct / a.total : 1;
              const pb = b.total ? b.correct / b.total : 1;
              return pa - pb || b.wrong_in_full - a.wrong_in_full;
            });
          if (list.length === 0) return null;
          return (
            <div key={skill} className="stack-xs">
              <strong>{t(`skill_${skill}`)}</strong>
              {list.map((r) => {
                const pct = r.total ? Math.round((r.correct / r.total) * 100) : null;
                return (
                  <div key={r.qtype} className="qtype-row">
                    <span dir="ltr" className="qtype-name">
                      {qtypeLabel(skill, r.qtype)}
                    </span>
                    <div className="meter" aria-hidden="true">
                      <span
                        className={pct !== null && pct < 60 ? "low" : ""}
                        style={{ width: `${pct ?? 0}%` }}
                      />
                    </div>
                    <span className="small qtype-figures">
                      {pct !== null && (
                        <bdi dir="ltr">
                          {r.correct}/{r.total} ({pct}%)
                        </bdi>
                      )}
                      {pct !== null && r.wrong_in_full > 0 && " · "}
                      {r.wrong_in_full > 0 && (
                        <span className="muted">{t("pr_wrong_in_full", { n: r.wrong_in_full })}</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })
      )}
    </section>
  );
}

export function ProgressScreen(props: { profile: Profile; onLevelsChanged: () => void }) {
  const { t, formatShortDate } = useI18n();
  const [data, setData] = useState<ProgressData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api
      .progress()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : String(e)));
  }, []);
  useEffect(() => load(), [load]);

  if (error) return <p className="page error-box">{error}</p>;
  if (!data) return <div className="page"><div className="spinner" aria-hidden="true" /></div>;
  const targets: Record<Skill, number> = {
    listening: props.profile.target_listening,
    reading: props.profile.target_reading,
    writing: props.profile.target_writing,
    speaking: props.profile.target_speaking,
  };

  return (
    <div className="page wide stack-lg">
      <header className="stack-xs">
        <h1>{t("pr_title")}</h1>
        <p className="muted">{t("pr_lead", { n: data.tests_done })}</p>
        <div className="legend">
          <span>
            <i className="dot solid" /> {t("pr_legend_official")}
          </span>
          <span>
            <i className="dot hollow" /> {t("pr_legend_other")}
          </span>
        </div>
      </header>

      <div className="progress-grid">
        {SKILLS.map((s) => (
          <SkillCard key={s} skill={s} data={data} target={targets[s]} />
        ))}
      </div>

      <QuestionTypes data={data} />

      <section className="card stack">
        <h2 className="row">
          <Icon name="flag" color="#DC2626" /> {t("pr_tests_title")}
        </h2>
        {data.results.length === 0 ? (
          <p className="note small">{t("pr_tests_empty")}</p>
        ) : (
          <div className="stack-xs">
            {data.results.map((r) => (
              <div key={r.id} className="history-row static">
                <span>{formatShortDate(dayKey(new Date(r.created_at)))}</span>
                <span dir="ltr" className="grow">
                  {r.title}
                </span>
                <span className={`pill ${r.kind === "full" ? "pill-ok" : ""}`}>
                  {r.kind === "sample" ? t("tq_sample") : r.skill === "full" ? t("tq_mock") : t("tq_full")}
                </span>
                <span className="small">{savedLine(r, t)}</span>
                <span className="muted small" dir="ltr">
                  {PROVIDER_LABEL[r.provider] ?? r.provider}
                </span>
                <button
                  className="btn subtle small"
                  title={t("pr_delete_result")}
                  onClick={async () => {
                    await api.practiceDelete(r.id);
                    load();
                    props.onLevelsChanged();
                  }}
                >
                  <Icon name="trash" size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card stack">
        <h2 className="row">
          <Icon name="pen" color="#BE185D" /> {t("pr_labs_title")}
        </h2>
        {data.labs.length === 0 ? (
          <p className="note small">{t("pr_labs_empty")}</p>
        ) : (
          <div className="stack-xs">
            {data.labs.map((a, i) => (
              <div key={`${a.kind}-${i}`} className="history-row static">
                <span>{formatShortDate(dayKey(new Date(a.created_at)))}</span>
                <span>
                  {a.kind === "writing" ? `Writing Task ${a.task}` : `Speaking Part ${a.part}`}
                </span>
                <span dir="auto" className="grow muted small">
                  {a.test_title || a.prompt.slice(0, 80)}
                </span>
                <span className="pill">{t("lab_opinion_short", { band: a.overall.toFixed(1) })}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
