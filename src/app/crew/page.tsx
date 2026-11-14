import { notFound, redirect } from "next/navigation";
import { parseLinkParam, withLink } from "@/lib/link";
import { listCrew } from "@/lib/store/readings";

export const dynamic = "force-dynamic";

/** /crew opens the first crew member's monitor page, keeping a valid ?link= (signal-delay profile). */
export default async function CrewIndexPage(props: PageProps<"/crew">) {
  const sp = await props.searchParams;
  const crew = await listCrew();
  if (!crew.length) notFound();
  redirect(withLink(`/crew/${encodeURIComponent(crew[0].id)}`, parseLinkParam(sp.link)));
}
