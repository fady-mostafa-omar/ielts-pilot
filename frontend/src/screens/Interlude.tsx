// One-minute pause between two tasks of the day (owner's request, v0.0.6): an original
// illustration, a line of encouragement written for the app (no quotes attributed to
// anyone), today's progress and what comes next. "Next" opens after the countdown.

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { Icon } from "../icons";
import { formatClock } from "../plan";

const CHEERS: { ar: string; en: string }[] = [
  { ar: "كل حلقة بتسمعها بتقرّبك خطوة من هدفك.", en: "Every episode you hear is one step closer to your goal." },
  { ar: "الاستمرار أهم من السرعة — يوم بيوم.", en: "Steady beats fast — one day at a time." },
  { ar: "اللي بتتعلمه النهارده هيبان في الامتحان.", en: "What you learn today shows up on exam day." },
  { ar: "ولا حد بدأ وهو شاطر — الشطارة بتيجي من التمرين.", en: "Nobody starts good — practice makes you good." },
  { ar: "خلّصت مهمة؟ ده إنجاز. خد نفس وكمّل.", en: "A task done is a win. Breathe, then carry on." },
  { ar: "الكلمة اللي بتكتبها النهارده هتطلع منك لوحدها بعدين.", en: "The word you note today will come out on its own later." },
  { ar: "انت مش بتذاكر للامتحان بس — انت بتبني لغة هتعيش معاك.", en: "You're not only studying for a test — you're building a language for life." },
  { ar: "الغلط جزء من التعلّم — كل غلطة بتعلّمك حاجة.", en: "Mistakes are part of learning — each one teaches you something." },
  { ar: "خطوة صغيرة كل يوم أحسن من قفزة كبيرة مرة واحدة.", en: "A small step every day beats one big jump." },
  { ar: "ركّز في المهمة اللي جاية بس — مش في الطريق كله.", en: "Focus on the next task only — not the whole road." },
  { ar: "انت أحسن من امبارح، حتى لو مش حاسس بده.", en: "You're better than yesterday, even if it doesn't feel like it." },
  { ar: "الامتحان بيكافئ اللي اتمرّن، مش اللي اتوتّر.", en: "The exam rewards practice, not worry." },
  { ar: "اشرب مية، فرّد ضهرك، وكمّل.", en: "Drink some water, straighten up, and go on." },
  { ar: "كل دقيقة تركيز بتتحسب.", en: "Every focused minute counts." },
  { ar: "التكنيك بيتعلّم، والطلاقة بتتبني بالوقت.", en: "Technique is learned; fluency is built over time." },
  { ar: "قارن نفسك بنفسك من شهر، مش بحد تاني.", en: "Compare yourself with you a month ago, not with anyone else." },
  { ar: "كل مهمة بتخلّصها = ثقة زيادة يوم الامتحان.", en: "Every task you finish is more confidence on exam day." },
  { ar: "ودنك كل يوم بتتعوّد على الإنجليزي أكتر.", en: "Your ears get more used to English every day." },
  { ar: "مش لازم يبقى كامل — المهم إنك كمّلت.", en: "It doesn't have to be perfect — what matters is you kept going." },
  { ar: "انت اخترت تذاكر النهارده بدل ما تأجّل. ده أهم قرار.", en: "You chose to study today instead of putting it off. That's the big decision." },
];

type Scene = (props: { id: string }) => React.ReactElement;

