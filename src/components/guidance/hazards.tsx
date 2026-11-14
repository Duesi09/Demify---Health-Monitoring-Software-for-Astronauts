import Link from "next/link";
import { AirVent, ArrowUpRight, Orbit, Radiation, UsersRound, Weight, type LucideIcon } from "lucide-react";
import { BODY_REGIONS, HAZARDS, INDICATORS } from "@/lib/health/knowledge";
import type { HazardId } from "@/lib/types";
import { tagClass } from "@/components/ui";

export const HAZARD_ICON: Record<HazardId, LucideIcon> = {
  radiation: Radiation,
  isolation: UsersRound,
  distance: Orbit,
  gravity: Weight,
  environment: AirVent,
};

export const RIDGE_LETTER: Record<HazardId, string> = { radiation: "R", isolation: "I", distance: "D", gravity: "G", environment: "E" };

/** NASA's RIDGE order. */
export const HAZARD_ORDER: HazardId[] = ["radiation", "isolation", "distance", "gravity", "environment"];

export function HazardCards() {
  const regions = Object.values(BODY_REGIONS);
  const indicators = Object.values(INDICATORS);
  return (
    <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
      {HAZARD_ORDER.map((id, i) => {
        const h = HAZARDS[id];
        const Icon = HAZARD_ICON[id];
        const affected = regions.filter((r) => r.hazards.includes(id));
        const tracked = indicators.filter((i) => i.hazards.includes(id)).length;
        return (
          <li
            key={id}
            className={`flex flex-col rounded-xl border border-border bg-surface p-4 ${i < 3 ? "lg:col-span-2" : "lg:col-span-3"} ${i === 4 ? "sm:max-lg:col-span-2" : ""}`}
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-xl font-semibold tracking-tight text-fg"
              >
                {RIDGE_LETTER[id]}
              </span>
              <div className="min-w-0">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
                  <Icon size={15} className="shrink-0 text-muted" aria-hidden />
                  {h.name}
                </h3>
                <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted">Hazard {i + 1} of 5</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted">{h.summary}</p>
            <ul className="mt-3 space-y-1 text-sm">
              {h.effects.map((e) => (
                <li key={e} className="flex gap-2">
                  <span className="mt-[9px] h-px w-2 shrink-0 bg-muted" aria-hidden />
                  {e}
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-4">
              <p className="text-[11px] uppercase tracking-wider text-muted">Body systems · {tracked} indicators tracked</p>
              <ul className="mt-2 flex flex-wrap gap-1">
                {affected.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/body?region=${r.id}`}
                      className={tagClass("sm", true)}
                    >
                      {r.name}
                    </Link>
                  </li>
                ))}
              </ul>
              <a
                href={h.url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                NASA Human Research Program
                <ArrowUpRight size={12} aria-hidden />
              </a>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
