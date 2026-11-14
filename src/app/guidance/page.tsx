import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { CommDelay, EscalationProtocol, PrivateConferences } from "@/components/guidance/escalation-protocol";
import { HazardCards } from "@/components/guidance/hazards";
import { IndicatorReference } from "@/components/guidance/indicator-reference";
import { PageHeader, tagClass } from "@/components/ui";
import { MISSION_PROFILES, currentMission } from "@/lib/config";
import { DISCLAIMER_SHORT } from "@/lib/disclaimer";

export const metadata: Metadata = { title: "Guidance" };
export const dynamic = "force-dynamic";

function SectionTitle({ id, title, description }: { id: string; title: string; description: string }) {
  return (
    <div className="mb-4">
      <h2 id={id} className="text-[22px] font-semibold leading-tight tracking-[-0.018em]">
        {title}
      </h2>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{description}</p>
    </div>
  );
}

const TOC = [
  { href: "#hazards", label: "Five hazards" },
  { href: "#escalation", label: "When to call the flight surgeon" },
  { href: "#reference", label: "Indicator reference" },
];

export default function GuidancePage() {
  const mission = currentMission();
  return (
    <div className="space-y-12">
      <div>
        <PageHeader
          title="Guidance and reference"
          description="What threatens crew health in space, what every Demify indicator means, how it is measured on board, what to do about it and when to involve the ground."
        />
        <aside
          role="note"
          aria-label="Disclaimer"
          className="flex gap-3 rounded-xl border border-caution/50 bg-caution/10 p-4"
        >
          <ShieldAlert size={22} className="mt-0.5 shrink-0 text-caution" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold text-caution">{DISCLAIMER_SHORT}</p>
            <p className="mt-1 text-fg/90">
              This reference shows how published and project-defined ranges would flag values in a training
              simulation, and how pre-approved procedures would be timed under signal delay. In a real situation
              follow your mission&apos;s medical procedures and contact your flight surgeon or emergency service.
            </p>
          </div>
        </aside>
        <nav aria-label="On this page" className="mt-4 flex flex-wrap gap-1.5">
          {TOC.map((t) => (
            <a
              key={t.href}
              href={t.href}
              className={tagClass("md", true)}
            >
              {t.label}
            </a>
          ))}
        </nav>
      </div>

      <section aria-labelledby="hazards" className="scroll-mt-20">
        <SectionTitle
          id="hazards"
          title="The five hazards of human spaceflight"
          description="NASA's Human Research Program groups the risks of long missions into five hazards, remembered as RIDGE. Every Demify indicator is mapped to the hazards that drive it."
        />
        <HazardCards />
      </section>

      <section aria-labelledby="escalation" className="scroll-mt-20">
        <SectionTitle
          id="escalation"
          title="When to call the flight surgeon"
          description="Work down this list from the top. The first tier that matches decides what you do."
        />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <EscalationProtocol />
          <div className="space-y-4">
            <CommDelay mission={mission} profiles={Object.values(MISSION_PROFILES)} />
            <PrivateConferences />
          </div>
        </div>
      </section>

      <section aria-labelledby="reference" className="scroll-mt-20">
        <SectionTitle
          id="reference"
          title="Indicator reference"
          description="Every health indicator Demify tracks, with its ranges and where each range comes from. Search or filter, then open an entry for the details."
        />
        <IndicatorReference />
      </section>
    </div>
  );
}
