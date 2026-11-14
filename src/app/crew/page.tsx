import { notFound, redirect } from "next/navigation";
import { listCrew } from "@/lib/store/readings";

export const dynamic = "force-dynamic";

/** /crew opens the first crew member's monitor page. */
export default async function CrewIndexPage() {
  const crew = await listCrew();
  if (!crew.length) notFound();
  redirect(`/crew/${encodeURIComponent(crew[0].id)}`);
}
