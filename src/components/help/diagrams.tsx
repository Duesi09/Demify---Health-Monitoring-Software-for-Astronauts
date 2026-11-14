import { Arrow, ArrowDefs, DiagramFrame, EdgeLabel, Node, SvgStatusChip, chipWidth } from "./diagram";

/*
 * The four help-page diagrams. Each shows the real mechanism (what feeds
 * what, which branch applies when) with labelled arrows and no decoration.
 * Coordinates are in SVG user units; DiagramFrame scrolls them sideways on
 * phones instead of shrinking the text.
 */

/* ------------------------------------------------------------------------- */
/* Daily routine                                                              */
/* ------------------------------------------------------------------------- */

export function DailyRoutineDiagram() {
  const id = "dg-routine";
  const y = 64;
  const h = 120;
  const cy = y + h / 2;
  return (
    <DiagramFrame
      minWidth={1000}
      caption="The daily loop. Steps 1 to 4 happen every morning; step 5 only when Demify raises an escalation."
    >
      <svg
        viewBox="0 0 1180 350"
        width="100%"
        role="img"
        aria-label="Daily routine. 1, morning check-in: enter vitals, sleep, mood and symptoms. 2, Demify rates each value as nominal, caution or critical against NASA and clinical ranges and your pre-flight baseline. 3, Overview and Body map show who and which body system needs attention. 4, follow the listed actions. 5, only if Demify escalates, contact the flight surgeon. With no escalation the loop repeats with the next morning's check-in."
      >
        <ArrowDefs id={id} />

        <Node x={20} y={y} w={220} h={h} step={1} title="Morning check-in" lines={["Enter vitals, sleep, mood", "and any symptoms"]} />
        <Node x={320} y={y} w={240} h={h} step={2} title="Demify rates each value" lines={["NASA and clinical ranges", "plus your pre-flight baseline"]}>
          <SvgStatusChip x={334} y={y + 84} status="nominal" label="Nominal" />
          <SvgStatusChip x={334 + chipWidth("Nominal") + 6} y={y + 84} status="caution" label="Caution" />
          <SvgStatusChip x={334 + chipWidth("Nominal") + chipWidth("Caution") + 12} y={y + 84} status="critical" label="Critical" />
        </Node>
        <Node x={640} y={y} w={220} h={h} step={3} title="Overview and Body map" lines={["show who and which body", "system needs attention"]} />
        <Node x={940} y={y} w={220} h={h} step={4} title="Follow the actions" lines={["each finding lists what", "to do now and when"]} />
        <Node
          x={940}
          y={262}
          w={220}
          h={80}
          step={5}
          emphasis
          title="Call the flight surgeon"
          lines={["when the escalation", "banner tells you to"]}
        />

        <Arrow id={id} strong d={`M240,${cy} H316`} />
        <EdgeLabel x={280} y={cy - 22}>values</EdgeLabel>
        <EdgeLabel x={280} y={cy - 8}>saved</EdgeLabel>

        <Arrow id={id} strong d={`M560,${cy} H636`} />
        <EdgeLabel x={600} y={cy - 22}>status of</EdgeLabel>
        <EdgeLabel x={600} y={cy - 8}>each value</EdgeLabel>

        <Arrow id={id} strong d={`M860,${cy} H936`} />
        <EdgeLabel x={900} y={cy - 22}>open a</EdgeLabel>
        <EdgeLabel x={900} y={cy - 8}>finding</EdgeLabel>

        <Arrow id={id} strong d={`M1050,${y + h} V258`} />
        <EdgeLabel x={1040} y={228} anchor="end">only if Demify escalates</EdgeLabel>

        <Arrow id={id} dashed d={`M1050,${y} V24 H130 V${y - 4}`} />
        <EdgeLabel x={590} y={28}>no escalation: next check-in tomorrow morning</EdgeLabel>
      </svg>
    </DiagramFrame>
  );
}

/* ------------------------------------------------------------------------- */
/* Alarm decision                                                             */
/* ------------------------------------------------------------------------- */

