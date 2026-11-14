// @ts-check
/**
 * The local medical library: curated Markdown documents (library/**.md with
 * front matter) plus the medical-kit inventory (library/inventory/*.json),
 * chunked, checksummed, embedded and stored in PostgreSQL. The same module
 * reads the bundled files directly when there is no database (laptop mode).
 *
 * Contract: onboard/library.d.mts. Plain JavaScript on purpose (see
 * onboard/config.mjs): the app, the ingestion CLI and the sync service all
 * import it, the scripts with plain `node`.
 *
 * Integrity: every document stores the SHA-256 of its body (its version id)
 * and every chunk the SHA-256 of its text. Search re-hashes each hit before
 * it is returned and drops any that no longer match; a sync rewrites
 * documents and chunks whose stored text no longer matches its checksum.
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { LOCK_SYNC, withAdvisoryLock } from "./db.mjs";

/** @typedef {import("./library.d.mts").LibraryCategory} LibraryCategory */
/** @typedef {import("./library.d.mts").LibraryDoc} LibraryDoc */
/** @typedef {import("./library.d.mts").LibraryChunk} LibraryChunk */
/** @typedef {import("./library.d.mts").MedKitItem} MedKitItem */
/** @typedef {import("./library.d.mts").LibraryHit} LibraryHit */
/** @typedef {import("./library.d.mts").SearchResult} SearchResult */
/** @typedef {import("./library.d.mts").SyncResult} SyncResult */
/** @typedef {import("./config.d.mts").OnboardConfig} OnboardConfig */
/** @typedef {import("pg").Pool} Pool */
/** @typedef {import("pg").PoolClient} PoolClient */

/**
 * The model client (onboard/model.mjs), loaded on first use: bundled search
 * and full-text search never need it, and a broken or missing model client
 * then only disables embeddings (search falls back, the sync records why)
 * instead of breaking the whole library module.
 * @type {Promise<typeof import("./model.mjs")> | null}
 */
let modelClient = null;
function model() {
  if (!modelClient) {
    const p = import("./model.mjs");
    modelClient = p;
    p.catch(() => {
      if (modelClient === p) modelClient = null;
    });
  }
  return modelClient;
}

/** @type {readonly LibraryCategory[]} */
const CATEGORIES = ["protocol", "reference", "baseline", "inventory", "drug-reference"];

/** Ids of the documents a sync generates (never read from the ground library, never deleted by it). */
const CREW_DOC_ID = "crew-baselines";
const INVENTORY_DOC_ID = "med-kit-inventory";
const GENERATED_IDS = new Set([CREW_DOC_ID, INVENTORY_DOC_ID]);

const REVIEWED = "Project text, not clinically reviewed";
/** The note every inventory item carries (library/inventory/med-kit.json); the generated document says it once. */
const INVENTORY_NOTE =
  "Representative training inventory; pack names from public NASA sources (2011/2015), contents not confirmed for 2026.";
/** The note of the first inventory version, still dropped from items so an older ground copy reads the same. */
const INVENTORY_NOTE_V1 = "Representative training inventory, not the real ISS kit.";
/** Source of the generated crew-baseline document: the demo crew is simulated. */
const CREW_SOURCE = "Demify crew records (SIMULATED crew profiles, pre-flight baselines)";

/** Same wording as POST /api/sync answers with 409. */
const LINK_DOWN_REASON = "Ground link is down (blackout): nothing to sync from";
const LOCKED_REASON = "Another library sync is running";

/**
 * sync_runs rows that came from the ground: a successful library sync while
 * the ground link was up. Not the startup seed from the release copy, and
 * not a run forced while the ground link was down (a local ingest).
 */
const FROM_GROUND_SQL = "trigger <> 'startup' AND coalesce(detail->>'groundLinkUp', 'true') <> 'false'";

/** sync_runs pruning: keep this many days, and at least this many of the newest rows. */
const SYNC_RUNS_KEEP_DAYS = 30;
const SYNC_RUNS_KEEP_ROWS = 100;

/** Time limit for embedding a question (ms); document embeddings during a sync keep cfg.embedTimeoutMs. */
const QUERY_EMBED_TIMEOUT_MS = 3000;
/** After a failed query embedding, vector search stays off this long (ms). */
const EMBED_BACKOFF_MS = 30_000;

const ID_RE = /^[a-z0-9][a-z0-9._-]*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Front-matter keys the parser knows; others are ignored. */
const FRONT_MATTER_KEYS = ["id", "title", "category", "source", "url", "license", "reviewed", "updated"];
const REQUIRED_KEYS = ["id", "title", "category", "source", "license"];

const EMBED_BATCH = 32;

/* ------------------------------------------------------------------------- */
/* Checksums and parsing                                                      */
/* ------------------------------------------------------------------------- */

/**
 * SHA-256 (hex) of the UTF-8 bytes of text.
 * @param {string} text
 */
export function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** @param {string} value */
function unquote(value) {
  const v = value.trim();
  if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) {
    const inner = v.slice(1, -1);
    return v[0] === '"' ? inner.replace(/\\(["\\])/g, "$1") : inner.replace(/''/g, "'");
  }
  return v;
}

/** @param {unknown} v @returns {v is LibraryCategory} */
function isCategory(v) {
  return typeof v === "string" && /** @type {readonly string[]} */ (CATEGORIES).includes(v);
}

/** @param {string} p */
function toPosix(p) {
  return p.split(path.sep).join("/").replace(/\\/g, "/");
}

/**
 * Parses one Markdown file with YAML-style front matter between `---` lines
 * (`key: value`, values optionally quoted). Throws on a missing or broken
 * front matter block, on missing id/title/category/source/license, on an
 * unknown category, a malformed id or date, and on an empty body.
 * @param {string} relPath
 * @param {string} raw
 * @returns {LibraryDoc}
 */
export function parseDoc(relPath, raw) {
  const where = toPosix(relPath);
  const lines = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") throw new Error(`${where}: missing front matter (a --- block at the top of the file)`);
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (end < 0) throw new Error(`${where}: front matter is not closed with a --- line`);

  /** @type {Record<string, string>} */
  const meta = {};
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const m = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) throw new Error(`${where}: front matter line ${i + 1} is not "key: value": ${line.trim()}`);
    const key = m[1].toLowerCase();
    if (FRONT_MATTER_KEYS.includes(key)) meta[key] = unquote(m[2]);
  }
  for (const key of REQUIRED_KEYS) {
    if (!meta[key]) throw new Error(`${where}: front matter is missing "${key}"`);
  }
  if (!ID_RE.test(meta.id)) {
    throw new Error(`${where}: id "${meta.id}" must be lower case letters, digits, ".", "_" or "-"`);
  }
  const category = meta.category;
  if (!isCategory(category)) {
    throw new Error(`${where}: unknown category "${category}" (use one of ${CATEGORIES.join(", ")})`);
  }
  if (meta.updated && !DATE_RE.test(meta.updated)) {
    throw new Error(`${where}: updated "${meta.updated}" is not a YYYY-MM-DD date`);
  }
  const body = lines
    .slice(end + 1)
    .join("\n")
    .replace(/^\s*\n/, "")
    .replace(/\s+$/, "");
  if (!body.trim()) throw new Error(`${where}: the document has no body`);

  /** @type {LibraryDoc} */
  const doc = {
    id: meta.id,
    title: meta.title,
    category,
    source: meta.source,
    license: meta.license,
    path: where,
    body,
    version: sha256(body),
  };
  if (meta.url) doc.url = meta.url;
  if (meta.reviewed) doc.reviewed = meta.reviewed;
  if (meta.updated) doc.updated = meta.updated;
  return doc;
}

/* ------------------------------------------------------------------------- */
/* Chunking                                                                   */
/* ------------------------------------------------------------------------- */

