// Reusable form sections for the setup wizard and the settings screen.

import { useId, type ReactNode } from "react";
import { useI18n, type T } from "./i18n";
import { Icon } from "./icons";
import { todayIso } from "./plan";
import {
  SKILLS,
  type ExamFormat,
  type ExplanationLang,
  type LevelEntry,
  type Profile,
  type ProfileInput,
  type Skill,
  type SourceType,
} from "./types";

export function bands(min: number, max: number): number[] {
  const out: number[] = [];
  for (let b = min; b <= max + 1e-9; b += 0.5) out.push(Math.round(b * 2) / 2);
  return out;
}

export { todayIso };

export function Field(props: {
  label: string;
  hint?: string;
  error?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`field${props.error ? " field-error" : ""}`}>
      <span className="field-label row">
        {props.icon}
        {props.label}
      </span>
      {props.children}
      {props.hint && <span className="field-hint">{props.hint}</span>}
      {props.error && (
        <span className="field-message" role="alert">
          {props.error}
        </span>
      )}
    </div>
  );
}

export function BandSelect(props: {
  value: number | null;
  onChange: (value: number | null) => void;
  options: number[];
  emptyLabel?: string;
  label: string;
}) {
  const { formatBand } = useI18n();
  return (
    <select
      aria-label={props.label}
      value={props.value === null ? "" : String(props.value)}
      onChange={(e) => props.onChange(e.target.value === "" ? null : Number(e.target.value))}
    >
      {props.emptyLabel !== undefined && <option value="">{props.emptyLabel}</option>}
      {props.options.map((b) => (
        <option key={b} value={b}>
          {formatBand(b)}
        </option>
      ))}
    </select>
  );
}

/* ---------- goals ---------- */

export interface GoalsDraft {
  target_overall: number;
  custom: boolean;
  targets: Record<Skill, number>;
  minimum_per_skill: number;
  exam_date: string;
}

export function goalsDefault(): GoalsDraft {
  return {
    target_overall: 7,
    custom: false,
    targets: { listening: 7, reading: 7, writing: 7, speaking: 7 },
    minimum_per_skill: 6.5,
    exam_date: "",
  };
}

export function goalsFromProfile(p: Profile): GoalsDraft {
  const targets = {
    listening: p.target_listening,
    reading: p.target_reading,
    writing: p.target_writing,
    speaking: p.target_speaking,
  };
  return {
    target_overall: p.target_overall,
    custom: SKILLS.some((s) => targets[s] !== p.target_overall),
    targets,
    minimum_per_skill: p.minimum_per_skill,
    exam_date: p.exam_date ?? "",
  };
}

export function validateGoals(d: GoalsDraft, t: T): Partial<Record<string, string>> {
  const errors: Partial<Record<string, string>> = {};
  const min = d.minimum_per_skill;
  if (!d.custom && d.target_overall < min) {
    errors.target_overall = t("err_target_below_min", { min: min.toFixed(1) });
  }
  if (d.custom) {
    for (const s of SKILLS) {
      if (d.targets[s] < min) errors[s] = t("err_target_below_min", { min: min.toFixed(1) });
    }
  }
  if (d.exam_date && d.exam_date < todayIso()) errors.exam_date = t("err_exam_past");
  return errors;
}

