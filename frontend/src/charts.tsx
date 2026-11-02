// Small hand-made SVG charts (no chart library; offline, tiny, RTL-aware).

import { useId } from "react";
import { formatHM, type OverallPoint } from "./plan";

/* ---------- hourglass: how much of today's goal is done ---------- */

export function Hourglass(props: { fraction: number; label: string; size?: number }) {
  const f = Math.min(1, Math.max(0, props.fraction));
  const clip = useId();
  const glass =
    "M14 8 C14 28 28 35 30 43 C28 51 14 58 14 78 L50 78 C50 58 36 51 34 43 C36 35 50 28 50 8 Z";
  const done = f >= 1;
  const sand = done ? "#0F766E" : "#F59E0B";
  const topHeight = (1 - f) * 30;
  const bottomHeight = f * 30;
  const h = props.size ?? 86;
  return (
    <svg width={(h * 64) / 86} height={h} viewBox="0 0 64 86" role="img" aria-label={props.label}>
      <defs>
        <clipPath id={clip}>
          <path d={glass} />
        </clipPath>
      </defs>
      <rect x="8" y="2" width="48" height="6" rx="3" fill={done ? "#0F766E" : "#B45309"} />
      <rect x="8" y="78" width="48" height="6" rx="3" fill={done ? "#0F766E" : "#B45309"} />
      <path d={glass} fill={done ? "#ECFDF5" : "#FFFBEB"} />
      <g clipPath={`url(#${clip})`}>
        <rect x="0" y={43 - topHeight} width="64" height={topHeight} fill={sand} />
        <rect x="0" y={78 - bottomHeight} width="64" height={bottomHeight} fill={sand} />
        {f > 0 && f < 1 && (
          <line
            x1="32"
            y1="42"
            x2="32"
            y2={78 - bottomHeight}
            stroke={sand}
            strokeWidth="2"
            strokeDasharray="2 3"
          />
        )}
      </g>
      <path
        d={glass}
        fill="none"
        stroke={done ? "#0F766E" : "#D97706"}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ---------- overall band over time ---------- */

export function LevelChart(props: {
  points: OverallPoint[];
  target: number;
  label: string;
  targetLabel: string;
  formatDate: (iso: string) => string;
}) {
  const { points, target } = props;
  const W = 340;
  const H = 156;
  const left = 28;
  const right = 332;
  const top = 18;
  const bottom = 124;
  const bands = [...points.map((p) => p.band), target];
  const lo = Math.max(0, Math.floor(Math.min(...bands) - 0.5));
  const hi = Math.min(9, Math.ceil(Math.max(...bands) + 0.5));
  const y = (b: number) => bottom - ((b - lo) / Math.max(1, hi - lo)) * (bottom - top);
  const n = points.length;
  const x = (i: number) => (n <= 1 ? (left + right) / 2 : left + 14 + (i * (right - left - 28)) / (n - 1));
  const grid: number[] = [];
  for (let b = lo; b <= hi; b++) grid.push(b);
  const line = points.map((p, i) => `${x(i)},${y(p.band)}`).join(" ");
  const labelEvery = Math.max(1, Math.ceil(n / 5));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={props.label} style={{ direction: "ltr" }}>
      {grid.map((b) => (
        <g key={b}>
          <line x1={left} y1={y(b)} x2={right} y2={y(b)} stroke="#EEF1F5" />
          <text x="4" y={y(b) + 4} fontSize="11" fill="#6B7280">
            {b}
          </text>
        </g>
      ))}
      <line
        x1={left}
        y1={y(target)}
        x2={right}
        y2={y(target)}
        stroke="#0F766E"
        strokeWidth="1.5"
        strokeDasharray="5 5"
      />
      <text x={right} y={y(target) - 6} fontSize="11" fill="#0F766E" textAnchor="end">
        {props.targetLabel}
      </text>
      {n > 1 && (
        <>
          <path
            d={`M${x(0)},${y(points[0].band)} L${line.split(" ").slice(1).join(" L")} L${x(n - 1)},${bottom} L${x(0)},${bottom} Z`}
            fill="#0F766E"
            fillOpacity="0.08"
          />
          <polyline points={line} fill="none" stroke="#0F766E" strokeWidth="2.5" strokeLinejoin="round" />
        </>
      )}
      {points.map((p, i) => (
        <g key={`${p.date}-${i}`}>
          <circle
            cx={x(i)}
            cy={y(p.band)}
            r="5.5"
            fill={p.kind === "official" ? "#0F766E" : "#FFFFFF"}
            stroke="#0F766E"
            strokeWidth="2.5"
          >
            <title>{`${p.band.toFixed(1)} · ${props.formatDate(p.date)}`}</title>
          </circle>
          {(i % labelEvery === 0 || i === n - 1) && (
            <text x={x(i)} y={H - 8} fontSize="11" fill="#6B7280" textAnchor="middle">
              {props.formatDate(p.date)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

/* ---------- this week's hours ---------- */

export interface DayBar {
  label: string;
  minutes: number;
  state: "past" | "today" | "future";
}

export function WeekBars(props: {
  days: DayBar[];
  targetMinutes: number;
  targetLabel: string;
  label: string;
  rtl: boolean;
}) {
  const W = 340;
  const H = 168;
  const base = 130;
  const topRoom = 36;
  const slot = (W - 16) / 7;
  const barW = Math.min(32, slot - 14);
  const max = Math.max(props.targetMinutes * 1.2, ...props.days.map((d) => d.minutes), 30);
  const height = (m: number) => (m / max) * (base - topRoom);
  const targetY = base - height(props.targetMinutes);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={props.label} style={{ direction: "ltr" }}>
      <line x1="8" y1={targetY} x2={W - 4} y2={targetY} stroke="#D97706" strokeWidth="1.5" strokeDasharray="4 4" />
      {/* label sits over the end of the week, where bars are still short */}
      <text
        x={props.rtl ? 8 : W - 4}
        y={targetY - 6}
        fontSize="11"
        fill="#B45309"
        textAnchor={props.rtl ? "start" : "end"}
      >
        {props.targetLabel}
      </text>
      {props.days.map((d, i) => {
        const pos = props.rtl ? 6 - i : i;
        const cx = 8 + slot * pos + slot / 2;
        const met = d.minutes >= props.targetMinutes && props.targetMinutes > 0;
        const h = height(d.minutes);
        let fill = "#E3E8F0";
        if (d.minutes > 0) {
          if (met) fill = "#0F766E";
          else if (d.state === "today") fill = "#F59E0B";
          else fill = "#F8C77E";
        }
        const shown = Math.max(h, 6);
        return (
          <g key={i}>
            <rect
              x={cx - barW / 2}
              y={base - shown}
              width={barW}
              height={shown}
              rx={Math.min(6, shown / 2)}
              fill={d.state === "future" && d.minutes === 0 ? "#F1F3F6" : fill}
            >
              <title>{`${d.label}: ${formatHM(d.minutes)}`}</title>
            </rect>
            {d.minutes > 0 && (
              <text x={cx} y={base - shown - 5} fontSize="10" fill="#4A5565" textAnchor="middle">
                {formatHM(d.minutes)}
              </text>
            )}
            <text
              x={cx}
              y={base + 18}
              fontSize="11"
              fill={d.state === "today" ? "#1B2330" : "#4A5565"}
              fontWeight={d.state === "today" ? 700 : 400}
              textAnchor="middle"
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- donut ---------- */

export function Donut(props: {
  segments: { value: number; color: string; label: string }[];
  center: string;
  sub: string;
  label: string;
  size?: number;
}) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const total = props.segments.reduce((a, s) => a + s.value, 0) || 1;
  let offset = 0;
  const size = props.size ?? 120;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={props.label}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="#EEF1F5" strokeWidth="16" />
      <g transform="rotate(-90 60 60)">
        {props.segments
          .filter((s) => s.value > 0)
          .map((s) => {
            const len = (s.value / total) * c;
            const el = (
              <circle
                key={s.label}
                cx="60"
                cy="60"
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth="16"
                strokeDasharray={`${Math.max(0, len - 1.5)} ${c}`}
                strokeDashoffset={-offset}
              >
                <title>{s.label}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
      </g>
      <text x="60" y="60" fontSize="20" fontWeight="700" fill="#1B2330" textAnchor="middle">
        {props.center}
      </text>
      <text x="60" y="77" fontSize="11" fill="#4A5565" textAnchor="middle">
        {props.sub}
      </text>
    </svg>
  );
}

/* ---------- one skill on the 4–9 scale ---------- */

export function SkillBar(props: {
  band: number | null;
  target: number;
  color: string;
  estimate: boolean;
  label: string;
}) {
  const pos = (b: number) => `${Math.min(100, Math.max(0, ((b - 4) / 5) * 100))}%`;
  if (props.band === null) {
    return (
      <div className="skillbar empty" role="img" aria-label={props.label}>
        <span className="skillbar-target" style={{ insetInlineStart: pos(props.target) }} />
      </div>
    );
  }
  const fill = props.estimate
    ? `repeating-linear-gradient(135deg, ${props.color} 0 6px, ${props.color}99 6px 12px)`
    : props.color;
  return (
    <div className="skillbar" role="img" aria-label={props.label}>
      <span className="skillbar-fill" style={{ width: pos(props.band), background: fill }} />
      <span className="skillbar-target" style={{ insetInlineStart: pos(props.target) }} />
    </div>
  );
}
