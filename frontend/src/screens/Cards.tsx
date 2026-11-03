// v0.0.11 (D-041): flashcards — Dalilk's 350 words (and the owner's own words) in the
// daily "Today's words" task, Dalilk's 150 phrases from the Library, one phrase in each
// pause between tasks. Coloured by section, Arabic and English, spoken by the computer's
// own English voice, reviewed with SM-2.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "../api";
import { DALILK_PAGE_URL, readDalilk } from "../dalilk";
import { useI18n } from "../i18n";
import { Icon } from "../icons";
import { todayIso } from "../plan";
import type { Card, CardDeck, CardStats } from "../types";

export const SECTION_COLORS: Record<string, { color: string; bg: string }> = {
  basic: { color: "#2563EB", bg: "#EFF6FF" },
  nouns: { color: "#059669", bg: "#ECFDF5" },
  verbs: { color: "#EA580C", bg: "#FFF7ED" },
  adjectives: { color: "#7C3AED", bg: "#F5F3FF" },
  mine: { color: "#DB2777", bg: "#FDF2F8" },
  emails: { color: "#0891B2", bg: "#ECFEFF" },
  meetings: { color: "#4F46E5", bg: "#EEF2FF" },
  // v0.0.12: the mistakes notebook
  writing: { color: "#DC2626", bg: "#FEF2F2" },
  speaking: { color: "#C2410C", bg: "#FFF7ED" },
  general: { color: "#B91C1C", bg: "#FEF2F2" },
};

export function sectionStyle(section: string) {
  return SECTION_COLORS[section] ?? SECTION_COLORS.basic;
}

const SECTION_KEYS = [
  "basic",
  "nouns",
  "verbs",
  "adjectives",
  "mine",
  "emails",
  "meetings",
  "writing",
  "speaking",
  "general",
] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

export function sectionLabelKey(section: string) {
  const s = (SECTION_KEYS as readonly string[]).includes(section) ? section : "basic";
  return `cards_sec_${s as SectionKey}` as const;
}

/** The computer's own English voice (Windows speech); nothing is downloaded. */
export function speak(text: string) {
  const synth = window.speechSynthesis;
  if (!synth || !text) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = synth.getVoices();
  const voice =
    voices.find((v) => /^en[-_]GB/i.test(v.lang)) ?? voices.find((v) => /^en/i.test(v.lang));
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? "en-GB";
  u.rate = 0.9;
  synth.speak(u);
}

export function SpeakButton(props: { text: string; small?: boolean }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className={`speak-btn${props.small ? " small" : ""}`}
      title={t("cards_listen")}
      aria-label={t("cards_listen")}
      onClick={(e) => {
        e.stopPropagation();
        speak(props.text);
      }}
    >
      <Icon name="volume" size={props.small ? 14 : 18} />
    </button>
  );
}

/* ---------- today's cards ---------- */

const GRADES = [
  { grade: 1, key: "cards_again", cls: "g-again" },
  { grade: 3, key: "cards_hard", cls: "g-hard" },
  { grade: 4, key: "cards_good", cls: "g-good" },
  { grade: 5, key: "cards_easy", cls: "g-easy" },
] as const;

export function useCardDeck(deck: CardDeck | null) {
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [stats, setStats] = useState<CardStats | null>(null);
  const [state, setState] = useState<"loading" | "reading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);

  const load = useCallback(
    async (fetchFromDalilk: boolean) => {
      if (!deck) return;
      const today = todayIso();
      setError(null);
      try {
        let s = await api.cardStats(today);
        const total = deck === "word" ? s.word.total : s.phrase.total;
        if (total === 0 || fetchFromDalilk) {
          setState("reading");
          await readDalilk(deck);
          s = await api.cardStats(today);
        }
        setStats(s);
        setQueue(await api.cardsToday(deck, today));
        setState("ready");
      } catch (e) {
        const message = e instanceof ApiError || e instanceof Error ? e.message : String(e);
        // the desktop bridge wraps errors: keep only the reason
        setError(message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ""));
        setState("error");
      }
    },
    [deck],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const grade = useCallback(
    async (card: Card, value: number) => {
      const updated = await api.cardReview(card.id, value, todayIso());
      setQueue((q) => {
        if (!q) return q;
        const rest = q.slice(1);
        // forgotten: once more at the end of today's cards
        return value < 3 ? [...rest, updated] : rest;
      });
      if (value >= 3) setDone((d) => d + 1);
      setStats(await api.cardStats(todayIso()).catch(() => null));
    },
    [],
  );

  return { queue, stats, state, error, done, load, grade };
}

