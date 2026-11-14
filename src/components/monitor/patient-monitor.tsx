"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Heart, Volume2, VolumeX } from "lucide-react";
import { ALARM_LIMITS } from "@/lib/monitor/alarms";
import type { LiveVitals, MonitorAlarm, Rhythm } from "@/lib/types";
import "./monitor.css";
import {
  DemoTag,
  DrillTag,
  MONITOR_COLOR,
  SourceTag,
  alarmFor,
  alarmPrefix,
  fmt,
  topAlarm,
  useReducedMotion,
  Val,
  useUtcClock,
} from "./shared";
import { SweepCanvas, type ChannelSpec } from "./sweep-canvas";
import { useLiveVitals } from "./use-live-vitals";

const RHYTHM_LABEL: Record<Rhythm, string> = {
  sinus: "Sinus rhythm",
  "sinus-tachycardia": "Sinus tachycardia",
  "sinus-bradycardia": "Sinus bradycardia",
  vt: "Ventricular tachycardia",
  vf: "Ventricular fibrillation",
};

const RHYTHM_SHORT: Record<Rhythm, string> = {
  sinus: "Sinus",
  "sinus-tachycardia": "Sinus tachy",
  "sinus-bradycardia": "Sinus brady",
  vt: "VTach",
  vf: "VFib",
};

const CAPTION_SOURCE: Record<LiveVitals["source"], string> = {
  simulated: "simulated data",
  sensor: "sensor data",
  mixed: "sensor + simulated data",
};

function seedFor(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}

