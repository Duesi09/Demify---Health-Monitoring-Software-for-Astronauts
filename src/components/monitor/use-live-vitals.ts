"use client";

import { useEffect, useRef, useState } from "react";
import type { LiveVitals } from "@/lib/types";

/**
 * Polls GET /api/vitals/live. Pauses while the tab is hidden, never overlaps
 * requests, and keeps the last good sample on network errors (a monitor
 * must not blank out because one poll failed). `stale` turns true when no
 * fresh sample arrived for 5 s so the UI can show "NO SIGNAL".
 */
export function useLiveVitals(crewId: string, initial: LiveVitals, intervalMs = 1000) {
  const [vitals, setVitals] = useState<LiveVitals>(initial);
  const [stale, setStale] = useState(false);
  const lastOk = useRef(0);

  // Reset when switching crew member.
  const [prevId, setPrevId] = useState(crewId);
  if (prevId !== crewId) {
    setPrevId(crewId);
    setVitals(initial);
  }

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ctrl = new AbortController();
    lastOk.current = Date.now();
    const tick = async () => {
      if (!document.hidden) {
        try {
          const res = await fetch(`/api/vitals/live?crewId=${encodeURIComponent(crewId)}`, {
            cache: "no-store",
            signal: ctrl.signal,
          });
          if (res.ok) {
            const v = (await res.json()) as LiveVitals;
            if (!cancelled) {
              setVitals(v);
              lastOk.current = Date.now();
            }
          }
        } catch {
          /* keep last sample */
        }
        if (!cancelled) setStale(Date.now() - lastOk.current > 5000);
      }
      if (!cancelled) timer = setTimeout(tick, intervalMs);
    };
    timer = setTimeout(tick, intervalMs);
    return () => {
      cancelled = true;
      ctrl.abort();
      if (timer) clearTimeout(timer);
    };
  }, [crewId, intervalMs]);

  return { vitals, stale };
}

/** Polls all crew members at once (overview). */
export function useAllLiveVitals(initial: LiveVitals[], intervalMs = 2000) {
  const [all, setAll] = useState<LiveVitals[]>(initial);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ctrl = new AbortController();
    const tick = async () => {
      if (!document.hidden) {
        try {
          const res = await fetch("/api/vitals/live", { cache: "no-store", signal: ctrl.signal });
          if (res.ok) {
            const j = (await res.json()) as { crew: LiveVitals[] };
            if (!cancelled) setAll(j.crew);
          }
        } catch {
          /* keep last */
        }
      }
      if (!cancelled) timer = setTimeout(tick, intervalMs);
    };
    timer = setTimeout(tick, intervalMs);
    return () => {
      cancelled = true;
      ctrl.abort();
      if (timer) clearTimeout(timer);
    };
  }, [intervalMs]);
  return all;
}
