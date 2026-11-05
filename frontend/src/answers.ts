// v0.0.17 (owner, 2026-11-05): every lab answer can be kept as one tidy PDF — the question,
// the answer, the tutor's marks and mistakes and the model answer part by part — with the
// speaking recordings beside it as WAV files, in Documents/IELTS Band Up/إجاباتي. The desktop
// app prints the page (scripts and network off) and keeps the files in that folder.

import arabic400 from "@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2?url";
import arabic600 from "@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-600-normal.woff2?url";
import arabic700 from "@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-700-normal.woff2?url";
import latin400 from "@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-400-normal.woff2?url";
import latin600 from "@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-600-normal.woff2?url";
import latin700 from "@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-700-normal.woff2?url";
import type { I18n } from "./i18n";
import { readModelAnswer, textDir } from "./tutor";
import type { MistakeInput } from "./types";

/* ---------- names ---------- */

function localDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "Cambridge IELTS 21 Academic — Writing Test 1" → "Cambridge 21 Test 1". */
export function shortTestTitle(title: string): string {
  const cam = /Cambridge IELTS (\d+)\b.*?Test (\d+)/i.exec(title);
  if (cam) return `Cambridge ${cam[1]} Test ${cam[2]}`;
  if (/^Official sample/i.test(title)) return "Official sample";
  return title
    .replace(/^IELTS\s+/i, "")
    .replace(/\s*[—–]\s*/g, " - ")
    .slice(0, 60)
    .trim();
}

/** "2026-11-05 · Writing Task 2 · Cambridge 21 Test 1" (the desktop app adds " (2)" if taken). */
export function answerStem(day: Date, label: string, testTitle: string | null): string {
  return [localDay(day), label, testTitle ? shortTestTitle(testTitle) : ""]
    .filter(Boolean)
    .join(" · ");
}

/* ---------- audio ---------- */

function encodeWav(samples: Float32Array, rate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return buffer;
}

/** The app's recording (WebM/Opus) as a plain WAV file — 22 kHz mono, about 2.6 MB a minute —
 *  which media players and file uploads take more readily. */
export async function toWav(data: ArrayBuffer, rate = 22050): Promise<ArrayBuffer> {
  const decoder = new OfflineAudioContext(1, 1, rate);
  const decoded = await decoder.decodeAudioData(data.slice(0));
  const length = Math.max(1, Math.ceil(decoded.duration * rate));
  const offline = new OfflineAudioContext(1, length, rate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination); // two channels are mixed into one
  source.start();
  const rendered = await offline.startRendering();
  return encodeWav(rendered.getChannelData(0), rate);
}

/** A recording this app kept in the data folder, as WAV. */
export async function recordingAsWav(name: string): Promise<ArrayBuffer> {
  const data = await window.ipBridge?.readRecording?.(name);
  if (!data) throw new Error("no recording");
  return toWav(data);
}

/* ---------- the page ---------- */

export interface AnswerDoc {
  skill: "writing" | "speaking";
  label: string; // "Writing Task 2", "Speaking Part 1"
  testTitle: string | null;
  day: Date;
  target: number;
  question: string;
  answer: string; // the essay, or what was said
  answerNote: string; // "262 words · 38 minutes" / "1:45 spoken"
  criteria: { short: string; name: string; band: number | null }[];
  overall: number | null;
  mistakes: MistakeInput[];
  model: string; // the model answer as pasted (MINE / BETTER / WHY, FULL ANSWER)
  site: string; // ChatGPT
}

const FONT_FILES: [string, number, "arabic" | "latin"][] = [
  [arabic400, 400, "arabic"],
  [arabic600, 600, "arabic"],
  [arabic700, 700, "arabic"],
  [latin400, 400, "latin"],
  [latin600, 600, "latin"],
  [latin700, 700, "latin"],
];
const RANGES = {
  arabic:
    "U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC",
  latin:
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
};

let fontCss: Promise<string> | null = null;

function base64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(out);
}

/** The app's own font, carried inside the page (the PDF window fetches nothing). */
function fonts(): Promise<string> {
  fontCss ??= Promise.all(
    FONT_FILES.map(async ([url, weight, range]) => {
      const data = await (await fetch(url)).arrayBuffer();
      return `@font-face{font-family:"Plex";font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${base64(data)}) format("woff2");unicode-range:${RANGES[range]};}`;
    }),
  )
    .then((rules) => rules.join("\n"))
    .catch(() => {
      fontCss = null; // try again next time; the page still prints with system fonts
      return "";
    });
  return fontCss;
}

