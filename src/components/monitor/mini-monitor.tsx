"use client";

import type { LiveVitals } from "@/lib/types";

/**
 * Compact live strip (ECG trace + HR / NBP / SpO2 numerics) for crew cards
 * (PLACEHOLDER: replaced by the monitor agent; props are the contract).
 * `vitals` is supplied by the parent (overview polls all crew at once).
 */
export function MiniMonitor({ vitals }: { vitals: LiveVitals }) {
  return <div>HR {vitals.hr ?? "---"}</div>;
}
