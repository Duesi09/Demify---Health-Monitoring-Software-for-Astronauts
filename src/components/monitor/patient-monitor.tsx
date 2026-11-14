"use client";

import type { LiveVitals } from "@/lib/types";

/**
 * Full bedside-style patient monitor for one crew member (PLACEHOLDER: the
 * monitor agent replaces this implementation; the props are the contract).
 */
export function PatientMonitor({ crewId, initial }: { crewId: string; initial: LiveVitals }) {
  return <div data-crew={crewId}>HR {initial.hr ?? "---"}</div>;
}
