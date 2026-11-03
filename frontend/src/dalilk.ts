// v0.0.11 (D-041): Dalilk's 350 words and 150 phrases, read from Dalilk's own public pages
// on this computer (the desktop app fetches only those two pages) and kept in the local
// database for the cards. Nothing of it is shipped with the app.
//
// The pages could change at any time, so the reading is tolerant: words come from the
// tables (columns found by their headers), phrases from the text in page order (number,
// phrase, meaning, example, translation). Anything that does not look right is skipped.

import { api } from "./api";
import type { CardDeck, CardImportItem } from "./types";

const ARABIC = /[؀-ۿ]/;
const LATIN = /[A-Za-z]/;
const TOGGLE = /اضغط|إظهار|اظهار/;

function clean(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

const WORD_SECTIONS: [RegExp, string][] = [
  [/صف/, "adjectives"],
  [/فعل|أفعال/, "verbs"],
  [/اسم|أسماء/, "nouns"],
  [/كلم/, "basic"],
];
export const WORD_SECTION_ORDER = ["basic", "nouns", "verbs", "adjectives"];

function wordSection(heading: string): string {
  return WORD_SECTIONS.find(([re]) => re.test(heading))?.[1] ?? "basic";
}

export function parseWords(html: string): CardImportItem[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: CardImportItem[] = [];
  const seen = new Set<string>();
  let heading = "";
  for (const el of Array.from(doc.querySelectorAll("h1, h2, h3, h4, table"))) {
    if (el.tagName !== "TABLE") {
      heading = clean(el.textContent);
      continue;
    }
    const section = wordSection(heading);
    const rows = Array.from(el.querySelectorAll("tr"));
    const head = rows.find((r) => r.querySelector("th"));
    const headers = head ? Array.from(head.querySelectorAll("th, td")).map((c) => clean(c.textContent)) : [];
    const col = (re: RegExp) => headers.findIndex((h) => re.test(h));
    let iNo = col(/^#$|رقم/);
    let iWord = col(/الكلمة|word/i);
    let iMeaning = col(/المعنى|meaning/i);
    let iExample = col(/مثال|example/i);
    let iTrans = col(/الترجمة|translation/i);
    if (iWord < 0 || iMeaning < 0) {
      [iNo, iWord, iMeaning, iExample, iTrans] = [0, 1, 2, 3, 4];
    }
    let index = 0;
    for (const row of rows) {
      if (row === head) continue;
      const cells = Array.from(row.querySelectorAll("td")).map((c) => clean(c.textContent));
      const front = cells[iWord] ?? "";
      const meaning = cells[iMeaning] ?? "";
      if (!LATIN.test(front) || !ARABIC.test(meaning)) continue;
      index += 1;
      const n = Number.parseInt(cells[iNo] ?? "", 10);
      const number = Number.isFinite(n) && n > 0 ? n : index;
      const key = `${section}-${number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key,
        section,
        situation: "",
        sort: WORD_SECTION_ORDER.indexOf(section) * 1000 + number,
        front,
        meaning,
        example: iExample >= 0 ? (cells[iExample] ?? "") : "",
        example_ar: iTrans >= 0 ? (cells[iTrans] ?? "") : "",
      });
    }
  }
  return out;
}

type Piece = { heading: number; text: string };

/** Headings and the smallest pieces of text, in page order. */
function pieces(doc: Document): Piece[] {
  const out: Piece[] = [];
  for (const el of Array.from(doc.body.querySelectorAll("*"))) {
    const tag = el.tagName;
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|SVG|PATH)$/i.test(tag)) continue;
    const h = /^H([1-4])$/.exec(tag);
    if (h) {
      out.push({ heading: Number(h[1]), text: clean(el.textContent) });
      continue;
    }
    if (el.closest("h1, h2, h3, h4, script, style, svg")) continue;
    if (el.children.length > 0) {
      // text written directly inside an element that also has children
      const own = clean(
        Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent)
          .join(" "),
      );
      if (own) out.push({ heading: 0, text: own });
      continue;
    }
    const text = clean(el.textContent);
    if (text) out.push({ heading: 0, text });
  }
  return out;
}

const NUMBER = /^#?(\d{1,3})\.?$/;
const NUMBERED = /^#?(\d{1,3})[.)\-:\s]+([A-Za-z].*)$/;

export function parsePhrases(html: string): CardImportItem[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const list = pieces(doc);
  const out: CardImportItem[] = [];
  let section = "";
  let situation = "";
  let expected = 1;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.heading) {
      if (p.heading <= 2 && /اجتماع/.test(p.text)) section = "meetings";
      else if (p.heading <= 2 && /إيميل|ايميل|بريد/.test(p.text)) section = "emails";
      else if (p.heading >= 3) situation = p.text;
      continue;
    }
    // "12" then "the phrase", or "12 the phrase" in one piece
    let phrase = "";
    let next = i + 1;
    const alone = NUMBER.exec(p.text);
    const joined = NUMBERED.exec(p.text);
    if (alone && Number(alone[1]) === expected) {
      const q = list[i + 1];
      if (!q || q.heading || !LATIN.test(q.text) || ARABIC.test(q.text)) continue;
      phrase = q.text;
      next = i + 2;
    } else if (joined && Number(joined[1]) === expected && !ARABIC.test(joined[2])) {
      phrase = joined[2].trim();
    } else {
      continue;
    }
    // then the meaning (Arabic), the example (English) and its translation (Arabic);
    // the "show the meaning" label and icon-only pieces are skipped
    const rest: string[] = [];
    let j = next;
    while (j < list.length && rest.length < 3) {
      const q = list[j];
      if (q.heading || NUMBER.test(q.text) || NUMBERED.test(q.text)) break;
      const words = ARABIC.test(q.text) || LATIN.test(q.text);
      if (words && !(TOGGLE.test(q.text) && !LATIN.test(q.text))) rest.push(q.text);
      j += 1;
    }
    const [meaning = "", example = "", exampleAr = ""] = rest;
    if (!ARABIC.test(meaning)) continue;
    out.push({
      key: String(expected),
      section: section || (expected <= 75 ? "emails" : "meetings"),
      situation,
      sort: expected,
      front: phrase,
      meaning,
      example: LATIN.test(example) ? example : "",
      example_ar: ARABIC.test(exampleAr) ? exampleAr : "",
    });
    expected += 1;
    i = j - 1;
  }
  return out;
}

/** Reads one of Dalilk's pages on this computer and stores its cards. */
export async function readDalilk(deck: CardDeck): Promise<number> {
  const bridge = window.ipBridge;
  if (!bridge?.dalilkPage) throw new Error("no desktop bridge");
  const which = deck === "word" ? "words" : "phrases";
  const parse = deck === "word" ? parseWords : parsePhrases;
  let items: CardImportItem[] = [];
  try {
    items = parse(await bridge.dalilkPage(which, false));
  } catch {
    // refused or unreachable as a plain request: try once as a browser would
  }
  if (items.length === 0) items = parse(await bridge.dalilkPage(which, true));
  if (items.length === 0) throw new Error("nothing found on the page");
  const result = await api.cardsImport(deck, items);
  return result.total;
}

let tried = false;

/** Once per run: fetch the cards in the background if they are not there yet. */
export async function ensureDalilkCards(today: string): Promise<void> {
  if (tried || !window.ipBridge?.dalilkPage) return;
  tried = true;
  try {
    const stats = await api.cardStats(today);
    if (stats.word.total === 0) await readDalilk("word").catch(() => undefined);
    if (stats.phrase.total === 0) await readDalilk("phrase").catch(() => undefined);
  } catch {
    // backend busy or offline: the cards screen will try again
  }
}

export const DALILK_PAGE_URL: Record<CardDeck, string> = {
  word: "https://dalilk.com/resources/foundation/words",
  phrase: "https://dalilk.com/resources/fluency/workplace",
};
