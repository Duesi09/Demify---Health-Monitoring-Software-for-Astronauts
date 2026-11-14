"use client";

import Link from "next/link";
import { useState } from "react";
import { Segmented } from "@/components/ui";
import { withLink, type LinkProfileId } from "@/lib/link";
import type { GroundLinkState } from "@/lib/onboard/types";
import { groundLinkChange } from "./format";
import { publishGroundLink, useGroundLink } from "./use-ground-link";

/**
 * Error of an admin-guarded POST, shown like the drill console's: the
 * server's message, plus how to unlock this browser on a 401.
 */
export function ActionError({
  message,
  locked,
  what,
  link = null,
}: {
  message: string;
  locked: boolean;
  what: string;
  /** The page's signal delay profile, kept on the help link. */
  link?: LinkProfileId | null;
}) {
  return (
    <div role="alert" className="mt-3 rounded-lg border border-critical/60 bg-critical/10 px-3 py-2 text-sm text-critical">
      <p>{message}</p>
      {locked && (
        <p className="mt-1 text-fg/85">
          This server protects {what} with an admin token.{" "}
          <Link href={withLink("/help#admin-token", link)} className="font-medium text-fg underline decoration-accent underline-offset-2">
            How to unlock this browser
          </Link>
        </p>
      )}
    </div>
  );
}

export interface ActionErrorState {
  message: string;
  /** HTTP 401: the server has an admin token and this browser is not unlocked. */
  locked: boolean;
}

/** Reads `{error}` from a failed response; falls back to the HTTP status. */
export async function responseError(res: Response): Promise<ActionErrorState> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  const message = typeof body?.error === "string" && body.error ? body.error : `Request failed (HTTP ${res.status})`;
  return { message, locked: res.status === 401 };
}

/**
 * The simulated ground-link switch (POST /api/ground-link, admin-guarded).
 * Down = simulated blackout: Demify works from the last data snapshots and
 * the onboard library, and advice follows the onboard procedures. No real
 * link changes. It also works in an air-gapped deployment (DEMIFY_OFFLINE),
 * which is not a blackout by itself.
 */
export function GroundLinkSwitch({
  initial,
  onChanged,
  link = null,
  className = "",
}: {
  /** Server-rendered state, used until the shared poll answers. */
  initial: GroundLinkState;
  onChanged?: (state: GroundLinkState) => void;
  /** The page's signal delay profile, kept on the help link of an error. */
  link?: LinkProfileId | null;
  className?: string;
}) {
  const { state: live } = useGroundLink();
  const state = live ?? initial;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ActionErrorState | null>(null);

  async function set(up: boolean) {
    if (busy || up === state.switchedUp) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ground-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ up }),
      });
      if (!res.ok) {
        const err = await responseError(res);
        setError({ ...err, message: `Could not switch the ground link ${up ? "up" : "down"}: ${err.message}` });
        return;
      }
      const next = (await res.json()) as GroundLinkState;
      publishGroundLink(next);
      onChanged?.(next);
    } catch (e) {
      setError({
        message: `Could not switch the ground link ${up ? "up" : "down"}: ${e instanceof Error ? e.message : "network error"}`,
        locked: false,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <Segmented
        label="Simulated ground link"
        value={state.switchedUp ? "up" : "down"}
        options={[
          { value: "up", label: "Up" },
          { value: "down", label: "Down (blackout)" },
        ]}
        onChange={(v) => void set(v === "up")}
        disabled={busy}
      />
      <p className="mt-1.5 text-[11px] leading-snug text-muted">
        {busy ? "Switching…" : `${groundLinkChange(state)}${state.forcedOffline ? " · air-gapped deployment (DEMIFY_OFFLINE)" : ""}`}
      </p>
      {error && <ActionError message={error.message} locked={error.locked} what="the ground link switch" link={link} />}
    </div>
  );
}
