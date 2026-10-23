/**
 * Guide §6.5 The chance line: 2px gold on the row's bottom rule, from the left, as wide as the chance
 * to win. Raised over the next row, whose top rule would otherwise cover its lower half.
 */
export function ChanceLine({ p }: { p: number }) {
  return (
    <span
      aria-hidden="true"
      data-chance-line
      className="pointer-events-none absolute -bottom-px left-0 z-[1] h-0.5 bg-gold"
      style={{ width: `${Math.min(Math.max(p, 0), 1) * 100}%` }}
    />
  );
}
