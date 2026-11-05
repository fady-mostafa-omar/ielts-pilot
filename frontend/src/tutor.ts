// v0.0.12 (D-026, D-042): the AI tutor through a prompt the app writes and copies; the
// owner pastes it into ChatGPT / Claude / Gemini himself (no typing into the site on his
// behalf) and pastes the reply back. The app keeps the context, so the tutor can be switched
// without losing anything. Marks in the reply are an opinion only (D-008): they are shown
// as such and never change the levels.

import type { ExplanationLang, MistakeInput, TutorSite } from "./types";

export const TUTOR_SITES: Record<TutorSite, { name: string; url: string }> = {
  chatgpt: { name: "ChatGPT", url: "https://chatgpt.com/" },
  claude: { name: "Claude", url: "https://claude.ai/new" },
  gemini: { name: "Gemini", url: "https://gemini.google.com/app" },
};

export const ERROR_CODES = [
  "GR-TENSE",
  "GR-ART",
  "GR-PREP",
  "GR-AGR",
  "GR-STRUCT",
  "VO-MEAN",
  "VO-COLL",
  "VO-FORM",
  "VO-SPELL",
  "WR-TASK",
  "WR-ORG",
  "WR-COH",
  "SP-HESIT",
  "SP-REPEAT",
  "SP-ORG",
] as const;

export interface Learner {
  band: number | null; // the skill's current level, if known
  target: number; // v0.0.17: the skill's own target from the setup (target_writing / _speaking)
  explain: ExplanationLang;
  examFormat: string | null;
  words: string[]; // words he is learning (recent cards)
}

function language(explain: ExplanationLang): string {
  if (explain === "ar_heavy") {
    return "Write every explanation in simple Egyptian Arabic; keep the English corrections and examples in English.";
  }
  if (explain === "en_heavy") return "Write everything in clear, simple English.";
  return "Explain in simple English and add a short note in Egyptian Arabic after each point.";
}

function whyLanguage(explain: ExplanationLang): string {
  return explain === "en_heavy" ? "in simple English" : "in short, simple Egyptian Arabic";
}

function aboutMe(l: Learner, skill: string): string {
  const level = l.band !== null ? `about band ${l.band.toFixed(1)}` : "not measured yet";
  return `About me: my ${skill} level is ${level}; my target in ${skill} is band ${l.target.toFixed(1)}.`;
}

const MISTAKE_LINE = `WRONG: <my exact words> || RIGHT: <the corrected words> || WHY: <a short reason> || CODE: <one of ${ERROR_CODES.join(", ")}>`;

const OPINION_NOTE =
  "Your marks are practice feedback and an opinion only, not an official IELTS score.";

/** v0.0.17: the better answer keeps the learner's own ideas, part by part (owner, 2026-11-05). */
function modelAnswerRules(l: Learner, spoken: boolean): string[] {
  return [
    "### MODEL ANSWER",
    `Rewrite MY answer at about band ${l.target.toFixed(1)}. Keep my own ideas, examples, opinion and order; do not add new ideas. Go part by part (one or two of my sentences at a time), in this format:`,
    "[1]",
    "MINE: <my exact words>",
    `BETTER: <the same idea at about band ${l.target.toFixed(1)}>`,
    `WHY: <what changed and why, in one line ${whyLanguage(l.explain)}>`,
    "(then [2], [3]… until the whole answer is covered)",
    spoken
      ? "Then a line that says only FULL ANSWER, followed by the whole better answer as natural spoken English that I can read aloud."
      : "Then a line that says only FULL ANSWER, followed by the whole better answer, in paragraphs as in the exam.",
    l.words.length
      ? `Where it fits naturally, use some of the words I am learning: ${l.words.join(", ")}.`
      : "",
  ];
}

/** v0.0.17 (owner, 2026-11-05): one message opens the chat and sets the steps for all of
 *  it — a question, wait, mark it like the exam, then a model answer at my target band,
 *  always under the same headings so the app can split the reply. No API: the learner
 *  pastes this himself and pastes the reply back (D-026). */
