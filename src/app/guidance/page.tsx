import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { CommDelay, EscalationProtocol, PrivateConferences } from "@/components/guidance/escalation-protocol";
import { HazardCards } from "@/components/guidance/hazards";
import { IndicatorReference } from "@/components/guidance/indicator-reference";
import { PageHeader, tagClass } from "@/components/ui";
import { MISSION_PROFILES, currentMission } from "@/lib/config";

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
          title="Guidance & Reference"
          description="What threatens crew health in space, what every Demify indicator means, how it is measured on board, what to do about it and when to involve the ground."
        />
        <aside
          role="note"
          aria-label="Medical disclaimer"
          className="flex gap-3 rounded-xl border border-caution/50 bg-caution/10 p-4"
        >
          <ShieldAlert size={22} className="mt-0.5 shrink-0 text-caution" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold text-caution">Decision support, not a medical device.</p>
            <p className="mt-1 text-fg/90">
              Demify helps crews notice changes early and act on published guidance. It does not diagnose or treat.
              Flight surgeons are the medical authority: when in doubt, contact them, and always follow the onboard
              medical procedures and their instructions over anything shown here.
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
