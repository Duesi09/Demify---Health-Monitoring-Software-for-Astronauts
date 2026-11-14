"use client";

import { useMemo, useRef, useState } from "react";
import { BODY_REGIONS } from "@/lib/health/knowledge";
import type { LinkMode, LinkProfileId } from "@/lib/link";
import type { Assessment, BodyRegionId, IndicatorId, Reading, Status } from "@/lib/types";
import { STATUS_ICON, STATUS_LABEL, StatusBadge } from "@/components/ui";
import "./body-map.css";
import { BodyFigure } from "./body-figure";
import { RegionDetail } from "./region-detail";
import { REGION_ICON, REGION_ORDER, STATUS_RANK, STATUS_VAR } from "./regions";

export interface BodyMapProps {
  crewName: string;
  regions: Record<BodyRegionId, Status>;
  assessments: Assessment[];
  sources: Partial<Record<IndicatorId, Reading["source"]>>;
  initialRegion?: BodyRegionId;
  /** linkPolicy mode of the page's signal delay (?link= aware); blackout means no contact with the ground. */
  linkMode?: LinkMode;
  /** Signal-delay profile chosen with ?link=, carried into the panel's links (null: none chosen). */
  link?: LinkProfileId | null;
}

function worstRegion(regions: Record<BodyRegionId, Status>): BodyRegionId {
  return REGION_ORDER.reduce((w, id) => (STATUS_RANK[regions[id]] > STATUS_RANK[regions[w]] ? id : w), REGION_ORDER[0]);
}

const LEGEND: Status[] = ["nominal", "caution", "critical", "unknown"];

export function BodyMap({
  crewName,
  regions,
  assessments,
  sources,
  initialRegion,
  linkMode = "live",
  link = null,
}: BodyMapProps) {
  const [selected, setSelected] = useState<BodyRegionId>(() => initialRegion ?? worstRegion(regions));
  const [hovered, setHovered] = useState<BodyRegionId | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // On stacked (narrow) layouts the panel sits below the figure: bring it into view.
  const select = (id: BodyRegionId) => {
    setSelected(id);
    const el = panelRef.current;
    if (!el || window.matchMedia("(min-width: 1280px)").matches) return;
    if (el.getBoundingClientRect().top > window.innerHeight * 0.6) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  };

  const byId = useMemo(
    () => Object.fromEntries(assessments.map((a) => [a.indicator, a])) as Partial<Record<IndicatorId, Assessment>>,
    [assessments],
  );
  const heartRate = byId.heartRate?.value ?? null;
  const attention = REGION_ORDER.filter((id) => regions[id] === "caution" || regions[id] === "critical").length;

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,540px)_minmax(0,1fr)]">
      <section
        aria-labelledby="body-map-title"
        className="relative overflow-hidden rounded-xl border border-border bg-surface p-4 md:p-6 xl:sticky xl:top-6"
      >
        <header className="mb-2 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="body-map-title" className="text-base font-semibold tracking-tight">
              {crewName}
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {attention === 0
                ? "All measured regions nominal."
                : `${attention} of ${REGION_ORDER.length} regions need attention.`}{" "}
              Select a region for details.
            </p>
          </div>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted" aria-label="Colour legend">
            {LEGEND.map((s) => {
              const Shape = STATUS_ICON[s];
              return (
                <li key={s} className="flex items-center gap-1">
                  <Shape size={12} strokeWidth={2.5} aria-hidden style={{ color: STATUS_VAR[s] }} />
                  {STATUS_LABEL[s]}
                </li>
              );
            })}
          </ul>
        </header>

        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:justify-center">
          <BodyFigure
            className="h-auto w-[min(100%,250px)] shrink-0 select-none sm:w-[280px]"
            regions={regions}
            selected={selected}
            hovered={hovered}
            heartRate={heartRate}
            onSelect={select}
            onHover={setHovered}
          />

          <ul className="grid w-full grid-cols-2 gap-1.5 sm:w-[205px] sm:grid-cols-1" aria-label="Body regions">
            {REGION_ORDER.map((id) => {
              const Icon = REGION_ICON[id];
              const on = selected === id;
              const status = regions[id];
              return (
                <li key={id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => select(id)}
                    onMouseEnter={() => setHovered(id)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(id)}
                    onBlur={() => setHovered(null)}
                    className={`group flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
                      on
                        ? "border-fg/25 bg-surface-2 text-fg"
                        : hovered === id
                          ? "border-border bg-surface-2 text-fg"
                          : "border-transparent text-muted hover:bg-surface-2 hover:text-fg"
                    }`}
                  >
                    <Icon size={16} aria-hidden className={`shrink-0 ${on ? "text-fg" : "text-muted group-hover:text-fg"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block leading-tight">{BODY_REGIONS[id].name}</span>
                      <StatusBadge status={status} size="xs" className="mt-1" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <div ref={panelRef} className="scroll-mt-16">
        <RegionDetail
          key={selected}
          region={selected}
          status={regions[selected]}
          assessments={byId}
          sources={sources}
          crewName={crewName}
          linkMode={linkMode}
          link={link}
        />
      </div>
    </div>
  );
}
