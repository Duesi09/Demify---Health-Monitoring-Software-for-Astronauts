"use client";

import { useSyncExternalStore } from "react";
import type { GroundLinkState } from "@/lib/onboard/types";

/**
 * One shared poll of GET /api/ground-link for the whole page: the nav chip,
 * the layout banner and the assistant's status strip read the same store,
 * so one request every 15 s serves them all, and a switch made on this page
 * (publishGroundLink) shows everywhere at once.
 *
 * `state` is null until the first answer and again while the route fails
 * (network error, non-2xx, malformed body): callers then show nothing.
 */

export const GROUND_LINK_POLL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 5_000;

export interface GroundLinkSnapshot {
  state: GroundLinkState | null;
}

const EMPTY: GroundLinkSnapshot = { state: null };

let snapshot: GroundLinkSnapshot = EMPTY;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight: AbortController | null = null;
/** Bumped by publishGroundLink so an older poll cannot overwrite a newer switch. */
let version = 0;

function emit(next: GroundLinkSnapshot): void {
  snapshot = next;
  listeners.forEach((l) => l());
}

function isState(v: unknown): v is GroundLinkState {
  const s = v as GroundLinkState | null;
  return typeof s === "object" && s !== null && typeof s.up === "boolean" && typeof s.switchedUp === "boolean";
}

async function poll(): Promise<void> {
  inflight?.abort();
  const ctrl = new AbortController();
  inflight = ctrl;
  const started = version;
  const timeout = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch("/api/ground-link", { cache: "no-store", signal: ctrl.signal });
    const body: unknown = res.ok ? await res.json() : null;
    if (ctrl.signal.aborted || started !== version) return;
    emit({ state: isState(body) ? body : null });
  } catch {
    // Network error or our own timeout: hide the indicators. A request
    // aborted by a newer poll, a switch or the last unsubscribe changes nothing.
    if (inflight === ctrl && started === version) emit(EMPTY);
  } finally {
    clearTimeout(timeout);
    if (inflight === ctrl) inflight = null;
  }
}

function schedule(delay: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    timer = null;
    if (!document.hidden) await poll();
    if (listeners.size) schedule(GROUND_LINK_POLL_MS);
  }, delay);
}

function onVisible(): void {
  if (!document.hidden && listeners.size) schedule(0);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    schedule(0);
    document.addEventListener("visibilitychange", onVisible);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (timer) clearTimeout(timer);
      timer = null;
      inflight?.abort();
      inflight = null;
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => EMPTY;

/** The shared ground-link state (null before the first answer or while GET /api/ground-link fails). */
export function useGroundLink(): GroundLinkSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** After a successful POST /api/ground-link: show the new state everywhere at once. */
export function publishGroundLink(state: GroundLinkState): void {
  version++;
  inflight?.abort();
  emit({ state });
}
