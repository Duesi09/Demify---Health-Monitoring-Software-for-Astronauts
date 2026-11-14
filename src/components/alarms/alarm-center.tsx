"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowUpRight, BellOff, BellRing, ChevronDown, Volume2, VolumeX, WifiOff } from "lucide-react";
import type { LiveVitals, MonitorAlarm } from "@/lib/types";
import "./alarm-center.css";
import { AlarmAudio, BURST_INTERVAL_S, audioSupported } from "./alarm-audio";
import {
  alarmLevel,
  alarmLine,
  announce,
  formatCountdown,
  groupByCrew,
  isCrewPage,
  resumeTracker,
  serverStateKey,
  telemetryLabel,
  trackAlarms,
  type AlarmTracker,
  type ScenarioRef,
  type TelemetrySource,
} from "./alarm-model";

const POLL_MS = 2000;
/** Abort a poll that has not answered after this long, so a hung request cannot stall the feed. */
const REQUEST_TIMEOUT_MS = 4000;
/** Minimum gap between two server re-renders (router.refresh) triggered by alarm changes. */
const REFRESH_MIN_MS = 4000;
/** Delay before writing a new announcement into the (just cleared) live region. */
const ANNOUNCE_DELAY_MS = 150;
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
/** Last value written in this tab (used when storage is unavailable). */
let memorySoundPref: boolean | null = null;
function readSoundPref(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return memorySoundPref ?? true;
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

/** Fetch with a hard timeout; aborts as well when `outer` aborts (unmount). */
async function fetchLive(outer: AbortSignal): Promise<LiveVitals[]> {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  outer.addEventListener("abort", onAbort);
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    // /api/vitals/live carries the alarms plus each crew member's telemetry
    // source and active scenario, which the bar labels honestly.
    const res = await fetch("/api/vitals/live", { cache: "no-store", signal: ctrl.signal });
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as { crew?: LiveVitals[] };
    return Array.isArray(j.crew) ? j.crew : [];
  } finally {
    clearTimeout(timer);
    outer.removeEventListener("abort", onAbort);
  }
}

/**
 * Global alarm center, mounted once in the root layout. Polls
 * GET /api/vitals/live every 2 s (paused while the tab is hidden, each
 * request aborted after 4 s) and shows a sticky alarm bar in patient-monitor
 * style while any alarm is active: red and flashing for a high-priority
 * alarm, yellow for medium only. Alarms are grouped per crew member with a
 * link to that member's monitor; drills are tagged "Training scenario" and
 * alarms from the demo telemetry generator "Simulated". On phones the list
 * collapses to a one-line summary that can be expanded.
 *
 * Audio follows IEC 60601-1-8 behaviour: "Silence 2 min" pauses sound only
 * (the visual alarm stays) and sound resumes when the silence expires or a
 * new alarm condition is raised. A new condition is a new alarm id, or an
 * escalation of an existing one to high priority; an alarm that clears and
 * returns within 15 s (flapping around a limit) is not new.
 */