export function GoalsFields(props: {
  value: GoalsDraft;
  onChange: (d: GoalsDraft) => void;
  errors: Partial<Record<string, string>>;
  showExamDate?: boolean;
}) {
  const { t } = useI18n();
  const d = props.value;
  const set = (patch: Partial<GoalsDraft>) => props.onChange({ ...d, ...patch });
  const customId = useId();
  return (
    <div className="stack">
      <div className="grid-2">
        <Field label={t("field_target_overall")} error={props.errors.target_overall}>
          <BandSelect
            label={t("field_target_overall")}
            value={d.target_overall}
            options={bands(4, 9)}
            onChange={(v) => set({ target_overall: v ?? d.target_overall })}
          />
        </Field>
        <Field label={t("field_minimum")}>
          <BandSelect
            label={t("field_minimum")}
            value={d.minimum_per_skill}
            options={bands(4, 9)}
            onChange={(v) => set({ minimum_per_skill: v ?? d.minimum_per_skill })}
          />
        </Field>
      </div>

      <label className="check" htmlFor={customId}>
        <input
          id={customId}
          type="checkbox"
          checked={d.custom}
          onChange={(e) =>
            set({
              custom: e.target.checked,
              targets: e.target.checked
                ? d.targets
                : { listening: d.target_overall, reading: d.target_overall,
                    writing: d.target_overall, speaking: d.target_overall },
            })
          }
        />
        {t("field_custom_targets")}
      </label>

      {d.custom && (
        <div className="grid-4">
          {SKILLS.map((s) => (
            <Field key={s} label={t(`skill_${s}`)} error={props.errors[s]}>
              <BandSelect
                label={t(`skill_${s}`)}
                value={d.targets[s]}
                options={bands(4, 9)}
                onChange={(v) => set({ targets: { ...d.targets, [s]: v ?? d.targets[s] } })}
              />
            </Field>
          ))}
        </div>
      )}

      {props.showExamDate !== false && (
      <Field label={`${t("field_exam_date")} (${t("optional")})`} error={props.errors.exam_date}>
        <input
          type="date"
          value={d.exam_date}
          min={todayIso()}
          onChange={(e) => set({ exam_date: e.target.value })}
        />
      </Field>
      )}
    </div>
  );
}

/* ---------- study time ---------- */

export interface TimeDraft {
  weekdays: number[]; // 0 = Sunday … 6 = Saturday
  study_minutes_per_day: number;
  explanation_language: ExplanationLang;
}

/** Six days a week with Friday off, two hours a day. */
export function timeDefault(): TimeDraft {
  return { weekdays: [0, 1, 2, 3, 4, 6], study_minutes_per_day: 120, explanation_language: "balanced" };
}

/** Rest days fall on Friday first, then Thursday … (same rule as the planner). */
export function defaultWeekdays(days: number): number[] {
  const rest = [5, 4, 3, 2, 1, 0, 6].slice(0, 7 - Math.max(1, Math.min(7, days)));
  return [0, 1, 2, 3, 4, 5, 6].filter((d) => !rest.includes(d));
}

// Daily study time is chosen in hours: ½ h to 14 h in half-hour steps.
const DAY_MINUTES = Array.from({ length: 28 }, (_, i) => (i + 1) * 30);
// Shown from Saturday, the first day of the week in Egypt.
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

export function WeekdayPicker(props: { value: number[]; onChange: (days: number[]) => void }) {
  const { t } = useI18n();
  const names = t("weekday_short").split(",");
  return (
    <div className="weekday-picker" role="group" aria-label={t("field_days")}>
      {WEEK_ORDER.map((d, i) => {
        const on = props.value.includes(d);
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            className={on ? "on" : ""}
            onClick={() => {
              const next = on ? props.value.filter((x) => x !== d) : [...props.value, d];
              if (next.length > 0) props.onChange(next.sort((a, b) => a - b));
            }}
          >
            {names[i]}
          </button>
        );
      })}
    </div>
  );
}

export function TimeFields(props: {
  value: TimeDraft;
  onChange: (d: TimeDraft) => void;
  hideExplanation?: boolean;
}) {
  const { t, formatHours, formatDays } = useI18n();
  const d = props.value;
  const set = (patch: Partial<TimeDraft>) => props.onChange({ ...d, ...patch });
  return (
    <div className="stack">
      <Field
        label={t("field_days")}
        hint={t("field_days_hint", { days: formatDays(d.weekdays.length) })}
        icon={<Icon name="calendar" color="#1D4ED8" />}
      >
        <WeekdayPicker value={d.weekdays} onChange={(weekdays) => set({ weekdays })} />
      </Field>
      <Field label={t("field_hours")} icon={<Icon name="clock" color="#B45309" />}>
        <select
          value={d.study_minutes_per_day}
          onChange={(e) => set({ study_minutes_per_day: Number(e.target.value) })}
        >
          {DAY_MINUTES.map((n) => (
            <option key={n} value={n}>
              {formatHours(n)}
            </option>
          ))}
        </select>
      </Field>
      {!props.hideExplanation && (
        <Field label={t("field_explanation")}>
          <div className="segmented" role="radiogroup">
            {(["ar_heavy", "balanced", "en_heavy"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={d.explanation_language === v}
                className={d.explanation_language === v ? "active" : ""}
                onClick={() => set({ explanation_language: v })}
              >
                {t(`expl_${v}`)}
              </button>
            ))}
          </div>
        </Field>
      )}
      <p className="muted">
        {t("weekly_hours", { hours: formatHours(d.weekdays.length * d.study_minutes_per_day) })}
      </p>
    </div>
  );
}

