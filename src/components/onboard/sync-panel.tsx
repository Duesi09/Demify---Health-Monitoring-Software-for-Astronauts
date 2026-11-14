"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { StatusBadge } from "@/components/ui";
import type { GroundLinkState, OnboardStatus } from "@/lib/onboard/types";
import { groundLinkLabel, syncBlockedReason, syncResultText } from "./format";
import { ActionError, GroundLinkSwitch, responseError, type ActionErrorState } from "./ground-link-switch";
import { useGroundLink } from "./use-ground-link";

/**
 * Ground-link switch and "Sync now" (POST /api/sync, admin-guarded). The
 * button is disabled, with the reason, while the ground link is down or
 * there is no database to sync into.
 */
export function SyncPanel({ initialLink, database }: { initialLink: GroundLinkState; database: OnboardStatus["database"] }) {
  const router = useRouter();
  const { state } = useGroundLink();
  const link = state ?? initialLink;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<ActionErrorState | null>(null);
  const [refreshing, startTransition] = useTransition();
  const blocked = syncBlockedReason(link, database);

  async function sync() {
    if (busy || blocked) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (!res.ok) {
        const err = await responseError(res);
        setError({ ...err, message: `Could not sync the library: ${err.message}` });
        return;
      }
      const body = (await res.json()) as { library?: Parameters<typeof syncResultText>[0] };
      setResult(body.library ? syncResultText(body.library) : "Sync finished.");
      startTransition(() => router.refresh());
    } catch (e) {
      setError({ message: `Could not sync the library: ${e instanceof Error ? e.message : "network error"}`, locked: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
          Ground link
          <StatusBadge status={link.up ? "nominal" : "caution"} label={groundLinkLabel(link)} size="xs" />
        </p>
        <GroundLinkSwitch initial={link} onChanged={() => startTransition(() => router.refresh())} className="mt-1.5" />
      </div>
      <div>
        <button
          type="button"
          onClick={() => void sync()}
          disabled={busy || !!blocked}
          aria-describedby={blocked ? "sync-blocked" : undefined}
          className="inline-flex items-center gap-2 rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-bg transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? (
            <LoaderCircle size={16} aria-hidden className="animate-spin motion-reduce:animate-none" />
          ) : (
            <RefreshCw size={16} aria-hidden />
          )}
          {busy ? "Syncing…" : "Sync now"}
        </button>
        {blocked && (
          <p id="sync-blocked" className="mt-1.5 text-xs leading-snug text-muted">
            {blocked}
          </p>
        )}
        {(result || refreshing) && (
          <p role="status" className="mt-2 text-sm">
            {result}
            {refreshing && <span className="text-muted"> Updating the page…</span>}
          </p>
        )}
        {error && <ActionError message={error.message} locked={error.locked} what="the library sync" />}
      </div>
    </div>
  );
}
