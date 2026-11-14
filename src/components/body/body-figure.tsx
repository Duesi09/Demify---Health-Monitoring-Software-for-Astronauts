"use client";

import { Fragment, useId, type KeyboardEvent, type ReactNode } from "react";
import { BODY_REGIONS } from "@/lib/health/knowledge";
import type { BodyRegionId, Status } from "@/lib/types";
import { STATUS_LABEL } from "@/components/ui";
import { REGION_LOCATION, STATUS_VAR } from "./regions";

/*
 * Hand-built front-view figure on a 240 x 520 canvas, centre line x = 120.
 * Proportions follow the classic ~8-heads figure: chin y 82, shoulders y 100,
 * elbows at the waist (y 215), wrists at the crotch (y 288), knees y 370,
 * ankles y 482. Paired shapes are drawn once for the viewer's left side and
 * mirrored, so the figure is always symmetric.
 */

const MIRROR = "translate(240 0) scale(-1 1)";

const HEAD =
  "M120,23 C134,23 143,34 143,50 C143,62 139,72 132,78 C128,81 124,82 120,82 C116,82 112,81 108,78 C101,72 97,62 97,50 C97,34 106,23 120,23 Z";
const NECK = "M109,70 L109,96 L131,96 L131,70 Z";
const TORSO =
  "M110,88 C106,95 96,98 84,100 C78,101 74,104 72,108 L80,114 C84,126 86,140 86,150 C88,180 94,205 94,222 C94,238 86,250 85,264 L86,282 C100,286 112,289 120,290 C128,289 140,286 154,282 L155,264 C154,250 146,238 146,222 C146,205 152,180 154,150 C154,140 156,126 160,114 L168,108 C166,104 162,101 156,100 C144,98 134,95 130,88 Z";
const ARM =
  "M84,100 C72,100 63,108 61,122 C58,140 57,160 57,178 C56,195 56,205 55,214 C51,232 49,258 50,288 L62,289 C64,265 69,240 71,216 C74,196 78,176 80,160 C82,150 84,142 86,136 Z";
const HAND =
  "M50,287 C47,297 46,309 47,318 C48,328 52,334 56,334 C60,334 63,329 63,322 L64,310 C66,313 68,315 69,314 C70,311 67,301 62,288 Z";
const LEG =
  "M86,256 C82,280 82,305 85,330 C87,348 89,360 90,370 C88,385 86,400 87,415 C89,440 96,465 98,482 L111,482 C111,465 113,440 113,418 C113,400 109,385 109,372 C109,355 114,320 118,290 L120,290 L120,256 Z";
const FOOT = "M98,480 L111,480 C112,488 113,494 112,500 C106,503 96,503 92,501 C90,498 93,492 98,486 Z";
const EAR = "M97,46 C93,46 92,50 92,54 C92,58 94,61 98,61 Z";

/* Region hotspots (left-side halves are mirrored where paired). */
const BRAIN =
  "M103,42 C102,32 110,28 120,28 C130,28 138,32 137,42 C137,48 132,51 127,49 C124,51 116,51 113,49 C108,51 103,48 103,42 Z";
const BRAIN_DETAIL =
  "M120,30 L120,49 M109,35 C113,36 113,40 110,42 M107,44 C110,44 112,46 112,48 M131,35 C127,36 127,40 130,42 M133,44 C130,44 128,46 128,48 M116,33 C118,37 116,41 118,44 M124,33 C122,37 124,41 122,44";
const EYE = "M103.5,58 C106.5,54.2 113.5,54.2 116.5,58 C113.5,61.8 106.5,61.8 103.5,58 Z";
const LUNG_R = // body's right lung, viewer's left
  "M116,110 C110,106 100,112 96,124 C92,138 91,160 92,178 C93,186 100,189 108,185 C113,182 116,178 116,170 Z";
const LUNG_L = // body's left lung with the cardiac notch
  "M124,110 C130,106 140,112 144,124 C148,138 149,160 148,178 C147,186 140,189 132,185 C128,183 126,180 126,176 C131,171 133,160 129,150 C126,140 124,130 124,120 Z";
const AIRWAY = "M120,92 L120,112 M120,112 C117,116 113,118 110,124 M120,112 C123,116 127,118 130,124 M110,124 L104,138 M110,124 L111,140 M130,124 L136,138";
const HEART =
  "M0,6 C-8,0 -12,-4 -12,-8 C-12,-12 -9,-14 -6,-14 C-3,-14 -1,-12 0,-10 C1,-12 3,-14 6,-14 C9,-14 12,-12 12,-8 C12,-4 8,0 0,6 Z";
