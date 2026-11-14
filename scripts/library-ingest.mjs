#!/usr/bin/env node
// @ts-check
/**
 * Ingests the ground library into PostgreSQL (one library sync) and can show
 * what a question retrieves. Plain Node, same image as the app.
 *
 *   npm run library:ingest
 *   npm run library:ingest -- --force                 sync even while the ground link is down, and accept
 *                                                     removing more than half of the documents
 *   npm run library:ingest -- --dir ./library         another ground library folder
 *   npm run library:ingest -- --search "Where is the pulse oximeter in the medical kit?" [--k 5]
 *   npm run library:ingest -- --no-sync --search "..." search without syncing first
 *
 * Needs DATABASE_URL. Reads DEMIFY_GROUND_LIBRARY_DIR (default ./library) and,
 * for embeddings and vector search, DEMIFY_MODEL_URL.
 *
 * A ground folder without Markdown documents never empties the onboard
 * library: the sync fails with the reason and changes nothing. One that would
 * remove more than half of the documents (half-copied?) fails the same way
 * unless --force.
 *
 * Exit codes: 0 ok, 1 sync failed or database error, 2 usage or configuration
 * error, 3 sync skipped (ground link down without --force, or another sync running).
 */
import path from "node:path";
import { parseArgs } from "node:util";
import { onboardConfig } from "../onboard/config.mjs";
import { closePool, ensureSchema, getPool } from "../onboard/db.mjs";
import { readGroundLinkRow } from "../onboard/ground-link.mjs";
import { searchLibrary, syncLibrary } from "../onboard/library.mjs";

const USAGE = `Usage: node scripts/library-ingest.mjs [--force] [--dir <path>] [--search "question"] [--k <n>] [--no-sync]

  --force        sync even while the ground link is down (first local ingest),
                 and accept removing more than half of the documents
  --dir <path>   ground library folder (default: DEMIFY_GROUND_LIBRARY_DIR or ./library)
  --search <q>   print the top passages for a question after the sync
  --k <n>        number of passages to print (default: DEMIFY_ASSISTANT_TOP_K or 5)
  --no-sync      only search, do not sync
  --help         this text`;

/**
 * Plain text table with aligned columns.
 * @param {string[]} header
 * @param {string[][]} rows
 */
function table(header, rows) {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (/** @type {string[]} */ r) =>
    r
      .map((c, i) => (i === r.length - 1 ? c : (c ?? "").padEnd(widths[i])))
      .join("  ")
      .trimEnd();
  return [line(header), line(widths.map((w) => "-".repeat(w))), ...rows.map(line)].join("\n");
}

/** @param {string} s @param {number} n */
function clip(s, n) {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
}

const OPTIONS = /** @type {const} */ ({
  force: { type: "boolean" },
  dir: { type: "string" },
  search: { type: "string" },
  k: { type: "string" },
  "no-sync": { type: "boolean" },
  help: { type: "boolean" },
});

/**
 * Key/value lines with aligned keys.
 * @param {[string, string][]} rows
 */
function keyValues(rows) {
  const width = Math.max(...rows.map(([key]) => key.length));
  return rows.map(([key, value]) => `  ${key.padEnd(width)}  ${value}`).join("\n");
}

/**
 * Summary rows of a successful sync.
 * @param {import("../onboard/library.mjs").SyncResult} r
 * @param {import("../onboard/config.mjs").OnboardConfig} cfg
 * @returns {[string, string][]}
 */
function counts(r, cfg) {
  return [
    ["documents", `${r.docsAdded} added, ${r.docsUpdated} updated, ${r.docsRemoved} removed, ${r.docsUnchanged} unchanged`],
    ["inventory items", String(r.inventoryItems)],
    [
      "embeddings",
      cfg.modelUrl
        ? `${r.chunksEmbedded} embedded, ${r.chunksPendingEmbedding} pending (${cfg.embedModel})`
        : `${r.chunksPendingEmbedding} chunks without embeddings (no DEMIFY_MODEL_URL: full-text search)`,
    ],
  ];
}

async function main() {
  let args;
  try {
    args = parseArgs({ options: OPTIONS, strict: true, allowPositionals: false }).values;
  } catch (err) {
    console.error(`${err instanceof Error ? err.message : String(err)}\n\n${USAGE}`);
    return 2;
  }
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  if (args["no-sync"] && !args.search) {
    console.error(`--no-sync needs --search\n\n${USAGE}`);
    return 2;
  }
  const k = args.k === undefined ? undefined : Number(args.k);
  if (k !== undefined && (!Number.isInteger(k) || k < 1 || k > 50)) {
    console.error(`--k must be a whole number from 1 to 50\n\n${USAGE}`);
    return 2;
  }

  const base = onboardConfig();
  if (!base.databaseUrl) {
    console.error("DATABASE_URL is not set: the library ingest needs PostgreSQL (see .env.spark.example).");
    return 2;
  }
  const cfg = args.dir ? { ...base, groundLibraryDir: path.resolve(args.dir) } : base;
  const pool = getPool();

  try {
    await ensureSchema(pool);
  } catch (err) {
    console.error(`Cannot prepare the database: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  let code = 0;
  if (!args["no-sync"]) {
    const row = await readGroundLinkRow(pool);
    const up = row.up && !cfg.offline;
    const linkText = up ? "up" : cfg.offline ? "down (DEMIFY_OFFLINE=true)" : `down (switched off ${row.changedAt})`;
    const r = await syncLibrary(pool, cfg, { trigger: "cli", groundLinkUp: up, force: args.force === true });
    const seconds = (Date.parse(r.finishedAt) - Date.parse(r.startedAt)) / 1000;
    console.log(`Library sync (cli${args.force ? ", forced" : ""}): ${r.status}\n`);
    console.log(
      keyValues([
        ["ground library", cfg.groundLibraryDir],
        ["ground link", linkText],
        ...(r.status === "ok" ? counts(r, cfg) : []),
        ...(r.reason ? /** @type {[string, string][]} */ ([[r.status === "ok" ? "note" : "reason", r.reason]]) : []),
        ["time", `${seconds.toFixed(1)} s`],
      ]),
    );
    if (r.status === "failed") {
      console.error(`\nLibrary sync failed: ${r.reason ?? "unknown reason"}`);
      code = 1;
    } else if (r.status === "skipped") code = 3;
  }

  if (args.search) {
    const res = await searchLibrary(pool, cfg, args.search, k ?? cfg.topK);
    console.log(
      `\nSearch: ${JSON.stringify(args.search)}\ntier ${res.tier}${res.fallbackReason ? ` (${res.fallbackReason})` : ""}` +
        `${res.integrityFailures ? `, ${res.integrityFailures} passages dropped: checksum mismatch` : ""}\n`,
    );
    if (!res.hits.length) console.log("No passages found.");
    else {
      console.log(
        table(
          ["#", "tier", "score", "title", "heading"],
          res.hits.map((h, i) => [String(i + 1), h.tier, h.score.toFixed(4), clip(h.title, 40), clip(h.heading, 70)]),
        ),
      );
    }
  }
  return code;
}

let exitCode = 1;
try {
  exitCode = await main();
} catch (err) {
  console.error(`Library ingest failed: ${err instanceof Error ? err.message : String(err)}`);
  exitCode = 1;
} finally {
  await closePool();
}
process.exitCode = exitCode;
