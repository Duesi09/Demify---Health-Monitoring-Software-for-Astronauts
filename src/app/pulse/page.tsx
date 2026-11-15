import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PulseCapture } from "@/components/pulse/pulse-capture";
import { SENSOR_ONLY_CREW_IDS } from "@/lib/crew-mode";
import { getCrew } from "@/lib/store/readings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Phone pulse" };

/**
 * /pulse?crew=test: the phone page of the camera pulse demo. Only sensor-only
 * crew members (never simulated) can be chosen, so phone values are never
 * mixed with simulated telemetry. Open it on the phone through the HTTPS
 * proxy (npm run pulse:https); /pulse/connect shows the QR code.
 */
export default async function PulsePage(props: PageProps<"/pulse">) {
  const sp = await props.searchParams;
  const requested = typeof sp.crew === "string" ? sp.crew : "test";
  if (!SENSOR_ONLY_CREW_IDS.has(requested)) notFound();
  const crew = await getCrew(requested);
  if (!crew) notFound();
  return <PulseCapture crewId={crew.id} crewName={crew.name} />;
}
