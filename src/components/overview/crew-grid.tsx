"use client";

import { useAllLiveVitals } from "@/components/monitor/use-live-vitals";
import type { LiveVitals } from "@/lib/types";
import "../alarms/alarm-center.css";
import { CrewCard, type CrewCardProps } from "./crew-card";

export type CrewGridItem = Omit<CrewCardProps, "vitals" | "selected">;

/**
 * Live crew grid for the overview. Assessments come from the server as plain
 * data (refreshed by the global alarm center via router.refresh() when the
 * set of crew members in alarm changes); live vitals and monitor alarms are
 * polled for all crew at once every 2 s.
 */
export function CrewGrid({ crew, initialVitals }: { crew: CrewGridItem[]; initialVitals: LiveVitals[] }) {
  const live = useAllLiveVitals(initialVitals, 2000);
  const byId = new Map(live.map((v) => [v.crewId, v]));
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {crew.map((c) => (
        <CrewCard key={c.id} {...c} vitals={byId.get(c.id)} />
      ))}
    </div>
  );
}