export function AlarmCenter() {
  const router = useRouter();
  const pathname = usePathname();
  const soundOn = useSoundPref();

  const [alarms, setAlarms] = useState<MonitorAlarm[]>([]);
  const [sources, setSources] = useState<Record<string, TelemetrySource>>({});
  const [feedDown, setFeedDown] = useState(false);
  const [silencedUntil, setSilencedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [audioStatus, setAudioStatus] = useState<AudioStatus>("locked");
  const [announcement, setAnnouncement] = useState("");
  const [expanded, setExpanded] = useState(false);

  const audioRef = useRef<AlarmAudio | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const level = alarmLevel(alarms);
  const silenced = silencedUntil != null;

  /* ---- polling ---------------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let announceTimer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    let lastOk = Date.now();
    let tracker: AlarmTracker | null = null;
    let shownKey: string | null = null;
    let lastRefresh = 0;
    const ctrl = new AbortController();

    const say = (text: string) => {
      // Clear first so an identical text is announced again.
      setAnnouncement("");
      if (announceTimer) clearTimeout(announceTimer);
      announceTimer = setTimeout(() => setAnnouncement(text), ANNOUNCE_DELAY_MS);
    };

    const poll = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const crew = await fetchLive(ctrl.signal);
        if (cancelled) return;
        const next = crew.flatMap((v) => (Array.isArray(v.alarms) ? v.alarms : []));
        const scenarios: ScenarioRef[] = crew.flatMap((v) => (v.scenario ? [v.scenario] : []));
        const t = Date.now();
        lastOk = t;
        setFeedDown(false);

        const r = trackAlarms(tracker, next, t);
        tracker = r.tracker;
        if (r.fresh.length) {
          say(announce(r.fresh));
          // A new alarm condition ends an active silence (IEC 60601-1-8).
          setSilencedUntil(null);
        }
        // No "clear all" here: an alarm that returns within the flap window
        // must not sound through the silence; one that returns later is new.
        setAlarms(next);
        setSources(Object.fromEntries(crew.map((v) => [v.crewId, v.source])));

        // Server-rendered statuses (overview, crew page, escalation banner)
        // follow alarm levels and drills; throttled so flapping cannot loop.
        const key = serverStateKey(next, scenarios);
        if (shownKey === null) shownKey = key;
        else if (key !== shownKey && t - lastRefresh >= REFRESH_MIN_MS) {
          shownKey = key;
          lastRefresh = t;
          router.refresh();
        }
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
        // Do not report the feed as down, or alarms as new, for time the tab spent hidden.
        lastOk = Date.now();
        tracker = resumeTracker(tracker, lastOk);
        void poll();
      }
    };
    void loop();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      ctrl.abort();
      if (timer) clearTimeout(timer);
      if (announceTimer) clearTimeout(announceTimer);
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
    // Next.js rewrites (or replaces) the <title> on navigation and refresh; put the mark back.
    const obs = new MutationObserver(mark);
    obs.observe(document.head, { childList: true, characterData: true, subtree: true });
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
  const anyDrill = alarms.some((a) => a.drill);
  const top = groups[0]?.alarms[0];
  const more = alarms.length - 1;

  return (
    <div ref={wrapRef} className="ac-wrap">
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {announcement}
      </div>

      {level && (
        <section
          aria-label={`Active alarms: ${alarms.length}${anyDrill ? ", training scenario" : ""}`}
          className={`ac-bar ${level === "high" ? "ac-high" : "ac-medium"}${expanded ? " ac-expanded" : ""}`}
        >
          <div className="px-4 py-1.5 md:px-8">
            {/* One slim bar: the most urgent alarm, its crew member, then controls. Details on demand. */}
            <div className="flex min-h-9 items-center gap-x-2.5 gap-y-1">
              <BellRing size={16} strokeWidth={2.25} aria-hidden className="shrink-0" />
              <span className="shrink-0 text-[15px] font-semibold tracking-[-0.01em]">
                {level === "high" ? "Alarm" : "Warning"}
                <span className="ml-1.5 font-light tabular-nums opacity-80">{alarms.length}</span>
              </span>
              <span className="ac-tag ac-demo shrink-0" title="Demo monitor alarms, not a medical device">
                Demo
              </span>
              {top && (
                <p className="ac-line min-w-0 flex-1 truncate text-[13px] leading-snug md:text-[14px]">
                  <span className="sr-only">{top.priority === "high" ? "High priority: " : "Medium priority: "}</span>
                  {alarmLine(top)}
                </p>
              )}
              {top && (
                // Wrapper carries the responsive visibility: .ac-tag sets its own display.
                <span className="hidden shrink-0 sm:inline-flex">
                  {groups[0].drill ? (
                    <span className="ac-tag ac-drill" title="Training scenario: simulated drill, not a real emergency">
                      Training scenario
                    </span>
                  ) : (
                    telemetryLabel(sources[groups[0].crewId]) && (
                      <span className="ac-tag ac-sim">{telemetryLabel(sources[groups[0].crewId])}</span>
                    )
                  )}
                </span>
              )}
              {top && groups[0].drill && (
                <span className="ac-tag ac-drill shrink-0 sm:!hidden" title="Training scenario: simulated drill, not a real emergency">
                  Drill
                </span>
              )}
              {alarms.length > 1 && (
                <button
                  type="button"
                  className="ac-btn ac-toggle shrink-0"
                  aria-expanded={expanded}
                  aria-controls="ac-groups"
                  onClick={() => setExpanded((e) => !e)}
                >
                  {expanded ? "Less" : `+${more}`}
                  <span className="sr-only"> alarm details</span>
                  <ChevronDown size={14} aria-hidden className="ac-chevron" />
                </button>
              )}
              {top && !isCrewPage(pathname, groups[0].crewId) && (
                <span className="hidden shrink-0 md:inline-flex">
                  <Link href={`/crew/${groups[0].crewId}`} className="ac-btn ac-primary">
                    Open monitor<span className="sr-only"> for {groups[0].crewName}</span>
                    <ArrowUpRight size={14} strokeWidth={2.25} aria-hidden />
                  </Link>
                </span>
              )}
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                {soundOn && audioStatus === "locked" && (
                  <button
                    type="button"
                    className="ac-btn ac-primary"
                    aria-label="Enable alarm sound"
                    onClick={() => void unlockAudio()}
                  >
                    <Volume2 size={14} aria-hidden /> <span className="hidden lg:inline">Enable sound</span>
                  </button>
                )}
                {silenced ? (
                  <button
                    type="button"
                    className="ac-btn ac-on"
                    aria-label={`Alarm sound silenced, ${formatCountdown(silencedUntil - now)} left. Resume sound now`}
                    onClick={() => setSilencedUntil(null)}
                  >
                    <BellOff size={14} aria-hidden />
                    <span className="tabular-nums">{now ? formatCountdown(silencedUntil - now) : "2:00"}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ac-btn"
                    aria-label="Silence alarm sound for 2 minutes (the visual alarm stays)"
                    title="Silence alarm sound for 2 minutes"
                    onClick={() => {
                      const t = Date.now();
                      setNow(t);
                      setSilencedUntil(t + SILENCE_MS);
                    }}
                    disabled={!soundOn}
                  >
                    <BellOff size={14} aria-hidden />
                    <span className="hidden lg:inline">Silence 2 min</span>
                  </button>
                )}
                <button
                  type="button"
                  className="ac-btn"
                  aria-pressed={soundOn}
                  aria-label="Alarm sound"
                  onClick={() => writeSoundPref(!soundOn)}
                  title={audioStatus === "unsupported" ? "Audio is not available in this browser" : soundOn ? "Sound on" : "Sound off"}
                >
                  {soundOn ? <Volume2 size={14} aria-hidden /> : <VolumeX size={14} aria-hidden />}
                </button>
              </div>
            </div>

            {/* Alarms per crew member */}
            <ul id="ac-groups" className="ac-groups mt-1.5 pt-1" aria-label="Alarms by crew member">
              {groups.map((g) => {
                const sim = g.drill ? null : telemetryLabel(sources[g.crewId]);
                const here = isCrewPage(pathname, g.crewId);
                return (
                  <li
                    key={g.crewId}
                    className="ac-group flex flex-col gap-x-4 gap-y-1.5 py-1.5 last:pb-0 sm:flex-row sm:items-center"
                  >
                    <ul
                      className="flex min-w-0 flex-col gap-x-6 gap-y-0.5 sm:flex-1 lg:flex-row lg:flex-wrap"
                      aria-label={g.crewName}
                    >
                      {g.alarms.map((a) => (
                        <li key={a.id} className="ac-line text-[13px] leading-snug md:text-[15px]">
                          <span className="sr-only">{a.priority === "high" ? "High priority: " : "Medium priority: "}</span>
                          {alarmLine(a)}
                        </li>
                      ))}
                    </ul>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {g.drill && (
                        <span className="ac-tag ac-drill" title="Training scenario: simulated drill, not a real emergency">
                          Training scenario
                        </span>
                      )}
                      {sim && (
                        <span
                          className="ac-tag ac-sim"
                          title="Values come from the demo telemetry generator, not from a sensor"
                        >
                          {sim}
                        </span>
                      )}
                      {here ? (
                        <span className="text-xs font-medium opacity-80">Shown on this page</span>
                      ) : (
                        <Link href={`/crew/${g.crewId}`} className="ac-btn ac-primary">
                          Open monitor<span className="sr-only"> for {g.crewName}</span>
                          <ArrowUpRight size={14} strokeWidth={2.25} aria-hidden />
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
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
