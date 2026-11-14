import type { Basis } from "@/lib/health/knowledge";
import { Tag } from "@/components/ui";

/** Where a threshold comes from. Shared by the body map and the guidance reference. */
export const BASIS_INFO: Record<Basis, { tag: string; name: string; description: string }> = {
  NASA: {
    tag: "NASA",
    name: "NASA / CSA standard",
    description: "Taken from a NASA or CSA primary source (a standard, an OCHMO technical brief or Human Research Program evidence). Each indicator names its own source.",
  },
  CLIN: {
    tag: "Clinical",
    name: "General clinical range",
    description: "A standard clinical range used on Earth (AHA, ADA, NEWS2, MedlinePlus). Spaceflight can shift what is normal for you.",
  },
  APP: {
    tag: "App-derived",
    name: "Derived by Demify",
    description: "A band derived for this app from the cited sources. Not an official NASA or clinical limit; treat it as a prompt to look closer.",
  },
};

/**
 * Neutral squared tag: where a range comes from is provenance, not status, so it carries no colour.
 * Pass `source` (the indicator's first source, INDICATORS[id].sources[0].label) so the tooltip names
 * that source instead of a generic description.
 */
export function BasisTag({ basis, source, className = "" }: { basis: Basis; source?: string; className?: string }) {
  const info = BASIS_INFO[basis];
  return (
    <Tag size="xs" title={source ? `${info.name}: ${source}` : `${info.name}: ${info.description}`} className={className}>
      {info.tag}
    </Tag>
  );
}
