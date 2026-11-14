import { searchWords } from "./relevance";

/**
 * Citation excerpts: up to EXCERPT_MAX characters of a library passage,
 * centred on the words that match the question (so the line that answers
 * it is in view), cut at word boundaries with "…", keeping the line breaks
 * of lists. The whole passage travels with the citation as Citation.text.
 * Pure functions.
 */

/** Excerpts are at most this many characters (ellipses included). */
export const EXCERPT_MAX = 300;

/** Line breaks kept, spaces collapsed inside lines, blank lines dropped. */
export function tidyPassage(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t\f\v ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

interface Match {
  start: number;
  end: number;
  term: string;
}

/** Where the question's search words occur in the text. */
function matchesIn(text: string, question: string): Match[] {
  const terms = new Set(searchWords(question));
  if (!terms.size) return [];
  const out: Match[] = [];
  for (const m of text.matchAll(/[\p{L}\p{N}]+/gu)) {
    const term = searchWords(m[0])[0];
    if (term && terms.has(term)) out.push({ start: m.index, end: m.index + m[0].length, term });
  }
  return out;
}

/** The densest run of matches that fits in width characters: most distinct words, then most matches, then earliest. */
function focus(matches: Match[], width: number): { start: number; end: number } | null {
  if (!matches.length) return null;
  let best = { i: 0, j: 0, distinct: 0, count: 0 };
  for (let i = 0; i < matches.length; i++) {
    const seen = new Set<string>();
    let j = i;
    while (j < matches.length && matches[j].end - matches[i].start <= width) seen.add(matches[j++].term);
    const count = j - i;
    if (seen.size > best.distinct || (seen.size === best.distinct && count > best.count)) best = { i, j: j - 1, distinct: seen.size, count };
  }
  return { start: matches[best.i].start, end: matches[best.j].end };
}

const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c);

/**
 * Up to max characters of text around the words that match the question.
 * Without a match (or without a question) the excerpt starts at the top.
 */
export function excerpt(text: string, question = "", max = EXCERPT_MAX): string {
  const flat = tidyPassage(text);
  if (flat.length <= max) return flat;
  const width = max - 2; // room for both ellipses
  const f = focus(matchesIn(flat, question), width);

  let start = 0;
  if (f) {
    start = Math.round((f.start + f.end) / 2 - width / 2);
    start = Math.max(0, Math.min(start, flat.length - width, f.start));
    // Begin at the line that holds the first match when that line starts inside the window (list items stay whole).
    const lineStart = flat.lastIndexOf("\n", f.start - 1) + 1;
    if (lineStart > start) start = lineStart;
    else if (start > 0 && !isSpace(flat[start - 1])) {
      // Mid-word: move to the next word.
      let s = start;
      while (s < f.start && !isSpace(flat[s - 1])) s++;
      start = s;
    }
  }

  const lead = start > 0 ? 1 : 0;
  let end = flat.length;
  if (flat.length - start > max - lead) {
    end = start + max - lead - 1;
    // Cut at the last space or line break before the limit (unless that would leave almost nothing).
    let cut = end;
    while (cut > start && !isSpace(flat[cut])) cut--;
    if (cut - start > (max - lead - 1) * 0.6) end = cut;
  }
  const body = flat
    .slice(start, end)
    .replace(/^[\s,;:.]+/, "")
    .replace(/[\s,;:.–-]+$/, "");
  return `${lead ? "…" : ""}${body}${end < flat.length ? "…" : ""}`;
}