export function writingSessionPrompt(task: 1 | 2, l: Learner, testTitle: string | null): string {
  const first = task === 1 ? "TA" : "TR";
  const step1 = testTitle
    ? [
        `Step 1 — the question: I will send you the question myself, from "${testTitle}"${task === 1 ? ", with a screenshot of the chart, table, map or process" : ""}. Do not send a question; reply only "Ready" and wait.`,
      ]
    : [
        `Step 1 — the question: send me ONE new IELTS Academic Writing Task ${task} question only (no tips, no model answer) and wait.`,
        task === 1
          ? "Describe the chart, table, map or process fully in text (give the numbers in a table), as I cannot see pictures here."
          : "",
      ];
  return [
    "You are my IELTS Writing examiner and coach for this whole chat. Work step by step and wait for me after each step.",
    `${aboutMe(l, "writing")} ${language(l.explain)}`,
    "",
    ...step1,
    "",
    "Step 2 — my answer: wait for it. I write it on my computer with the exam's time limit and paste it here.",
    "",
    `Step 3 — your reply: mark my answer exactly as an IELTS examiner would. ${OPINION_NOTE} Reply under these headings, written exactly like this and in this order:`,
    "### SCORES",
    `${first}: <band>`,
    "CC: <band>",
    "LR: <band>",
    "GRA: <band>",
    "OVERALL: <band>",
    "(half bands only, one per line)",
    "### MISTAKES",
    `One line per mistake, the most important first, at most 12, exactly like this: ${MISTAKE_LINE}`,
    ...modelAnswerRules(l, false),
    "",
    "Step 4 — then wait. When I ask for another question, start again from Step 1, with the same headings every time.",
  ]
    .filter((line, i, all) => line !== "" || (all[i - 1] ?? "") !== "")
    .join("\n");
}

export function speakingSessionPrompt(part: 1 | 2 | 3, l: Learner, testTitle: string | null): string {
  const ask =
    part === 1
      ? "ask me 4 IELTS Speaking Part 1 questions on one everyday topic"
      : part === 2
        ? "give me one IELTS Speaking Part 2 cue card (the topic and the 3–4 points to talk about)"
        : "ask me 4 IELTS Speaking Part 3 discussion questions on one common topic";
  const length =
    part === 1
      ? "about 20–30 seconds for each question"
      : part === 2
        ? "about 2 minutes"
        : "about 40–60 seconds for each question";
  return [
    "You are my IELTS Speaking examiner and coach for this whole chat. Work step by step and wait for me after each step.",
    `${aboutMe(l, "speaking")} ${language(l.explain)}`,
    "",
    testTitle
      ? `Step 1 — the questions: I will send you the Part ${part} questions myself, from "${testTitle}". Do not send questions; reply only "Ready" and wait.`
      : `Step 1 — the questions: ${ask} — questions only, no model answers — and wait.`,
    "",
    "Step 2 — my answer: I record it on my computer and send it to you as an audio file. If I cannot attach the file, I will speak with your microphone or type what I said.",
    "",
    `Step 3 — your reply: mark my answer exactly as an IELTS examiner would. ${OPINION_NOTE} Reply under these headings, written exactly like this and in this order:`,
    "### MY ANSWER",
    "Exactly what I said, word for word, without correcting it. If you could not hear the audio file, say so in one line and wait for me to speak or type my answer.",
    "### SCORES",
    "FC: <band>",
    "LR: <band>",
    "GRA: <band>",
    'P: <band — only if you really heard my voice; otherwise write "not assessed">',
    "OVERALL: <band>",
    "(half bands only, one per line)",
    "### MISTAKES",
    `One line per mistake, the most important first, at most 12, exactly like this: ${MISTAKE_LINE}`,
    ...modelAnswerRules(l, true),
    `Make the full answer ${length} when spoken.`,
    "Just before FULL ANSWER, one line telling me to press Read aloud, listen to the full answer, then say it myself.",
    "",
    "Step 4 — then wait. When I ask for another question, start again from Step 1, with the same headings every time.",
  ]
    .filter((line, i, all) => line !== "" || (all[i - 1] ?? "") !== "")
    .join("\n");
}