export function AlarmDecisionDiagram({
  missionName,
  delayText,
  autonomous,
}: {
  missionName: string;
  /** One-way signal delay, already formatted (e.g. "0.5 s"). */
  delayText: string;
  /** True when the delay is long enough that the crew must act first, then transmit. */
  autonomous: boolean;
}) {
  const id = "dg-alarm";
  const cx = 160;
  const rule = autonomous ? "act first, then transmit the data" : "near real-time link: call directly";
  return (
    <DiagramFrame
      minWidth={420}
      caption={`Decision path for any alarm. Contact rule for the current mission (${missionName}, ${delayText} one-way): ${rule}.`}
    >
      <svg
        viewBox="0 0 500 722"
        width="100%"
        role="img"
        aria-label={`When an alarm sounds. 1, the alarm bar appears on top of every page, red for high priority and yellow for medium. 2, open the crew monitor to see the alarm, the numbers and the response checklist. 3, is a training scenario tag shown? If yes, it is a drill: practise the same steps and end the drill when done. If no, it is a real alarm: act first, check the crew member and follow the checklist. 4, only after acting, silence the sound for 2 minutes if needed; the visual alarm stays. 5, contact the flight surgeon. Current mission ${missionName}, ${delayText} one-way: ${rule}.`}
      >
        <ArrowDefs id={id} />

        <Node x={20} y={16} w={280} h={80} title="Alarm bar appears" lines={["on top of every page", "red = high, yellow = medium priority"]} />
        <Arrow id={id} strong d={`M${cx},96 V130`} />
        <EdgeLabel x={cx + 10} y={118} anchor="start">open it</EdgeLabel>

        <Node x={20} y={134} w={280} h={80} title="Open the crew monitor" lines={["alarm, numbers and the", "response checklist"]} />
        <Arrow id={id} strong d={`M${cx},214 V242`} />

        {/* Decision */}
        <path d={`M${cx},246 L280,296 L${cx},346 L40,296 z`} strokeWidth={1.5} className="fill-surface-2 stroke-fg" />
        <text x={cx} y={292} textAnchor="middle" fontSize={13.5} fontWeight={600} className="fill-fg">
          Training scenario
        </text>
        <text x={cx} y={309} textAnchor="middle" fontSize={13.5} fontWeight={600} className="fill-fg">
          tag shown?
        </text>

        <Arrow id={id} d="M280,296 H326" />
        <EdgeLabel x={303} y={288}>yes</EdgeLabel>
        <Node x={330} y={244} w={160} h={104} title="Training drill" lines={["not a real emergency;", "practise the same steps,", "then press End drill"]} />
        <Arrow id={id} dashed d="M410,348 V428 H304" />
        <EdgeLabel x={418} y={392} anchor="start">practise</EdgeLabel>

        <Arrow id={id} strong d={`M${cx},346 V384`} />
        <EdgeLabel x={cx + 10} y={370} anchor="start">no: real alarm</EdgeLabel>

        <Node x={20} y={388} w={280} h={80} emphasis title="Act first" lines={["check the crew member,", "follow the response checklist"]} />
        <Arrow id={id} strong d={`M${cx},468 V502`} />
        <EdgeLabel x={cx + 10} y={490} anchor="start">only after acting</EdgeLabel>

        <Node x={20} y={506} w={280} h={80} title="Silence 2 min if needed" lines={["sound pauses; the red or", "yellow bar stays on screen"]} />
        <Arrow id={id} strong d={`M${cx},586 V620`} />

        <Node
          x={20}
          y={624}
          w={280}
          h={84}
          emphasis
          title="Contact the flight surgeon"
          lines={[`${missionName}: ${delayText} one-way`, rule]}
        />
      </svg>
    </DiagramFrame>
  );
}

/* ------------------------------------------------------------------------- */
/* Data flow                                                                  */
/* ------------------------------------------------------------------------- */

const ROWS = [20, 116, 212, 308];
const ROW_H = 84;

function SvgTag({ x, y, label, simulated }: { x: number; y: number; label: string; simulated: boolean }) {
  const w = label.length * 5.6 + 14;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={16}
        rx={2.5}
        strokeWidth={1}
        strokeDasharray={simulated ? "3 2" : undefined}
        className={simulated ? "fill-surface stroke-muted" : "fill-surface-2 stroke-border"}
      />
      <text x={x + 7} y={y + 11.5} fontSize={10.5} fontWeight={600} className={simulated ? "fill-muted" : "fill-fg"}>
        {label}
      </text>
    </g>
  );
}

