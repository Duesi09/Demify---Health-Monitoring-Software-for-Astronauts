import { BLOCKED_REASON, NO_ANSWER_TOKEN, PASSAGES_ONLY_REASON } from "./wording";

/**
 * Safety rules of the onboard assistant, as pure functions:
 *
 * - questions that ask for a medicine, a dose or a prescription are never
 *   answered (status "blocked"); this prototype has no medicines in its
 *   library and never names one;
 * - questions that name an emergency get an "act now" line first: the
 *   emergency checklist and the crew come before any assistant;
 * - every model answer is checked before it is shown: it must cite at least
 *   one library passage, markers that point nowhere are removed, and an
 *   answer with a dose or an amount is never shown.
 *
 * No medicine names here either: the checks look for the request (medicine,
 * dose, prescription, "how much should I take") and for amounts with units.
 */

/** Words that ask for a medicine or a prescription (English, plus a few common words in other languages). */
const MEDICINE_REQUEST =
  /\b(medicines?|medications?|meds|drugs?|pills?|tablets?|capsules?|pain ?killers?|analgesics?|antibiotics?|sedatives?|sleeping aids?|prescriptions?|prescrib(?:e|es|ed|ing)|dosages?|dosing|overdos(?:e|es|ed|ing)|injections?|inject(?:s|ed|ing)?|medikament\w*|arznei\w*|dosierung\w*|tablette\w*|m[ée]dicament\w*|medicamento\w*|f[aá]rmaco\w*|posolog\w*)\b/i;

/** "dose" is also a radiation word ("radiation dose", "dose rate", "career dose"). */
const DOSE_WORD = /\b(doses?|dosis)\b/i;
const RADIATION_CONTEXT =
  /radiat|\bm?sv\b|µsv|μsv|\bm?gy\b|sievert|\bgray\b|dosimet|exposure|career|cumulative|cosmic|\bgcr\b|\bspe\b|solar|storm|shield|alara|proton|dose[- ]rates?/i;

/** "how much should I take", "what can we give him for …". */
const TAKE_OR_GIVE =
  /\bhow (?:much|many)\b[^.?!]*\b(?:take|give|administer|use)\b|\bwhat\b[^.?!]*\b(?:can|could|should|do|must)\b[^.?!]*\b(?:take|give|administer)\b[^.?!]*\bfor\b/i;

/**
 * An amount with a unit used for medicines (mg, mcg, mL, IU, units, tablets …).
 * Lab units such as mg/dL or mg/L and radiation units are not doses.
 */
export const DOSE_PATTERN =
  /\b\d+(?:[.,]\d+)?\s?(?:mg|mcg|µg|μg|ug|ml|cc|iu|units?|tablets?|pills?|capsules?|drops?|puffs?|sprays?|ampoules?|ampules?|vials?|sachets?|patch(?:es)?)\b(?!\s*\/\s*(?:dl|l)\b)|\bmg\s*\/\s*kg\b|\bper\s+kg\b/i;

/** Words that describe an emergency happening now. */
const EMERGENCY =
  /\b(not breathing|stopped breathing|isn'?t breathing|can'?t breathe|cannot breathe|no pulse|pulseless|unconscious|unresponsive|passed out|collapsed?|cardiac arrest|heart attack|ventricular fibrillation|ventricular tachycardia|v-?fib|v-?tach|stemi|chest pain|choking|seizures?|convuls\w*|stroke|severe bleeding|bleeding heavily|anaphyla\w*|bewusstlos|atmet nicht|herzstillstand|kammerflimmern|brustschmerz\w*)\b/i;
/** VF / VT as monitor abbreviations (upper case only, so "vt" in other words does not count). */
const EMERGENCY_ABBREVIATION = /\b(VF|VT)\b/;

/** The reason a question is never answered, or null when it may be. */
export function blockedReason(question: string): string | null {
  if (MEDICINE_REQUEST.test(question)) return BLOCKED_REASON;
  if (DOSE_WORD.test(question) && !RADIATION_CONTEXT.test(question)) return BLOCKED_REASON;
  if (DOSE_PATTERN.test(question)) return BLOCKED_REASON;
  if (TAKE_OR_GIVE.test(question)) return BLOCKED_REASON;
  return null;
}

/** The question names an emergency (the reply starts with ACT_NOW_LINE). */
export function isEmergency(question: string): boolean {
  return EMERGENCY.test(question) || EMERGENCY_ABBREVIATION.test(question);
}

export function containsDose(text: string): boolean {
  return DOSE_PATTERN.test(text);
}

export type AnswerCheck =
  | { ok: true; text: string; cited: number[] }
  | { ok: false; kind: "no-answer" | "uncited" | "dose"; reason: string };

/**
 * Normalises citation markers to [n]: "[1, 2]" and "[1-3]" become
 * "[1][2]" and "[1][2][3]", "【1†source】" becomes "[1]", "[c]" becomes "[C]".
 */
function normaliseMarkers(text: string): string {
  return text
    .replace(/【\s*(\d+)[^】]*】/g, "[$1]")
    .replace(/\[\s*c\s*\]/gi, "[C]")
    .replace(/\[\s*(\d+)\s*[-–]\s*(\d+)\s*\]/g, (whole, a: string, b: string) => {
      const from = Number(a);
      const to = Number(b);
      if (!(to >= from) || to - from > 20) return whole;
      return Array.from({ length: to - from + 1 }, (_, i) => `[${from + i}]`).join("");
    })
    .replace(/\[\s*(\d+(?:\s*[,;]\s*\d+)+)\s*\]/g, (_, list: string) =>
      list
        .split(/[,;]/)
        .map((n) => `[${n.trim()}]`)
        .join(""),
    )
    .replace(/\[\s*(\d+)\s*\]/g, "[$1]");
}

/**
 * Checks a model answer against the passages it was given (numbered
 * 1..passageCount). Removes markers out of range; needs at least one valid
 * [n]; rejects any dose pattern; "NO_ANSWER" means the passages did not
 * answer the question.
 */
export function checkAnswer(raw: string, passageCount: number): AnswerCheck {
  const text = raw.trim();
  if (!text || new RegExp(`\\b${NO_ANSWER_TOKEN}\\b`).test(text)) {
    return { ok: false, kind: "no-answer", reason: "the model found no answer in the passages" };
  }
  if (containsDose(text)) return { ok: false, kind: "dose", reason: PASSAGES_ONLY_REASON.dose };

  const cited = new Set<number>();
  const cleaned = normaliseMarkers(text)
    .replace(/\[(\d+)\]/g, (marker, n: string) => {
      const i = Number(n);
      if (Number.isInteger(i) && i >= 1 && i <= passageCount) {
        cited.add(i);
        return marker;
      }
      return "";
    })
    // Tidy the gaps left by removed markers.
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  if (!cited.size) return { ok: false, kind: "uncited", reason: PASSAGES_ONLY_REASON.uncited };
  return { ok: true, text: cleaned, cited: [...cited].sort((a, b) => a - b) };
}