/** @param {string} s */
function cleanHeading(s) {
  return s
    .replace(/\s+#+\s*$/, "")
    .replace(/[*_`]/g, "")
    .trim();
}

/**
 * Splits a Markdown body into sections at headings (outside code fences).
 * Each section carries its heading path ("H1 › H2 › H3"); text before the
 * first heading gets the document title as its heading.
 * @param {string} body
 * @param {string} title
 * @returns {{ heading: string; text: string }[]}
 */
function splitSections(body, title) {
  /** @type {{ heading: string; text: string }[]} */
  const out = [];
  /** @type {string[]} */
  const stack = [];
  /** @type {string[]} */
  let buf = [];
  let heading = title;
  let fence = false;
  const flush = () => {
    const text = buf.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (text) out.push({ heading, text });
    buf = [];
  };
  for (const line of body.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const m = fence ? null : /^(#{1,6})\s+(.+)$/.exec(line);
    if (m) {
      flush();
      const level = m[1].length;
      stack.length = level - 1;
      stack[level - 1] = cleanHeading(m[2]);
      heading = stack.filter(Boolean).join(" › ") || title;
      continue;
    }
    buf.push(line);
  }
  flush();
  return out;
}

/** @param {string} c */
function isSpace(c) {
  return c === " " || c === "\n" || c === "\t" || c === "\r" || c === "\f" || c === "\v";
}

/**
 * Last index i in [from, to) with text[i] whitespace (and, for a needle,
 * text.startsWith(needle, i)), or -1.
 * @param {string} text @param {number} from @param {number} to @param {string} [needle]
 */
function lastBreak(text, from, to, needle) {
  for (let i = Math.min(to, text.length) - 1; i >= from; i--) {
    if (needle ? text.startsWith(needle, i) : isSpace(text[i])) return i;
  }
  return -1;
}

/**
 * Splits text into pieces of at most max characters that start and end at
 * word boundaries, each overlapping the previous by at most `overlap`
 * characters. Prefers paragraph breaks, then line breaks, then spaces. A
 * single word longer than max is the one case that is cut inside a word.
 * @param {string} text @param {number} max @param {number} overlap
 * @returns {string[]}
 */
function splitText(text, max, overlap) {
  if (text.length <= max) return [text];
  /** @type {string[]} */
  const out = [];
  let start = 0;
  while (start < text.length) {
    if (text.length - start <= max) {
      const tail = text.slice(start).trim();
      if (tail) out.push(tail);
      break;
    }
    const end = start + max; // a piece is text.slice(start, cut) with cut <= end
    const soft = start + Math.floor(max / 2);
    const para = lastBreak(text, soft, end, "\n\n");
    const line = para < 0 ? lastBreak(text, soft, end, "\n") : -1;
    const space = para < 0 && line < 0 ? lastBreak(text, start + 1, end + 1) : -1;
    const cut = para >= 0 ? para : line >= 0 ? line : space >= 0 ? space : end;
    const piece = text.slice(start, cut).trim();
    if (piece) out.push(piece);
    // Next piece: back up by the overlap, then forward to the start of a word.
    let next = cut - overlap;
    if (next <= start) next = cut;
    while (next < cut && !isSpace(text[next - 1])) next++;
    while (next < text.length && isSpace(text[next])) next++;
    start = next > start ? next : cut;
  }
  return out;
}

/**
 * Splits a document at headings into chunks of at most maxChars (default
 * 1200) with overlap (default 150), never mid-word. Deterministic: the same
 * document always yields the same chunks.
 * @param {LibraryDoc} doc
 * @param {{ maxChars?: number; overlap?: number }} [opts]
 * @returns {LibraryChunk[]}
 */
export function chunkDoc(doc, opts = {}) {
  const maxChars = Math.max(40, Math.floor(opts.maxChars ?? 1200));
  const overlap = Math.max(0, Math.min(Math.floor(opts.overlap ?? 150), Math.floor(maxChars / 2)));
  /** @type {LibraryChunk[]} */
  const chunks = [];
  for (const section of splitSections(doc.body, doc.title)) {
    for (const text of splitText(section.text, maxChars, overlap)) {
      chunks.push({ docId: doc.id, ord: chunks.length, heading: section.heading, text, sha256: sha256(text) });
    }
  }
  return chunks;
}

/* ------------------------------------------------------------------------- */
/* Reading the library folder                                                 */
/* ------------------------------------------------------------------------- */

/**
 * Relative POSIX paths of all files under root (hidden entries skipped), sorted.
 * @param {string} root
 * @returns {Promise<string[]>}
 */
async function listFiles(root) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} dir */
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) await walk(abs);
      else if (e.isFile()) out.push(toPosix(path.relative(root, abs)));
    }
  }
  await walk(root);
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * @param {string} where
 * @param {unknown} raw
 * @returns {MedKitItem}
 */
function parseItem(where, raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${where}: an item is not an object`);
  const r = /** @type {Record<string, unknown>} */ (raw);
  /** @param {string} k */
  const str = (k) => (typeof r[k] === "string" && /** @type {string} */ (r[k]).trim() ? /** @type {string} */ (r[k]).trim() : undefined);
  const id = str("id");
  const name = str("name");
  const category = str("category");
  if (!id || !ID_RE.test(id)) throw new Error(`${where}: item id ${JSON.stringify(r.id)} is missing or malformed`);
  if (!name) throw new Error(`${where}: item ${id} has no name`);
  if (!category) throw new Error(`${where}: item ${id} has no category`);
  /** @type {MedKitItem} */
  const item = { id, name, category };
  const location = str("location");
  if (location) item.location = location;
  if (r.quantity !== undefined && r.quantity !== null) {
    if (typeof r.quantity !== "number" || !Number.isInteger(r.quantity) || r.quantity < 0) {
      throw new Error(`${where}: item ${id} has an invalid quantity ${JSON.stringify(r.quantity)}`);
    }
    item.quantity = r.quantity;
  }
  const unit = str("unit");
  if (unit) item.unit = unit;
  const expiresOn = str("expiresOn");
  if (expiresOn) {
    if (!DATE_RE.test(expiresOn)) throw new Error(`${where}: item ${id} expiresOn "${expiresOn}" is not YYYY-MM-DD`);
    item.expiresOn = expiresOn;
  }
  const notes = str("notes");
  if (notes) item.notes = notes;
  return item;
}

/**
 * Reads the library folder: documents, inventory items and the newest
 * inventory file date (the `updated` field of an inventory file object).
 * @param {string} dir
 * @returns {Promise<{ docs: LibraryDoc[]; inventory: MedKitItem[]; inventoryUpdated: string }>}
 */
async function readLibraryTree(dir) {
  const root = path.resolve(dir);
  const stat = await fs.stat(root).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`library folder ${root} does not exist or is not a folder`);
  const files = await listFiles(root);
  /** @type {LibraryDoc[]} */
  const docs = [];
  /** @type {MedKitItem[]} */
  const inventory = [];
  let inventoryUpdated = "";
  const docIds = new Map();
  const itemIds = new Map();
  for (const rel of files) {
    if (rel.toLowerCase() === "readme.md") continue; // explains the library, not part of it
    if (rel.toLowerCase().endsWith(".md")) {
      const doc = parseDoc(rel, await fs.readFile(path.join(root, rel), "utf8"));
      if (GENERATED_IDS.has(doc.id)) throw new Error(`${rel}: id "${doc.id}" is reserved for a generated document`);
      if (docIds.has(doc.id)) throw new Error(`${rel}: id "${doc.id}" is already used by ${docIds.get(doc.id)}`);
      docIds.set(doc.id, rel);
      docs.push(doc);
    } else if (/^inventory\/[^/]+\.json$/i.test(rel)) {
      /** @type {unknown} */
      let data;
      try {
        data = JSON.parse(await fs.readFile(path.join(root, rel), "utf8"));
      } catch (err) {
        throw new Error(`${rel}: not valid JSON (${err instanceof Error ? err.message : String(err)})`);
      }
      const obj = /** @type {Record<string, unknown>} */ (data && typeof data === "object" ? data : {});
      const list = Array.isArray(data) ? data : obj.items;
      if (!Array.isArray(list)) throw new Error(`${rel}: expected an array of items or an object with "items"`);
      if (typeof obj.updated === "string" && DATE_RE.test(obj.updated) && obj.updated > inventoryUpdated) {
        inventoryUpdated = obj.updated;
      }
      for (const raw of list) {
        const item = parseItem(rel, raw);
        if (itemIds.has(item.id)) throw new Error(`${rel}: item id "${item.id}" is already used in ${itemIds.get(item.id)}`);
        itemIds.set(item.id, rel);
        inventory.push(item);
      }
    }
  }
  return { docs, inventory, inventoryUpdated };
}

/**
 * Reads every *.md document and inventory/*.json under dir (recursive,
 * sorted, deterministic). README.md at the library root is not a document.
 * @param {string} dir
 * @returns {Promise<{ docs: LibraryDoc[]; inventory: MedKitItem[] }>}
 */
export async function readLibraryDir(dir) {
  const { docs, inventory } = await readLibraryTree(dir);
  return { docs, inventory };
}

/* ------------------------------------------------------------------------- */
/* Generated documents                                                        */
/* ------------------------------------------------------------------------- */

/** Labels and units as in src/lib/health/knowledge.ts (kept here so plain Node can use them). */
/** @type {Record<string, { label: string; unit: string }>} */
const INDICATOR_TEXT = {
  heartRate: { label: "Resting heart rate", unit: "bpm" },
  systolicBP: { label: "Blood pressure, systolic", unit: "mmHg" },
  diastolicBP: { label: "Blood pressure, diastolic", unit: "mmHg" },
  spo2: { label: "Blood oxygen saturation (SpO₂)", unit: "%" },
  bodyTemp: { label: "Body temperature", unit: "°C" },
  respRate: { label: "Respiratory rate", unit: "/min" },
  glucose: { label: "Blood glucose (fasting)", unit: "mg/dL" },
  sleepHours: { label: "Sleep", unit: "h" },
  mood: { label: "Mood", unit: "/10" },
  stress: { label: "Stress", unit: "/10" },
  radiationDoseRate: { label: "Radiation dose rate", unit: "mSv/day" },
  radiationCumulative: { label: "Cumulative effective dose", unit: "mSv" },
  bodyMassChange: { label: "Body mass change vs pre-flight", unit: "%" },
  boneLoss: { label: "Estimated bone loss rate", unit: "%/month" },
  exerciseMinutes: { label: "Exercise", unit: "min" },
  hydration: { label: "Water intake", unit: "L" },
  wbc: { label: "White blood cell count", unit: "×10⁹/L" },
  cabinCO2: { label: "Cabin CO₂ partial pressure", unit: "mmHg" },
  visionChange: { label: "Vision symptoms", unit: "/3" },
  stDeviation: { label: "ST segment deviation (ECG)", unit: "mm" },
};
const INDICATOR_ORDER = Object.keys(INDICATOR_TEXT);

/** @param {string} a @param {string} b */
function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** @param {string} s */
function oneLine(s) {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Markdown document generated from crew baselines (category "baseline"), so
 * baselines are citable. The body depends only on the crew data (sorted), so
 * the same data always gives the same version; `updated` is metadata only.
 * @param {{ id: string; name: string; role: string; baseline: Record<string, number> }[]} crew
 * @param {string} updated
 * @returns {LibraryDoc}
 */
export function crewBaselineDoc(crew, updated) {
  const members = [...crew].sort((a, b) => cmp(a.id, b.id));
  const lines = [
    "# Crew baselines",
    "",
    "Pre-flight baseline values from the crew records of this Demify installation. The crew profiles are SIMULATED: demo crew members for training, not real people. Demify compares each continuous signal (heart rate, blood pressure, SpO₂, temperature, respiratory rate, ST segment) with the crew member's own baseline: a change of 25 % or more raises the status to caution even when the value is still inside the population range. This personal-baseline rule is a project rule; it never escalates on its own.",
  ];
  for (const m of members) {
    const name = oneLine(m.name);
    const role = oneLine(m.role);
    lines.push("", `## ${role && role !== name ? `${name} (${role})` : name}`, "");
    lines.push(`- Crew id: ${oneLine(m.id)}`);
    if (role) lines.push(`- Role: ${role}`);
    const keys = Object.keys(m.baseline ?? {})
      .filter((k) => typeof m.baseline[k] === "number" && Number.isFinite(m.baseline[k]))
      .sort((a, b) => {
        const ia = INDICATOR_ORDER.indexOf(a);
        const ib = INDICATOR_ORDER.indexOf(b);
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || cmp(a, b);
      });
    if (!keys.length) lines.push("- No baseline values recorded.");
    for (const k of keys) {
      const t = INDICATOR_TEXT[k] ?? { label: k, unit: "" };
      lines.push(`- ${name} baseline, ${t.label.charAt(0).toLowerCase()}${t.label.slice(1)}: ${m.baseline[k]}${t.unit ? ` ${t.unit}` : ""}`);
    }
  }
  const body = lines.join("\n");
  /** @type {LibraryDoc} */
  const doc = {
    id: CREW_DOC_ID,
    title: "Crew baselines",
    category: "baseline",
    source: CREW_SOURCE,
    license: "Project data, MIT",
    reviewed: REVIEWED,
    path: "generated/crew-baselines.md",
    body,
    version: sha256(body),
  };
  if (updated) doc.updated = updated;
  return doc;
}

/**
 * Markdown document generated from the inventory (category "inventory"),
 * grouped by category, sorted, deterministic.
 * @param {MedKitItem[]} items
 * @param {string} updated
 * @returns {LibraryDoc}
 */
export function inventoryDoc(items, updated) {
  /** @type {Map<string, MedKitItem[]>} */
  const groups = new Map();
  for (const item of items) {
    const list = groups.get(item.category) ?? [];
    list.push(item);
    groups.set(item.category, list);
  }
  const lines = [
    "# Medical kit inventory",
    "",
    "Representative training inventory, not the real ISS kit. The medical kit is grouped by the pack names of the ISS Crew Health Care System (CHeCS) as described in public NASA sources (2011/2015), with the AED and the Crew Medical Restraint System as emergency equipment; the contents of each pack are not confirmed for 2026, and the pouch numbers are training examples. Devices and supplies; this prototype lists no medicines and leaves the medicine packs out. Every entry gives the stowage location, the quantity and, where it applies, the expiry date. Check the physical kit and the onboard procedures before use.",
  ];
  for (const category of [...groups.keys()].sort((a, b) => cmp(a.toLowerCase(), b.toLowerCase()) || cmp(a, b))) {
    const heading = category.charAt(0).toUpperCase() + category.slice(1);
    lines.push("", `## ${heading}`, "");
    const list = /** @type {MedKitItem[]} */ (groups.get(category)).sort(
      (a, b) => cmp(a.name.toLowerCase(), b.name.toLowerCase()) || cmp(a.id, b.id),
    );
    for (const it of list) {
      const parts = [`${oneLine(it.name)}: ${it.location ? `stowed in ${oneLine(it.location)}` : "location not recorded"}`];
      if (it.quantity != null) parts.push(`quantity ${it.quantity}${it.unit && it.unit !== "each" ? ` ${oneLine(it.unit)}` : ""}`);
      if (it.expiresOn) parts.push(`expires ${it.expiresOn}`);
      const extra = it.notes ? oneLine(it.notes.replace(INVENTORY_NOTE, "").replace(INVENTORY_NOTE_V1, "")) : "";
      if (extra) parts.push(extra.replace(/\.$/, "").replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase()));
      parts.push(`item id ${it.id}`);
      lines.push(`- ${parts.join("; ")}.`);
    }
  }
  if (!items.length) lines.push("", "No items recorded.");
  const body = lines.join("\n");
  /** @type {LibraryDoc} */
  const doc = {
    id: INVENTORY_DOC_ID,
    title: "Medical kit inventory",
    category: "inventory",
    source: "Demify medical-kit inventory (representative training list, not the real ISS kit; CHeCS pack names from public NASA sources)",
    license: "Project data, MIT",
    reviewed: REVIEWED,
    path: "inventory/",
    body,
    version: sha256(body),
  };
  if (updated) doc.updated = updated;
  return doc;
}

/* ------------------------------------------------------------------------- */
/* Keyword search over bundled documents (no database)                       */
/* ------------------------------------------------------------------------- */

/**
 * English stopwords (Snowball list) plus question fillers. "up" and "down"
 * stay searchable: "the ground link is down" is a real question here.
 */
const STOPWORDS = new Set(
  (
    "a about above after again against all am an and any are as at be because been before being below between both but by " +
    "can could did do does doing during each few for from further had has have having he her here hers herself him himself " +
    "his how i if in into is it its itself just me more most my myself no nor not of off on once only or other our ours " +
    "ourselves out over own same she should so some such than that the their theirs them themselves then there these they " +
    "this those through to too under until very was we were what when where which while who whom why will with would you " +
    "your yours yourself yourselves s t don shall may might must also please tell say says show shows us let get got know " +
    "need needs want"
  ).split(" "),
);

/**
 * Light English stemmer (plurals, -ing, -ed, final -e), applied to documents
 * and queries alike, so "handling" and "handle" or "advised" and "advise"
 * meet in the same stem.
 * @param {string} word
 */
function stem(word) {
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

/**
 * Lower-case word tokens (diacritics and subscripts folded: SpO₂ -> spo2).
 * @param {string} text
 */
function words(text) {
  return (
    text
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? []
  );
}

/** Search terms of a text: stopwords and one-letter words dropped, stemmed. @param {string} text */
function searchTerms(text) {
  return words(text)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem);
}

/**
 * @typedef {{ doc: LibraryDoc; chunk: LibraryChunk; tf: Map<string, number>; len: number }} IndexedChunk
 * @typedef {{ key: string; chunks: IndexedChunk[]; df: Map<string, number>; avgLen: number; failures: number }} BundledIndex
 */

/** @type {BundledIndex | null} */
let bundledCache = null;

/** @param {LibraryDoc[]} docs @returns {BundledIndex} */
function bundledIndex(docs) {
  const key = docs.map((d) => `${d.id}:${d.version}:${d.body.length}`).join("|");
  if (bundledCache && bundledCache.key === key) return bundledCache;
  /** @type {IndexedChunk[]} */
  const chunks = [];
  /** @type {Map<string, number>} */
  const df = new Map();
  let failures = 0;
  for (const doc of docs) {
    // A document whose body no longer matches its version was altered after parsing.
    if (sha256(doc.body) !== doc.version) {
      failures++;
      continue;
    }
    for (const chunk of chunkDoc(doc)) {
      const terms = searchTerms(`${doc.title} ${chunk.heading} ${chunk.text}`);
      /** @type {Map<string, number>} */
      const tf = new Map();
      for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
      chunks.push({ doc, chunk, tf, len: terms.length });
    }
  }
  const avgLen = chunks.length ? chunks.reduce((s, c) => s + c.len, 0) / chunks.length : 1;
  bundledCache = { key, chunks, df, avgLen: avgLen || 1, failures };
  return bundledCache;
}

const BM25_K1 = 1.2;
const BM25_B = 0.75;

/**
 * Keyword search over bundled documents (no database). Okapi BM25 over the
 * chunks of chunkDoc (title + heading + text, English stopwords removed,
 * light stemming). The score is BM25 divided by the best score the query
 * could reach (every term present, saturated), so it lies in 0..1 and says
 * how much of the question the chunk covers. Deterministic: ties are broken
 * by document id and chunk order. minScore is not applied here.
 * @param {LibraryDoc[]} docs
 * @param {string} query
 * @param {number} [k]
 * @returns {SearchResult}
 */
export function searchBundled(docs, query, k = 5) {
  const index = bundledIndex(docs);
  const terms = [...new Set(searchTerms(query))];
  const n = index.chunks.length;
  /** @param {string} t */
  const idf = (t) => {
    const d = index.df.get(t) ?? 0;
    return Math.log(1 + (n - d + 0.5) / (d + 0.5));
  };
  // Pure numbers ("185/115") rarely appear in the text; they do not lower the coverage.
  const best = terms.filter((t) => !/^\d+$/.test(t) || index.df.has(t)).reduce((s, t) => s + idf(t) * (BM25_K1 + 1), 0);
  /** @type {{ c: IndexedChunk; score: number }[]} */
  const scored = [];
  if (terms.length && n && best > 0) {
    for (const c of index.chunks) {
      let s = 0;
      for (const t of terms) {
        const f = c.tf.get(t);
        if (!f) continue;
        s += (idf(t) * f * (BM25_K1 + 1)) / (f + BM25_K1 * (1 - BM25_B + (BM25_B * c.len) / index.avgLen));
      }
      if (s > 0) scored.push({ c, score: Math.min(1, s / best) });
    }
  }
  scored.sort((a, b) => b.score - a.score || cmp(a.c.doc.id, b.c.doc.id) || a.c.chunk.ord - b.c.chunk.ord);
  const limit = Math.max(1, Math.floor(k));
  /** @type {LibraryHit[]} */
  const hits = scored.slice(0, limit).map(({ c, score }) => ({
    ...docMeta(c.doc),
    heading: c.chunk.heading,
    text: c.chunk.text,
    sha256: c.chunk.sha256,
    score: Number(score.toFixed(4)),
    tier: /** @type {const} */ ("bundled"),
    integrityOk: true,
  }));
  /** @type {SearchResult} */
  const result = { tier: "bundled", hits, integrityFailures: index.failures };
  if (!terms.length) result.fallbackReason = "the question has no searchable words";
  return result;
}

/**
 * @param {LibraryDoc} doc
 * @returns {Pick<LibraryHit, "docId" | "title" | "category" | "source" | "url" | "license" | "reviewed" | "version">}
 */
function docMeta(doc) {
  return {
    docId: doc.id,
    title: doc.title,
    category: doc.category,
    source: doc.source,
    ...(doc.url ? { url: doc.url } : {}),
    license: doc.license,
    ...(doc.reviewed ? { reviewed: doc.reviewed } : {}),
    version: doc.version,
  };
}

/* ------------------------------------------------------------------------- */
/* PostgreSQL: sync                                                           */
/* ------------------------------------------------------------------------- */

/** @param {unknown} err */
function message(err) {
  return err instanceof Error ? err.message : String(err);
}

/** Chunks that need an embedding from the configured model. */
const PENDING_SQL = "embedding IS NULL OR embed_model IS DISTINCT FROM $1";

/** @param {Pool | PoolClient} db @param {OnboardConfig} cfg */
async function countPending(db, cfg) {
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM library_chunks WHERE ${PENDING_SQL}`, [cfg.embedModel]);
  return Number(rows[0]?.n ?? 0);
}

/** @param {{ heading: string; text: string }} c */
function embedText(c) {
  return c.heading ? `${c.heading}\n\n${c.text}` : c.text;
}

/** @param {number[]} v */
function vectorLiteral(v) {
  return `[${v.join(",")}]`;
}

/**
 * Embeds up to limit (default 256) chunks whose embedding is NULL (or was
 * made by another embedding model), in batches of 32. Returns how many were
 * embedded. Chunks whose text no longer matches their checksum are left
 * alone (a sync rewrites them). Throws on model errors; batches embedded
 * before the error stay embedded.
 * @param {Pool} pool
 * @param {OnboardConfig} cfg
 * @param {number} [limit]
 * @returns {Promise<number>}
 */
export async function embedPending(pool, cfg, limit = 256) {
  if (!cfg.modelUrl || !cfg.vectorSearch) return 0;
  const { rows } = await pool.query(
    `SELECT id, heading, text, sha256 FROM library_chunks WHERE ${PENDING_SQL} ORDER BY id LIMIT $2`,
    [cfg.embedModel, Math.max(1, Math.floor(limit))],
  );
  const todo = rows.filter((r) => sha256(r.text) === r.sha256);
  let done = 0;
  for (let i = 0; i < todo.length; i += EMBED_BATCH) {
    const batch = todo.slice(i, i + EMBED_BATCH);
    const vectors = await (await model()).embed(cfg, batch.map(embedText), "document");
    if (!Array.isArray(vectors) || vectors.length !== batch.length) {
      throw new Error(`embedding model returned ${Array.isArray(vectors) ? vectors.length : "no"} vectors for ${batch.length} texts`);
    }
    for (const v of vectors) {
      if (!Array.isArray(v) || v.length !== cfg.embedDim || !v.every(Number.isFinite)) {
        throw new Error(`embedding model returned a vector that is not ${cfg.embedDim} finite numbers`);
      }
    }
    const res = await pool.query(
      `UPDATE library_chunks c SET embedding = v.e::vector, embed_model = $4
         FROM unnest($1::bigint[], $2::text[], $3::text[]) AS v(id, e, sha)
        WHERE c.id = v.id AND c.sha256 = v.sha`,
      [batch.map((r) => r.id), vectors.map(vectorLiteral), batch.map((r) => r.sha256), cfg.embedModel],
    );
    done += res.rowCount ?? 0;
    // The model embeds again: a remembered query-embedding failure is over.
    embedFailures().delete(embedKey(cfg));
  }
  return done;
}

/**
 * @param {PoolClient} client
 * @param {LibraryDoc} doc
 * @param {LibraryChunk[]} chunks
 */
async function writeChunks(client, doc, chunks) {
  await client.query("DELETE FROM library_chunks WHERE doc_id = $1", [doc.id]);
  if (!chunks.length) return;
  await client.query(
    `INSERT INTO library_chunks (doc_id, ord, heading, text, sha256)
     SELECT $1, * FROM unnest($2::int[], $3::text[], $4::text[], $5::text[])`,
    [doc.id, chunks.map((c) => c.ord), chunks.map((c) => c.heading), chunks.map((c) => c.text), chunks.map((c) => c.sha256)],
  );
}

/** @param {LibraryDoc} d */
function docParams(d) {
  return [d.id, d.title, d.category, d.source, d.url ?? null, d.license, d.reviewed ?? null, d.updated ?? null, d.path, d.body, d.version];
}

/**
 * @param {Record<string, any>} row
 * @param {LibraryDoc} d
 */
function metaDiffers(row, d) {
  return (
    row.title !== d.title ||
    row.category !== d.category ||
    row.source !== d.source ||
    (row.url ?? null) !== (d.url ?? null) ||
    row.license !== d.license ||
    (row.reviewed ?? null) !== (d.reviewed ?? null) ||
    (row.updated ?? null) !== (d.updated ?? null) ||
    (row.path ?? null) !== d.path
  );
}

/**
 * @param {{ ord: number; sha256: string; text: string }[] | undefined} stored
 * @param {LibraryChunk[]} expected
 */
function chunksIntact(stored, expected) {
  if (!stored || stored.length !== expected.length) return false;
  return expected.every((c, i) => stored[i].ord === c.ord && stored[i].sha256 === c.sha256 && sha256(stored[i].text) === c.sha256);
}

/** @param {unknown} v */
function dateOnly(v) {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** @param {unknown} v @returns {string | null} */
function isoOrNull(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const CREW_SQL = "SELECT id, name, role, baseline, updated_at FROM crew ORDER BY id";
const DOC_COLUMNS = "id, title, category, source, url, license, reviewed, updated, path, body, body_sha256, synced_at";
/**
 * Marks the crew-baseline document current when it is older than the newest
 * crew record (its content was just checked against the crew table).
 */
const CREW_DOC_TOUCH_SQL =
  "UPDATE library_documents SET synced_at = now() WHERE id = $1 AND synced_at < (SELECT max(updated_at) FROM crew)";

/**
 * The crew-baseline document for crew table rows (dated by the newest row).
 * @param {Record<string, any>[]} rows
 * @returns {LibraryDoc}
 */
function crewDocOf(rows) {
  const updated = rows.map((r) => dateOnly(r.updated_at)).sort().at(-1) ?? "";
  return crewBaselineDoc(
    rows.map((r) => ({ id: String(r.id), name: String(r.name), role: String(r.role), baseline: r.baseline ?? {} })),
    updated,
  );
}

/**
 * Stored chunks per document id (all documents, or one).
 * @param {PoolClient} client
 * @param {string} [docId]
 * @returns {Promise<Map<string, { ord: number; sha256: string; text: string }[]>>}
 */
async function storedChunks(client, docId) {
  const { rows } = docId
    ? await client.query("SELECT doc_id, ord, sha256, text FROM library_chunks WHERE doc_id = $1 ORDER BY ord", [docId])
    : await client.query("SELECT doc_id, ord, sha256, text FROM library_chunks ORDER BY doc_id, ord");
  /** @type {Map<string, { ord: number; sha256: string; text: string }[]>} */
  const out = new Map();
  for (const r of rows) {
    const list = out.get(r.doc_id) ?? [];
    list.push({ ord: Number(r.ord), sha256: r.sha256, text: r.text });
    out.set(r.doc_id, list);
  }
  return out;
}

/**
 * Writes one document and its chunks unless the stored copy is current and
 * intact (inside the caller's transaction). A new version is "updated"; a
 * stored body or chunk that no longer matches its checksum is rewritten and
 * reported as repaired.
 * @param {PoolClient} client
 * @param {LibraryDoc} doc
 * @param {Record<string, any> | undefined} old  its library_documents row
 * @param {{ ord: number; sha256: string; text: string }[] | undefined} oldChunks
 * @returns {Promise<{ change: "added" | "updated" | "unchanged"; repaired: boolean }>}
 */
async function upsertDoc(client, doc, old, oldChunks) {
  const chunks = chunkDoc(doc);
  if (!old) {
    await client.query(
      `INSERT INTO library_documents (id, title, category, source, url, license, reviewed, updated, path, body, body_sha256, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())`,
      docParams(doc),
    );
    await writeChunks(client, doc, chunks);
    return { change: "added", repaired: false };
  }
  const bodyIntact = sha256(String(old.body)) === old.body_sha256;
  if (old.body_sha256 !== doc.version || !bodyIntact) {
    // New version (or a stored body that no longer matches its checksum): rewrite it.
    await client.query(
      `UPDATE library_documents SET title = $2, category = $3, source = $4, url = $5, license = $6, reviewed = $7,
              updated = $8, path = $9, body = $10, body_sha256 = $11, synced_at = now()
        WHERE id = $1`,
      docParams(doc),
    );
    await writeChunks(client, doc, chunks);
    return old.body_sha256 !== doc.version ? { change: "updated", repaired: false } : { change: "unchanged", repaired: true };
  }
  const meta = metaDiffers(old, doc);
  if (meta) {
    await client.query(
      `UPDATE library_documents SET title = $2, category = $3, source = $4, url = $5, license = $6, reviewed = $7,
              updated = $8, path = $9
        WHERE id = $1`,
      docParams(doc).slice(0, 9),
    );
  }
  let repaired = false;
  if (!chunksIntact(oldChunks, chunks)) {
    await writeChunks(client, doc, chunks);
    repaired = true;
  }
  return { change: meta ? "updated" : "unchanged", repaired };
}

/**
 * The sync itself (caller holds LOCK_SYNC on client). Mutates and returns detail counts.
 * @param {Pool} pool
 * @param {PoolClient} client
 * @param {OnboardConfig} cfg
 * @param {SyncResult} result
 * @param {number} runId
 * @param {boolean} force  accept removing more than half of the documents
 * @returns {Promise<Record<string, unknown>>}
 */
async function runSync(pool, client, cfg, result, runId, force) {
  /** @type {Record<string, unknown>} */
  const extra = {};
  // Runs left "running" by a process that died (we hold the lock, so none is live).
  const stale = await client.query(
    `UPDATE sync_runs SET status = 'failed', finished_at = now(),
            detail = detail || '{"reason":"interrupted before it finished (process stopped or database restarted)"}'::jsonb
      WHERE kind = 'library' AND status = 'running' AND id <> $1`,
    [runId],
  );
  if (stale.rowCount) extra.staleRunsClosed = stale.rowCount;

  const dir = path.resolve(cfg.groundLibraryDir);
  const lib = await readLibraryTree(dir);
  // An empty folder (a bind mount of a missing ./library, a copy not yet
  // started) must never empty the onboard library.
  if (!lib.docs.length) {
    throw new Error(`the ground library ${dir} has no Markdown documents (empty, or not mounted?); nothing was changed`);
  }
  /** @type {LibraryDoc[]} */
  const target = [...lib.docs];
  if (lib.inventory.length) target.push(inventoryDoc(lib.inventory, lib.inventoryUpdated));
  const crewRows = (await client.query(CREW_SQL)).rows;
  if (crewRows.length) target.push(crewDocOf(crewRows));
  const keep = new Set(target.map((d) => d.id));

  let repaired = 0;
  await client.query("BEGIN");
  try {
    const existing = new Map((await client.query(`SELECT ${DOC_COLUMNS} FROM library_documents`)).rows.map((r) => [String(r.id), r]));
    // A half-copied ground folder: refuse to remove most of the library unless forced.
    const fromGround = [...existing.keys()].filter((id) => !GENERATED_IDS.has(id));
    const removed = fromGround.filter((id) => !keep.has(id));
    if (!force && removed.length > fromGround.length / 2) {
      throw new Error(
        `the ground library ${dir} would remove ${removed.length} of ${fromGround.length} documents (more than half), ` +
          "so it looks empty or half-copied; nothing was changed. Check the ground folder, or run library-ingest with --force to accept the removal",
      );
    }
    const stored = await storedChunks(client);

    for (const doc of target) {
      const out = await upsertDoc(client, doc, existing.get(doc.id), stored.get(doc.id));
      if (out.change === "added") result.docsAdded++;
      else if (out.change === "updated") result.docsUpdated++;
      else result.docsUnchanged++;
      if (out.repaired) repaired++;
    }
    for (const id of removed) {
      await client.query("DELETE FROM library_documents WHERE id = $1", [id]);
      result.docsRemoved++;
    }
    if (crewRows.length) await client.query(CREW_DOC_TOUCH_SQL, [CREW_DOC_ID]);

    if (lib.inventory.length) {
      await client.query("DELETE FROM med_kit_items");
      const inv = lib.inventory;
      await client.query(
        `INSERT INTO med_kit_items (id, name, category, location, quantity, unit, expires_on, notes, synced_at)
         SELECT id, name, category, location, quantity, unit, expires_on, notes, now()
           FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::int[], $6::text[], $7::date[], $8::text[])
             AS t(id, name, category, location, quantity, unit, expires_on, notes)`,
        [
          inv.map((i) => i.id),
          inv.map((i) => i.name),
          inv.map((i) => i.category),
          inv.map((i) => i.location ?? null),
          inv.map((i) => i.quantity ?? null),
          inv.map((i) => i.unit ?? null),
          inv.map((i) => i.expiresOn ?? null),
          inv.map((i) => i.notes ?? null),
        ],
      );
      result.inventoryItems = inv.length;
    } else {
      const { rows } = await client.query("SELECT count(*)::int AS n FROM med_kit_items");
      result.inventoryItems = Number(rows[0]?.n ?? 0);
      extra.inventory = "no inventory files in the ground library; kept the stored inventory";
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  }
  if (repaired) extra.docsRepaired = repaired;
  if (!crewRows.length) extra.crew = "crew table is empty; crew baselines not regenerated";

  // Embeddings: never fail the sync; pending chunks stay covered by full-text search.
  const before = await countPending(pool, cfg);
  let after = before;
  if (before > 0 && cfg.modelUrl && cfg.vectorSearch) {
    /** @type {import("./model.mjs").ModelStatus | null} */
    let status = null;
    try {
      status = await (await model()).modelStatus(cfg, 3000);
      if (!status.reachable) {
        extra.embedError = `model server unreachable${status.error ? ` (${status.error})` : ""}`;
      } else {
        // Bounded: each round embeds up to 256 chunks.
        for (let round = 0; round < Math.ceil(before / 256) + 1; round++) {
          if ((await embedPending(pool, cfg, 256)) === 0) break;
        }
      }
    } catch (err) {
      const unlisted = status && !status.embedReady ? ` (model ${cfg.embedModel} not listed by the model server)` : "";
      extra.embedError = `embedding failed: ${message(err)}${unlisted}`;
    }
    after = await countPending(pool, cfg);
    result.chunksEmbedded = Math.max(0, before - after);
  } else if (before > 0 && !cfg.modelUrl) {
    extra.embedding = "no embedding model configured; full-text search covers the library";
  } else if (before > 0 && !cfg.vectorSearch) {
    extra.embedding = "embedding width does not match the database column; full-text search covers the library";
  }
  result.chunksPendingEmbedding = after;
  if (extra.embedError) {
    result.reason = `Library synced; ${after} chunks wait for embeddings (${extra.embedError}). Full-text search covers them.`;
  }
  const { rows: totals } = await pool.query("SELECT count(*)::int AS n FROM library_chunks");
  extra.chunks = Number(totals[0]?.n ?? 0);
  return extra;
}

/**
 * @param {SyncResult} r
 * @param {Record<string, unknown>} [extra]
 */
function runDetail(r, extra = {}) {
  return {
    docsAdded: r.docsAdded,
    docsUpdated: r.docsUpdated,
    docsRemoved: r.docsRemoved,
    docsUnchanged: r.docsUnchanged,
    inventoryItems: r.inventoryItems,
    chunksEmbedded: r.chunksEmbedded,
    chunksPendingEmbedding: r.chunksPendingEmbedding,
    ...(r.reason ? { reason: r.reason } : {}),
    ...extra,
  };
}

/**
 * pruneSyncRuns after a run; a failure only leaves old rows for the next run.
 * @param {Pool} pool
 */
async function pruneQuietly(pool) {
  try {
    await pruneSyncRuns(pool);
  } catch {
    // Best effort: the run itself is recorded.
  }
}

/**
 * Pulls the ground library into PostgreSQL (see library.d.mts). Records a
 * sync_runs row (running -> ok / skipped / failed). Errors inside the sync
 * are returned as status "failed" (with the reason) after the transaction is
 * rolled back; only a database that cannot record the run makes this throw.
 * A ground library without Markdown documents fails the sync; one that would
 * remove more than half of the documents fails it unless opts.force.
 * @param {Pool} pool
 * @param {OnboardConfig} cfg
 * @param {{ trigger: SyncResult["trigger"]; groundLinkUp: boolean; force?: boolean }} opts
 * @returns {Promise<SyncResult>}
 */
export async function syncLibrary(pool, cfg, opts) {
  const startedAt = new Date().toISOString();
  /** @type {SyncResult} */
  const result = {
    kind: "library",
    status: "ok",
    trigger: opts.trigger,
    docsAdded: 0,
    docsUpdated: 0,
    docsRemoved: 0,
    docsUnchanged: 0,
    inventoryItems: 0,
    chunksEmbedded: 0,
    chunksPendingEmbedding: 0,
    startedAt,
    finishedAt: startedAt,
  };
  const force = opts.force === true;
  const context = { force, groundLinkUp: opts.groundLinkUp, dir: cfg.groundLibraryDir };

  if (!opts.groundLinkUp && !force) {
    result.status = "skipped";
    result.reason = LINK_DOWN_REASON;
    result.finishedAt = new Date().toISOString();
    await pool.query(
      "INSERT INTO sync_runs (kind, trigger, status, started_at, finished_at, detail) VALUES ('library', $1, 'skipped', $2, $3, $4)",
      [opts.trigger, result.startedAt, result.finishedAt, JSON.stringify({ reason: result.reason, ...context })],
    );
    await pruneQuietly(pool);
    return result;
  }

  const { rows } = await pool.query(
    "INSERT INTO sync_runs (kind, trigger, status, started_at, detail) VALUES ('library', $1, 'running', $2, $3) RETURNING id",
    [opts.trigger, startedAt, JSON.stringify(context)],
  );
  const runId = Number(rows[0].id);
  /** @type {Record<string, unknown>} */
  let extra = {};
  try {
    const out = await withAdvisoryLock(pool, LOCK_SYNC, (client) => runSync(pool, client, cfg, result, runId, force));
    if (out === null) {
      result.status = "skipped";
      result.reason = LOCKED_REASON;
    } else {
      extra = out;
    }
  } catch (err) {
    result.status = "failed";
    result.reason = message(err);
  }
  result.finishedAt = new Date().toISOString();
  await pool.query("UPDATE sync_runs SET status = $2, finished_at = $3, detail = $4 WHERE id = $1", [
    runId,
    result.status,
    result.finishedAt,
    JSON.stringify({ ...runDetail(result, extra), ...context }),
  ]);
  await pruneQuietly(pool);
  return result;
}

/* ------------------------------------------------------------------------- */
/* PostgreSQL: crew baselines                                                 */
/* ------------------------------------------------------------------------- */

/**
 * Whether the crew-baseline document needs regenerating: crew rows exist and
 * the document is missing or older than the newest crew record.
 * @param {Pool} pool
 * @returns {Promise<import("./library.d.mts").CrewBaselinesState>}
 */
export async function crewBaselinesState(pool) {
  const { rows } = await pool.query(
    `SELECT c.n, c.crew_at, d.synced_at AS doc_at,
            (c.n > 0 AND (d.synced_at IS NULL OR d.synced_at < c.crew_at)) AS due
       FROM (SELECT count(*)::int AS n, max(updated_at) AS crew_at FROM crew) c
       LEFT JOIN library_documents d ON d.id = $1`,
    [CREW_DOC_ID],
  );
  const r = rows[0] ?? {};
  return {
    crewMembers: Number(r.n ?? 0),
    crewUpdatedAt: isoOrNull(r.crew_at),
    documentSyncedAt: isoOrNull(r.doc_at),
    due: r.due === true,
  };
}

/**
 * Regenerates the crew-baseline document from the crew table (onboard data:
 * no ground link needed). Holds LOCK_SYNC; status "skipped" while a library
 * sync runs (that sync regenerates it). New chunks wait for embeddings
 * (embedPending); full-text search covers them meanwhile.
 * @param {Pool} pool
 * @returns {Promise<import("./library.d.mts").CrewBaselinesRefresh>}
 */
export async function refreshCrewBaselines(pool) {
  const out = await withAdvisoryLock(pool, LOCK_SYNC, async (client) => {
    await client.query("BEGIN");
    try {
      const crewRows = (await client.query(CREW_SQL)).rows;
      if (!crewRows.length) {
        await client.query("COMMIT");
        return /** @type {const} */ ({ status: "no-crew" });
      }
      const old = (await client.query(`SELECT ${DOC_COLUMNS} FROM library_documents WHERE id = $1`, [CREW_DOC_ID])).rows[0];
      const stored = await storedChunks(client, CREW_DOC_ID);
      const r = await upsertDoc(client, crewDocOf(crewRows), old, stored.get(CREW_DOC_ID));
      await client.query(CREW_DOC_TOUCH_SQL, [CREW_DOC_ID]);
      await client.query("COMMIT");
      /** @type {"added" | "updated" | "unchanged"} */
      const status = r.change === "unchanged" && r.repaired ? "updated" : r.change;
      return { status, crewMembers: crewRows.length };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    }
  });
  return out ?? { status: "skipped", reason: LOCKED_REASON };
}

/* ------------------------------------------------------------------------- */
/* PostgreSQL: sync history                                                   */
/* ------------------------------------------------------------------------- */

/**
 * Deletes sync_runs rows older than keepDays (default 30), keeping at least
 * the keepRows (default 100) newest rows and the latest successful run of
 * each kind (library sync from the ground, library seed, snapshots), so the
 * "last synced" time never loses its row. Returns how many rows it deleted.
 * @param {Pool} pool
 * @param {{ keepDays?: number; keepRows?: number }} [opts]
 * @returns {Promise<number>}
 */
export async function pruneSyncRuns(pool, opts = {}) {
  const days = Math.max(1, Math.floor(opts.keepDays ?? SYNC_RUNS_KEEP_DAYS));
  const keepRows = Math.max(1, Math.floor(opts.keepRows ?? SYNC_RUNS_KEEP_ROWS));
  const res = await pool.query(
    `WITH keep AS (
       (SELECT id FROM sync_runs ORDER BY started_at DESC, id DESC LIMIT $2)
       UNION SELECT max(id) FROM sync_runs WHERE kind = 'library' AND status = 'ok' AND (${FROM_GROUND_SQL})
       UNION SELECT max(id) FROM sync_runs WHERE kind = 'library' AND status = 'ok' AND NOT (${FROM_GROUND_SQL})
       UNION SELECT max(id) FROM sync_runs WHERE kind = 'snapshots' AND status = 'ok'
     )
     DELETE FROM sync_runs s
      WHERE s.started_at < now() - make_interval(days => $1::int)
        AND NOT EXISTS (SELECT 1 FROM keep WHERE keep.id = s.id)`,
    [days, keepRows],
  );
  return res.rowCount ?? 0;
}

/**
 * When the library last came from the ground, and when it was last loaded
 * without the ground (see library.d.mts).
 * @param {Pool} pool
 * @returns {Promise<{ lastGroundSync: string | null; seededAt: string | null }>}
 */
export async function librarySyncInfo(pool) {
  const { rows } = await pool.query(
    `SELECT max(finished_at) FILTER (WHERE ${FROM_GROUND_SQL}) AS ground,
            max(finished_at) FILTER (WHERE NOT (${FROM_GROUND_SQL})) AS seeded
       FROM sync_runs
      WHERE kind = 'library' AND status = 'ok'`,
  );
  return { lastGroundSync: isoOrNull(rows[0]?.ground), seededAt: isoOrNull(rows[0]?.seeded) };
}

/**
 * Latest successful library sync from the ground (finished_at, ISO), or
 * null. The startup seed and runs forced during a blackout do not count.
 * @param {Pool} pool
 * @returns {Promise<string | null>}
 */
export async function lastLibrarySync(pool) {
  return (await librarySyncInfo(pool)).lastGroundSync;
}

/* ------------------------------------------------------------------------- */
/* PostgreSQL: search                                                         */
/* ------------------------------------------------------------------------- */

const HIT_COLUMNS = `c.doc_id, c.ord, c.heading, c.text, c.sha256,
       d.title, d.category, d.source, d.url, d.license, d.reviewed, d.body_sha256, d.synced_at`;

/**
 * Turns rows into hits, re-checking every chunk checksum; stops at k hits.
 * @param {any[]} rows
 * @param {"vector" | "fulltext"} tier
 * @param {number} k
 */
function toHits(rows, tier, k) {
  /** @type {LibraryHit[]} */
  const hits = [];
  let integrityFailures = 0;
  for (const r of rows) {
    if (hits.length >= k) break;
    if (sha256(String(r.text)) !== r.sha256) {
      integrityFailures++;
      continue;
    }
    const category = isCategory(r.category) ? r.category : "reference";
    hits.push({
      docId: String(r.doc_id),
      title: String(r.title),
      category,
      source: String(r.source),
      ...(r.url ? { url: String(r.url) } : {}),
      license: String(r.license),
      ...(r.reviewed ? { reviewed: String(r.reviewed) } : {}),
      version: String(r.body_sha256),
      heading: String(r.heading ?? ""),
      text: String(r.text),
      sha256: String(r.sha256),
      score: Number(Math.max(0, Number(r.score)).toFixed(4)),
      tier,
      syncedAt: new Date(r.synced_at).toISOString(),
      integrityOk: true,
    });
  }
  return { hits, integrityFailures };
}

/**
 * Remembered query-embedding failures per model (modelUrl + embedModel),
 * shared by every copy of this module in the process (Next.js bundles one
 * per route), so one failure keeps every route off the vector tier.
 * @returns {Map<string, { until: number; reason: string }>}
 */
function embedFailures() {
  const g = /** @type {Record<symbol, unknown>} */ (/** @type {unknown} */ (globalThis));
  const key = Symbol.for("demify.onboard.library.embedFailures");
  if (!(g[key] instanceof Map)) g[key] = new Map();
  return /** @type {Map<string, { until: number; reason: string }>} */ (g[key]);
}

/** @param {OnboardConfig} cfg */
function embedKey(cfg) {
  return `${cfg.modelUrl ?? ""}|${cfg.embedModel}`;
}

/**
 * Why embedding the question failed, in the crew's words: an HTTP error is
 * the model's own error, not an unreachable server.
 * @param {unknown} err
 */
function embedFailureReason(err) {
  const e = /** @type {{ kind?: unknown; status?: unknown }} */ (err && typeof err === "object" ? err : {});
  const msg = message(err);
  if (e.kind === "http" || typeof e.status === "number" || /\bHTTP \d{3}\b/.test(msg)) return `embedding model error (${msg})`;
  if (e.kind === "timeout") return `embedding model did not answer in time (${msg})`;
  if (e.kind === "bad-response") return `embedding model returned an unusable answer (${msg})`;
  return `embedding model unreachable (${msg})`;
}

/**
 * Retrieval with fallbacks: vector (pgvector cosine; needs the embedding
 * model, a matching embedding width and no pending chunks) -> full-text
 * (OR of the question's terms, ranked by ts_rank_cd). Re-checks every hit's
 * SHA-256 and drops mismatches. Returns the top k without applying minScore
 * (the assistant does). Throws only when the database itself fails.
 *
 * The question is embedded with a short time limit (opts.embedTimeoutMs,
 * default 3 s); after a failure the vector tier stays off for 30 s, so a
 * hung model server costs one short wait, not one per question.
 * opts.skipVector goes straight to full-text (the caller knows the model
 * server is not ready).
 * @param {Pool} pool
 * @param {OnboardConfig} cfg
 * @param {string} query
 * @param {number} [k]
 * @param {import("./library.d.mts").SearchOptions} [opts]
 * @returns {Promise<SearchResult>}
 */
export async function searchLibrary(pool, cfg, query, k = cfg.topK, opts = {}) {
  const q = query.trim();
  const limit = Math.max(1, Math.floor(k || 5));
  const fetchN = limit + 10; // room to replace hits that fail the checksum
  /** @type {string | undefined} */
  let fallbackReason;

  if (!cfg.modelUrl) fallbackReason = "no embedding model configured";
  else if (!cfg.vectorSearch) fallbackReason = "embedding width does not match the database column";
  else if (opts.skipVector) fallbackReason = "vector search skipped (the model server was not ready at the last check)";
  else {
    const failures = embedFailures();
    const key = embedKey(cfg);
    const failed = failures.get(key);
    const now = Date.now();
    if (failed && now < failed.until && now >= failed.until - EMBED_BACKOFF_MS) {
      fallbackReason = `${failed.reason}; vector search paused for ${Math.ceil((failed.until - now) / 1000)} s`;
    } else {
      const pending = await countPending(pool, cfg);
      if (pending > 0) {
        fallbackReason = `${pending} library chunks are still waiting for embeddings`;
      } else {
        const t = opts.embedTimeoutMs;
        const embedTimeoutMs = typeof t === "number" && Number.isFinite(t) && t > 0 ? Math.max(100, Math.floor(t)) : QUERY_EMBED_TIMEOUT_MS;
        /** @type {number[] | null} */
        let vector = null;
        try {
          const [v] = await (await model()).embed({ ...cfg, embedTimeoutMs }, [q], "query");
          if (Array.isArray(v) && v.length === cfg.embedDim && v.every(Number.isFinite)) vector = v;
          else fallbackReason = "embedding model returned an unusable vector";
        } catch (err) {
          fallbackReason = embedFailureReason(err);
        }
        if (vector) {
          failures.delete(key);
          const { rows } = await pool.query(
            `SELECT ${HIT_COLUMNS}, 1 - (c.embedding <=> $1::vector) AS score
               FROM library_chunks c JOIN library_documents d ON d.id = c.doc_id
              WHERE c.embedding IS NOT NULL AND c.embed_model = $2
              ORDER BY c.embedding <=> $1::vector, c.doc_id, c.ord
              LIMIT $3`,
            [vectorLiteral(vector), cfg.embedModel, fetchN],
          );
          return { tier: "vector", ...toHits(rows, "vector", limit) };
        }
        failures.set(key, { until: Date.now() + EMBED_BACKOFF_MS, reason: fallbackReason ?? "embedding failed" });
      }
    }
  }

  const terms = [...new Set(words(q).filter((w) => w.length > 1 && !STOPWORDS.has(w)))];
  if (!terms.length) {
    return { tier: "fulltext", hits: [], integrityFailures: 0, fallbackReason: fallbackReason ?? "the question has no searchable words" };
  }
  const { rows } = await pool.query(
    `SELECT ${HIT_COLUMNS}, ts_rank_cd(c.tsv, q) AS score
       FROM library_chunks c JOIN library_documents d ON d.id = c.doc_id,
            to_tsquery('english', $1) AS q
      WHERE c.tsv @@ q AND ts_rank_cd(c.tsv, q) > 0
      ORDER BY score DESC, c.doc_id, c.ord
      LIMIT $2`,
    [terms.join(" | "), fetchN],
  );
  /** @type {SearchResult} */
  const result = { tier: "fulltext", ...toHits(rows, "fulltext", limit) };
  if (fallbackReason) result.fallbackReason = fallbackReason;
  return result;
}
