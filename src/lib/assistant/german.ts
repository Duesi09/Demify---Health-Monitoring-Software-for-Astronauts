import { GERMAN_STOPWORDS, germanTerm } from "@onboard/library.mjs";
import { foldWord, stemSet, stemWord } from "./safety";

/**
 * German questions against the English library. The keyword searches
 * translate a German question with the reviewed glossary in
 * onboard/library.mjs (germanToEnglish); the model answers in the language
 * of the question. This file keeps the grounding check fair to such an
 * answer: a German answer naturally repeats German words of the question
 * ("Pulsoximeter", "Checkliste") that the English passages cannot contain.
 */

/**
 * True when a (folded) German word of the question is backed by these
 * texts: a German function word (it carries no fact), or a glossary term
 * whose English the backing contains (at least half of its English words,
 * by stem: "Kammerflimmern" -> "ventricular fibrillation").
 */
export function germanWordBacked(word: string, backed: Set<string>): boolean {
  const w = foldWord(word);
  if (GERMAN_STOPWORDS.has(w)) return true;
  const en = germanTerm(w);
  if (!en) return false;
  const stems = (en.match(/\p{L}+/gu) ?? []).map((x) => stemWord(foldWord(x)));
  if (!stems.length) return false;
  const hits = stems.filter((s) => backed.has(s)).length;
  return hits * 2 >= stems.length;
}

/** The grounding candidates (groundingCandidates) minus the German words the backing covers by their English. */
export function germanBackedRemoved(candidates: string[], backing: string[]): string[] {
  if (!candidates.length) return candidates;
  const backed = stemSet(backing);
  return candidates.filter((w) => !germanWordBacked(w, backed));
}
