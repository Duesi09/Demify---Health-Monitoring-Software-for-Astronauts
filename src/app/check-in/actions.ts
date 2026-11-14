"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { CheckInItem, CheckInResult } from "@/components/check-in/types";
import { assessCrewMember } from "@/lib/health/assess";
import { CHECK_IN_INDICATORS, INDICATORS, classify, needsEscalation } from "@/lib/health/knowledge";
import { addReadings, getCrew } from "@/lib/store/readings";
import type { IndicatorId } from "@/lib/types";

const valueSchemas = Object.fromEntries(
  CHECK_IN_INDICATORS.map((id) => {
    const def = INDICATORS[id];
    const [lo, hi] = def.inputRange;
    const msg = `${def.short} must be between ${lo} and ${hi} ${def.unit}`;
    return [id, z.number(msg).min(lo, msg).max(hi, msg).optional()];
  }),
) as Record<IndicatorId, z.ZodOptional<z.ZodNumber>>;

const CheckInSchema = z.object({
  crewId: z.string().min(1).max(64),
  values: z.strictObject(valueSchemas),
  note: z.string().trim().max(500, "Note must be 500 characters or fewer").optional(),
});

/**
 * Stores a daily self-assessment as source="manual" readings, then returns the
 * per-value assessment so the astronaut sees status, actions and whether to
 * escalate to the flight surgeon.
 */
export async function submitCheckIn(input: unknown): Promise<CheckInResult> {
  const parsed = CheckInSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<IndicatorId, string>> = {};
    for (const issue of parsed.error.issues) {
      if (issue.path[0] === "values" && typeof issue.path[1] === "string") {
        fieldErrors[issue.path[1] as IndicatorId] = issue.message;
      }
    }
    return { ok: false, error: "Some values could not be saved. Check the highlighted fields.", fieldErrors };
  }
  const { crewId, values, note } = parsed.data;
  const crew = await getCrew(crewId);
  if (!crew) return { ok: false, error: `Unknown crew member "${crewId}".` };

  const entries = (Object.entries(values) as [IndicatorId, number | undefined][]).filter(
    (e): e is [IndicatorId, number] => e[1] != null,
  );
  if (!entries.length) return { ok: false, error: "Enter at least one value before saving." };

  const takenAt = new Date().toISOString();
  await addReadings(
    entries.map(([id, value]) => ({
      crewId,
      indicator: id,
      value: Number(value.toFixed(INDICATORS[id].decimals)),
      unit: INDICATORS[id].unit,
      takenAt,
      source: "manual" as const,
      ...(note ? { note } : {}),
    })),
  );

  // Re-assess with the new data: crew entries override simulated values.
  const assessment = await assessCrewMember(crewId);
  const byId = new Map(assessment?.assessments.map((a) => [a.indicator, a]));
  const items: CheckInItem[] = entries.map(([id, raw]) => {
    const def = INDICATORS[id];
    const value = Number(raw.toFixed(def.decimals));
    const a = byId.get(id);
    if (a && a.value === value) {
      return { indicator: id, value, unit: def.unit, status: a.status, finding: a.finding, actions: a.actions, escalate: a.escalate };
    }
    const status = classify(id, value);
    return {
      indicator: id,
      value,
      unit: def.unit,
      status,
      finding: `${def.short} ${value.toFixed(def.decimals)} ${def.unit}.`,
      actions: status === "nominal" ? [] : def.actions,
      escalate: status === "critical" || needsEscalation(id, value),
    };
  });

  const submitted = new Set(entries.map(([id]) => id));
  refresh();
  return {
    ok: true,
    crewName: crew.name,
    takenAt,
    items,
    overall: assessment?.overall ?? "unknown",
    otherEscalations: (assessment?.escalations ?? [])
      .filter((e) => !submitted.has(e.indicator))
      .map((e) => ({ indicator: e.indicator, finding: e.finding })),
  };
}
