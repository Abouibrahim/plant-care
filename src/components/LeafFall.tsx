import type { CSSProperties } from "react";

const COLOURS = ["var(--c-propagate)", "var(--sun)", "var(--apricot)", "var(--sage)", "var(--c-harvest)"];

/** Fixed spread so every celebration looks the same and render stays pure. */
const LEAVES = Array.from({ length: 26 }, (_, i) => ({
  left: (i * 37 + 7) % 100,
  delay: (i % 9) * 0.08,
  duration: 1.5 + (i % 5) * 0.2,
  drift: ((i * 53) % 80) - 40,
  turn: 160 + ((i * 71) % 300),
  size: 10 + (i % 4) * 3,
  colour: COLOURS[i % COLOURS.length],
}));

/** A short fall of leaves over the screen when the day's last task is done. Skipped under reduced motion (CSS). */
export function LeafFall() {
  return (
    <div className="leaf-fall" aria-hidden>
      {LEAVES.map((leaf, i) => (
        <i
          key={i}
          style={
            {
              left: `${leaf.left}%`,
              width: leaf.size,
              height: leaf.size,
              animationDelay: `${leaf.delay}s`,
              animationDuration: `${leaf.duration}s`,
              "--drift": `${leaf.drift}px`,
              "--turn": `${leaf.turn}deg`,
              "--leaf": leaf.colour,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