function Numeric({
  label,
  color,
  alarm,
  limits,
  className = "",
  extra,
  children,
}: {
  label: ReactNode;
  color: string;
  alarm: MonitorAlarm | null;
  limits?: [string, string];
  className?: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  const alarmCls = alarm ? (alarm.priority === "high" ? "dm-num-high" : "dm-num-medium") : "";
  return (
    <div
      className={`relative rounded-[14px] px-3 py-2 @3xl:px-3.5 @3xl:py-2.5 ${alarmCls} ${className}`}
      style={{ color }}
      data-alarm={alarm?.priority}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/55">
          {label}
        </span>
        {limits && (
          <span className="text-right text-[9.5px] font-normal leading-[1.15] text-white/35 tabular-nums" aria-label={`Alarm limits ${limits[0]} high, ${limits[1]} low`}>
            <span className="block">{limits[0]}</span>
            <span className="block">{limits[1]}</span>
          </span>
        )}
      </div>
      {children}
      {extra}
    </div>
  );
}

/**
 * Full bedside-style DEMO patient monitor for one crew member, presented in
 * an Apple-keynote style (black stage, thin large numerics, glowing traces)
 * while keeping real-monitor conventions: colour-matched parameters, alarm
 * limits, Philips-style alarm messages, inverted flashing numerics in alarm.
 * Waveforms are synthesised from the polled telemetry numbers.
 */
export function PatientMonitor({ crewId, initial }: { crewId: string; initial: LiveVitals }) {
  const { vitals: v, stale } = useLiveVitals(crewId, initial, 1000);
  const reducedMotion = useReducedMotion();
  const clock = useUtcClock();

  /* ---- alarm message cycling (every 2 s) ---- */
  const [alarmTick, setAlarmTick] = useState(0);
  const alarmCount = v.alarms.length;
  useEffect(() => {
    if (alarmCount < 2) return;
    const id = setInterval(() => setAlarmTick((i) => i + 1), 2000);
    return () => clearInterval(id);
  }, [alarmCount]);
  const shown = alarmCount > 0 ? v.alarms[alarmTick % alarmCount] : null;
  const top = topAlarm(v.alarms);

  /* ---- screen-reader announcement only when the alarm set changes ---- */
  const announceKey = `${v.alarms.map((a) => a.id).join("|")}${stale ? "|stale" : ""}`;
  const makeAnnouncement = () => {
    if (stale) return `${v.crewName}: no signal, communications lost.`;
    if (alarmCount === 0) return "";
    const drill = v.alarms.some((a) => a.drill) ? "Training drill. " : "";
    return `${drill}${v.crewName} alarms: ${v.alarms.map((a) => `${a.priority} priority ${a.text}`).join("; ")}`;
  };
  const [announce, setAnnounce] = useState(() => ({ key: announceKey, text: makeAnnouncement() }));
  if (announce.key !== announceKey) setAnnounce({ key: announceKey, text: makeAnnouncement() });

  /* ---- heart glyph + optional QRS tone ---- */
  const heartRef = useRef<HTMLSpanElement | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const [sound, setSound] = useState(false);
  const [soundUnavailable, setSoundUnavailable] = useState(false);
  const beatCtx = useRef({ sound, spo2: v.spo2, reducedMotion });
  useEffect(() => {
    beatCtx.current = { sound, spo2: v.spo2, reducedMotion };
  });
  useEffect(
    () => () => {
      const ctx = audioRef.current;
      audioRef.current = null;
      try {
        void ctx?.close().catch(() => {});
      } catch {
        /* ignore */
      }
    },
    [],
  );

  const onBeat = useCallback(() => {
    const { sound: on, spo2, reducedMotion: rm } = beatCtx.current;
    const el = heartRef.current;
    if (el && typeof el.animate === "function") {
      el.animate(
        rm
          ? [{ opacity: 1 }, { opacity: 0.4 }]
          : [
              { transform: "scale(1)", opacity: 0.45 },
              { transform: "scale(1.3)", opacity: 1, offset: 0.25 },
              { transform: "scale(1)", opacity: 0.45 },
            ],
        { duration: rm ? 250 : 460, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      );
    }
    const ctx = audioRef.current;
    if (!on || !ctx) return;
    try {
      // Pulse-oximeter style: pitch falls ~1 semitone per % SpO2 below 100.
      const s = spo2 == null ? 92 : Math.max(70, Math.min(100, spo2));
      const freq = 880 * Math.pow(2, -(100 - s) / 12);
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } catch {
      /* audio is optional */
    }
  }, []);

  const toggleSound = () => {
    if (sound) {
      setSound(false);
      try {
        void audioRef.current?.suspend().catch(() => {});
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      const AC =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) {
        setSoundUnavailable(true);
        return;
      }
      if (!audioRef.current) audioRef.current = new AC();
      void audioRef.current.resume().catch(() => {});
      setSound(true);
    } catch {
      setSoundUnavailable(true);
    }
  };

  /* ---- channels ---- */
  const abpTop = Math.max(190, Math.ceil(((v.sys ?? 0) + 20) / 20) * 20);
  const channels: ChannelSpec[] = [
    { key: "ecg", label: "II", sublabel: "x1 · 25 mm/s", color: MONITOR_COLOR.ecg, range: [-0.8, 1.6], weight: 2.2 },
    { key: "abp", label: "ABP", sublabel: "mmHg", color: MONITOR_COLOR.abp, range: [-6, abpTop], weight: 1.5, scale: [0, 80, 160] },
    { key: "pleth", label: "Pleth", color: MONITOR_COLOR.pleth, range: [-0.05, 1.05], weight: 1.1 },
    { key: "resp", label: "Resp", sublabel: "Imp", color: MONITOR_COLOR.resp, range: [-1.25, 1.25], weight: 1 },
  ];

  /* ---- numerics ---- */
  const L = ALARM_LIMITS;
  const hrAlarm = alarmFor(v.alarms, "heartRate");
  const stAlarm = alarmFor(v.alarms, "stDeviation");
  const abpAlarm = alarmFor(v.alarms, "systolicBP", "diastolicBP");
  const spo2Alarm = alarmFor(v.alarms, "spo2");
  const respAlarm = alarmFor(v.alarms, "respRate");
  const st = `${v.stMm >= 0 ? "+" : "−"}${Math.abs(v.stMm).toFixed(1)}`;
  const perfusion = v.spo2 == null || v.sys == null || v.dia == null ? 0 : Math.max(0.12, Math.min(1, (v.sys - v.dia) / 50));
  const hrText = fmt(v.hr);
  const abpText = `${fmt(v.sys)}/${fmt(v.dia)}`;

  const summary =
    `Demo patient monitor for ${v.crewName}${v.scenario ? `, training scenario ${v.scenario.label}` : ""}. ` +
    `Heart rate ${v.hr ?? "not measurable"}${v.hr != null ? " beats per minute" : ""}, ${RHYTHM_LABEL[v.rhythm]}. ` +
    `ST ${st} millimetres. Arterial pressure ${v.sys != null ? `${v.sys} over ${v.dia}, mean ${v.map}` : "not measurable"}. ` +
    `SpO2 ${v.spo2 != null ? `${v.spo2} percent` : "not measurable"}. Respiration ${v.resp ?? "not measurable"} per minute. ` +
    `Temperature ${v.temp ?? "unknown"} °C. ${stale ? "No signal, last values shown. " : ""}Waveforms synthesised from ${CAPTION_SOURCE[v.source]}.`;

  const stageAlarm = stale ? "" : top?.priority === "high" ? "dm-alarm-high" : top ? "dm-alarm-medium" : "";

  return (
    <figure className="m-0" data-crew={crewId}>
      <div className={`dm-stage ${stageAlarm} @container overflow-hidden rounded-[26px] p-4 @3xl:p-6`}>
        {/* ---- top status bar ---- */}
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-center gap-3">
            <DemoTag />
            <div className="min-w-0">
              <div className="truncate text-[15px] font-medium tracking-[-0.01em] text-white/95 @3xl:text-[17px]">{v.crewName}</div>
              <div className="text-[9.5px] font-medium uppercase tracking-[0.2em] text-white/45">
                Crew monitor · {v.crewId.toUpperCase()}
              </div>
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            {v.scenario && <DrillTag scenario={v.scenario} className="max-w-full" />}
            <SourceTag source={v.source} />
            <span className="text-[12px] font-light tabular-nums tracking-[0.04em] text-white/70" suppressHydrationWarning>
              {clock ?? "--:--:--"} <span className="text-[9.5px] tracking-[0.18em] text-white/40">UTC</span>
            </span>
            <button
              type="button"
              onClick={toggleSound}
              aria-pressed={sound}
              aria-label={soundUnavailable ? "QRS tone unavailable in this browser" : sound ? "Turn QRS tone off" : "Turn QRS tone on"}
              title={soundUnavailable ? "Audio unavailable" : sound ? "QRS tone on" : "QRS tone off"}
              disabled={soundUnavailable}
              className="grid size-7 place-items-center rounded-full text-white/60 ring-1 ring-inset ring-white/12 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 disabled:opacity-40"
            >
              {sound ? <Volume2 size={14} aria-hidden /> : <VolumeX size={14} aria-hidden />}
            </button>
          </div>
        </header>

        {/* ---- alarm message area ---- */}
        <div className="mt-3 flex h-8 items-center @3xl:mt-4">
          {stale ? (
            <div className="flex h-full w-full items-center gap-3 rounded-[10px] bg-white/[0.06] px-3 text-[12.5px] font-semibold uppercase tracking-[0.12em] text-[#64d2ff]">
              <span>No signal · comms lost</span>
              <span className="ml-auto text-[10px] font-medium tracking-[0.16em] text-white/45">Last values held</span>
            </div>
          ) : shown ? (
            <div
              key={shown.id}
              className={`flex h-full w-full min-w-0 items-center gap-3 rounded-[10px] px-3 text-[12.5px] font-semibold tracking-[0.1em] ${shown.priority === "high" ? "dm-band-high" : "dm-band-medium"}`}
            >
              <span className="truncate">
                {alarmPrefix(shown)} {shown.text}
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-2">
                {shown.drill && (
                  <span className="rounded-[4px] bg-black/80 px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.16em] text-[#ffcc00]">Drill</span>
                )}
                {alarmCount > 1 && (
                  <span className="text-[10px] tabular-nums tracking-[0.1em] opacity-80">
                    {(alarmTick % alarmCount) + 1}/{alarmCount}
                  </span>
                )}
              </span>
            </div>
          ) : (
            <div className="flex h-full w-full items-center px-1 text-[10px] font-medium uppercase tracking-[0.2em] text-white/30">
              No active alarms
            </div>
          )}
        </div>

        {/* ---- body ---- */}
        <div className="mt-3 flex flex-col gap-4 @3xl:mt-4 @3xl:flex-row @3xl:gap-6">
          {/* numerics: 2x2 grid on narrow screens, vertical column on wide */}
          <div
            className={`grid grid-cols-2 gap-x-2 gap-y-1 transition-opacity duration-700 @3xl:order-last @3xl:w-[32%] @3xl:gap-y-0.5 ${stale ? "opacity-45" : ""}`}
          >
            <Numeric
              label={
                <>
                  HR
                  <span ref={heartRef} className="dm-heart inline-flex" style={{ opacity: v.hr == null ? 0.15 : 0.45 }}>
                    <Heart size={11} fill="currentColor" strokeWidth={0} aria-hidden />
                  </span>
                </>
              }
              color={MONITOR_COLOR.ecg}
              alarm={hrAlarm}
              limits={[String(L.hr.high), String(L.hr.low)]}
              className="order-1 @3xl:col-span-2"
              extra={
                <div className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-[0.14em] text-white/45">
                  <span className="@3xl:hidden">{RHYTHM_SHORT[v.rhythm]}</span>
                  <span className="hidden @3xl:inline">{RHYTHM_LABEL[v.rhythm]}</span>
                  {v.pvcPerMin > 0 && <> · PVC {v.pvcPerMin}/min</>}
                </div>
              }
            >
              <div className="flex items-baseline gap-1.5">
                <span className="text-[60px] font-extralight leading-[0.95] tracking-[-0.045em] tabular-nums @3xl:text-[112px]">
                  <Val>{hrText}</Val>
                </span>
                <span className="text-[11px] font-light text-white/50">bpm</span>
              </div>
            </Numeric>

            <Numeric
              label="ST-II"
              color={MONITOR_COLOR.ecg}
              alarm={stAlarm}
              limits={[`+${L.stMm.high.toFixed(1)}`, `−${L.stMm.high.toFixed(1)}`]}
              className="order-5 @3xl:order-2 @3xl:col-span-2"
            >
              <div className="flex items-baseline gap-1.5">
                <span className="text-[26px] font-light leading-none tracking-[-0.02em] tabular-nums @3xl:text-[28px]">
                  <Val>{st}</Val>
                </span>
                <span className="text-[11px] font-light text-white/50">mm</span>
              </div>
            </Numeric>

            <Numeric
              label="ABP"
              color={MONITOR_COLOR.abp}
              alarm={abpAlarm}
              limits={[String(L.sys.high), String(L.sys.low)]}
              className="order-2 @3xl:order-3 @3xl:col-span-2"
            >
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[30px] font-extralight leading-none tracking-[-0.035em] tabular-nums @3xl:text-[54px]">
                  <Val>{abpText}</Val>
                </span>
                <span className="text-[15px] font-light tabular-nums text-current/80 @3xl:text-[20px]">
                  <span className="whitespace-nowrap">(<Val>{fmt(v.map)}</Val>)</span>
                </span>
              </div>
              <div className="mt-0.5 text-[10px] font-light text-white/45">mmHg</div>
            </Numeric>

            <Numeric
              label={<>SpO₂</>}
              color={MONITOR_COLOR.pleth}
              alarm={spo2Alarm}
              limits={["100", String(L.spo2.low)]}
              className="order-3 @3xl:order-4 @3xl:col-span-2"
            >
              <div className="flex items-end gap-2">
                <span className="text-[44px] font-extralight leading-[0.95] tracking-[-0.04em] tabular-nums @3xl:text-[64px]">
                  <Val>{fmt(v.spo2)}</Val>
                </span>
                <span className="mb-1 text-[11px] font-light text-white/50">%</span>
                <span
                  className="mb-1 ml-auto flex h-9 w-[5px] flex-col justify-end overflow-hidden rounded-full bg-white/10 @3xl:h-12"
                  title={`Perfusion indicator ${Math.round(perfusion * 100)} %`}
                  aria-hidden
                >
                  <span
                    className="block w-full rounded-full bg-current transition-[height] duration-700 ease-out"
                    style={{ height: `${Math.round(perfusion * 100)}%` }}
                  />
                </span>
              </div>
            </Numeric>

            <Numeric
              label="Resp"
              color={MONITOR_COLOR.resp}
              alarm={respAlarm}
              limits={[String(L.resp.high), String(L.resp.low)]}
              className="order-4 @3xl:order-5"
            >
              <div className="flex items-baseline gap-1.5">
                <span className="text-[36px] font-extralight leading-none tracking-[-0.035em] tabular-nums @3xl:text-[40px]">
                  <Val>{fmt(v.resp)}</Val>
                </span>
                <span className="text-[11px] font-light text-white/50">rpm</span>
              </div>
            </Numeric>

            <Numeric label="Temp" color={MONITOR_COLOR.temp} alarm={null} className="order-6">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[26px] font-extralight leading-none tracking-[-0.03em] tabular-nums @3xl:text-[40px]">
                  <Val>{fmt(v.temp, 1)}</Val>
                </span>
                <span className="text-[11px] font-light text-white/50">°C</span>
              </div>
            </Numeric>
          </div>

          {/* waveforms */}
          <div role="img" aria-label={summary} className="relative h-[268px] min-w-0 @3xl:h-auto @3xl:min-h-[440px] @3xl:w-[68%]">
            <SweepCanvas
              vitals={v}
              channels={channels}
              frozen={stale}
              reducedMotion={reducedMotion}
              onBeat={onBeat}
              seed={seedFor(crewId)}
              className="absolute inset-0"
            />
            {stale && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 rounded-[14px] bg-black/55 text-center">
                <div className="text-[34px] font-extralight tracking-[-0.02em] text-white @3xl:text-[48px]">No signal</div>
                <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#64d2ff]">
                  Comms lost · last sample {v.t.slice(11, 19)} UTC
                </div>
              </div>
            )}
            <div className="dm-watermark" aria-hidden>
              <span style={{ fontSize: "clamp(56px, 13cqw, 168px)" }}>DEMO</span>
            </div>
          </div>
        </div>

        <div className="dm-sr-only" aria-live="polite" role="status">
          {announce.text}
        </div>
      </div>
      <figcaption className="mt-2 px-1 text-[11px] text-muted">
        Demo monitor · not a medical device · Waveforms synthesised from telemetry · {CAPTION_SOURCE[v.source]}
        {v.scenario && <> · Training scenario (drill), not a real emergency</>}
      </figcaption>
    </figure>
  );
}
