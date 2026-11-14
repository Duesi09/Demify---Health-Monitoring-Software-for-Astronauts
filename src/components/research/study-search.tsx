"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ExternalLink, Loader2, Search, WifiOff } from "lucide-react";
import type { StudySearch as StudySearchData, StudySearchResponse } from "@/lib/sources/osdr";
import type { SourceResult } from "@/lib/types";
import { Provenance, Tag, tagClass } from "@/components/ui";

type Meta = Omit<SourceResult<unknown>, "data">;
type Result = { data: StudySearchData; meta: Meta };
type OfflineInfo = NonNullable<Extract<StudySearchResponse, { provenance: unknown }>["offline"]>;

const SUGGESTIONS = ["Inspiration4", "bone loss", "muscle atrophy", "space radiation", "immune", "cardiovascular", "astronaut"];
const PAGE = 10;

/** Drops a trailing full stop so a sentence can be continued. */
function sentence(text: string): string {
  return text.replace(/[.\s]+$/, "");
}

/**
 * Status line under the search box, or null when nothing needs saying:
 *  - the server answered with the cached default list instead (`offline`),
 *  - offline mode, showing the default list or a seeded example's snapshot,
 *  - online, but the live search failed and a cached copy of this query is
 *    shown. The cause is not known here (ground link down, network
 *    unreachable or an OSDR error), so the wording stays neutral; the
 *    fallback above uses the server's reason-specific message.
 */
function statusText(
  offline: OfflineInfo | null,
  result: Result | null,
  searchOff: boolean,
  defaultQuery: string,
): string | null {
  const data = result?.data;
  if (offline) {
    const other = offline.requested && offline.requested.toLowerCase() !== data?.query.toLowerCase();
    const later =
      offline.reason === "offline-mode"
        ? `“${offline.requested}” can be searched when the connection is back`
        : `try “${offline.requested}” again later`;
    return `${sentence(offline.message)}${other ? ` (${later})` : ""}.`;
  }
  const isDefault = !data || data.query.toLowerCase() === defaultQuery.toLowerCase();
  const shown = isDefault ? "the cached default list" : `the cached results for “${data.query}”`;
  if (searchOff) {
    return `Search needs a connection; showing ${shown}. Example searches that are not greyed out also work offline.`;
  }
  if (result && result.meta.error && result.meta.freshness !== "live") {
    return `Live OSDR search unavailable; showing ${shown}.`;
  }
  return null;
}

/**
 * OSDR full-text study search; queries go through our server (/api/osdr/search)
 * because OSDR has no CORS. Without a connection the server answers with the
 * cached default list and an `offline` note instead of an error: in offline
 * mode (DEMIFY_OFFLINE) the search box is disabled and only the example
 * queries that ship with a snapshot (`seeded`) stay clickable.
 */
