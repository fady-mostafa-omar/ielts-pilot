// Home (v0.1 Sprint 1a): goals, current levels with their sources, exam countdown.
// The "Today" task screen replaces the bottom card in Sprint 2.

import { useI18n } from "../i18n";
import { SKILLS, type Levels, type Profile } from "../types";
import { todayIso } from "../forms";

function daysUntil(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  const [ty, tm, td] = todayIso().split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000);
}

export function HomeScreen(props: {
  profile: Profile;
  levels: Levels | null;
  onOpenSettings: () => void;
}) {
  const { t, formatBand, formatDate } = useI18n();
  const { profile, levels } = props;
  const lowConfidence = SKILLS.some((s) => {
    const level = levels?.current[s];
    return !level || level.source_type === "self_estimate";
  });
  const examDays = profile.exam_date ? daysUntil(profile.exam_date) : null;

  return (
    <div className="page stack-lg">
      <header>
        <h1>
          {profile.display_name
            ? t("home_hello", { name: profile.display_name })
            : t("home_hello_anon")}
        </h1>
      </header>

      <div className="grid-2">
        <section className="card">
          <h2>{t("home_exam")}</h2>
          {examDays === null ? (
            <p className="big muted">{t("home_no_exam")}</p>
          ) : (
            <>
              <p className="big">
                {examDays === 0 ? t("home_exam_today") : t("home_days_left", { n: examDays })}
              </p>
              <p className="muted">{formatDate(profile.exam_date)}</p>
            </>
          )}
        </section>
        <section className="card">
          <h2>{t("home_week")}</h2>
          <p className="big">
            {t("weekly_minutes", { m: profile.study_days_per_week * profile.study_minutes_per_day })}
          </p>
          <p className="muted">
            {t("home_week_detail", {
              d: profile.study_days_per_week,
              m: profile.study_minutes_per_day,
            })}
          </p>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>{t("home_levels")}</h2>
          <span className="muted">
            {t("home_targets")}: {t("home_overall")} {formatBand(profile.target_overall)} ·{" "}
            {t("home_minimum", { min: formatBand(profile.minimum_per_skill) })}
          </span>
        </div>
        <table className="skills-table">
          <tbody>
            {SKILLS.map((s) => {
              const level = levels?.current[s] ?? null;
              const target = profile[`target_${s}`];
              const gap = level ? Math.max(target - level.band, 0) : null;
              return (
                <tr key={s}>
                  <th scope="row">{t(`skill_${s}`)}</th>
                  <td>
                    <span className="band">{formatBand(level?.band)}</span>
                    {level && (
                      <span
                        className={`tag ${level.source_type === "self_estimate" ? "tag-warn" : ""}`}
                        title={level.source_note}
                      >
                        {level.source_type === "self_estimate"
                          ? t("home_self_tag")
                          : t(`source_${level.source_type}`)}
                      </span>
                    )}
                    {!level && <span className="muted"> {t("not_set")}</span>}
                  </td>
                  <td className="arrow" aria-hidden="true">
                    →
                  </td>
                  <td>
                    <span className="band">{formatBand(target)}</span>
                  </td>
                  <td className="gap">
                    {gap === null
                      ? ""
                      : gap === 0
                        ? t("home_reached")
                        : `${t("home_gap")} ${formatBand(gap)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {lowConfidence && <p className="note">{t("home_low_confidence")}</p>}
      </section>

      <section className="card card-soft">
        <h2>{t("home_next_title")}</h2>
        <p>{t("home_next_body")}</p>
        <button className="btn" onClick={props.onOpenSettings}>
          {t("edit_in_settings")}
        </button>
      </section>
    </div>
  );
}
