"use client";

import type { CSSProperties } from "react";
import { BODY_REGIONS } from "@/lib/health/knowledge";
import type { BodyRegionId, Status } from "@/lib/types";
import { STATUS_LABEL } from "@/components/ui";
import { FIGURE_ANCHORS, FIGURE_ART, FIGURE_HIT, FIGURE_VIEWBOX } from "./figure-art";
import { REGION_ORDER, STATUS_VAR } from "./regions";

/*
 * Front-view body figure: blue body silhouette, organs and a full skeleton
 * (original artwork, see src/components/body/art/ and
 * scripts/build-body-figure.py).
 *
 * Rendering is split in two layers:
 *  1. the artwork, recoloured per region through CSS variables
 *     (--region-<id>), never receiving pointer events;
 *  2. an invisible click layer: one copy of each region's shapes, stacked so
 *     organs win over the ribs drawn in front of them and bones win over the
 *     body surface. Keyboard and screen-reader access goes through the region
 *     list next to the figure (head-to-toe order), which offers the same
 *     selection.
 */

/** Regions that only get a status tint when they need attention; otherwise they keep their natural colour (white bones, blue body). */
const TINT_ONLY: BodyRegionId[] = ["skeleton", "muscles", "skin"];

function regionVars(regions: Record<BodyRegionId, Status>): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const id of REGION_ORDER) {
    const s = regions[id];
    const alert = s === "caution" || s === "critical";
    vars[`--region-${id}`] = TINT_ONLY.includes(id)
      ? alert
        ? STATUS_VAR[s]
        : "transparent"
      : STATUS_VAR[s];
  }
  return vars;
}

export function BodyFigure({
  regions,
  selected,
  hovered,
  heartRate,
  onSelect,
  onHover,
  className = "",
}: {
  regions: Record<BodyRegionId, Status>;
  selected: BodyRegionId;
  hovered: BodyRegionId | null;
  heartRate: number | null;
  onSelect: (id: BodyRegionId) => void;
  onHover: (id: BodyRegionId | null) => void;
  className?: string;
}) {
  const beatSeconds = heartRate && heartRate >= 30 && heartRate <= 220 ? Number((60 / heartRate).toFixed(3)) : null;
  const attention = REGION_ORDER.filter((id) => regions[id] === "caution" || regions[id] === "critical");
  const summary =
    attention.length === 0
      ? "all regions nominal or not measured"
      : attention.map((id) => `${BODY_REGIONS[id].name} ${STATUS_LABEL[regions[id]].toLowerCase()}`).join(", ");

  const style = {
    ...regionVars(regions),
    ...(beatSeconds ? { "--bf-beat": `${beatSeconds}s` } : {}),
  } as CSSProperties;

  return (
    <svg
      viewBox={FIGURE_VIEWBOX}
      className={`bf-root ${className}`}
      role="img"
      aria-label={`Body map, front view: ${summary}. Use the region list to select a body system.`}
      data-hover={hovered ?? ""}
      data-selected={selected}
      data-beat={beatSeconds ? "on" : "off"}
      style={style}
    >
      <g className="bf-art" aria-hidden dangerouslySetInnerHTML={{ __html: FIGURE_ART }} />

      <g className="bf-hits" aria-hidden>
        {FIGURE_HIT.map(([id, markup]) => (
          <g
            key={id}
            className="bf-hit"
            data-hit={id}
            onClick={() => onSelect(id)}
            onMouseEnter={() => onHover(id)}
            onMouseLeave={() => onHover(null)}
            dangerouslySetInnerHTML={{ __html: markup }}
          />
        ))}
      </g>

      {/* Critical regions glow through the bones in front of them (e.g. the heart behind the sternum). */}
      <g aria-hidden pointerEvents="none">
        {attention
          .filter((id) => regions[id] === "critical" && !["skeleton", "muscles", "skin"].includes(id))
          .map((id) =>
            FIGURE_ANCHORS[id].map(([cx, cy, r], i) => (
              <circle key={`glow-${id}-${i}`} className="bf-glow" cx={cx} cy={cy} r={r * 1.05} fill={STATUS_VAR.critical} />
            )),
          )}
      </g>

      {/* Pulse rings on regions that need attention. */}
      <g aria-hidden pointerEvents="none">
        {attention.map((id) =>
          FIGURE_ANCHORS[id].map(([cx, cy, r], i) => (
            <circle
              key={`${id}-${i}`}
              className="pulse-ring"
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={STATUS_VAR[regions[id]]}
              strokeWidth={regions[id] === "critical" ? 2.4 : 1.6}
              style={{ animationDelay: `${(i * 0.25).toFixed(2)}s`, animationDuration: regions[id] === "critical" ? "1.2s" : undefined }}
            />
          )),
        )}
      </g>
    </svg>
  );
}
