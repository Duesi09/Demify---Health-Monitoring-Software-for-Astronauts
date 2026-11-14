"use client";

import { useState, type FormEvent } from "react";
import { ExternalLink, Loader2, Search } from "lucide-react";
import type { StudySearch as StudySearchData } from "@/lib/sources/osdr";
import type { SourceResult } from "@/lib/types";
import { Provenance } from "@/components/ui";

type Meta = Omit<SourceResult<unknown>, "data">;
type Result = { data: StudySearchData; meta: Meta };

const SUGGESTIONS = ["Inspiration4", "bone loss", "muscle atrophy", "space radiation", "immune", "cardiovascular", "astronaut"];
const PAGE = 10;

/** OSDR full-text study search; queries go through our server (/api/osdr/search) because OSDR has no CORS. */
export function StudySearch({ initial }: { initial: Result | null }) {
  const [q, setQ] = useState(initial?.data.query ?? "");
  const [result, setResult] = useState<Result | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(query: string, from = 0) {
    const term = query.trim();
    if (!term) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/osdr/search?q=${encodeURIComponent(term)}&size=${PAGE}&from=${from}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      const { provenance, ...data } = body;
      setResult({ data: data as StudySearchData, meta: provenance as Meta });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void run(q);
  }

  const data = result?.data;
  const from = data?.from ?? 0;

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
            placeholder="e.g. bone loss, Inspiration4, radiation…"
            maxLength={120}
            className="w-full rounded-md border border-border bg-surface-2 py-2 pl-9 pr-3 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !q.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
        >
          {loading && <Loader2 size={14} className="animate-spin" aria-hidden />}
          Search OSDR
        </button>
      </form>
      <div className="flex flex-wrap gap-1.5" aria-label="Example searches">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setQ(s);
              void run(s);
            }}
            className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted hover:border-accent hover:text-fg"
          >
            {s}
          </button>
        ))}
      </div>

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
                    <span className="mr-2 whitespace-nowrap rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[11px] text-accent">{h.accession}</span>
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
          {data.total > PAGE && (
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={loading || from === 0}
                onClick={() => void run(data.query, Math.max(0, from - PAGE))}
                className="rounded-md border border-border px-3 py-1 text-xs disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={loading || from + PAGE >= data.total || from + PAGE > 500}
                onClick={() => void run(data.query, from + PAGE)}
                className="rounded-md border border-border px-3 py-1 text-xs disabled:opacity-40"
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
