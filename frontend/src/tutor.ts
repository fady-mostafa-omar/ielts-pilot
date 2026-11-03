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
  target: number;
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

function aboutMe(l: Learner, skill: string): string {
  const level = l.band !== null ? `about band ${l.band.toFixed(1)}` : "not measured yet";
  return `About me: my ${skill} level is ${level}; my target is band ${l.target.toFixed(1)}.`;
}

const MISTAKES_FORMAT = `Then write a line that says only MISTAKES, followed by one line per mistake (the most important first, at most 12), exactly in this format:
WRONG: <my exact words> || RIGHT: <the corrected words> || WHY: <a short reason> || CODE: <one of ${ERROR_CODES.join(", ")}>`;

const OPINION_NOTE =
  "Your marks are practice feedback and an opinion only, not an official IELTS score.";

/** v0.0.13 (owner, 2026-11-03): one short prompt opens the chat — the tutor sends a topic
 *  only and waits; the answer goes to the same chat and is marked like the exam. */
export function writingStarterPrompt(task: 1 | 2, l: Learner): string {
  const first = task === 1 ? "TA" : "TR";
  return [
    `Act as my IELTS Writing examiner. Send me ONE new IELTS Academic Writing Task ${task} question only — no tips, no model answer — and wait for my answer.`,
    task === 1
      ? "Describe the chart, table, map or process fully in text (give the numbers in a table), as I cannot see pictures here."
      : "",
    `When I send my answer, mark it exactly as an IELTS examiner would: a band in half bands for ${first}, CC, LR and GRA, and the overall band for the task, each on its own line like "${first}: 6.0". ${OPINION_NOTE}`,
    MISTAKES_FORMAT,
    `Then give a better version of my answer at about band ${l.target.toFixed(1)}.`,
    `${aboutMe(l, "writing")} ${language(l.explain)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function writingAnswerMessage(answer: string, words: number, minutes: number): string {
  return `Here is my answer (${words} words, about ${minutes} minutes). Please mark it as agreed.\n\n${answer.trim()}`;
}

export function speakingStarterPrompt(part: 1 | 2 | 3, l: Learner): string {
  const ask =
    part === 1
      ? "ask me 4 IELTS Speaking Part 1 questions on one everyday topic"
      : part === 2
        ? "give me one IELTS Speaking Part 2 cue card (the topic and the 3–4 points to talk about)"
        : "ask me 4 IELTS Speaking Part 3 discussion questions on one common topic";
  return [
    `Act as my IELTS Speaking examiner: ${ask} — questions only, no model answers — and wait.`,
    "I will record my answer and send you what I said as text (it may come from voice typing, so ignore recognition errors; you cannot hear my pronunciation).",
    `Then mark it like an IELTS examiner: a band in half bands for FC, LR and GRA and an overall band, each on its own line like "FC: 6.0" (pronunciation not assessed). ${OPINION_NOTE}`,
    MISTAKES_FORMAT,
    `Then show a better answer at about band ${l.target.toFixed(1)} in natural spoken English.`,
    `${aboutMe(l, "speaking")} ${language(l.explain)}`,
  ].join("\n");
}

export function speakingAnswerMessage(transcript: string, seconds: number): string {
  return `Here is what I said (about ${Math.round(seconds)} seconds). Please mark it as agreed.\n\n${transcript.trim()}`;
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

/** Asks the tutor for a fresh practice question. */
export function writingQuestionPrompt(task: 1 | 2, l: Learner): string {
  if (task === 1) {
    return [
      "Give me one new IELTS Academic Writing Task 1 question for practice.",
      "Describe the chart, table, map or process completely in text (for a chart, give the numbers in a table) so I can write without seeing a picture.",
      `${aboutMe(l, "writing")} Give only the task, no model answer.`,
    ].join("\n");
  }
  return [
    "Give me one new IELTS Writing Task 2 question for practice, on a common exam topic.",
    `${aboutMe(l, "writing")} Give only the question, no model answer.`,
  ].join("\n");
}

export function writingFeedbackPrompt(
  task: 0 | 1 | 2,
  question: string,
  answer: string,
  words: number,
  minutes: number,
  l: Learner,
): string {
  const kind =
    task === 1 ? "IELTS Academic Writing Task 1" : task === 2 ? "IELTS Writing Task 2" : "free writing";
  const criteria =
    task === 1
      ? "TA (Task Achievement), CC (Coherence and Cohesion), LR (Lexical Resource), GRA (Grammatical Range and Accuracy)"
      : "TR (Task Response), CC (Coherence and Cohesion), LR (Lexical Resource), GRA (Grammatical Range and Accuracy)";
  const first = task === 1 ? "TA" : "TR";
  return [
    `You are an experienced IELTS writing teacher. Give feedback on my ${kind} answer. ${OPINION_NOTE}`,
    aboutMe(l, "writing"),
    "",
    `The question:\n${question.trim() || "(I did not paste the question.)"}`,
    "",
    `My answer (${words} words, written in about ${minutes} minutes):`,
    "<<<",
    answer.trim(),
    ">>>",
    "",
    "Reply in this order:",
    `1. One line exactly like: AI OPINION: OVERALL 6.0 | ${first} 6.0 | CC 6.0 | LR 6.0 | GRA 6.0 — using half bands (criteria: ${criteria}).`,
    "2. The three changes that would raise my band the most.",
    `3. ${MISTAKES_FORMAT}`,
    `4. A better version of my answer that keeps my ideas, at about band ${l.target.toFixed(1)}.`,
    "5. Five useful words or phrases for this topic, each with its Arabic meaning.",
    l.words.length
      ? `If it fits naturally, show where I could have used some of the words I am learning: ${l.words.join(", ")}.`
      : "",
    language(l.explain),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function speakingQuestionPrompt(part: 1 | 2 | 3, l: Learner): string {
  const ask =
    part === 1
      ? "Give me 4 IELTS Speaking Part 1 questions on one everyday topic."
      : part === 2
        ? "Give me one IELTS Speaking Part 2 cue card (the topic and the 3–4 points to talk about)."
        : "Give me 4 IELTS Speaking Part 3 discussion questions on one common topic.";
  return `${ask}\n${aboutMe(l, "speaking")} Give only the questions, no model answers.`;
}

export function speakingFeedbackPrompt(
  part: 0 | 1 | 2 | 3,
  question: string,
  transcript: string,
  seconds: number,
  l: Learner,
): string {
  return [
    `You are an IELTS speaking examiner and coach. Below is the transcript of my answer to ${part ? `Speaking Part ${part}` : "a speaking practice question"}. ${OPINION_NOTE}`,
    "The transcript may come from voice typing, so ignore obvious recognition errors. You cannot hear me: do not judge my pronunciation.",
    aboutMe(l, "speaking"),
    "",
    `The question:\n${question.trim() || "(I did not paste the question.)"}`,
    "",
    `My answer (spoken for about ${Math.round(seconds)} seconds):`,
    "<<<",
    transcript.trim(),
    ">>>",
    "",
    "Reply in this order:",
    "1. One line exactly like: AI OPINION: OVERALL 6.0 | FC 6.0 | LR 6.0 | GRA 6.0 (pronunciation not assessed) — using half bands.",
    "2. What I did well, and the three changes that would help most (fluency, ideas, vocabulary, grammar).",
    `3. ${MISTAKES_FORMAT}`,
    `4. A better answer that keeps my ideas, at about band ${l.target.toFixed(1)}, in natural spoken English.`,
    part === 2 ? "5. Three Part 3 questions an examiner could ask next." : "5. Two follow-up questions to practise next.",
    l.words.length
      ? `If it fits naturally, show where I could have used some of the words I am learning: ${l.words.join(", ")}.`
      : "",
    language(l.explain),
  ]
    .filter((line) => line !== "")
    .join("\n");
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