export function DataFlowDiagram() {
  const id = "dg-data";
  const sources = [
    { title: "Wearables and devices", line: "heart rate, BP, SpO₂, temperature", tag: "Simulated until a device is connected", simulated: true, edge: "device API" },
    { title: "Daily check-in", line: "sleep, mood, stress, exercise", tag: "Simulated until you enter your own", simulated: true, edge: "check-in form" },
    { title: "NOAA SWPC", line: "solar protons, flares, Kp index", tag: "Real · live", simulated: false, edge: "live or snapshot" },
    { title: "NASA OSDR", line: "ISS dose, Inspiration4 blood data", tag: "Real · published data", simulated: false, edge: "live or snapshot" },
  ];
  const screens = [
    { title: "Overview, Crew monitor", lines: ["vital-sign charts and the", "live monitor (Demo)"], edge: "vitals" },
    { title: "Check-in, Body map", lines: ["ratings, actions and", "body-system status"], edge: "ratings" },
    { title: "Radiation", lines: ["storm level, dose rate", "and mission dose budget"], edge: "dose rate" },
    { title: "NASA data, Radiation", lines: ["Inspiration4 biomarkers,", "ISS dose cross-check"], edge: "reference" },
  ];
  const steps: { n: number; head: string; sub?: string }[] = [
    { n: 1, head: "Checks every reading", sub: "(unit, plausible range)" },
    { n: 2, head: "Rates it: NASA, clinical", sub: "and personal baseline" },
    { n: 3, head: "Falls back live → cache", sub: "→ offline snapshot" },
    { n: 4, head: "Labels simulated values" },
  ];
  return (
    <DiagramFrame
      minWidth={900}
      caption="Main path per source. The assessment combines all of them; device readings arrive through POST /api/readings."
      legend={
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-3 w-5 rounded-[2px] border border-border bg-surface-2" />
            Real data
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-3 w-5 rounded-[2px] border border-dashed border-muted" />
            Simulated until real data arrives
          </span>
        </span>
      }
    >
      <svg
        viewBox="0 0 1000 412"
        width="100%"
        role="img"
        aria-label="Where the data comes from. Wearables and devices send vital signs through the device API; these are simulated until a device is connected. The daily check-in sends sleep, mood, stress and exercise; simulated until you enter your own. NOAA SWPC provides real live space weather. NASA OSDR provides real published ISS dose and Inspiration4 blood data. Demify checks every reading, rates it against NASA and clinical ranges and the personal baseline, falls back from live data to cache to an offline snapshot, and labels simulated values. The results appear on Overview and Crew monitor, Check-in and Body map, Radiation, and NASA data."
      >
        <ArrowDefs id={id} />

        {sources.map((s, i) => {
          const y = ROWS[i];
          return (
            <g key={s.title}>
              <Node x={20} y={y} w={260} h={ROW_H} dashed={s.simulated} title={s.title} lines={[s.line]} />
              <SvgTag x={34} y={y + 59} label={s.tag} simulated={s.simulated} />
              <Arrow id={id} strong={!s.simulated} dashed={s.simulated} d={`M280,${y + ROW_H / 2} H396`} />
              <EdgeLabel x={340} y={y + ROW_H / 2 - 8}>{s.edge}</EdgeLabel>
            </g>
          );
        })}

        <rect x={400} y={20} width={200} height={372} rx={5} strokeWidth={1.75} className="fill-surface-2 stroke-fg" />
        <text x={500} y={52} textAnchor="middle" fontSize={17} fontWeight={600} className="fill-fg">
          Demify
        </text>
        <line x1={416} x2={584} y1={66} y2={66} strokeWidth={1} className="stroke-border" />
        {steps.map((st, i) => {
          const y = 100 + i * 66;
          return (
            <g key={st.n}>
              <text x={416} y={y} fontSize={12.5} fontWeight={600} className="fill-muted tabular">
                {st.n}
              </text>
              <text x={432} y={y} fontSize={12.5} className="fill-fg">
                {st.head}
              </text>
              {st.sub && (
                <text x={432} y={y + 17} fontSize={12.5} className="fill-muted">
                  {st.sub}
                </text>
              )}
            </g>
          );
        })}

        {screens.map((s, i) => {
          const y = ROWS[i];
          return (
            <g key={s.title}>
              <Arrow id={id} strong d={`M600,${y + ROW_H / 2} H716`} />
              <EdgeLabel x={658} y={y + ROW_H / 2 - 8}>{s.edge}</EdgeLabel>
              <Node x={720} y={y} w={260} h={ROW_H} title={s.title} lines={s.lines} />
            </g>
          );
        })}
      </svg>
    </DiagramFrame>
  );
}