/** Step 2 in writing: the answer, with the question when it comes from a named test. */
export function writingAnswerMessage(
  answer: string,
  words: number,
  minutes: number,
  named: { title: string; question: string; task: number } | null,
): string {
  const head = named
    ? [
        `The question (from "${named.title}"):`,
        named.question.trim() || "(I did not paste the question.)",
        named.task === 1 ? "I attached a screenshot of the chart, table, map or process." : "",
        "",
      ]
    : [];
  return [
    ...head,
    `My answer (${words} words, written in about ${minutes} minute${minutes === 1 ? "" : "s"}):`,
    "<<<",
    answer.trim(),
    ">>>",
    "Please mark it as agreed, under the same headings.",
  ]
    .filter((line, i) => line !== "" || i === head.length - 1)
    .join("\n");
}

/** Step 2 in speaking: the recording goes as a file the learner attaches himself. */
export function speakingAnswerMessage(
  seconds: number,
  named: { title: string; question: string; part: number } | null,
): string {
  const head = named
    ? [
        `The Part ${named.part} questions (from "${named.title}"):`,
        named.question.trim() || "(I did not paste the questions.)",
        "",
      ]
    : [];
  return [
    ...head,
    `My answer is in the audio file I attached (about ${Math.max(1, Math.round(seconds))} seconds).`,
    "Please write it down under MY ANSWER and mark it as agreed, under the same headings.",
  ].join("\n");
}

/** "rtl" when the text has Arabic letters (a note like "people جمع لوحدها"), else "ltr". */
export function textDir(text: string): "rtl" | "ltr" {
  return /[\u0600-\u06FF]/.test(text) ? "rtl" : "ltr";
}

/* ---------- reading the reply back ---------- */

export type ReplySection = "my_answer" | "scores" | "mistakes" | "model_answer";

const HEADINGS: Record<string, ReplySection> = {
  "MY ANSWER": "my_answer",
  SCORES: "scores",
  SCORE: "scores",
  MISTAKES: "mistakes",
  "MODEL ANSWER": "model_answer",
};

/** v0.0.17: the reply's parts under the agreed headings ("### SCORES", "**SCORES**",
 *  "SCORES:"…). A heading met again starts its part again (the last one counts). */
