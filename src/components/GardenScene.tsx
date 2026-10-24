// The landscape at the foot of the Today header and the sign-in screen: hills, a golden field with
// crop rows, olive trees, and a sun (or moon and stars) placed and coloured by the time of day.
// The sky itself is the header's CSS background, so the text above sits on the same gradient.
// Inline SVG, no image file; it fades into the page colour at the bottom in both themes.
import { useId } from "react";
import type { DayPhase } from "../lib/today";

interface Palette {
  sun: string;
  glow: string;
  far: string;
  mid: string;
  field: string;
  rows: string;
  near: string;
  tree: string;
  trunk: string;
}

const PALETTES: Record<DayPhase, Palette> = {
  dawn: { sun: "#f7a46a", glow: "#ffd9a8", far: "#c9a9c6", mid: "#a9b38a", field: "#e6b65a", rows: "#9a7a2c", near: "#6f9b4f", tree: "#3f6e3a", trunk: "#5b4a33" },
  day: { sun: "#ffd25e", glow: "#fff1b8", far: "#9cc3b5", mid: "#88b073", field: "#d8c760", rows: "#8a8a2c", near: "#5f9f4a", tree: "#2f6a36", trunk: "#5b4a33" },
  dusk: { sun: "#ffb067", glow: "#ffcf96", far: "#a27fa8", mid: "#8e8a6a", field: "#d99a4a", rows: "#8a5a26", near: "#5d7f45", tree: "#354f2e", trunk: "#3f3324" },
  night: { sun: "#f4ecd0", glow: "#c9d4f2", far: "#33405f", mid: "#304237", field: "#45503a", rows: "#2c3526", near: "#25372a", tree: "#18271c", trunk: "#1a1a14" },
};

/** Sun (or moon) centre and radius per phase, in the 400 × 160 viewBox. */
const SUN: Record<DayPhase, [number, number, number]> = {
  dawn: [318, 56, 28],
  day: [300, 26, 20],
  dusk: [92, 58, 30],
  night: [312, 26, 14],
};

/** Olive trees as [x, ground y, scale]: a few on the far slope, the rest along the near hill. */
const TREES: Array<[number, number, number]> = [
  [148, 80, 0.42],
  [163, 81, 0.36],
  [206, 76, 0.44],
  [24, 118, 1.15],
  [60, 113, 0.9],
  [246, 119, 0.8],
  [282, 120, 0.7],
  [330, 117, 1.25],
  [366, 112, 1],
  [394, 114, 0.85],
];

const STARS: Array<[number, number, number]> = [
  [40, 14, 1.2],
  [86, 32, 0.9],
  [132, 8, 1.1],
  [180, 28, 0.8],
  [226, 6, 1.3],
  [256, 38, 0.8],
  [356, 10, 1],
  [384, 40, 0.9],
];

function OliveTree({ x, y, s, p }: { x: number; y: number; s: number; p: Palette }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x={-1.6} y={-9} width={3.2} height={10} rx={1.2} fill={p.trunk} />
      <circle cx={-6} cy={-13} r={7} fill={p.tree} />
      <circle cx={5} cy={-15} r={8} fill={p.tree} />
      <circle cx={-1} cy={-20} r={7.5} fill={p.tree} />
      <circle cx={3} cy={-19} r={3.2} fill="#ffffff" opacity={0.08} />
    </g>
  );
}

export function GardenScene({ phase, className = "" }: { phase: DayPhase; className?: string }) {
  const uid = useId().replace(/:/g, "");
  const p = PALETTES[phase];
  const [sx, sy, sr] = SUN[phase];
  const fieldPath = "M0 96 C 90 84, 180 92, 250 88 S 350 80, 400 90 L400 160 L0 160 Z";
  // Crop rows run from the bottom edge towards a vanishing point behind the field.
  const rows = Array.from({ length: 11 }, (_, i) => `M${-160 + i * 62} 160 L300 84`);

  return (
    <svg className={`garden-scene ${phase} ${className}`} viewBox="0 0 400 160" preserveAspectRatio="xMidYMax slice" aria-hidden focusable="false">
      <defs>
        <radialGradient id={`glow-${uid}`}>
          <stop offset="0" stopColor={p.glow} stopOpacity={0.85} />
          <stop offset="1" stopColor={p.glow} stopOpacity={0} />
        </radialGradient>
        <linearGradient id={`fade-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--bg)", stopOpacity: 0 }} />
          <stop offset="1" style={{ stopColor: "var(--bg)", stopOpacity: 1 }} />
        </linearGradient>
        <clipPath id={`field-${uid}`}>
          <path d={fieldPath} />
        </clipPath>
        <mask id={`moon-${uid}`}>
          <rect width="400" height="160" fill="#fff" />
          <circle cx={sx + 7} cy={sy - 5} r={sr} fill="#000" />
        </mask>
      </defs>

      {phase === "night" &&
        STARS.map(([x, y, r], i) => <circle key={i} className="star" cx={x} cy={y} r={r} fill="#fff" style={{ animationDelay: `${i * 0.7}s` }} />)}

      <circle className="sun-glow" cx={sx} cy={sy} r={sr * 2.6} fill={`url(#glow-${uid})`} />
      <circle cx={sx} cy={sy} r={sr} fill={p.sun} mask={phase === "night" ? `url(#moon-${uid})` : undefined} />

      {phase === "day" && (
        <g className="clouds" fill="#ffffff" opacity={0.75}>
          <ellipse cx={70} cy={30} rx={26} ry={8} />
          <ellipse cx={88} cy={24} rx={16} ry={9} />
          <ellipse cx={196} cy={44} rx={20} ry={6} />
          <ellipse cx={208} cy={39} rx={12} ry={7} />
        </g>
      )}

      <path d="M0 70 C 40 56, 80 50, 130 58 S 210 74, 260 60 S 350 44, 400 56 L400 160 L0 160 Z" fill={p.far} />
      <path d="M0 84 C 60 72, 110 78, 170 80 S 290 66, 400 78 L400 160 L0 160 Z" fill={p.mid} />
      <path d={fieldPath} fill={p.field} />
      <g clipPath={`url(#field-${uid})`} stroke={p.rows} strokeWidth={2.2} opacity={0.35}>
        {rows.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <path d="M0 122 C 70 106, 150 110, 220 116 S 340 122, 400 110 L400 160 L0 160 Z" fill={p.near} />
      {TREES.map(([x, y, s]) => (
        <OliveTree key={`${x}-${y}`} x={x} y={y} s={s} p={p} />
      ))}
      <rect x="0" y="130" width="400" height="30" fill={`url(#fade-${uid})`} />
    </svg>
  );
}