const SCENES: Scene[] = [
  // sunrise over hills
  ({ id }) => (
    <svg viewBox="0 0 240 160" role="presentation">
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FDE68A" />
          <stop offset="1" stopColor="#FDBA74" />
        </linearGradient>
      </defs>
      <rect width="240" height="160" rx="20" fill={`url(#${id}s)`} />
      <circle className="il-rise" cx="120" cy="100" r="34" fill="#F97316" />
      <path d="M0 112 Q60 78 120 108 T240 96 V160 H0Z" fill="#22C55E" />
      <path d="M0 132 Q70 104 150 128 T240 120 V160 H0Z" fill="#15803D" />
      <path d="M40 46 l10 0 M45 41 l0 10 M196 36 l8 0 M200 32 l0 8" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  ),
  // a plant growing
  ({ id }) => (
    <svg viewBox="0 0 240 160" role="presentation">
      <defs>
        <linearGradient id={`${id}p`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#DCFCE7" />
          <stop offset="1" stopColor="#BAE6FD" />
        </linearGradient>
      </defs>
      <rect width="240" height="160" rx="20" fill={`url(#${id}p)`} />
      <path d="M92 118 h56 l-8 32 h-40z" fill="#EA580C" />
      <rect x="88" y="110" width="64" height="12" rx="4" fill="#C2410C" />
      <path className="il-sway" d="M120 112 V64" stroke="#15803D" strokeWidth="5" strokeLinecap="round" />
      <path className="il-sway" d="M120 86 C100 84 88 70 90 56 C106 58 118 70 120 86Z" fill="#22C55E" />
      <path className="il-sway" d="M120 74 C138 72 150 58 148 44 C132 46 122 58 120 74Z" fill="#16A34A" />
      <circle cx="170" cy="40" r="5" fill="#FACC15" />
      <circle cx="62" cy="50" r="4" fill="#FACC15" />
      <circle cx="184" cy="76" r="3" fill="#FACC15" />
    </svg>
  ),
  // mountain with a flag
  ({ id }) => (
    <svg viewBox="0 0 240 160" role="presentation">
      <defs>
        <linearGradient id={`${id}m`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#BFDBFE" />
          <stop offset="1" stopColor="#E0E7FF" />
        </linearGradient>
      </defs>
      <rect width="240" height="160" rx="20" fill={`url(#${id}m)`} />
      <path d="M20 150 L110 36 L200 150Z" fill="#6366F1" />
      <path d="M110 36 L132 64 L118 60 L106 70 L96 56Z" fill="#fff" />
      <path d="M130 150 L180 82 L230 150Z" fill="#818CF8" />
      <path d="M110 36 V12" stroke="#1E293B" strokeWidth="3" strokeLinecap="round" />
      <path className="il-wave" d="M110 12 h22 l-6 6 l6 6 h-22z" fill="#EF4444" />
      <path d="M44 150 C70 128 84 120 100 98" stroke="#FDE68A" strokeWidth="3" strokeDasharray="4 6" fill="none" />
    </svg>
  ),
  // rocket
  ({ id }) => (
    <svg viewBox="0 0 240 160" role="presentation">
      <defs>
        <linearGradient id={`${id}r`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1E3A8A" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <rect width="240" height="160" rx="20" fill={`url(#${id}r)`} />
      <g fill="#fff">
        <circle cx="40" cy="30" r="2" />
        <circle cx="200" cy="44" r="2.5" />
        <circle cx="70" cy="120" r="1.8" />
        <circle cx="186" cy="118" r="2" />
        <circle cx="150" cy="22" r="1.6" />
      </g>
      <g className="il-float">
        <path d="M120 24 C140 44 144 76 138 104 H102 C96 76 100 44 120 24Z" fill="#F8FAFC" />
        <circle cx="120" cy="66" r="11" fill="#38BDF8" stroke="#1E3A8A" strokeWidth="3" />
        <path d="M102 92 L86 112 L102 108Z M138 92 L154 112 L138 108Z" fill="#F43F5E" />
        <path d="M108 106 Q120 140 132 106Z" fill="#FB923C" />
        <path d="M113 106 Q120 128 127 106Z" fill="#FDE047" />
      </g>
    </svg>
  ),
  // books and a light bulb
  ({ id }) => (
    <svg viewBox="0 0 240 160" role="presentation">
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FCE7F3" />
          <stop offset="1" stopColor="#FEF3C7" />
        </linearGradient>
      </defs>
      <rect width="240" height="160" rx="20" fill={`url(#${id}b)`} />
      <rect x="64" y="122" width="112" height="18" rx="4" fill="#2563EB" />
      <rect x="72" y="104" width="100" height="18" rx="4" fill="#0F766E" />
      <rect x="60" y="86" width="108" height="18" rx="4" fill="#BE185D" />
      <path d="M76 126 h20 M84 108 h20 M72 90 h20" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <g className="il-glow">
        <circle cx="150" cy="44" r="22" fill="#FDE047" />
        <rect x="142" y="64" width="16" height="12" rx="3" fill="#94A3B8" />
        <path d="M150 12 v-6 M176 22 l5 -5 M124 22 l-5 -5 M184 44 h7 M116 44 h-7" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
  ),
  // stairs going up
  ({ id }) => (
    <svg viewBox="0 0 240 160" role="presentation">
      <defs>
        <linearGradient id={`${id}t`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#CCFBF1" />
          <stop offset="1" stopColor="#DBEAFE" />
        </linearGradient>
      </defs>
      <rect width="240" height="160" rx="20" fill={`url(#${id}t)`} />
      <path d="M30 140 h40 v-24 h40 v-24 h40 v-24 h40 v-24 h20 v96 h-180z" fill="#14B8A6" />
      <path d="M30 140 h40 v-24 h40 v-24 h40 v-24 h40 v-24 h20" stroke="#0F766E" strokeWidth="4" fill="none" strokeLinejoin="round" />
      <g className="il-float">
        <circle cx="168" cy="22" r="9" fill="#F97316" />
        <path d="M168 31 v18 M168 38 l-9 6 M168 38 l9 -6 M168 49 l-7 12 M168 49 l8 10" stroke="#1E293B" strokeWidth="4" strokeLinecap="round" />
      </g>
      <path d="M56 50 l14 -14 M70 36 h-10 M70 36 v10" stroke="#0F766E" strokeWidth="4" strokeLinecap="round" />
    </svg>
  ),
];

/** Test hook for the screen walkthrough: localStorage "ip-test-interlude-seconds". */
function testSeconds(): number | null {
  try {
    const raw = window.localStorage.getItem("ip-test-interlude-seconds");
    return raw ? Math.max(1, Number(raw)) : null;
  } catch {
    return null;
  }
}

export function interludeSeconds(setting: number | null | undefined): number {
  return testSeconds() ?? setting ?? 60;
}

export function Interlude(props: {
  seconds: number;
  done: number;
  total: number;
  nextTitle: string | null;
  onNext: () => void;
  onExit: () => void;
}) {
  const { t, lang } = useI18n();
  const [left, setLeft] = useState(props.seconds);
  const pick = useMemo(
    () => ({
      cheer: CHEERS[Math.floor(Math.random() * CHEERS.length)],
      scene: Math.floor(Math.random() * SCENES.length),
    }),
    [],
  );
  useEffect(() => {
    const timer = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, []);
  const Scene = SCENES[pick.scene];
  const ready = left === 0;
  const pct = props.seconds > 0 ? (1 - left / props.seconds) * 100 : 100;

  return (
    <div className="interlude" role="region" aria-label={t("il_label")}>
      <div className="il-card">
        <div className="il-art">
          <Scene id={`il${pick.scene}`} />
        </div>
        <p className="il-cheer" dir="auto">
          {lang === "ar" ? pick.cheer.ar : pick.cheer.en}
        </p>
        {/* v0.0.13: the pause holds tips only; the phrases are a task of their own (owner) */}
        <p className="muted">
          {t("il_progress", { done: props.done, total: props.total })}
          {props.nextTitle && (
            <>
              {" · "}
              {t("il_next")} <strong className="ink">{props.nextTitle}</strong>
            </>
          )}
        </p>
        <div className="il-meter" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </div>
        {!ready && <span className="muted small">{t("il_left", { s: formatClock(left) })}</span>}
        <div className="row wrap il-actions">
          {/* v0.0.10: "Next" works at once for anyone who would rather skip the break */}
          <button
            className={`btn primary big-btn${ready ? " il-ready" : ""}`}
            onClick={props.onNext}
          >
            <Icon name="play" size={14} /> {ready ? t("focus_next") : t("il_skip")}
          </button>
          <button className="btn subtle" onClick={props.onExit}>
            {t("focus_exit")}
          </button>
        </div>
      </div>
    </div>
  );
}
