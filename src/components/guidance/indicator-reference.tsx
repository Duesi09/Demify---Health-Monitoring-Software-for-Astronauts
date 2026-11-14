"use client";

import Link from "next/link";
import { useId, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowUpRight, ChevronDown, ChevronsDownUp, ChevronsUpDown, PhoneCall, Search, X } from "lucide-react";
import { BODY_REGIONS, HAZARDS, INDICATORS, escalationFlags, type IndicatorDef } from "@/lib/health/knowledge";
import type { BodyRegionId, HazardId, IndicatorId } from "@/lib/types";
import { BASIS_INFO, BasisTag } from "./basis";
import { HAZARD_ICON, HAZARD_ORDER } from "./hazards";
import { StatusBadge, TAG_SELECTED, tagClass } from "@/components/ui";
import "@/components/body/body-map.css";

const ALL = Object.values(INDICATORS);

function haystack(def: IndicatorDef): string {
  return [
    def.label,
    def.short,
    def.unit,
    def.spaceflightEffect,
    def.measurement,
    def.escalation,
    ...def.actions,
    ...Object.values(def.ranges),
    ...def.regions.map((r) => BODY_REGIONS[r].name),
    ...def.hazards.map((h) => HAZARDS[h].name),
  ]
    .join(" ")
    .toLowerCase();
}

const INDEX = ALL.map((d) => [d.id, haystack(d)] as const);

/* The URL hash (#ind-heartRate) opens that entry, e.g. when linked from the body map. */
function subscribeHash(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}
const getHash = () => window.location.hash;
const getServerHash = () => "";

/** Squared filter chip; the selected one is inverted (not coloured), like a segmented control. */
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`${tagClass("md", true)} ${on ? TAG_SELECTED : ""}`}>
      {children}
    </button>
  );
}

