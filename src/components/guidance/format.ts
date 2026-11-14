import type { IndicatorDef } from "@/lib/health/knowledge";

/** Human readable automatic-escalation threshold, e.g. "< 40 bpm or > 130 bpm". */
export function escalationThreshold(def: IndicatorDef): string | null {
  const parts: string[] = [];
  if (def.escalateBelow != null) parts.push(`< ${def.escalateBelow} ${def.unit}`);
  if (def.escalateAbove != null) parts.push(`> ${def.escalateAbove} ${def.unit}`);
  return parts.length ? parts.join(" or ") : null;
}
