"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { DASH } from "@/lib/format";

export type SortDirection = "ascending" | "descending";
export type DataSort = { key: string; direction: SortDirection };

export type DataColumn = {
  key: string;
  label: string;
  sortable?: boolean;
  /** The direction a first press sorts in: figures start descending (the default), names ascending. */
  firstDirection?: SortDirection;
  /** Left out on phone (the "Years" column). */
  hidePhone?: boolean;
  /** A text column after the first (the backtest's favourite); figures are right-aligned. */
  alignLeft?: boolean;
};

export type DataRow =
  | { type: "group"; key: string; label: string }
  | { type?: "row"; key: string; cells: ReactNode[] };

/**
 * Guide §7 Data table: caption-size heads over an ink rule, figures right-aligned, group rows
 * ("Major awards") on a line-strong rule. Sortable heads are buttons; the sorted one is ink 500
 * with an arrow and aria-sort. The page keeps the sort in the address and passes it back in.
 */
export function DataTable({
  columns,
  rows,
  sort,
  onSort,
  caption,
  className,
}: {
  columns: DataColumn[];
  rows: DataRow[];
  sort?: DataSort;
  /** Called with the column and its next direction: a new column starts in its `firstDirection` (descending), the same one flips. */
  onSort?: (next: DataSort) => void;
  /** The table's name for screen readers. */
  caption?: string;
  className?: string;
}) {
  const hide = (col: DataColumn) => (col.hidePhone ? "max-md:hidden" : undefined);
  const cellPad = "px-2 py-3 first:pl-0 md:px-3";
  const frame = useRef<HTMLDivElement>(null);
  const scrolls = useScrolls(frame);

  return (
    // A frame that scrolls sideways is a named, focusable region, so a keyboard can scroll it
    // even when the table holds no buttons or links (launch check A2).
    <div
      ref={frame}
      tabIndex={scrolls ? 0 : undefined}
      role={scrolls ? "region" : undefined}
      aria-label={scrolls ? caption : undefined}
      className={cn("-mx-2 overflow-x-auto rounded-xs px-2 outline-none focus-visible:shadow-focus", className)}
    >
      <table className="w-full border-collapse text-caption md:text-small">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((col, i) => {
              const sorted = sort?.key === col.key ? sort.direction : undefined;
              const Arrow = sorted === "ascending" ? ArrowUp : ArrowDown;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={sorted}
                  className={cn(
                    cellPad,
                    "border-b border-ink py-2.5 align-bottom text-caption font-normal whitespace-nowrap text-ink-muted",
                    i === 0 || col.alignLeft ? "text-left" : "text-right",
                    hide(col),
                  )}
                >
                  {col.sortable && onSort ? (
                    <button
                      type="button"
                      onClick={() =>
                        onSort({
                          key: col.key,
                          direction: sorted
                            ? sorted === "descending"
                              ? "ascending"
                              : "descending"
                            : (col.firstDirection ?? "descending"),
                        })
                      }
                      className={cn(
                        "inline-flex items-center gap-1 rounded-xs outline-none hover:text-ink focus-visible:shadow-focus",
                        sorted && "font-medium text-ink",
                      )}
                    >
                      {col.label}
                      {sorted ? <Arrow aria-hidden="true" className="size-3.5" strokeWidth={1.75} /> : null}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) =>
            row.type === "group" ? (
              <tr key={row.key}>
                <th
                  scope="colgroup"
                  colSpan={columns.length}
                  className="border-b border-line-strong pt-7 pb-2 text-left text-caption font-medium text-ink-muted"
                >
                  {row.label}
                </th>
              </tr>
            ) : (
              <tr key={row.key} className="hover:bg-paper">
                {row.cells.map((cell, i) => (
                  <td
                    key={columns[i]?.key ?? i}
                    className={cn(
                      cellPad,
                      "border-b border-line align-middle md:py-3.5",
                      // On phone the first column keeps room for a long award name; the frame scrolls instead.
                      i === 0 ? "text-left max-md:min-w-[140px]" : columns[i]?.alignLeft ? "text-left" : "text-right",
                      columns[i] && hide(columns[i]),
                    )}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Whether the frame is narrower than its table, checked on every resize. */
function useScrolls(ref: RefObject<HTMLDivElement | null>) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOn(el.scrollWidth > el.clientWidth);
    check();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(check);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [ref]);
  return on;
}

/**
 * A figure cell: "79% 11 of 14", the % in 500 and the count in ink-muted, with a 72px gold
 * mini meter under the main sorted figure. A figure that doesn't apply is "–" (say why in a footnote).
 */
export function DataFigure({
  pct,
  count,
  meter = false,
  reason,
}: {
  /** 0–100, or null when the figure doesn't apply. */
  pct: number | null;
  /** "11 of 14". */
  count?: string;
  meter?: boolean;
  /** Why it doesn't apply, as the dash's title. */
  reason?: string;
}) {
  if (pct === null) {
    return (
      <span className="text-ink-muted" title={reason}>
        {DASH}
      </span>
    );
  }
  const rounded = Math.round(pct);
  return (
    <span className="whitespace-nowrap">
      <b className="font-medium">{rounded}%</b>
      {count ? <span className="text-ink-muted"> {count}</span> : null}
      {meter ? (
        <span aria-hidden="true" className="mt-1.5 ml-auto block h-0.5 w-[72px] bg-track">
          <span className="block h-0.5 bg-gold" style={{ width: `${Math.min(100, Math.max(0, rounded))}%` }} />
        </span>
      ) : null}
    </span>
  );
}

/** The award cell: name in 500, the category or note under it in caption ink-muted. */
export function DataName({ name, note }: { name: ReactNode; note?: ReactNode }) {
  return (
    <span className="font-medium">
      {name}
      {note ? <span className="block text-caption font-normal text-ink-muted">{note}</span> : null}
    </span>
  );
}