function CardFace(props: { card: Card; flipped: boolean; onFlip: () => void }) {
  const { t } = useI18n();
  const c = props.card;
  const style = sectionStyle(c.section);
  const mistake = c.kind === "mistake";
  return (
    <div
      className={`flashcard${props.flipped ? " flipped" : ""}`}
      style={{ borderColor: style.color, background: style.bg }}
      role="button"
      tabIndex={0}
      aria-label={props.flipped ? c.meaning : c.front}
      onClick={props.onFlip}
      onKeyDown={(e) => {
        if (e.key === "Enter") props.onFlip();
      }}
    >
      <div className="fc-band" style={{ background: style.color }}>
        <span>{t(sectionLabelKey(c.section))}</span>
        {c.situation && <span className="fc-situation">{c.situation}</span>}
        {c.reps === 0 && c.due === null && <span className="fc-new">{t("cards_new")}</span>}
      </div>
      <div className={`fc-front${mistake ? " fc-mistake" : ""}`} dir="ltr">
        <strong style={{ color: style.color }}>{c.front}</strong>
        {!mistake && <SpeakButton text={c.front} />}
      </div>
      {mistake && c.situation && (
        <p className="muted small" dir="auto">
          {c.situation}
        </p>
      )}
      {props.flipped ? (
        <div className="fc-back">
          {mistake ? (
            <p className="fc-meaning fc-right" dir="ltr">
              ✓ {c.meaning} <SpeakButton text={c.meaning} small />
            </p>
          ) : (
            <p className="fc-meaning" dir="rtl">
              {c.meaning}
            </p>
          )}
          {c.example && !mistake && (
            <p className="fc-example" dir="ltr">
              {c.example} <SpeakButton text={c.example} small />
            </p>
          )}
          {c.example && mistake && (
            <p className="fc-example" dir="auto">
              {c.example}
            </p>
          )}
          {mistake && c.code && <span className="pill self-center">{c.code}</span>}
          {c.example_ar && (
            <p className="fc-example-ar" dir="rtl">
              {c.example_ar}
            </p>
          )}
        </div>
      ) : (
        <p className="fc-hint muted small">
          {mistake ? t("cards_mistake_hint") : t("cards_flip_hint")}
        </p>
      )}
    </div>
  );
}

export function CardsSession(props: {
  deck: CardDeck;
  cards: ReturnType<typeof useCardDeck>;
  inFocus: boolean;
  /** v0.0.13: when the cards cannot be read, Dalilk's page itself (owner, 2026-11-03) */
  pageFallback?: (url: string) => ReactNode;
}) {
  const { t } = useI18n();
  const { cards } = props;
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const card = cards.queue?.[0] ?? null;

  useEffect(() => setFlipped(false), [card?.id, card?.reps, card?.lapses]);

  const answer = useCallback(
    async (value: number) => {
      if (!card || busy) return;
      setBusy(true);
      try {
        await cards.grade(card, value);
      } finally {
        setBusy(false);
      }
    },
    [card, busy, cards],
  );

  // keyboard: space flips, 1–4 answer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.code === "Space") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && ["1", "2", "3", "4"].includes(e.key)) {
        void answer(GRADES[Number(e.key) - 1].grade);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, answer]);

  if (cards.state === "loading") {
    return (
      <div className="cards-main">
        <div className="spinner" aria-hidden="true" />
      </div>
    );
  }
  if (cards.state === "reading") {
    return (
      <div className="cards-main">
        <div className="spinner" aria-hidden="true" />
        <p className="lead">{t(props.deck === "word" ? "cards_reading_words" : "cards_reading_phrases")}</p>
      </div>
    );
  }
  if (cards.state === "error" && props.pageFallback) {
    return (
      <div className="cards-fallback">
        <div className="row wrap cards-fallback-bar">
          <span className="note small">{t("cards_fallback_note")}</span>
          <span className="spacer" />
          <button className="btn small" onClick={() => void cards.load(true)}>
            {t("retry")}
          </button>
        </div>
        <div className="fill">{props.pageFallback(DALILK_PAGE_URL[props.deck])}</div>
      </div>
    );
  }
  if (cards.state === "error") {
    return (
      <div className="cards-main">
        <p className="error-box">
          {t("cards_read_failed")} <bdi dir="ltr">{cards.error}</bdi>
        </p>
        <div className="row wrap">
          <button className="btn primary" onClick={() => void cards.load(true)}>
            {t("retry")}
          </button>
          <button
            className="btn"
            onClick={() => void window.ipBridge?.openExternal(DALILK_PAGE_URL[props.deck])}
          >
            <Icon name="globe" size={14} /> {t("cards_open_page")}
          </button>
        </div>
      </div>
    );
  }
  if (!card) {
    return (
      <div className="cards-main">
        <div className="listen-badge">
          <Icon name="check" size={44} color="#15803D" />
        </div>
        <p className="lead">{t(props.inFocus ? "cards_all_done_focus" : "cards_all_done")}</p>
      </div>
    );
  }
  return (
    <div className="cards-main">
      <CardFace card={card} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />
      {flipped ? (
        <div className="fc-grades" role="group" aria-label={t("cards_how_well")}>
          {GRADES.map((g, i) => (
            <button
              key={g.grade}
              className={`btn ${g.cls}`}
              disabled={busy}
              onClick={() => void answer(g.grade)}
            >
              <kbd>{i + 1}</kbd> {t(g.key)}
            </button>
          ))}
        </div>
      ) : (
        <button className="btn primary big-btn" onClick={() => setFlipped(true)}>
          {t("cards_flip")}
        </button>
      )}
    </div>
  );
}

