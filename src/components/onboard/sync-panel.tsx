"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import type { LinkProfileId } from "@/lib/link";
import type { GroundLinkState, OnboardStatus } from "@/lib/onboard/types";
import { groundLinkView, syncBlockedReason, syncResultText } from "./format";
import { GroundLinkBadge } from "./ground-link-indicators";
import { ActionError, GroundLinkSwitch, responseError, type ActionErrorState } from "./ground-link-switch";
import { useGroundLink } from "./use-ground-link";

/**
 * Ground-link switch and "Sync now" (POST /api/sync, admin-guarded). The
 * button is disabled, with the reason, while there is no contact with the
 * ground (switch down, conjunction profile, air-gapped) or no database to
 * sync into. A result or error belongs to the ground-link state it was made
 * in and disappears when that state changes.
 */
export function SyncPanel({
  initialLink,
  database,
  link = null,
}: {
  initialLink: GroundLinkState;
  database: OnboardStatus["database"];
  /** The page's signal delay profile (?link=). */
  link?: LinkProfileId | null;
}) {
  const router = useRouter();
  const { state } = useGroundLink();
  const current = state ?? initialLink;
  const view = groundLinkView(current, link);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ text: string; view: string } | null>(null);
  const [error, setError] = useState<(ActionErrorState & { view: string }) | null>(null);
  const [refreshing, startTransition] = useTransition();
  // A change of the ground-link state clears the last result and error (also after switching back).
  const [seenView, setSeenView] = useState(view);
  if (seenView !== view) {
    setSeenView(view);
    setResult(null);
    setError(null);
  }
  const blocked = syncBlockedReason(view, database);
  const shownResult = result && result.view === view ? result.text : null;
  const shownError = error && error.view === view ? error : null;

  async function sync() {
    if (busy || blocked) return;
    const startedIn = view;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (!res.ok) {
        const err = await responseError(res);
        setError({ ...err, message: `Could not sync the library: ${err.message}`, view: startedIn });
        return;
      }
      const body = (await res.json()) as { library?: Parameters<typeof syncResultText>[0] };
      setResult({ text: body.library ? syncResultText(body.library) : "Sync finished.", view: startedIn });
      startTransition(() => router.refresh());
    } catch (e) {
      setError({
        message: `Could not sync the library: ${e instanceof Error ? e.message : "network error"}`,
        locked: false,
        view: startedIn,
      });
    } finally {
      setBusy(false);
    }
  }

  const statusText = shownResult || refreshing;
  return (
    <div className="space-y-4">
      <div>
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
          Ground link
          <GroundLinkBadge view={view} />
        </p>
        <GroundLinkSwitch initial={current} link={link} onChanged={() => startTransition(() => router.refresh())} className="mt-1.5" />
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
        {/* Stays mounted (a live region announces changed text, not a newly inserted element). */}
        <p role="status" className={statusText ? "mt-2 text-sm" : "sr-only"}>
          {shownResult}
          {refreshing && <span className="text-muted"> Updating the page…</span>}
        </p>
        {shownError && <ActionError message={shownError.message} locked={shownError.locked} what="the library sync" link={link} />}
      </div>
    </div>
  );
}
