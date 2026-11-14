"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowUpRight, BellOff, BellRing, Volume2, VolumeX, WifiOff } from "lucide-react";
import type { MonitorAlarm } from "@/lib/types";
import "./alarm-center.css";
import { AlarmAudio, BURST_INTERVAL_S, audioSupported } from "./alarm-audio";
import {
  alarmLevel,
  alarmLine,
  announce,
  crewSetKey,
  formatCountdown,
  groupByCrew,
  newAlarms,
} from "./alarm-model";

const POLL_MS = 2000;
const SILENCE_MS = 2 * 60_000;
/** Show a technical "feed interrupted" notice after this long without a good poll. */
const FEED_TIMEOUT_MS = 10_000;
const TITLE_MARK = "⚠ ";
const SOUND_KEY = "demify.alarmSound";

/* ------------------------------------------------------------------------- */
/* Sound preference (localStorage, read through an external store so the     */
/* server render and the first client render agree).                         */
/* ------------------------------------------------------------------------- */

const soundListeners = new Set<() => void>();
function readSoundPref(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}
function writeSoundPref(on: boolean) {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    /* private mode / blocked storage: keep the in-memory value */
  }
  memorySoundPref = on;
  soundListeners.forEach((l) => l());
}
let memorySoundPref: boolean | null = null;
function subscribeSound(cb: () => void) {
  soundListeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === SOUND_KEY) {
      memorySoundPref = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    soundListeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}
function useSoundPref(): boolean {
  return useSyncExternalStore(
    subscribeSound,
    () => memorySoundPref ?? readSoundPref(),
    () => true,
  );
}

type AudioStatus = "unsupported" | "locked" | "running";

/**
 * Global alarm center, mounted once in the root layout. Polls GET /api/alarms
 * every 2 s (paused while the tab is hidden) and shows a sticky alarm bar in
 * patient-monitor style while any alarm is active: red and flashing for a
 * high-priority alarm, yellow for medium only. Alarms are grouped per crew
 * member with a link to that member's monitor; drills are tagged
 * "Training scenario".
 *
 * Audio follows IEC 60601-1-8 behaviour: "Silence 2 min" pauses sound only
 * (the visual alarm stays) and sound resumes when the silence expires or a
 * new alarm is raised.
 */
