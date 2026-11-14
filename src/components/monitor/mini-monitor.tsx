"use client";

import type { LiveVitals } from "@/lib/types";
import "./monitor.css";
import { DemoTag, DrillTag, MONITOR_COLOR, Val, alarmPrefix, fmt, topAlarm, useReducedMotion } from "./shared";
import { SweepCanvas, type ChannelSpec } from "./sweep-canvas";

const ECG: ChannelSpec[] = [{ key: "ecg", label: "II", color: MONITOR_COLOR.ecg, range: [-0.7, 1.5], weight: 1 }];

function seedFor(id: string): number {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 100000;
}

/**
 * Compact DEMO monitor strip for crew cards (keynote style: black rounded
 * tile, thin large HR numeral, glowing mini ECG). Vitals come from props;
 * the parent polls all crew at once, so there is no polling in here.
 */
export function MiniMonitor({ vitals: v }: { vitals: LiveVitals }) {
  const reducedMotion = useReducedMotion();
  const top = topAlarm(v.alarms);
  const stageAlarm = top?.priority === "high" ? "dm-alarm-high" : top ? "dm-alarm-medium" : "";
  const label =
    `Demo monitor, ${v.crewName}${v.scenario ? `, training scenario ${v.scenario.label}` : ""}: ` +
    `HR ${v.hr ?? "not measurable"}, ABP ${v.sys != null ? `${v.sys}/${v.dia}` : "not measurable"}, ` +
    `SpO2 ${v.spo2 ?? "not measurable"}` +
    (top ? `. Alarm: ${top.text}${top.drill ? " (drill)" : ""}` : "") +
    ". Waveform synthesised from telemetry.";

  return (
    <div
      role="img"
      aria-label={label}
      data-crew={v.crewId}
      className={`dm-stage ${stageAlarm} @container relative flex h-[86px] overflow-hidden rounded-[18px]`}
    >
      {/* mini ECG */}
      <div className="relative min-w-0 flex-1">
        <div className="absolute inset-x-2.5 bottom-1.5 top-6">
          <SweepCanvas
            vitals={v}
            channels={ECG}
            frozen={false}
            reducedMotion={reducedMotion}
            pxPerSecond={42}
            showLabels={false}
            seed={seedFor(v.crewId)}
          />
        </div>
        <div className="absolute left-2.5 right-1 top-2 z-10 flex min-w-0 items-center gap-1.5">
          <DemoTag className="!h-[15px] !px-1 !text-[8.5px]" />
          {v.scenario ? (
            <DrillTag scenario={v.scenario} compact className="!h-[15px] !px-1 !text-[8.5px]" />
          ) : (
            <span className="text-[9px] font-medium uppercase tracking-[0.16em]" style={{ color: MONITOR_COLOR.ecg }}>
              II
            </span>
          )}
        </div>
        {top && (
          <div className="absolute bottom-1.5 left-2.5 right-1 z-10 flex">
            <span
              className={`truncate rounded-[5px] px-1.5 py-[3px] text-[9.5px] font-semibold leading-none tracking-[0.08em] ${top.priority === "high" ? "dm-band-high" : "dm-band-medium"}`}
            >
              {alarmPrefix(top)} {top.text}
            </span>
          </div>
        )}
        <div className="dm-watermark" aria-hidden>
          <span className="text-[30px]">DEMO</span>
        </div>
      </div>

      {/* numerics */}
      <div className="flex shrink-0 items-center gap-3 pl-1 pr-3.5 tabular-nums">
        <div style={{ color: MONITOR_COLOR.ecg }}>
          <div className="text-[8.5px] font-medium uppercase tracking-[0.18em] text-white/50">HR</div>
          <div className="text-[36px] font-extralight leading-[0.95] tracking-[-0.045em]">
            <Val>{fmt(v.hr)}</Val>
          </div>
        </div>
        <div className="hidden @[17rem]:block" style={{ color: MONITOR_COLOR.abp }}>
          <div className="text-[8.5px] font-medium uppercase tracking-[0.18em] text-white/50">ABP</div>
          <div className="text-[17px] font-light leading-none tracking-[-0.02em]">
            <Val>{`${fmt(v.sys)}/${fmt(v.dia)}`}</Val>
          </div>
        </div>
        <div style={{ color: MONITOR_COLOR.pleth }}>
          <div className="text-[8.5px] font-medium uppercase tracking-[0.18em] text-white/50">SpO₂</div>
          <div className="text-[22px] font-extralight leading-none tracking-[-0.03em]">
            <Val>{fmt(v.spo2)}</Val>
          </div>
        </div>
      </div>
    </div>
  );
}
