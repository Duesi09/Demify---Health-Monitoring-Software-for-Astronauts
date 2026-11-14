import { notFound, redirect } from "next/navigation";
import { withLink } from "@/lib/link";
import { effectiveLink } from "@/lib/onboard/effective-link";
import { listCrew } from "@/lib/store/readings";

export const dynamic = "force-dynamic";

/** /crew opens the first crew member's monitor page, keeping a valid ?link= (signal-delay profile). */
export default async function CrewIndexPage(props: PageProps<"/crew">) {
  const sp = await props.searchParams;
  const [crew, { selected }] = await Promise.all([listCrew(), effectiveLink(sp.link)]);
  if (!crew.length) notFound();
  redirect(withLink(`/crew/${encodeURIComponent(crew[0].id)}`, selected));
}