export function splitTutorReply(reply: string): Partial<Record<ReplySection, string>> {
  const parts: Partial<Record<ReplySection, string[]>> = {};
  let current: ReplySection | null = null;
  for (const raw of reply.split(/\r?\n/)) {
    const bare = raw
      .replace(/[#*_`:]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\d+[.)]\s*/, "")
      .toUpperCase();
    // "MODEL ANSWER (band 7.0)" or "SCORES — opinion only" count too
    const m = /^(MY ANSWER|SCORES?|MISTAKES|MODEL ANSWER)(?:\s*[(\-—–].{0,40})?$/.exec(bare);
    const heading = m ? HEADINGS[m[1]] : undefined;
    if (heading) {
      current = heading;
      parts[heading] = [];
      continue;
    }
    if (current) parts[current]!.push(raw);
  }
  const out: Partial<Record<ReplySection, string>> = {};
  for (const [key, lines] of Object.entries(parts) as [ReplySection, string[]][]) {
    const text = lines.join("\n").trim();
    if (text) out[key] = text;
  }
  return out;
}

export interface ModelPart {
  mine: string;
  better: string;
  why: string;
}

/** The model answer part by part (MINE / BETTER / WHY) and the full answer after it. */
export function readModelAnswer(text: string): { parts: ModelPart[]; full: string } {
  const parts: ModelPart[] = [];
  const fullLines: string[] = [];
  let field: keyof ModelPart | "full" | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\*\*|__|`/g, "").trim();
    if (field === "full") {
      fullLines.push(raw.replace(/\*\*|__/g, "").trimEnd());
      continue;
    }
    const full = /^#*\s*FULL ANSWER\s*:?\s*(.*)$/i.exec(line);
    if (full) {
      field = "full";
      if (full[1]) fullLines.push(full[1]);
      continue;
    }
    const m = /^(?:[-*•]\s*)?(MINE|BETTER|WHY)\s*:\s*(.*)$/i.exec(line);
    if (m) {
      const key = m[1].toLowerCase() as keyof ModelPart;
      if (key === "mine" || parts.length === 0) parts.push({ mine: "", better: "", why: "" });
      field = key;
      parts[parts.length - 1][key] = m[2].trim();
      continue;
    }
    if (!line || /^\[\d+\]$/.test(line) || /^\(then \[2\]/i.test(line)) continue;
    if (/read aloud/i.test(line)) continue; // the reminder to listen, not part of the answer
    if (field && parts.length) {
      const last = parts[parts.length - 1];
      last[field] = `${last[field]} ${line}`.trim();
    }
  }
  return {
    parts: parts.filter((p) => p.mine || p.better),
    full: fullLines.join("\n").trim(),
  };
}

/** Copies a message for the chat that is already open (no new tab). */
export async function copyOnly(text: string): Promise<boolean> {
  try {
    const bridge = window.ipBridge;
    if (bridge?.copyText && (await bridge.copyText(text))) return true;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** What the app can read back from the tutor's reply: the overall opinion and the
 *  mistakes in the agreed format. Anything else stays as text. */
export function readTutorReply(reply: string): {
  overall: number | null;
  mistakes: MistakeInput[];
} {
  const plain = reply.replace(/\*\*|__|`/g, "");
  const m = /OVERALL\D{0,12}(\d(?:\.5)?)/i.exec(plain);
  let overall: number | null = m ? Number(m[1]) : null;
  if (overall !== null && (overall < 0 || overall > 9)) overall = null;
  const mistakes: MistakeInput[] = [];
  for (const raw of plain.split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "");
    const wrong = /WRONG\s*:\s*(.*?)\s*(?:\|\||$)/i.exec(line);
    const right = /RIGHT\s*:\s*(.*?)\s*(?:\|\||$)/i.exec(line);
    if (!wrong || !right || !wrong[1] || !right[1]) continue;
    // the format line itself, if the tutor repeats it
    if (/^<.*>$/.test(wrong[1].trim()) || /^<.*>$/.test(right[1].trim())) continue;
    const why = /WHY\s*:\s*(.*?)\s*(?:\|\||$)/i.exec(line)?.[1] ?? "";
    const codeRaw = (/CODE\s*:\s*([A-Z]{2}-[A-Z]{2,8})/i.exec(line)?.[1] ?? "").toUpperCase();
    mistakes.push({
      wrong: wrong[1].replace(/^["“]|["”]$/g, "").slice(0, 300),
      right: right[1].replace(/^["“]|["”]$/g, "").slice(0, 500),
      why: why.slice(0, 500),
      code: /^[A-Z]{2}-[A-Z]{2,8}$/.test(codeRaw) ? codeRaw : "",
    });
    if (mistakes.length >= 50) break;
  }
  return { overall, mistakes };
}

/** The marks per criterion in a pasted reply ("TR: 6.0", "CC 5.5"…), to fill the boxes. */
export function readTutorScores(reply: string): Record<string, number> {
  const plain = reply.replace(/\*\*|__|`/g, "");
  const out: Record<string, number> = {};
  const map: [RegExp, string][] = [
    [/\b(?:TR|TA)\b\s*[:=]?\s*(\d(?:\.5)?)/i, "task"],
    [/\bCC\b\s*[:=]?\s*(\d(?:\.5)?)/i, "coherence"],
    [/\bLR\b\s*[:=]?\s*(\d(?:\.5)?)/i, "lexical"],
    [/\bGRA\b\s*[:=]?\s*(\d(?:\.5)?)/i, "grammar"],
    [/\bFC\b\s*[:=]?\s*(\d(?:\.5)?)/i, "fluency"],
    [/(?:^|\n)\s*(?:P|PR|Pronunciation)\s*[:=]\s*(\d(?:\.5)?)/i, "pronunciation"],
  ];
  for (const [re, key] of map) {
    const m = re.exec(plain);
    if (m) {
      const v = Number(m[1]);
      if (v >= 0 && v <= 9) out[key] = v;
    }
  }
  return out;
}

/** Copies the prompt and opens the tutor's site in the owner's browser. */
export async function copyAndOpen(text: string, site: TutorSite): Promise<boolean> {
  const bridge = window.ipBridge;
  let copied = false;
  try {
    copied = bridge?.copyText ? await bridge.copyText(text) : false;
    if (!copied) {
      await navigator.clipboard.writeText(text);
      copied = true;
    }
  } catch {
    copied = false;
  }
  await bridge?.openExternal(TUTOR_SITES[site].url);
  return copied;
}