export function StudySearch({
  initial,
  offlineMode = false,
  seeded = [],
  defaultQuery,
}: {
  initial: Result | null;
  /** Server runs with DEMIFY_OFFLINE=true. */
  offlineMode?: boolean;
  /** Lower-case example queries that have a bundled snapshot. */
  seeded?: readonly string[];
  /** The query of the cached default list (DEFAULT_SEARCH on the server). */
  defaultQuery: string;
}) {
  const [q, setQ] = useState(initial?.data.query ?? "");
  const [result, setResult] = useState<Result | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState<OfflineInfo | null>(null);
  // Offline mode, as configured or as the server reported it on the last search.
  const searchOff = offlineMode || offline?.reason === "offline-mode";
  // Latest-wins: each run aborts the previous request, and a response that is
  // no longer the latest never touches state (so an older query can't overwrite
  // a newer one, or clear `loading` while the newer one is still in flight).
  const inflight = useRef<AbortController | null>(null);

  useEffect(() => () => inflight.current?.abort(), []);

  async function run(query: string, from = 0) {
    const term = query.trim();
    if (!term) return;
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    const isLatest = () => inflight.current === ctrl && !ctrl.signal.aborted;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/osdr/search?q=${encodeURIComponent(term)}&size=${PAGE}&from=${from}`, { signal: ctrl.signal });
      const body = (await res.json()) as StudySearchResponse;
      if (!isLatest()) return;
      if (!res.ok || "error" in body) {
        if ("error" in body && body.offline) {
          // Not even the default list is cached: clear the old results so the
          // page never shows a list next to "no cached list is available".
          setResult(null);
          setOffline({ reason: body.reason ?? "unreachable", requested: term, message: body.error });
          return;
        }
        throw new Error("error" in body ? body.error : `HTTP ${res.status}`);
      }
      const { provenance, offline: off, ...data } = body;
      setOffline(off ?? null);
      setResult({ data, meta: provenance });
    } catch (e) {
      if (!isLatest()) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (isLatest()) {
        inflight.current = null;
        setLoading(false);
      }
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void run(q);
  }

  const data = result?.data;
  const from = data?.from ?? 0;
  const status = statusText(offline, result, searchOff, defaultQuery);

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} role="search" className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="osdr-q" className="sr-only">
          Search NASA OSDR studies
        </label>
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            id="osdr-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchOff ? "Search needs a connection" : "e.g. bone loss, Inspiration4, radiation…"}
            maxLength={120}
            disabled={searchOff}
            aria-describedby={status ? "osdr-offline" : undefined}
            className="w-full rounded-lg border border-border bg-surface-2 py-2 pl-9 pr-3 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
        <button
          type="submit"
          disabled={searchOff || loading || !q.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-[3px] bg-accent px-4 py-2 text-[12px] font-semibold text-bg disabled:opacity-50"
        >
          {loading && <Loader2 size={14} className="animate-spin" aria-hidden />}
          Search OSDR
        </button>
      </form>
      <div className="flex flex-wrap gap-1.5" aria-label="Example searches">
        {SUGGESTIONS.map((s) => {
          // Offline, only the examples with a bundled snapshot can answer.
          const off = searchOff && !seeded.includes(s.toLowerCase());
          return (
            <button
              key={s}
              type="button"
              disabled={off}
              onClick={() => {
                setQ(s);
                void run(s);
              }}
              className={`${tagClass("md", true)} disabled:pointer-events-none disabled:opacity-40`}
            >
              {s}
            </button>
          );
        })}
      </div>

      {status && (
        <p id="osdr-offline" role="status" className="flex items-start gap-2 text-sm text-muted">
          <WifiOff size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span>{status}</span>
        </p>
      )}
      {error && <p className="text-sm text-critical">Search failed: {error}</p>}

      {data && (
        <div aria-live="polite" aria-busy={loading}>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs text-muted">
              {data.total.toLocaleString("en-US")} {data.total === 1 ? "study" : "studies"} for “{data.query}”
              {data.total > 0 && ` · showing ${from + 1}–${from + data.hits.length}`}
            </p>
            {result && <Provenance result={result.meta} />}
          </div>
          {data.hits.length === 0 ? (
            <p className="text-sm text-muted">No studies found. Try a broader term.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {data.hits.map((h) => (
                <li key={h.accession} className="p-3">
                  <a href={h.url} target="_blank" rel="noreferrer" className="group block text-sm font-medium hover:text-accent">
                    <Tag mono className="mr-2 align-[1px]">
                      {h.accession}
                    </Tag>
                    {h.title}
                    <ExternalLink size={12} className="ml-1 inline align-baseline text-muted group-hover:text-accent" aria-hidden />
                  </a>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                    <span>
                      <span className="text-fg/80">Organism:</span> {h.organism}
                    </span>
                    {(h.mission || h.flightProgram) && (
                      <span>
                        <span className="text-fg/80">Mission:</span> {[h.mission, h.flightProgram].filter(Boolean).join(" · ")}
                      </span>
                    )}
                    {h.measurement.length > 0 && (
                      <span>
                        <span className="text-fg/80">Assay:</span> {h.measurement.join(", ")}
                      </span>
                    )}
                    {h.releaseDate && (
                      <span className="tabular">
                        <span className="text-fg/80">Released:</span> {h.releaseDate}
                      </span>
                    )}
                  </p>
                  {h.description && <p className="mt-1 line-clamp-2 text-xs text-muted">{h.description}</p>}
                </li>
              ))}
            </ul>
          )}
          {/* Paging needs OSDR; offline only the first page of a snapshot exists. */}
          {data.total > PAGE && !searchOff && !offline && (
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={loading || from === 0}
                onClick={() => void run(data.query, Math.max(0, from - PAGE))}
                className={`${tagClass("md", true)} disabled:pointer-events-none disabled:opacity-40`}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={loading || from + PAGE >= data.total || from + PAGE > 500}
                onClick={() => void run(data.query, from + PAGE)}
                className={`${tagClass("md", true)} disabled:pointer-events-none disabled:opacity-40`}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