export function AlarmCenter() {
  const router = useRouter();
  const pathname = usePathname();
  const soundOn = useSoundPref();

  const [alarms, setAlarms] = useState<MonitorAlarm[]>([]);
  const [feedDown, setFeedDown] = useState(false);
  const [silencedUntil, setSilencedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [audioStatus, setAudioStatus] = useState<AudioStatus>("locked");
  const [announcement, setAnnouncement] = useState("");

  const audioRef = useRef<AlarmAudio | null>(null);
  const prevIds = useRef<Set<string> | null>(null);
  const prevCrewKey = useRef<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const level = alarmLevel(alarms);
  const silenced = silencedUntil != null;

  /* ---- polling ---------------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    let lastOk = Date.now();
    const ctrl = new AbortController();

    const poll = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const res = await fetch("/api/alarms", { cache: "no-store", signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json()) as { alarms?: MonitorAlarm[] };
        if (cancelled) return;
        const next = Array.isArray(j.alarms) ? j.alarms : [];
        lastOk = Date.now();
        setFeedDown(false);

        const fresh = newAlarms(prevIds.current, next);
        prevIds.current = new Set(next.map((a) => a.id));
        if (fresh.length) {
          setAnnouncement(announce(fresh));
          // A new alarm ends an active silence (IEC 60601-1-8).
          setSilencedUntil(null);
        }
        if (!next.length) setSilencedUntil(null);
        setAlarms(next);

        // Server-rendered statuses (overview, crew page) follow the alarm set.
        const key = crewSetKey(next);
        if (prevCrewKey.current !== null && prevCrewKey.current !== key) router.refresh();
        prevCrewKey.current = key;
      } catch {
        if (cancelled) return;
        if (Date.now() - lastOk > FEED_TIMEOUT_MS) setFeedDown(true);
      } finally {
        inFlight = false;
      }
    };

    const loop = async () => {
      await poll();
      if (!cancelled) timer = setTimeout(loop, POLL_MS);
    };
    const onVisible = () => {
      if (!document.hidden) {
        // Do not report the feed as down for time the tab spent hidden.
        lastOk = Date.now();
        void poll();
      }
    };
    void loop();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      ctrl.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  /* ---- audio unlock (autoplay policy) ------------------------------------ */
  const unlockAudio = useCallback(async () => {
    if (!audioSupported()) {
      setAudioStatus("unsupported");
      return;
    }
    if (!audioRef.current) {
      audioRef.current = new AlarmAudio();
      audioRef.current.onRunningChange((running) => setAudioStatus(running ? "running" : "locked"));
    }
    const ok = await audioRef.current.unlock();
    setAudioStatus(ok ? "running" : "locked");
  }, []);

  useEffect(() => {
    if (!audioSupported()) {
      // Deferred so it is not a synchronous setState inside the effect body.
      const id = setTimeout(() => setAudioStatus("unsupported"), 0);
      return () => clearTimeout(id);
    }
    // After a client-side navigation the page already had a user gesture.
    const nav = navigator as Navigator & { userActivation?: { hasBeenActive: boolean } };
    let id: ReturnType<typeof setTimeout> | undefined;
    if (nav.userActivation?.hasBeenActive) id = setTimeout(() => void unlockAudio(), 0);
    const onGesture = () => {
      void unlockAudio();
    };
    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("keydown", onGesture, { once: true });
    return () => {
      if (id) clearTimeout(id);
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, [unlockAudio]);

  /* ---- alarm tones -------------------------------------------------------- */
  const audible = level != null && soundOn && !silenced && audioStatus === "running";
  useEffect(() => {
    if (!audible || !level) return;
    const play = () => audioRef.current?.playBurst(level);
    play();
    const id = setInterval(play, BURST_INTERVAL_S[level] * 1000);
    return () => clearInterval(id);
  }, [audible, level]);

  /* ---- silence countdown --------------------------------------------------- */
  useEffect(() => {
    if (silencedUntil == null) return;
    const tick = () => {
      const t = Date.now();
      if (t >= silencedUntil) setSilencedUntil(null);
      else setNow(t);
    };
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [silencedUntil]);

  /* ---- document title -------------------------------------------------- */
  const hasHigh = level === "high";
  useEffect(() => {
    if (!hasHigh) return;
    const mark = () => {
      if (!document.title.startsWith(TITLE_MARK)) document.title = TITLE_MARK + document.title;
    };
    mark();
    // Next.js rewrites the title on navigation; put the mark back.
    const titleEl = document.querySelector("head > title");
    const obs = new MutationObserver(mark);
    obs.observe(titleEl ?? document.head, { childList: true, characterData: true, subtree: true });
    return () => {
      obs.disconnect();
      if (document.title.startsWith(TITLE_MARK)) document.title = document.title.slice(TITLE_MARK.length);
    };
  }, [hasHigh, pathname]);

  /* ---- keep the bar below the mobile top nav ------------------------------ */
  useEffect(() => {
    const el = wrapRef.current;
    const navEl = document.querySelector<HTMLElement>('nav[aria-label="Main"]');
    if (!el || !navEl || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => {
      el.style.setProperty("--ac-top", mq.matches ? "0px" : `${navEl.getBoundingClientRect().height}px`);
    };
    apply();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    ro?.observe(navEl);
    mq.addEventListener("change", apply);
    return () => {
      ro?.disconnect();
      mq.removeEventListener("change", apply);
    };
  }, []);

  const groups = groupByCrew(alarms);
  const highCount = alarms.filter((a) => a.priority === "high").length;
  const anyDrill = alarms.some((a) => a.drill);

  return (
    <div ref={wrapRef} className="ac-wrap">
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {announcement}
      </div>

      {level && (
        <section
          aria-label={`Active alarms: ${alarms.length}${anyDrill ? ", training scenario" : ""}`}
          className={`ac-bar ${level === "high" ? "ac-high" : "ac-medium"}`}
        >
          <div className="flex flex-col gap-2 px-4 py-2.5 md:flex-row md:items-start md:gap-6 md:px-8 md:py-3">
            {/* Summary */}
            <div className="flex shrink-0 items-center gap-2.5 md:w-44 md:flex-col md:items-start md:gap-1">
              <div className="flex items-center gap-2">
                <BellRing size={18} strokeWidth={2.25} aria-hidden />
                <span className="text-[15px] font-semibold tracking-[-0.01em]">
                  {level === "high" ? "Alarm" : "Warning"}
                </span>
                <span className="text-[15px] font-light tabular-nums opacity-80">{alarms.length}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="ac-tag ac-demo" title="Demo monitor alarms, not a medical device">
                  Demo
                </span>
                <span className="text-[11px] font-medium opacity-80">
                  {highCount ? `${highCount} high` : "medium only"}
                </span>
              </div>
            </div>

            {/* Alarms per crew member */}
            <ul className="min-w-0 flex-1" aria-label="Alarms by crew member">
              {groups.map((g) => (
                <li key={g.crewId} className="ac-group flex flex-wrap items-center gap-x-3 gap-y-1.5 py-1.5 first:pt-0 last:pb-0 md:first:pt-0.5">
                  <ul className="flex min-w-0 flex-1 flex-col gap-0.5" aria-label={`${g.crewName}`}>
                    {g.alarms.map((a) => (
                      <li key={a.id} className="ac-line truncate text-[13px] md:text-sm" title={alarmLine(a)}>
                        <span className="sr-only">{a.priority === "high" ? "High priority: " : "Medium priority: "}</span>
                        {alarmLine(a)}
                      </li>
                    ))}
                  </ul>
                  <div className="flex shrink-0 items-center gap-2">
                    {g.drill && (
                      <span className="ac-tag ac-drill" title="Training scenario: simulated drill, not a real emergency">
                        Training scenario
                      </span>
                    )}
                    <Link href={`/crew/${g.crewId}`} className="ac-btn ac-primary">
                      Open monitor<span className="sr-only"> for {g.crewName}</span>
                      <ArrowUpRight size={14} strokeWidth={2.25} aria-hidden />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>

            {/* Audio controls */}
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {soundOn && audioStatus === "locked" && (
                <button type="button" className="ac-btn ac-primary" onClick={() => void unlockAudio()}>
                  <Volume2 size={14} aria-hidden /> Enable alarm sound
                </button>
              )}
              {silenced ? (
                <button
                  type="button"
                  className="ac-btn"
                  aria-pressed="true"
                  aria-label={`Alarm sound silenced, ${formatCountdown(silencedUntil - now)} left. Resume sound now`}
                  onClick={() => setSilencedUntil(null)}
                >
                  <BellOff size={14} aria-hidden />
                  <span>
                    Silenced <span className="tabular-nums">{now ? formatCountdown(silencedUntil - now) : "2:00"}</span>
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  className="ac-btn"
                  aria-pressed="false"
                  aria-label="Silence alarm sound for 2 minutes (the visual alarm stays)"
                  onClick={() => {
                    const t = Date.now();
                    setNow(t);
                    setSilencedUntil(t + SILENCE_MS);
                  }}
                  disabled={!soundOn}
                >
                  <BellOff size={14} aria-hidden /> Silence 2 min
                </button>
              )}
              <button
                type="button"
                className="ac-btn"
                aria-pressed={soundOn}
                aria-label={soundOn ? "Alarm sound is on. Turn sound off" : "Alarm sound is off. Turn sound on"}
                onClick={() => writeSoundPref(!soundOn)}
                title={audioStatus === "unsupported" ? "Audio is not available in this browser" : undefined}
              >
                {soundOn ? <Volume2 size={14} aria-hidden /> : <VolumeX size={14} aria-hidden />}
                {soundOn ? "Sound on" : "Sound off"}
              </button>
            </div>
          </div>
        </section>
      )}

      {feedDown && (
        <div role="status" className="ac-bar ac-tech">
          <p className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium md:px-8">
            <WifiOff size={15} aria-hidden />
            Alarm feed interrupted: no update for more than {FEED_TIMEOUT_MS / 1000} s. Showing the last known alarms.
          </p>
        </div>
      )}
    </div>
  );
}