export function toProfileInput(
  base: { display_name: string; interface_language: "ar" | "en" },
  goals: GoalsDraft,
  time: TimeDraft,
): ProfileInput {
  const input: ProfileInput = {
    display_name: base.display_name.trim() || null,
    interface_language: base.interface_language,
    explanation_language: time.explanation_language,
    target_overall: goals.target_overall,
    minimum_per_skill: goals.minimum_per_skill,
    exam_date: goals.exam_date || null,
    study_days_per_week: time.weekdays.length,
    study_minutes_per_day: time.study_minutes_per_day,
  };
  if (goals.custom) {
    input.target_listening = goals.targets.listening;
    input.target_reading = goals.targets.reading;
    input.target_writing = goals.targets.writing;
    input.target_speaking = goals.targets.speaking;
  }
  return input;
}

/* ---------- levels ---------- */

export interface LevelDraft {
  band: number | null;
  source_type: SourceType;
  source_note: string;
}
export type LevelsDraft = Record<Skill, LevelDraft>;

export function levelsDefault(): LevelsDraft {
  const one = (): LevelDraft => ({ band: null, source_type: "self_estimate", source_note: "" });
  return { listening: one(), reading: one(), writing: one(), speaking: one() };
}

export function validateLevels(d: LevelsDraft, t: T): Partial<Record<Skill, string>> {
  const errors: Partial<Record<Skill, string>> = {};
  for (const s of SKILLS) {
    const l = d[s];
    if (l.band !== null && l.source_type !== "self_estimate" && !l.source_note.trim()) {
      errors[s] = t("err_note_required");
    }
  }
  return errors;
}

export function levelsToEntries(d: LevelsDraft): LevelEntry[] {
  return SKILLS.filter((s) => d[s].band !== null).map((s) => ({
    skill: s,
    band: d[s].band as number,
    source_type: d[s].source_type,
    source_note: d[s].source_note.trim(),
  }));
}

export function LevelsFields(props: {
  value: LevelsDraft;
  onChange: (d: LevelsDraft) => void;
  errors: Partial<Record<Skill, string>>;
}) {
  const { t } = useI18n();
  const d = props.value;
  const set = (s: Skill, patch: Partial<LevelDraft>) =>
    props.onChange({ ...d, [s]: { ...d[s], ...patch } });
  return (
    <div className="levels-table">
      {SKILLS.map((s) => (
        <div className="level-row" key={s}>
          <span className="level-skill">{t(`skill_${s}`)}</span>
          <BandSelect
            label={t(`skill_${s}`)}
            value={d[s].band}
            options={bands(1, 9)}
            emptyLabel={t("level_unknown")}
            onChange={(v) => set(s, { band: v })}
          />
          <select
            aria-label={t("field_source")}
            value={d[s].source_type}
            disabled={d[s].band === null}
            onChange={(e) => set(s, { source_type: e.target.value as SourceType })}
          >
            {(["official_practice", "external_marker", "self_estimate"] as const).map((v) => (
              <option key={v} value={v}>
                {t(`source_${v}`)}
              </option>
            ))}
          </select>
          <input
            aria-label={t("field_source_note")}
            placeholder={t("field_source_note")}
            value={d[s].source_note}
            maxLength={200}
            disabled={d[s].band === null}
            onChange={(e) => set(s, { source_note: e.target.value })}
          />
          {props.errors[s] && (
            <span className="field-message level-error" role="alert">
              {props.errors[s]}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** D-037: computer or paper exam (picks the format videos and the final-days tests). */
export function ExamFormatPicker(props: {
  value: ExamFormat | null;
  onChange: (value: ExamFormat) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="stack-xs">
      <span className="field-label">{t("fmt_title")}</span>
      <div className="segmented" role="radiogroup" aria-label={t("fmt_title")}>
        {(["computer", "paper"] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={props.value === f}
            className={props.value === f ? "active" : ""}
            onClick={() => props.onChange(f)}
          >
            {t(`fmt_${f}`)}
          </button>
        ))}
      </div>
      <span className="muted small">{t("fmt_body")}</span>
    </div>
  );
}