const HEART_DETAIL = "M-3,-12 C-2,-6 -1,-2 1,2 M5,-11 C4,-7 4,-3 2,0";
const GUT =
  "M104,198 C110,193 130,193 136,198 C141,208 142,232 138,241 C132,248 108,248 102,241 C98,232 99,208 104,198 Z";
const GUT_DETAIL =
  "M108,212 C112,205 128,205 132,212 C135,218 106,218 108,225 C110,232 130,231 132,226 M108,236 C116,241 124,241 132,236";
const PELVIS =
  "M96,256 C100,250 108,252 114,258 L120,262 L126,258 C132,252 140,250 144,256 C148,264 146,276 138,280 C132,282 128,278 124,276 L120,284 L116,276 C112,278 108,282 102,280 C94,276 92,264 96,256 Z";
const PELVIS_DETAIL = "M106,262 C109,266 109,270 106,273 M134,262 C131,266 131,270 134,273";
const TIBIA = "M97,382 C97,378 103,378 103,382 L102,468 C102,472 98,472 98,468 Z";
const BICEPS =
  "M64,134 C66,124 76,122 80,132 C80,150 77,172 73,190 C71,196 66,196 64,190 C61,172 61,150 64,134 Z";
const BICEPS_DETAIL = "M71,134 C72,152 71,170 69,188";
const QUAD =
  "M89,292 C95,286 109,287 113,297 C113,314 109,340 104,358 C101,363 95,362 93,357 C89,340 86,306 89,292 Z";
const QUAD_DETAIL = "M100,296 C101,320 100,340 99,356";
const FOREARM =
  "M58,222 C62,219 67,219 69,223 C68,245 64,268 61,282 C59,285 54,285 53,282 C53,262 55,240 58,222 Z";
const VESSELS = "M63,224 C62,245 59,262 58,281 M62,238 C65,250 63,262 61,270 M60,252 C57,258 56,266 56,274";

type Anchor = [number, number, number];

const PULSE_ANCHORS: Record<BodyRegionId, Anchor[]> = {
  brain: [[120, 39, 15]],
  eyes: [[110, 58, 6], [130, 58, 6]],
  heart: [[127, 156, 12]],
  lungs: [[104, 148, 13], [137, 148, 13]],
  blood: [[61, 252, 9], [179, 252, 9]],
  gut: [[120, 221, 15]],
  muscles: [[71, 160, 10], [169, 160, 10], [101, 325, 10], [139, 325, 10]],
  skeleton: [[120, 268, 14], [100, 370, 6], [140, 370, 6]],
  skin: [[55, 312, 9], [185, 312, 9]],
};

/**
 * DOM order = keyboard tab order, so it runs head to toe. Shapes barely overlap;
 * the one rule is that the heart comes after the lungs so it stays clickable.
 */
const DRAW_ORDER: BodyRegionId[] = ["brain", "eyes", "lungs", "heart", "blood", "gut", "muscles", "skeleton", "skin"];

function Pair({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <g transform={MIRROR}>{children}</g>
    </>
  );
}

