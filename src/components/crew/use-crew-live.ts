"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveVitals } from "@/lib/types";

/**
 * Lightweight live poll for the crew page's drill panel and response sheet
 * (the PatientMonitor runs its own 1 s poll). Unlike useLiveVitals it exposes
 * `refetch()` so a drill started or ended here shows up immediately, and it
 * keeps a client-side clock (`nowMs`) plus the time the last sample arrived
 * (`receivedAt`) so elapsed times tick smoothly without server/client clock skew.
 */
export function useCrewLive(crewId: string, initial: LiveVitals, intervalMs = 2000) {
  const [sample, setSample] = useState<{ v: LiveVitals; receivedAt: number | null }>({ v: initial, receivedAt: null });
  const [nowMs, setNowMs] = useState<number | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  const refetch = useCallback(async () => {
    const ctrl = new AbortController();
    ctrlRef.current?.abort();
    ctrlRef.current = ctrl;
    try {
      const res = await fetch(`/api/vitals/live?crewId=${encodeURIComponent(crewId)}`, {
        cache: "no-store",
        signal: ctrl.signal,
      });
      if (!res.ok) return;
      const v = (await res.json()) as LiveVitals;
      if (ctrl.signal.aborted) return;
      const at = Date.now();
      setSample({ v, receivedAt: at });
      setNowMs(at);
    } catch {
      /* keep the last sample */
    }
  }, [crewId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async () => {
      if (!document.hidden) await refetch();
      if (!cancelled) timer = setTimeout(loop, intervalMs);
    };
    timer = setTimeout(loop, 250);
    const clock = setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      cancelled = true;
      ctrlRef.current?.abort();
      if (timer) clearTimeout(timer);
      clearInterval(clock);
    };
  }, [refetch, intervalMs]);

  return { live: sample.v, receivedAt: sample.receivedAt, nowMs, refetch };
}

/** "4:07" / "1:02:09" */
export function formatElapsed(totalS: number): string {
  const s = Math.max(0, Math.floor(totalS));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
