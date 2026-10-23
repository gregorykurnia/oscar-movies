import type { CellKind, CoverageCell } from "@/lib/coverage";
import { cn } from "@/lib/cn";

const CELL: Record<CellKind, string> = {
  loaded: "bg-ink",
  partial: "bg-[linear-gradient(90deg,var(--ink)_50%,var(--line-strong)_50%)]",
  none: "bg-surface shadow-[inset_0_0_0_1px_var(--line-strong)]",
  live: "bg-gold",
};

/** Guide §8.9 coverage strip: one 14px-high cell per film year, oldest to newest, 15 across. */
export function CoverageStrip({ cells, label }: { cells: CoverageCell[]; label: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      // Phone: the strip takes the room left beside the name (2px gaps); 300px and up from md.
      className="grid gap-[2px] md:min-w-[300px] md:gap-[3px]"
      style={{ gridTemplateColumns: `repeat(${cells.length}, 1fr)` }}
    >
      {cells.map((cell) => (
        <i key={cell.year} title={cell.label} data-cell={cell.kind} className={cn("block h-3.5 rounded-[3px]", CELL[cell.kind])} />
      ))}
    </div>
  );
}

/** The strip's colours in words, under the table. */
export function CoverageLegend() {
  const items: { kind: CellKind; label: string }[] = [
    { kind: "loaded", label: "Loaded" },
    { kind: "partial", label: "Partly loaded" },
    { kind: "none", label: "No data" },
    { kind: "live", label: "Live season" },
  ];
  return (
    <ul aria-label="Legend" className="mt-4 flex flex-wrap items-center gap-x-[18px] gap-y-2 text-caption text-ink-muted">
      {items.map((item) => (
        <li key={item.kind} className="inline-flex items-center gap-2">
          <i aria-hidden="true" className={cn("block size-3.5 rounded-[3px]", CELL[item.kind])} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
