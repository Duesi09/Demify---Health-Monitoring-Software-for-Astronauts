import type { Metadata } from "next";
import { CheckInForm } from "@/components/check-in/check-in-form";
import { RecentEntries } from "@/components/check-in/recent-entries";
import { formatDelay } from "@/components/overview/format";
import { CrewSwitcher } from "@/components/crew-switcher";
import { Card, PageHeader, StatusBadge } from "@/components/ui";
import { currentMission, missionDay } from "@/lib/config";
import { DISCLAIMER_SHORT } from "@/lib/disclaimer";
import { listCrew, listReadings } from "@/lib/store/readings";
import { submitCheckIn } from "./actions";

export const metadata: Metadata = { title: "Daily check-in" };
export const dynamic = "force-dynamic";

/** ISO time N days before this request (rendered per request, force-dynamic). */
function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export default async function CheckInPage(props: PageProps<"/check-in">) {
  const sp = await props.searchParams;
  const crewParam = typeof sp.crew === "string" ? sp.crew : undefined;
  const crew = await listCrew();
  const member = crew.find((c) => c.id === crewParam) ?? crew[0];
  const mission = currentMission();

  const since = daysAgoIso(14);
  const recent = member
    ? (await listReadings({ crewId: member.id, since })).filter((r) => r.source === "manual" || r.source === "sensor")
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Daily check-in"
        description={`Your self-assessment for mission day ${missionDay()}. Enter what you measured; every value is checked against tagged reference ranges as you type, and saved values replace the SIMULATED demo data. With a ${formatDelay(mission.commDelaySeconds)} one-way signal delay, you are the first responder for your own health.`}
      >
        <CrewSwitcher crew={crew} active={member?.id ?? ""} basePath="/check-in" />
      </PageHeader>

      {member ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="min-w-0 xl:col-span-2">
            <CheckInForm
              key={member.id}
              crewId={member.id}
              crewName={member.name}
              commDelaySeconds={mission.commDelaySeconds}
              baselines={member.baseline}
              submit={submitCheckIn}
            />
          </div>
          <aside className="space-y-4" aria-label="Check-in history and help">
            <Card title={`Recent entries · ${member.name}`} subtitle="Crew and sensor entries from the last 14 days">
              <RecentEntries readings={recent} />
            </Card>
            <Card title="How to read the feedback">
              <ul className="space-y-2.5 text-xs text-muted">
                <li className="flex items-start gap-2">
                  <StatusBadge status="nominal" size="xs" className="mt-px w-[74px]" />
                  <span>Inside the normal range. Nothing to do.</span>
                </li>
                <li className="flex items-start gap-2">
                  <StatusBadge status="caution" size="xs" className="mt-px w-[74px]" />
                  <span>Outside the normal range. Follow the listed crew actions and re-check.</span>
                </li>
                <li className="flex items-start gap-2">
                  <StatusBadge status="critical" size="xs" className="mt-px w-[74px]" />
                  <span>Past an escalation limit. In a real mission, act now and contact the flight surgeon.</span>
                </li>
                <li>
                  Ranges come from NASA standards, clinical guidelines or our own project rules, and each carries its
                  source tag (see Guidance). {DISCLAIMER_SHORT}
                </li>
              </ul>
            </Card>
          </aside>
        </div>
      ) : (
        <Card>
          <p className="text-sm text-muted">No crew members configured.</p>
        </Card>
      )}
    </div>
  );
}