/** Sidebar: how many are left today and how far the deck is. */
export function CardsSide(props: { deck: CardDeck; cards: ReturnType<typeof useCardDeck> }) {
  const { t } = useI18n();
  const { stats, queue, done } = props.cards;
  const left = queue?.length ?? 0;
  const s = stats ? (props.deck === "word" ? stats.word : stats.phrase) : null;
  return (
    <div className="queue-now stack">
      <span className="queue-counter">
        <Icon name="cards" size={14} />
        {t("cards_left_today", { n: left, done })}
      </span>
      {s && s.total > 0 && (
        <>
          <span className="muted small">
            {t(props.deck === "word" ? "cards_learned_words" : "cards_learned_phrases", {
              n: s.learned,
              m: s.total,
            })}
          </span>
          <div className="meter" aria-hidden="true">
            <span style={{ width: `${Math.min(100, (s.learned / s.total) * 100)}%` }} />
          </div>
        </>
      )}
      {props.deck === "word" && stats && stats.mine.total > 0 && (
        <span className="muted small">{t("cards_mine_count", { n: stats.mine.total })}</span>
      )}
      {props.deck === "word" && stats && stats.mistake.total > 0 && (
        <span className="muted small">
          {t("cards_mistakes_count", { n: stats.mistake.total })}
        </span>
      )}
      <p className="muted small">{t("cards_keys")}</p>
      {s && s.total > 0 && (
        <button className="btn subtle small self-start" onClick={() => void props.cards.load(true)}>
          <Icon name="reload" size={12} /> {t("cards_refresh")}
        </button>
      )}
    </div>
  );
}

/* ---------- a word met in a podcast or a novel ---------- */

export function AddWordForm() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [front, setFront] = useState("");
  const [meaning, setMeaning] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button className="btn subtle small self-start" onClick={() => setOpen(true)}>
        <Icon name="plus" size={12} /> {t("cards_add_word")}
      </button>
    );
  }
  const add = async () => {
    if (!front.trim()) return;
    setBusy(true);
    try {
      const c = await api.cardAdd(front.trim(), meaning.trim());
      setSaved(c.front);
      setFront("");
      setMeaning("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="add-word stack-xs"
      onSubmit={(e) => {
        e.preventDefault();
        void add();
      }}
    >
      <span className="field-label">{t("cards_add_word")}</span>
      <input
        dir="ltr"
        placeholder={t("cards_add_front")}
        value={front}
        maxLength={300}
        onChange={(e) => setFront(e.target.value)}
      />
      <input
        dir="rtl"
        placeholder={t("cards_add_meaning")}
        value={meaning}
        maxLength={500}
        onChange={(e) => setMeaning(e.target.value)}
      />
      <div className="row wrap">
        <button className="btn primary small" disabled={busy || !front.trim()} type="submit">
          {t("cards_add")}
        </button>
        <button className="btn subtle small" type="button" onClick={() => setOpen(false)}>
          {t("cards_close")}
        </button>
      </div>
      {saved && (
        <span className="ok small" role="status">
          ✓ {t("cards_added", { w: saved })}
        </span>
      )}
    </form>
  );
}

/* ---------- the pause's phrase ---------- */

export function PhraseOfThePause() {
  const { t } = useI18n();
  const [card, setCard] = useState<Card | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    api
      .phraseNext()
      .then((c) => {
        if (!alive) return;
        setCard(c);
        void api.phraseShown(c.id).catch(() => undefined);
      })
      .catch(() => undefined); // phrases not read yet: the pause stays as it was
    return () => {
      alive = false;
    };
  }, []);
  if (!card) return null;
  const style = sectionStyle(card.section);
  return (
    <div className="pause-phrase" style={{ borderColor: style.color, background: style.bg }}>
      <span className="pp-label" style={{ color: style.color }}>
        {t("cards_phrase_of_pause", { n: card.sort })} · {t(sectionLabelKey(card.section))}
      </span>
      <div className="pp-front" dir="ltr">
        <strong>{card.front}</strong>
        <SpeakButton text={card.front} small />
      </div>
      {open ? (
        <div className="pp-back">
          <p dir="rtl">{card.meaning}</p>
          {card.example && (
            <p dir="ltr" className="muted">
              {card.example} <SpeakButton text={card.example} small />
            </p>
          )}
          {card.example_ar && (
            <p dir="rtl" className="muted">
              {card.example_ar}
            </p>
          )}
        </div>
      ) : (
        <button className="linkish small" onClick={() => setOpen(true)}>
          {t("cards_show_meaning")}
        </button>
      )}
    </div>
  );
}
