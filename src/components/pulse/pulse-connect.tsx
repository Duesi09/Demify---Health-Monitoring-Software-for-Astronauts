"use client";

import { useState } from "react";
import { isPlainHost, phonePulseUrl } from "@/lib/pulse/lan";
import { PulseQr } from "./pulse-qr";

/**
 * Laptop side of the phone pulse demo: QR code for the phone, the detected
 * laptop addresses to choose from, and a field to type another one.
 */
export function PulseConnect({
  candidates,
  initialHost,
  crewId,
  crewName,
}: {
  candidates: string[];
  initialHost: string | null;
  crewId: string;
  crewName: string;
}) {
  const [host, setHost] = useState(initialHost ?? candidates[0] ?? "");
  const [typed, setTyped] = useState("");
  const valid = host !== "" && isPlainHost(host);
  const url = valid ? phonePulseUrl(host, crewId) : null;

  return (
    <div className="grid gap-8 md:grid-cols-[auto_1fr] md:items-start">
      <div className="flex flex-col items-center gap-3">
        {url ? (
          <PulseQr url={url} size={260} />
        ) : (
          <div className="flex size-[260px] items-center justify-center rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
            Type the laptop&apos;s address on the right to get a QR code.
          </div>
        )}
        {url && <p className="max-w-[260px] break-all text-center font-mono text-[12px]">{url}</p>}
      </div>

      <div className="space-y-5 text-sm">
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Laptop and phone in the same network: best the phone&apos;s own hotspot, laptop connected to it.</li>
          <li>
            On the laptop, in a second terminal: <code className="font-mono">npm run pulse:https</code> (leave it running;
            allow it in the Windows firewall prompt for private networks).
          </li>
          <li>Scan the QR code with the phone camera and open the link in Chrome.</li>
          <li>
            Warning &quot;connection is not private&quot;: tap <b>Advanced</b>, then <b>Proceed</b> (our own self-signed
            certificate).
          </li>
          <li>
            Tap <b>Start</b>, allow the camera, place a fingertip gently over the main camera and the flash. After about 10 s
            the pulse appears on the phone and on the monitor of {crewName}.
          </li>
        </ol>

        <div className="space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Laptop address for the phone</p>
          {candidates.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {candidates.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setHost(c)}
                  className={`rounded-md px-2.5 py-1 font-mono text-[12.5px] ring-1 ring-inset ${
                    c === host ? "bg-fg text-bg ring-fg" : "ring-border hover:bg-surface-2"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-muted">
              No address found here (for example when Demify runs in Docker). Use the address that{" "}
              <code className="font-mono">npm run pulse:https</code> prints, or type it below.
            </p>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (isPlainHost(typed.trim())) setHost(typed.trim());
            }}
          >
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="e.g. 192.168.43.17"
              inputMode="decimal"
              aria-label="Laptop address"
              className="w-48 rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-[13px]"
            />
            <button type="submit" className="rounded-md px-3 py-1.5 ring-1 ring-inset ring-border hover:bg-surface-2">
              Use
            </button>
          </form>
          {host !== "" && !valid && <p className="text-critical">Not a valid address: {host}</p>}
          <p className="text-[12px] text-muted">
            Windows: <code className="font-mono">ipconfig</code>, the IPv4 address of the Wi-Fi adapter. Addresses starting
            with 172. usually belong to Docker or WSL and do not work from the phone.
          </p>
        </div>
      </div>
    </div>
  );
}
