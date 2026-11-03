// v0.0.14 (owner, 2026-11-03, D-044): tests by name. The question types of the IELTS
// Listening and Academic Reading papers, with the exam's own English names, for the official
// samples and for "the types I got wrong" in a full test.

export const QTYPES: Record<"listening" | "reading", { key: string; label: string }[]> = {
  listening: [
    { key: "mc_one", label: "Multiple choice (one answer)" },
    { key: "mc_multi", label: "Multiple choice (more than one)" },
    { key: "matching", label: "Matching" },
    { key: "map_labelling", label: "Plan / map / diagram labelling" },
    { key: "form_completion", label: "Form completion" },
    { key: "note_completion", label: "Note completion" },
    { key: "table_completion", label: "Table completion" },
    { key: "flow_chart", label: "Flow-chart completion" },
    { key: "summary_completion", label: "Summary completion" },
    { key: "sentence_completion", label: "Sentence completion" },
    { key: "short_answer", label: "Short answer" },
  ],
  reading: [
    { key: "mc_one", label: "Multiple choice (one answer)" },
    { key: "mc_multi", label: "Multiple choice (more than one)" },
    { key: "tfng", label: "True / False / Not Given" },
    { key: "ynng", label: "Yes / No / Not Given" },
    { key: "matching_info", label: "Matching information" },
    { key: "matching_headings", label: "Matching headings" },
    { key: "matching_features", label: "Matching features" },
    { key: "matching_endings", label: "Matching sentence endings" },
    { key: "sentence_completion", label: "Sentence completion" },
    { key: "summary_text", label: "Summary (words from the text)" },
    { key: "summary_list", label: "Summary (from a list)" },
    { key: "note_completion", label: "Note completion" },
    { key: "table_completion", label: "Table completion" },
    { key: "flow_chart", label: "Flow-chart completion" },
    { key: "diagram_labelling", label: "Diagram label completion" },
    { key: "short_answer", label: "Short answer" },
  ],
};

export function qtypeLabel(skill: string, key: string): string {
  const list = QTYPES[skill as "listening" | "reading"] ?? [];
  return list.find((q) => q.key === key)?.label ?? key.replace(/_/g, " ");
}

export const PROVIDER_LABEL: Record<string, string> = {
  official: "ielts.org",
  engnovate: "engnovate",
  ieltsonlinetests: "ieltsonlinetests",
  britishcouncil: "British Council",
  dalilk: "Dalilk",
};

/** Questions in a whole Listening / Reading test. */
export const FULL_QUESTIONS = 40;

export const BANDS = Array.from({ length: 19 }, (_, i) => i / 2);