/* ------------------------------------------------------------------------- */
/* Drill timeline                                                             */
/* ------------------------------------------------------------------------- */

export function DrillTimelineDiagram({ autoEndMin }: { autoEndMin: number }) {
  const id = "dg-drill";
  const x0 = 40;
  const x1 = 960;
  const step = autoEndMin <= 30 ? 5 : 10;
  const ticks = Array.from({ length: Math.floor(autoEndMin / step) + 1 }, (_, i) => i * step);
  const xAt = (min: number) => x0 + ((x1 - x0) * min) / autoEndMin;
  return (
    <DiagramFrame
      minWidth={820}
      caption={`A drill runs on simulated telemetry only. It ends when you press End drill, or by itself after ${autoEndMin} minutes.`}
    >
      <svg
        viewBox="0 0 1000 200"
        width="100%"
        role="img"
        aria-label={`Drill timeline from 0 to ${autoEndMin} minutes. At the start you choose a drill and confirm; a red alarm tagged Training scenario appears on every page. While it runs you practise the response checklist on the crew page. End drill stops it at any moment. If nobody ends it, it ends automatically after ${autoEndMin} minutes.`}
      >
        <ArrowDefs id={id} />

        {/* Events above the bar */}
        <line x1={x0} x2={x0} y1={22} y2={96} strokeWidth={1.5} className="stroke-fg" />
        <text x={x0 + 8} y={34} fontSize={13.5} fontWeight={600} className="fill-fg">
          Start: choose a drill, confirm
        </text>
        <text x={x0 + 8} y={52} fontSize={12.5} className="fill-muted">
          red alarm tagged Training scenario
        </text>

        <line x1={x1} x2={x1} y1={22} y2={96} strokeWidth={1.5} className="stroke-fg" />
        <text x={x1 - 8} y={34} textAnchor="end" fontSize={13.5} fontWeight={600} className="fill-fg">
          Ends automatically
        </text>
        <text x={x1 - 8} y={52} textAnchor="end" fontSize={12.5} className="fill-muted">
          if nobody presses End drill
        </text>

        {/* Running drill */}
        <rect x={x0} y={96} width={x1 - x0} height={28} rx={3} strokeWidth={1.25} fillOpacity={0.22} className="fill-caution-fill stroke-caution-fill" />
        <text x={(x0 + x1) / 2} y={115} textAnchor="middle" fontSize={13} fontWeight={600} className="fill-fg">
          Drill running: practise the response checklist on the crew page
        </text>

        {/* Axis */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={xAt(t)} x2={xAt(t)} y1={124} y2={132} strokeWidth={1} className="stroke-muted" />
            <text x={xAt(t)} y={148} textAnchor={t === 0 ? "start" : t === autoEndMin ? "end" : "middle"} fontSize={11.5} className="fill-muted tabular">
              {t} min
            </text>
          </g>
        ))}

        {/* End drill: any time */}
        <Arrow id={id} dashed d={`M${(x0 + x1) / 2},178 H${x0 + 4}`} />
        <Arrow id={id} dashed d={`M${(x0 + x1) / 2},178 H${x1 - 4}`} />
        <EdgeLabel x={(x0 + x1) / 2} y={182}>End drill stops it at any moment</EdgeLabel>
      </svg>
    </DiagramFrame>
  );
}
