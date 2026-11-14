"use client";

import Link from "next/link";
import { useId } from "react";
import { Check, SatelliteDish, TriangleAlert, Unplug, type LucideIcon } from "lucide-react";
import { withLink, type LinkProfileId } from "@/lib/link";
import { GROUND_LINK_EXPLANATION, GROUND_LINK_LABEL, groundLinkBanner, groundLinkView, type GroundLinkView } from "./format";
import { useGroundLink } from "./use-ground-link";

/*
 * Colours: every label is dark text (text-fg or the caution fill's
 * on-caution) so small text keeps a contrast of at least 4.5:1; the status
 * shows in the fill, the ring and the icon shape.
 */
const VIEW_STYLE: Record<GroundLinkView, { box: string; Icon: LucideIcon; icon: string }> = {
  up: { box: "bg-nominal/10 text-fg ring-1 ring-inset ring-nominal/40", Icon: Check, icon: "text-nominal" },
  down: { box: "bg-caution-fill text-on-caution", Icon: TriangleAlert, icon: "" },
  conjunction: { box: "bg-caution-fill text-on-caution", Icon: TriangleAlert, icon: "" },
  "air-gapped": { box: "bg-surface-2 text-fg ring-1 ring-inset ring-border", Icon: Unplug, icon: "text-muted" },
};

/** Squared badge with the ground-link label ("Ground link up", "Ground link down (simulated blackout)", …). */
export function GroundLinkBadge({
  view,
  size = "sm",
  className = "",
}: {
  view: GroundLinkView;
  size?: "sm" | "md";
  className?: string;
}) {
  const { box, Icon, icon } = VIEW_STYLE[view];
  const dims = size === "md" ? "min-h-6 gap-1.5 px-2 text-[11.5px]" : "min-h-5 gap-1 px-1.5 text-[10.5px]";
  return (
    <span className={`inline-flex items-center rounded-[3px] py-0.5 font-semibold leading-tight ${dims} ${box} ${className}`}>
      <Icon size={size === "md" ? 13 : 11} strokeWidth={2.5} aria-hidden className={`shrink-0 ${icon}`} />
      {GROUND_LINK_LABEL[view]}
    </span>
  );
}

/**
 * Ground-link chip for the nav: the simulated switch, the conjunction
 * profile of this page (?link=) or the air-gapped deployment. A link to the
 * switch on the library page; its explanation is visible under it on
 * desktop and read with it (aria-describedby) on phones. Renders nothing
 * until GET /api/ground-link answers, and nothing while it fails, so a setup
 * without the route looks exactly as before.
 */
export function GroundLinkChip({ link, className = "" }: { link: LinkProfileId | null; className?: string }) {
  const { state } = useGroundLink();
  const descId = useId();
  if (!state) return null;
  const view = groundLinkView(state, link);
  const explanation = GROUND_LINK_EXPLANATION[view];
  return (
    <div className={`shrink-0 ${className}`}>
      <Link
        href={withLink("/library#ground-link", link)}
        aria-describedby={descId}
        title={explanation}
        className="flex items-center gap-1.5 rounded-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <SatelliteDish size={14} aria-hidden className="shrink-0 text-muted" />
        <GroundLinkBadge view={view} className="whitespace-nowrap md:whitespace-normal" />
      </Link>
      <p id={descId} className="sr-only md:not-sr-only md:mt-1.5 md:text-[11px] md:leading-snug md:text-muted">
        {explanation}
      </p>
    </div>
  );
}

/**
 * Slim banner under the alarm bar, shown only while the simulated switch is
 * down (DEMIFY_OFFLINE alone shows none). The live region stays mounted and
 * only its text changes, so screen readers announce the switch.
 */
export function GroundLinkBanner() {
  const { state } = useGroundLink();
  const text = groundLinkBanner(state);
  return (
    <div role="status" className={text ? "border-b border-caution/40 bg-caution/10 px-4 py-1.5 md:px-8" : "sr-only"}>
      {text && (
        <p className="flex items-start gap-2 text-[13px] leading-snug text-fg">
          <SatelliteDish size={15} aria-hidden className="mt-px shrink-0 text-caution" />
          <span>{text}</span>
        </p>
      )}
    </div>
  );
}