const LOGO = `<svg width="40" height="40" viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="g" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#be185d"/><stop offset="1" stop-color="#e11d48"/></linearGradient></defs><rect width="120" height="120" rx="30" fill="url(#g)"/><path d="M30 76 L60 46 L90 76" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><path d="M40 94 L60 74 L80 94" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/><circle cx="60" cy="28" r="8" fill="#fde047"/></svg>`;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** English text as written: paragraphs kept, left to right. */
function en(text: string, cls = "en"): string {
  const body = text.trim() ? esc(text.trim()) : "—";
  return `<div class="${cls}" dir="ltr" lang="en">${body}</div>`;
}

const STYLE = `
@page{size:A4;margin:16mm 15mm 18mm}
*{box-sizing:border-box}
html{font-family:"Plex","Segoe UI","DejaVu Sans",Tahoma,sans-serif;font-size:10.5pt;line-height:1.6;color:#1b2330;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0}
.head{display:flex;align-items:center;gap:12px;padding-bottom:10px;border-bottom:3px solid #e11d48}
.head .name{font-weight:700;font-size:15pt;color:#be185d;line-height:1.2}
.head .sub{color:#4a5565;font-size:9.5pt}
.head .spacer{flex:1}
.title{margin:14px 0 4px;font-size:16pt;font-weight:700;line-height:1.3}
.meta{display:flex;flex-wrap:wrap;gap:6px 8px;margin-bottom:6px}
.chip{background:#f6f8fb;border:1px solid #e3e8f0;border-radius:999px;padding:1px 10px;font-size:9pt;color:#4a5565}
.chip b{color:#1b2330;font-weight:600}
h2{font-size:11.5pt;margin:18px 0 6px;color:#1d4ed8;display:flex;align-items:center;gap:8px;break-after:avoid}
h2 .no{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#1d4ed8;color:#fff;font-size:9pt}
.note{color:#6b7280;font-size:8.5pt;margin:4px 0 0}
.en{white-space:pre-wrap;font-size:10.5pt;text-align:left;direction:ltr;unicode-bidi:isolate}
.box{border:1px solid #e3e8f0;border-radius:10px;padding:10px 12px;background:#fff}
.box.soft{background:#f6f8fb}
table{width:100%;border-collapse:collapse;font-size:9.5pt}
th,td{border:1px solid #e3e8f0;padding:5px 8px;vertical-align:top;text-align:start}
th{background:#e8eefc;font-weight:600}
tr{break-inside:avoid}
.scores td.band{font-weight:700;text-align:center;width:70px}
.scores tr.overall td{background:#fdf2f8;font-weight:700}
.wrong{color:#b42318;text-decoration:line-through;text-decoration-thickness:1px}
.right{color:#0f5132;font-weight:600}
.code{display:inline-block;margin-top:2px;font-size:7.5pt;color:#4a5565;border:1px solid #d5dce6;border-radius:4px;padding:0 4px;direction:ltr}
.part{border:1px solid #e3e8f0;border-radius:10px;margin:0 0 8px;break-inside:avoid;overflow:hidden}
.part .row{display:flex;gap:8px;padding:5px 10px}
.part .row + .row{border-top:1px dashed #e3e8f0}
.part .lab{flex:0 0 60px;font-size:8.5pt;font-weight:600;color:#6b7280;padding-top:2px}
.part .row > div{flex:1;min-width:0}
.part .mine .en{color:#4a5565}
.part .better{background:#f0fdf4}
.part .better .en{color:#0f5132;font-weight:600}
.part .why{font-size:9pt;color:#4a5565}
.full{border-inline-start:4px solid #0f766e;background:#f0fdf4}
.files li{font-size:9pt;unicode-bidi:plaintext}
.foot{margin-top:22px;padding-top:8px;border-top:1px solid #e3e8f0;color:#6b7280;font-size:8pt}
`;

