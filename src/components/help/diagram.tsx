import type { ReactNode } from "react";

/**
 * Hand-built SVG diagram primitives for the help page. Everything is drawn
 * with theme tokens (fill-surface, stroke-border, fill-muted ...) so the
 * diagrams follow the light and dark themes. Server-safe, no hooks.
 */

/**
 * Figure frame: the SVG scrolls horizontally inside its own frame on narrow
 * screens (never the page), with a caption underneath. The SVG itself
 * carries role="img" and the full text alternative.
 */
export function DiagramFrame({
  caption,
  minWidth,
  legend,
  children,
}: {
  caption: ReactNode;
  /** Narrowest width (px) at which the SVG text stays legible. */
  minWidth: number;
  legend?: ReactNode;
  children: ReactNode;
}) {
  return (
    <figure className="min-w-0 rounded-xl border border-border bg-surface">
      {/* Phones: keep the text legible and scroll inside the frame. From md up the
          diagram scales down to fit, so nothing is ever cut off on laptops.
          Focusable (named region) so keyboard users can scroll it. */}
      <div
        role="region"
        aria-label="Diagram (scrolls sideways on small screens)"
        className="overflow-x-auto p-3 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent md:overflow-visible md:p-4"
        tabIndex={0}
      >
        <div className="min-w-[var(--diagram-min)] md:min-w-0" style={{ ["--diagram-min" as string]: `${minWidth}px` }}>
          {children}
        </div>
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border px-4 py-2.5 text-xs leading-relaxed text-muted">
        <span>
          {caption}
          <span className="md:hidden"> Swipe sideways to see the whole diagram.</span>
        </span>
        {legend}
      </figcaption>
    </figure>
  );
}

/** Arrowhead marker; give each SVG its own id prefix so markers never clash. */
export function ArrowDefs({ id }: { id: string }) {
  return (
    <defs>
      <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" className="fill-muted" />
      </marker>
      <marker id={`${id}-arrow-fg`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" className="fill-fg" />
      </marker>
    </defs>
  );
}

/** Connector line with an arrowhead at the end. */
export function Arrow({
  id,
  d,
  dashed = false,
  strong = false,
}: {
  id: string;
  /** SVG path data. */
  d: string;
  dashed?: boolean;
  /** Darker line for the main path through a diagram. */
  strong?: boolean;
}) {
  return (
    <path
      d={d}
      fill="none"
      strokeWidth={1.5}
      strokeDasharray={dashed ? "5 4" : undefined}
      markerEnd={`url(#${id}-arrow${strong ? "-fg" : ""})`}
      className={strong ? "stroke-fg" : "stroke-muted"}
    />
  );
}

/** Small arrow label with a surface-coloured halo so it stays legible over lines. */
export function EdgeLabel({
  x,
  y,
  children,
  anchor = "middle",
  mono = false,
}: {
  x: number;
  y: number;
  children: ReactNode;
  anchor?: "start" | "middle" | "end";
  mono?: boolean;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fontSize={11.5}
      strokeWidth={5}
      strokeLinejoin="round"
      paintOrder="stroke"
      className={`fill-muted stroke-surface ${mono ? "font-mono" : ""}`}
    >
      {children}
    </text>
  );
}

/** Rectangular node: optional step number, a title and short muted lines. */
export function Node({
  x,
  y,
  w,
  h,
  title,
  lines = [],
  step,
  dashed = false,
  emphasis = false,
  children,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  lines?: string[];
  step?: number;
  /** Dashed outline = simulated / synthetic (matches the simulated tag). */
  dashed?: boolean;
  /** Stronger outline for the system itself or the decisive step. */
  emphasis?: boolean;
  children?: ReactNode;
}) {
  const tx = step != null ? x + 40 : x + 14;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={5}
        strokeWidth={emphasis ? 1.75 : 1.25}
        strokeDasharray={dashed ? "6 4" : undefined}
        className={`${emphasis ? "fill-surface-2 stroke-fg" : "fill-surface stroke-border"} ${dashed ? "stroke-muted" : ""}`}
      />
      {step != null && (
        <g>
          <rect x={x + 12} y={y + 12} width={20} height={20} rx={3} className="fill-fg" />
          <text x={x + 22} y={y + 26.5} textAnchor="middle" fontSize={12} fontWeight={600} className="fill-bg">
            {step}
          </text>
        </g>
      )}
      <text x={tx} y={y + 27} fontSize={14} fontWeight={600} className="fill-fg">
        {title}
      </text>
      {lines.map((l, i) => (
        <text key={l} x={x + 14} y={y + 50 + i * 17} fontSize={12.5} className="fill-muted">
          {l}
        </text>
      ))}
      {children}
    </g>
  );
}

/** Approximate rendered width of an SvgStatusChip (10.5 px semibold label + glyph). */
export function chipWidth(label: string): number {
  // Generous for IBM Plex Sans semibold at 10.5 px, so the label never touches the edge.
  return Math.round(label.length * 6.6 + 26);
}

/** Squared mini status chip inside an SVG (shape + text, never colour alone). */
export function SvgStatusChip({
  x,
  y,
  status,
  label,
}: {
  x: number;
  y: number;
  status: "nominal" | "caution" | "critical";
  label: string;
}) {
  const w = chipWidth(label);
  const box =
    status === "nominal"
      ? "fill-surface stroke-nominal"
      : status === "caution"
        ? "fill-caution-fill stroke-caution-fill"
        : "fill-critical-fill stroke-critical-fill";
  const text = status === "nominal" ? "fill-nominal" : status === "caution" ? "fill-on-caution" : "fill-on-critical";
  const glyph = status === "nominal" ? "stroke-nominal" : status === "caution" ? "stroke-on-caution" : "stroke-on-critical";
  const cx = x + 10;
  const cy = y + 9;
  return (
    <g>
      <rect x={x} y={y} width={w} height={18} rx={2.5} strokeWidth={1} className={box} />
      {status === "nominal" && (
        <path d={`M${cx - 3.5},${cy} l2.5,2.5 l4.5,-5`} fill="none" strokeWidth={1.8} className={glyph} />
      )}
      {status === "caution" && (
        <path d={`M${cx},${cy - 4.5} L${cx + 4.5},${cy + 3.5} L${cx - 4.5},${cy + 3.5} z`} fill="none" strokeWidth={1.5} strokeLinejoin="round" className={glyph} />
      )}
      {status === "critical" && (
        <path
          d={`M${cx - 2},${cy - 4.5} h4 l2.5,2.5 v4 l-2.5,2.5 h-4 l-2.5,-2.5 v-4 z`}
          fill="none"
          strokeWidth={1.5}
          className={glyph}
        />
      )}
      <text x={x + 19} y={y + 13} fontSize={10.5} fontWeight={600} className={text}>
        {label}
      </text>
    </g>
  );
}
