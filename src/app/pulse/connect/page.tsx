import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PulseConnect } from "@/components/pulse/pulse-connect";
import { adminToken } from "@/lib/http";
import { isPlainHost, rankLanAddresses } from "@/lib/pulse/lan";
import { getCrew } from "@/lib/store/readings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Connect a phone" };

/** True inside a Docker container: the addresses seen there are the container's, not the laptop's. */
function inContainer(): boolean {
  return existsSync("/.dockerenv");
}

/**
 * /pulse/connect (on the laptop): QR code that opens the phone pulse page
 * through the HTTPS proxy. ?host=<laptop IP> preselects the address
 * (scripts/pulse-https.mjs prints such a link).
 */
export default async function PulseConnectPage(props: PageProps<"/pulse/connect">) {
  const sp = await props.searchParams;
  const crew = await getCrew("test");
  if (!crew) notFound();
  const hostParam = typeof sp.host === "string" && isPlainHost(sp.host) ? sp.host : null;
  const candidates = inContainer() ? [] : rankLanAddresses(networkInterfaces());
  const locked = adminToken() !== undefined;

  return (
    <div className="max-w-4xl space-y-8">
      <header className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Phone pulse demo</p>
        <h1 className="text-3xl font-semibold tracking-tight">Connect a phone</h1>
        <p className="max-w-2xl text-sm text-muted">
          The phone measures a camera pulse estimate (fingertip over camera and flash) and sends it once per second to the
          monitor of{" "}
          <Link className="underline" href={`/crew/${crew.id}`}>
            {crew.name}
          </Link>
          . This is a camera pulse estimate, not a medical measurement.
        </p>
      </header>

      {locked && (
        <p className="rounded-lg border border-caution/50 bg-caution/10 p-3 text-sm">
          This server has an admin token. Open <code className="font-mono">/unlock?token=&lt;token&gt;&amp;next=/pulse</code>{" "}
          once on the phone (through the same https address) before you tap Start, otherwise the readings are refused (401).
        </p>
      )}

      <PulseConnect candidates={candidates} initialHost={hostParam} crewId={crew.id} crewName={crew.name} />
    </div>
  );
}
