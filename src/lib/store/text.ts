/**
 * Text that PostgreSQL can store. Its text and jsonb types cannot hold the NUL
 * character (U+0000), and jsonb rejects unpaired UTF-16 surrogates (JSON
 * escapes such as "\ud800" without a partner). Plain functions, no I/O: the
 * readings route validates with isStorableText, the PostgreSQL store cleans
 * with cleanText before every insert and import.
 */

const NUL = "\u0000";

/** true when the string has no NUL character and no unpaired surrogate. */
export function isStorableText(value: string): boolean {
  return !value.includes(NUL) && isWellFormed(value);
}

/** NUL characters removed, unpaired surrogates replaced by U+FFFD; anything else unchanged. */
export function cleanText(value: string): string {
  const out = value.includes(NUL) ? value.replaceAll(NUL, "") : value;
  return isWellFormed(out) ? out : toWellFormed(out);
}

/** cleanText on every string (object keys included) of a plain JSON value. */
export function cleanDeep(value: unknown): unknown {
  if (typeof value === "string") return cleanText(value);
  if (Array.isArray(value)) return value.map(cleanDeep);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [cleanText(k), cleanDeep(v)]));
  }
  return value;
}

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function isWellFormed(value: string): boolean {
  if (typeof value.isWellFormed === "function") return value.isWellFormed();
  LONE_SURROGATE.lastIndex = 0;
  return !LONE_SURROGATE.test(value);
}

function toWellFormed(value: string): string {
  if (typeof value.toWellFormed === "function") return value.toWellFormed();
  return value.replace(LONE_SURROGATE, "�");
}