function RegionArt({ id, beatSeconds }: { id: BodyRegionId; beatSeconds: number | null }) {
  const s = "bm-shape";
  const d = "bm-detail";
  switch (id) {
    case "brain":
      return (
        <>
          <path className={s} d={BRAIN} />
          <path className={d} d={BRAIN_DETAIL} />
        </>
      );
    case "eyes":
      return (
        <>
          <rect x="99" y="50" width="42" height="16" rx="8" fill="transparent" />
          <Pair>
            <path className={s} d={EYE} />
            <circle cx="110" cy="58" r="1.8" fill="currentColor" />
          </Pair>
        </>
      );
    case "lungs":
      return (
        <>
          <rect x="92" y="104" width="56" height="84" rx="12" fill="transparent" />
          <path className={s} d={LUNG_R} />
          <path className={s} d={LUNG_L} />
          <path className={d} d={AIRWAY} />
        </>
      );
    case "heart":
      return (
        <g transform="translate(127 158) rotate(-25) scale(0.92)">
          <g
            className={beatSeconds ? "bm-beat" : undefined}
            style={beatSeconds ? { animationDuration: `${beatSeconds}s` } : undefined}
          >
            <path className={s} d={HEART} />
            <path className={d} d={HEART_DETAIL} />
          </g>
        </g>
      );
    case "gut":
      return (
        <>
          <path className={s} d={GUT} />
          <path className={d} d={GUT_DETAIL} />
        </>
      );
    case "skeleton":
      return (
        <>
          <path className={s} d={PELVIS} />
          <path className={d} d={PELVIS_DETAIL} />
          <Pair>
            <circle className={s} cx="99.5" cy="370" r="5" />
            <path className={s} d={TIBIA} />
          </Pair>
        </>
      );
    case "muscles":
      return (
        <Pair>
          <path className={s} d={BICEPS} />
          <path className={d} d={BICEPS_DETAIL} />
          <path className={s} d={QUAD} />
          <path className={d} d={QUAD_DETAIL} />
        </Pair>
      );
    case "blood":
      return (
        <Pair>
          <path className={s} d={FOREARM} />
          <path className={d} d={VESSELS} />
        </Pair>
      );
    case "skin":
      return (
        <Pair>
          <path className={s} d={HAND} />
        </Pair>
      );
  }
}

/** Plain paths only (no <g>), so the same markup also works inside <clipPath>. */
function Silhouette() {
  return (
    <>
      <path d={NECK} />
      <path d={HEAD} />
      <path d={TORSO} />
      {[EAR, ARM, HAND, LEG, FOOT].map((d) => (
        <Fragment key={d}>
          <path d={d} />
          <path d={d} transform={MIRROR} />
        </Fragment>
      ))}
    </>
  );
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
  const uid = useId().replace(/:/g, "");
  const fillId = `${uid}-fill`;
  const beatSeconds = heartRate && heartRate >= 30 && heartRate <= 220 ? Number((60 / heartRate).toFixed(3)) : null;

  const onKey = (id: BodyRegionId) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(id);
    }
  };

  return (
    <svg
      viewBox="0 0 240 520"
      className={className}
      role="group"
      aria-label="Interactive body map. Each highlighted body region is a button."
    >
      <defs>
        <linearGradient id={fillId} gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="0" y2="505">
          <stop offset="0" style={{ stopColor: "var(--surface-2)" }} />
          <stop offset="1" style={{ stopColor: "var(--surface)" }} />
        </linearGradient>
      </defs>

      {/* Silhouette: a wide stroked pass under a fill pass gives a clean outer outline. */}
      <g aria-hidden pointerEvents="none">
        <g fill="none" stroke="var(--muted)" strokeOpacity="0.4" strokeWidth="2" strokeLinejoin="round">
          <Silhouette />
        </g>
        <g fill={`url(#${fillId})`}>
          <Silhouette />
        </g>
      </g>

      {DRAW_ORDER.map((id) => {
        const status = regions[id];
        const name = BODY_REGIONS[id].name;
        return (
          <g
            key={id}
            role="button"
            tabIndex={0}
            aria-pressed={selected === id}
            aria-label={`${name} (${REGION_LOCATION[id]}) — ${STATUS_LABEL[status].toLowerCase()}`}
            data-hover={hovered === id}
            className="bm-hotspot"
            style={{ color: STATUS_VAR[status] }}
            onClick={() => onSelect(id)}
            onKeyDown={onKey(id)}
            onMouseEnter={() => onHover(id)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(id)}
            onBlur={() => onHover(null)}
          >
            <title>{`${name}: ${STATUS_LABEL[status]}`}</title>
            <RegionArt id={id} beatSeconds={id === "heart" ? beatSeconds : null} />
          </g>
        );
      })}
      {/* Pulse rings on regions that need attention. */}
      <g aria-hidden pointerEvents="none">
        {DRAW_ORDER.filter((id) => regions[id] === "caution" || regions[id] === "critical").map((id) =>
          PULSE_ANCHORS[id].map(([cx, cy, r], i) => (
            <circle
              key={`${id}-${i}`}
              className="pulse-ring"
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={STATUS_VAR[regions[id]]}
              strokeWidth="1.5"
              style={{ animationDelay: `${(i * 0.25).toFixed(2)}s`, animationDuration: regions[id] === "critical" ? "1.2s" : undefined }}
            />
          )),
        )}
      </g>
    </svg>
  );
}
