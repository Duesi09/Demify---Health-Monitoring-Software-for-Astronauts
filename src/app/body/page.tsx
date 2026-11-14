import type { Metadata } from "next";
import { BodyMap } from "@/components/body/body-map";
import { CrewSwitcher } from "@/components/crew-switcher";
import { Card, PageHeader } from "@/components/ui";
import { assessAllCrew } from "@/lib/health/assess";
import { BODY_REGIONS } from "@/lib/health/knowledge";
import type { BodyRegionId } from "@/lib/types";

export const metadata: Metadata = { title: "Body Map" };
export const dynamic = "force-dynamic";

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function BodyPage(props: PageProps<"/body">) {
  const sp = await props.searchParams;
  const all = await assessAllCrew();
  const crewParam = first(sp.crew);
  const regionParam = first(sp.region);
  const active = all.find((a) => a.crew.id === crewParam) ?? all[0];
  const initialRegion = regionParam && regionParam in BODY_REGIONS ? (regionParam as BodyRegionId) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Body Map"
        description="Each body system is coloured by the worst of its health indicators. Select a region to see what it does, how spaceflight affects it, the latest readings and what to do about them."
      >
        {all.length > 0 && (
          <CrewSwitcher
            crew={all.map((a) => a.crew)}
            active={active.crew.id}
            basePath="/body"
            statuses={Object.fromEntries(all.map((a) => [a.crew.id, a.overall]))}
          />
        )}
      </PageHeader>

      {active ? (
        <BodyMap
          key={active.crew.id}
          crewName={active.crew.name}
          regions={active.regions}
          assessments={active.assessments}
          sources={active.sources}
          initialRegion={initialRegion}
        />
      ) : (
        <Card>
          <p className="text-sm text-muted">No crew members are configured yet.</p>
        </Card>
      )}
    </div>
  );
}
