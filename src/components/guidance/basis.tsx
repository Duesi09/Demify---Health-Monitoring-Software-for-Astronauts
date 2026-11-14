import type { Basis } from "@/lib/health/knowledge";

/** Where a threshold comes from. Shared by the body map and the guidance reference. */
export const BASIS_INFO: Record<Basis, { tag: string; name: string; description: string; className: string }> = {
  NASA: {
    tag: "NASA",
    name: "NASA / CSA standard",
    description: "Taken from a NASA or CSA primary source: NASA-STD-3001, OCHMO technical briefs or Human Research Program evidence.",
    className: "border-accent/40 bg-accent/10 text-accent",
  },
  CLIN: {
    tag: "Clinical",
    name: "General clinical range",
    description: "A standard clinical range used on Earth (AHA, ADA, NEWS2, MedlinePlus). Spaceflight can shift what is normal for you.",
    className: "border-accent-2/40 bg-accent-2/10 text-accent-2",
  },
  APP: {
    tag: "App-derived",
    name: "Derived by Demify",
    description: "A band derived for this app from the cited sources. Not an official NASA or clinical limit; treat it as a prompt to look closer.",
    className: "border-border bg-surface-2 text-muted",
  },
};

export function BasisTag({ basis, className = "" }: { basis: Basis; className?: string }) {
  const info = BASIS_INFO[basis];
  return (
    <span
      title={`${info.name}: ${info.description}`}
      className={`inline-flex shrink-0 items-center rounded border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider ${info.className} ${className}`}
    >
      {info.tag}
    </span>
  );
}
