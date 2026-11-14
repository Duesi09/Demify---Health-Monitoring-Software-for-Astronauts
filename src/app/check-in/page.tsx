import type { Metadata } from "next";
import { CheckInForm } from "@/components/check-in/check-in-form";
import { RecentEntries } from "@/components/check-in/recent-entries";
import { formatDelay } from "@/components/overview/format";
import { CrewSwitcher } from "@/components/crew-switcher";
import { Card, PageHeader } from "@/components/ui";
import { currentMission, missionDay } from "@/lib/config";
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
        description={`Your self-assessment for mission day ${missionDay()}. Enter what you measured; every value is checked against NASA and clinical ranges as you type, and saved values replace the simulated demo data. With a ${formatDelay(mission.commDelaySeconds)} one-way signal delay, you are the first responder for your own health.`}
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
              <ul className="space-y-2 text-xs text-muted">
                <li>
                  <span className="font-medium text-nominal">Nominal</span>: inside the normal range. Nothing to do.
                </li>
                <li>
                  <span className="font-medium text-caution">Caution</span>: outside the normal range. Follow the listed
                  crew actions and re-check.
                </li>
                <li>
                  <span className="font-medium text-critical">Critical</span>: act now and contact the flight surgeon.
                </li>
                <li>
                  Ranges come from NASA-STD-3001, NASA OCHMO technical briefs and standard clinical guidance (see
                  Guidance). This is decision support; flight surgeons remain the medical authority.
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
