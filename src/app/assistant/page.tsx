import type { Metadata } from "next";
import { Info } from "lucide-react";
import { AssistantConsole, type CrewOption } from "@/components/onboard/assistant-console";
import { PageHeader } from "@/components/ui";
import { onboardStatus } from "@/lib/assistant/status";
import { ASSISTANT_NOTICE } from "@/lib/assistant/wording";
import { DISCLAIMER_SHORT } from "@/lib/disclaimer";
import { listCrew } from "@/lib/store/readings";

export const metadata: Metadata = { title: "Onboard assistant" };
export const dynamic = "force-dynamic";

const LEAD = "Advises, never decides.";
/** ASSISTANT_NOTICE without its lead sentence and the disclaimer (both shown separately). */
const NOTICE_BODY = ASSISTANT_NOTICE.replace(LEAD, "").replace(DISCLAIMER_SHORT, "").trim();

export default async function AssistantPage() {
  // The status is read server-side (same functions as GET /api/onboard/status), so the page never starts blank.
  const [status, crew] = await Promise.all([onboardStatus(), listCrew().catch(() => [])]);
  const crewOptions: CrewOption[] = crew.map((c) => ({ id: c.id, name: c.name, role: c.role }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Onboard assistant"
        description="Library assistant (local language model) on the onboard server. It answers crew questions from the curated onboard library and nothing else, cites every passage it used, shows how fresh the library is, and says so when the library has no good answer."
      />

      <section
        aria-labelledby="assistant-notice"
        className="flex gap-3 rounded-xl border border-accent/40 bg-accent/[0.06] p-4 md:p-5"
      >
        <Info size={18} aria-hidden className="mt-0.5 shrink-0 text-accent" />
        <div className="space-y-1 text-sm leading-relaxed">
          <h2 id="assistant-notice" className="text-[15px] font-semibold">
            {LEAD}
          </h2>
          <p>
            {NOTICE_BODY} The alarms and the response checklists stay primary: the assistant never raises or clears an alarm. In an
            emergency, start the checklist before asking.
          </p>
          <p className="font-medium">{DISCLAIMER_SHORT}</p>
        </div>
      </section>

      <AssistantConsole initialStatus={status} crew={crewOptions} />
    </div>
  );
}