export async function answerHtml(doc: AnswerDoc, audio: string[], i18n: I18n): Promise<string> {
  const { t, lang } = i18n;
  const dir = lang === "ar" ? "rtl" : "ltr";
  let n = 0;
  const h2 = (title: string) => `<h2><span class="no">${(n += 1)}</span>${esc(title)}</h2>`;
  const model = readModelAnswer(doc.model);
  const sections: string[] = [];

  sections.push(h2(t("pdf_question")), en(doc.question, "box soft en"));
  sections.push(
    h2(doc.skill === "writing" ? t("pdf_your_answer") : t("pdf_what_you_said")),
    `<p class="note">${esc(doc.answerNote)}</p>`,
    en(doc.answer, "box en"),
  );
  if (audio.length) {
    sections.push(
      `<p class="note">${esc(t("pdf_recordings"))}</p><ul class="files">${audio
        .map((a) => `<li>${esc(a)}</li>`)
        .join("")}</ul>`,
    );
  }

  const marked = doc.criteria.filter((c) => c.band !== null);
  if (marked.length || doc.overall !== null) {
    sections.push(
      h2(t("pdf_scores", { site: doc.site })),
      `<table class="scores"><tr><th>${esc(t("pdf_criterion"))}</th><th>${esc(t("pdf_band"))}</th></tr>${doc.criteria
        .map(
          (c) =>
            `<tr><td dir="ltr" style="text-align:left">${esc(c.short)} — ${esc(c.name)}</td><td class="band">${c.band === null ? "—" : c.band.toFixed(1)}</td></tr>`,
        )
        .join("")}<tr class="overall"><td>${esc(t("pdf_overall"))}</td><td class="band">${doc.overall === null ? "—" : doc.overall.toFixed(1)}</td></tr></table>`,
      `<p class="note">${esc(t("pdf_opinion_note"))}</p>`,
    );
  }

  if (doc.mistakes.length) {
    sections.push(
      h2(t("pdf_mistakes", { n: doc.mistakes.length })),
      `<table><tr><th>${esc(t("pdf_wrong"))}</th><th>${esc(t("pdf_right"))}</th><th>${esc(t("pdf_why"))}</th></tr>${doc.mistakes
        .map(
          (m) =>
            `<tr><td dir="ltr" style="text-align:left"><span class="wrong">${esc(m.wrong)}</span></td><td dir="ltr" style="text-align:left"><span class="right">${esc(m.right)}</span></td><td dir="${textDir(m.why)}">${esc(m.why)}${m.code ? `<br><span class="code">${esc(m.code)}</span>` : ""}</td></tr>`,
        )
        .join("")}</table>`,
    );
  }

  if (doc.model.trim()) {
    sections.push(h2(t("pdf_model", { band: doc.target.toFixed(1) })));
    if (model.parts.length) {
      sections.push(
        model.parts
          .map(
            (p, i) =>
              `<div class="part"><div class="row mine"><span class="lab">${i + 1} · ${esc(t("pdf_mine"))}</span>${en(p.mine)}</div><div class="row better"><span class="lab">${esc(t("pdf_better"))}</span>${en(p.better)}</div>${p.why ? `<div class="row why"><span class="lab">${esc(t("pdf_why"))}</span><div dir="${textDir(p.why)}">${esc(p.why)}</div></div>` : ""}</div>`,
          )
          .join(""),
      );
      if (model.full) {
        sections.push(`<p class="note">${esc(t("pdf_full_answer"))}</p>`, en(model.full, "box full en"));
      }
    } else {
      sections.push(en(model.full || doc.model, "box full en"));
    }
  }

  const chips = [
    [t("pdf_date"), i18n.formatDate(localDay(doc.day))],
    [t("pdf_target"), doc.target.toFixed(1)],
    ...(doc.testTitle ? [[t("pdf_test"), doc.testTitle]] : []),
  ]
    .map(([k, v]) => `<span class="chip">${esc(k)}: <b dir="auto">${esc(v)}</b></span>`)
    .join("");

  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(doc.label)}</title><style>${await fonts()}${STYLE}</style></head><body>
<div class="head">${LOGO}<div><div class="name" dir="ltr">IELTS Band Up</div><div class="sub">${esc(t("pdf_tagline"))}</div></div><span class="spacer"></span><div class="sub">${esc(t("pdf_kind"))}</div></div>
<div class="title" dir="ltr">${esc(doc.label)}</div>
<div class="meta">${chips}</div>
${sections.join("\n")}
<div class="foot">${esc(t("pdf_footer"))}</div>
</body></html>`;
}

/* ---------- saving ---------- */

export interface SavedAnswer {
  pdf: string;
  audio: string[];
}

/** Saves the answer's PDF, and its recordings beside it, in the answers folder. Saving the
 *  same answer again keeps its file name (`current`). */
export async function saveAnswer(
  doc: AnswerDoc,
  recordings: { label: "mine" | "model"; name: string }[],
  current: string | null,
  i18n: I18n,
): Promise<SavedAnswer> {
  const bridge = window.ipBridge?.answers;
  if (!bridge) throw new Error("desktop only");
  const stem = await bridge.name(answerStem(doc.day, doc.label, doc.testTitle), current);
  const audio: string[] = [];
  for (const r of recordings) {
    try {
      audio.push(await bridge.saveAudio(stem, r.label, await recordingAsWav(r.name)));
    } catch {
      // a recording that cannot be read is left out; the PDF still saves
    }
  }
  const pdf = await bridge.savePdf(stem, await answerHtml(doc, audio, i18n));
  return { pdf, audio };
}
