import { germanToEnglish, type LibraryHit, type SearchResult } from "@onboard/library.mjs";

/**
 * Which retrieved passages count as an answer. A passage that only shares a
 * word or two with the question is not one: the assistant then says the
 * library has no good answer instead of showing it.
 *
 * - vector tier: cosine similarity >= DEMIFY_ASSISTANT_MIN_SCORE (default
 *   0.5); a hit less than VECTOR_STRONG_MARGIN above it must also contain
 *   most of the question's words (with nomic-embed-text, passages that
 *   answer score about 0.75-0.88, off-topic ones such as the kidney-stone
 *   question about 0.55-0.60);
 * - full-text and bundled tiers: their scores are keyword ranks, not
 *   similarities, so a passage must also contain most of the question's
 *   words (TERM_COVERAGE_MIN; a question of SHORT_QUESTION_TERMS words or
 *   fewer: half of them, including the rarest); bundled scores (BM25 share
 *   of the best possible score, 0..1) must also reach BUNDLED_MIN_SCORE.
 */

/** Share of the question's search words a keyword hit must contain. */
export const TERM_COVERAGE_MIN = 0.6;
/** Minimum normalised BM25 score of a bundled hit. */
export const BUNDLED_MIN_SCORE = 0.25;
/** A vector hit this far above DEMIFY_ASSISTANT_MIN_SCORE counts without the word check. */
export const VECTOR_STRONG_MARGIN = 0.15;

/** Same idea as the library's keyword search: English stopwords and question fillers. */
const STOPWORDS = new Set(
  (
    "a about above after again against all am an and any are as at be because been before being below between both but by " +
    "can could did do does doing during each few for from further had has have having he her here hers herself him himself " +
    "his how i if in into is it its itself just me more most my myself no nor not of off on once only or other our ours " +
    "ourselves out over own same she should so some such than that the their theirs them themselves then there these they " +
    "this those through to too under until very was we were what when where which while who whom why will with would you " +
    "your yours yourself yourselves s t don shall may might must also please tell say says show shows us let get got know " +
    "need needs want someone somebody anyone anybody first now happen happening going crushing having doing please quickly " +
    "right ok"
  ).split(" "),
);

/** Light stemmer: plurals, -ing, -ed, final -e (so "handling" meets "handle"). */
function stem(word: string): string {
  let w = word;
  if (w.length <= 3 || /^\d/.test(w)) return w;
  if (w.endsWith("ies") && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (w.endsWith("s") && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
  if (w.endsWith("ing") && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith("ed") && w.length > 4) w = w.slice(0, -2);
  if (w.endsWith("e") && w.length > 4) w = w.slice(0, -1);
  return w;
}

/** Search words of a text: lower case, diacritics folded, stopwords dropped, stemmed. */
export function searchWords(text: string): string[] {
  return (
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? []
  )
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem);
}

/** The words a question is searched with: a German question by its English (glossary, see germanToEnglish). */
export function searchQuestion(question: string): string {
  return germanToEnglish(question) ?? question;
}

/** The question's search words for the coverage check (plain numbers such as "185/115" left out: values rarely appear in the text). */
export function questionTerms(question: string): string[] {
  return [...new Set(searchWords(searchQuestion(question)))].filter((t) => !/^\d+$/.test(t));
}

/**
 * Share (0..1) of the question's search words that appear in the passage.
 * Plain numbers ("185/115") are left out: values rarely appear in the text.
 * A German question counts with its English (searchQuestion).
 */
export function termCoverage(question: string, passage: string): number {
  const terms = questionTerms(question);
  if (!terms.length) return 0;
  const words = new Set(searchWords(passage));
  return terms.filter((t) => words.has(t)).length / terms.length;
}

/** Share of a short question's (SHORT_QUESTION_TERMS words or fewer) search words a keyword hit must contain, the rarest among them. */
export const SHORT_COVERAGE_MIN = 0.5;
/** Up to this many search words a question counts as short. */
export const SHORT_QUESTION_TERMS = 3;

/** How often a search word occurs (passages of the library containing it); lower is rarer. */
export type TermFrequency = (term: string) => number;

/**
 * Whether the passage covers the question: most of its search words
 * (TERM_COVERAGE_MIN), or for a short question (SHORT_QUESTION_TERMS words
 * or fewer) at least half of them including the rarest one (the word that
 * says what the question is about: "seizure", not "treatment").
 */
export function coversQuestion(question: string, passage: string, frequency: TermFrequency): boolean {
  const terms = questionTerms(question);
  if (!terms.length) return false;
  const words = new Set(searchWords(passage));
  const matched = terms.filter((t) => words.has(t));
  const share = matched.length / terms.length;
  if (share >= TERM_COVERAGE_MIN) return true;
  if (terms.length > SHORT_QUESTION_TERMS || share < SHORT_COVERAGE_MIN) return false;
  const rarest = Math.min(...terms.map(frequency));
  return matched.some((t) => frequency(t) === rarest);
}

/** Frequency of each search word among these hits (when no library-wide count is given). */
function hitFrequency(hits: LibraryHit[]): TermFrequency {
  const sets = hits.map((h) => new Set(searchWords(`${h.title} ${h.heading} ${h.text}`)));
  return (t) => sets.filter((s) => s.has(t)).length;
}

/**
 * The hits that count as an answer, best first, at most k. opts.frequency
 * says how rare a search word is in the library (bundled index); without it
 * the hits themselves are counted.
 */
export function usableHits(
  result: SearchResult,
  question: string,
  opts: { minScore: number; k: number; frequency?: TermFrequency },
): LibraryHit[] {
  const frequency = opts.frequency ?? hitFrequency(result.hits);
  const covers = (h: LibraryHit) => coversQuestion(question, `${h.title} ${h.heading} ${h.text}`, frequency);
  return result.hits
    .filter((h) => {
      if (!h.integrityOk) return false;
      if (h.tier === "vector") {
        if (!(h.score >= opts.minScore)) return false;
        return h.score >= opts.minScore + VECTOR_STRONG_MARGIN || covers(h);
      }
      if (!(h.score > 0)) return false;
      if (h.tier === "bundled" && h.score < BUNDLED_MIN_SCORE) return false;
      return covers(h);
    })
    .slice(0, Math.max(1, Math.floor(opts.k)));
}