export function IndicatorReference() {
  const uid = useId();
  const [query, setQuery] = useState("");
  const [hazard, setHazard] = useState<HazardId | "all">("all");
  const [region, setRegion] = useState<BodyRegionId | "all">("all");
  const [toggled, setToggled] = useState<Partial<Record<IndicatorId, boolean>>>({});
  const hash = useSyncExternalStore(subscribeHash, getHash, getServerHash);
  const hashId = hash.startsWith("#ind-") ? hash.slice(5) : null;

  const shown = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return INDEX.filter(([id, text]) => {
      const def = INDICATORS[id];
      if (hazard !== "all" && !def.hazards.includes(hazard)) return false;
      if (region !== "all" && !def.regions.includes(region)) return false;
      return terms.every((t) => text.includes(t));
    }).map(([id]) => INDICATORS[id]);
  }, [query, hazard, region]);

  const isOpen = (id: IndicatorId) => toggled[id] ?? id === hashId;
  const setAll = (open: boolean) => setToggled(Object.fromEntries(shown.map((d) => [d.id, open])));
  const filtered = query !== "" || hazard !== "all" || region !== "all";

  return (
    <div className="space-y-4">
      {/* Basis legend */}
      <dl className="grid gap-2 md:grid-cols-3">
        {(Object.keys(BASIS_INFO) as (keyof typeof BASIS_INFO)[]).map((b) => (
          <div key={b} className="rounded-lg border border-border bg-surface-2/40 p-3">
            <dt className="flex items-center gap-2 text-sm font-medium">
              <BasisTag basis={b} />
              {BASIS_INFO[b].name}
            </dt>
            <dd className="mt-1 text-xs text-muted">{BASIS_INFO[b].description}</dd>
          </div>
        ))}
      </dl>

      {/* Controls */}
      <div className="space-y-3 rounded-lg border border-border bg-surface-2/30 p-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Search indicators</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search: blood pressure, sleep, CO₂, fainting…"
              className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm placeholder:text-muted/70 focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="shrink-0 text-xs text-muted">Body region</span>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value as BodyRegionId | "all")}
              className="w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20 sm:w-auto"
            >
              <option value="all">All regions</option>
              {Object.values(BODY_REGIONS).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by NASA hazard">
          <span className="mr-1 text-xs text-muted">Hazard</span>
          <Chip on={hazard === "all"} onClick={() => setHazard("all")}>
            All
          </Chip>
          {HAZARD_ORDER.map((h) => {
            const Icon = HAZARD_ICON[h];
            return (
              <Chip key={h} on={hazard === h} onClick={() => setHazard(hazard === h ? "all" : h)}>
                <Icon size={12} aria-hidden />
                {HAZARDS[h].name}
              </Chip>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted" aria-live="polite">
          Showing {shown.length} of {ALL.length} indicators
          {filtered && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setHazard("all");
                setRegion("all");
              }}
              className="ml-2 inline-flex items-center gap-0.5 text-accent hover:underline"
            >
              <X size={12} aria-hidden /> Clear filters
            </button>
          )}
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setAll(true)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg"
          >
            <ChevronsUpDown size={13} aria-hidden /> Expand all
          </button>
          <button
            type="button"
            onClick={() => setAll(false)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg"
          >
            <ChevronsDownUp size={13} aria-hidden /> Collapse all
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
          No indicator matches these filters.
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((def) => {
            const open = isOpen(def.id);
            const panelId = `${uid}-${def.id}`;
            const flags = escalationFlags(def);
            return (
              <li
                key={def.id}
                id={`ind-${def.id}`}
                className={`scroll-mt-20 rounded-lg border bg-surface transition-colors ${open ? "border-fg/25" : "border-border"}`}
              >
                <h3>
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setToggled((t) => ({ ...t, [def.id]: !open }))}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-surface-2/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent md:px-4"
                  >
                    <ChevronDown
                      size={16}
                      aria-hidden
                      className={`shrink-0 text-muted transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-medium">{def.label}</span>
                        <span className="text-xs text-muted">{def.unit}</span>
                        <BasisTag basis={def.basis} />
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">
                        <span className="font-medium text-fg/80">Nominal</span> {def.ranges.nominal}
                      </span>
                    </span>
                    <span className="hidden shrink-0 gap-1 md:flex" aria-hidden>
                      {def.hazards.map((h) => {
                        const Icon = HAZARD_ICON[h];
                        return (
                          <span key={h} title={HAZARDS[h].name} className="rounded-[3px] border border-border bg-surface-2 p-1 text-muted">
                            <Icon size={12} />
                          </span>
                        );
                      })}
                    </span>
                  </button>
                </h3>

                {open && (
                  <div id={panelId} className="bm-panel-in space-y-4 border-t border-border px-3 pb-4 pt-3 md:px-4">
                    <div className="grid gap-2 sm:grid-cols-3">
                      {(["nominal", "caution", "critical"] as const).map((k) => (
                        <div key={k} className="rounded-lg border border-border bg-surface-2/40 p-2.5">
                          <StatusBadge status={k} size="xs" />
                          <p className="mt-1.5 text-sm">{def.ranges[k]}</p>
                        </div>
                      ))}
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <h4 className="text-xs font-semibold text-muted">Effect of spaceflight</h4>
                        <p className="mt-1 text-sm leading-relaxed">{def.spaceflightEffect}</p>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-muted">How it is measured in space</h4>
                        <p className="mt-1 text-sm leading-relaxed">{def.measurement}</p>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-muted">Crew actions</h4>
                        <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm marker:text-muted">
                          {def.actions.map((a) => (
                            <li key={a}>{a}</li>
                          ))}
                        </ol>
                      </div>
                      <div className="rounded-lg border border-critical/40 bg-critical/5 p-3">
                        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-critical">
                          <PhoneCall size={12} aria-hidden /> When to escalate
                        </h4>
                        <p className="mt-1 text-sm">{def.escalation}</p>
                        {flags.length > 0 && <p className="mt-1 text-xs text-muted">Automatic flag: {flags.join("; ")}</p>}
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-border pt-3 text-xs md:flex-row md:flex-wrap md:gap-x-8">
                      <div>
                        <p className="text-muted">Hazards</p>
                        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                          {def.hazards.map((h) => (
                            <a key={h} href={HAZARDS[h].url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-accent">
                              {HAZARDS[h].name}
                              <ArrowUpRight size={11} aria-hidden />
                            </a>
                          ))}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted">Body regions</p>
                        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                          {def.regions.map((r) => (
                            <Link key={r} href={`/body?region=${r}`} className="hover:text-accent">
                              {BODY_REGIONS[r].name}
                            </Link>
                          ))}
                        </p>
                      </div>
                      <div className="min-w-0 md:flex-1">
                        <p className="text-muted">Sources</p>
                        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                          {def.sources.map((s) => (
                            <a
                              key={s.url}
                              href={s.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-0.5 text-accent/90 hover:text-accent hover:underline"
                            >
                              {s.label}
                              <ArrowUpRight size={11} aria-hidden />
                            </a>
                          ))}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
