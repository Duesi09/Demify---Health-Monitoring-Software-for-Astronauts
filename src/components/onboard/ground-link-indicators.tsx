"use client";

import { SatelliteDish } from "lucide-react";
import { StatusBadge } from "@/components/ui";
import { groundLinkBanner, groundLinkLabel, groundLinkMeaning } from "./format";
import { useGroundLink } from "./use-ground-link";

/**
 * Small ground-link chip for the nav ("Ground link up" / "Ground link
 * down"). Renders nothing until GET /api/ground-link answers, and nothing
 * while it fails, so a setup without the route looks exactly as before.
 */
export function GroundLinkChip({ className = "" }: { className?: string }) {
  const { state } = useGroundLink();
  if (!state) return null;
  return (
    <span
      title={groundLinkMeaning(state)}
      className={`flex shrink-0 items-center gap-1.5 text-[11px] text-muted ${className}`}
    >
      <SatelliteDish size={14} aria-hidden className={state.up ? "text-muted" : "text-caution"} />
      <StatusBadge status={state.up ? "nominal" : "caution"} label={groundLinkLabel(state)} size="xs" />
    </span>
  );
}

/**
 * Slim banner under the alarm bar, shown only while the ground link is
 * down. Nothing at all while the link is up or the route fails.
 */
export function GroundLinkBanner() {
  const { state } = useGroundLink();
  const text = groundLinkBanner(state);
  if (!text) return null;
  return (
    <div role="status" className="border-b border-caution/40 bg-caution/10 px-4 py-1.5 md:px-8">
      <p className="flex items-start gap-2 text-[13px] leading-snug text-fg">
        <SatelliteDish size={15} aria-hidden className="mt-px shrink-0 text-caution" />
        <span>{text}</span>
      </p>
    </div>
  );
}
