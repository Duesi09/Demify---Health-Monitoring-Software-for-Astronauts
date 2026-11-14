import type { Metadata } from "next";
import { CheckInForm } from "@/components/check-in/check-in-form";
import { RecentEntries } from "@/components/check-in/recent-entries";
import { CrewSwitcher } from "@/components/crew-switcher";
import { Card, PageHeader, StatusBadge } from "@/components/ui";
import { currentLink, currentMission, missionDay } from "@/lib/config";
import { DISCLAIMER_SHORT } from "@/lib/disclaimer";
import { linkPolicy, withLink } from "@/lib/link";
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
  // ?link= swaps the signal delay; ?crew= picks the crew member. Both work together.
  const { profile: link, selected } = currentLink(sp.link);
  const policy = linkPolicy(link.oneWayS);
  const delayText =
    policy.mode === "blackout"
      ? `Signal delay profile ${link.label}: no contact (blackout); act on the onboard procedures and transmit when contact returns.`
      : selected
        ? `Signal delay profile ${link.label}: ${policy.label} one way.`
        : `Current mission ${mission.name}: ${policy.label} one-way signal delay.`;

  const since = daysAgoIso(14);
  const recent = member
    ? (await listReadings({ crewId: member.id, since })).filter((r) => r.source === "manual" || r.source === "sensor")
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Daily check-in"
        description={`Your self-assessment for mission day ${missionDay()}. Enter what you measured; every value is checked against tagged reference ranges as you type, and saved values replace the SIMULATED demo data. ${delayText}`}
      >
        <CrewSwitcher
          crew={crew}
          active={member?.id ?? ""}
          hrefFor={(cid) => withLink(`/check-in?crew=${encodeURIComponent(cid)}`, selected)}
        />
      </PageHeader>

      {member ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="min-w-0 xl:col-span-2">
            <CheckInForm
              key={member.id}
              crewId={member.id}
              crewName={member.name}
              commDelaySeconds={link.oneWayS}
              link={selected}
              baselines={member.baseline}
              submit={submitCheckIn}
            />
          </div>
          <aside className="space-y-4" aria-label="Check-in history and help">
            <Card title={`Recent entries · ${member.name}`} subtitle="Crew and device entries from the last 14 days">
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
                  <span>
                    In the critical band: re-check and log. Escalation only when Demify shows “contact the flight
                    surgeon”. Training: in a real mission this prompts a call to the flight surgeon.
                  </span>
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
