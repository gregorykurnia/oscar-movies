"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { DataTable, type DataColumn, type DataRow } from "@/components/data-table/DataTable";
import { ShowAllButton } from "@/components/show-all/ShowAllRow";

// "Show all" on the patterns page: the rest of a list, or of a table's rows, opens in place. As in
// the race, the button goes once it has opened and keyboard focus moves to the first row it showed.

/** `children` (a Film-row list) with `more` (more rows of the same list) after it once opened. */
export function Reveal({
  children,
  more,
  label,
  rest,
}: {
  children: ReactNode;
  more: ReactNode;
  /** "Show all 10 films that missed" */
  label: string;
  rest?: string;
}) {
  const [all, setAll] = useState(false);
  const revealed = useRef(false);
  const extra = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (all && revealed.current) {
      revealed.current = false;
      extra.current?.querySelector<HTMLElement>("h3 a, h2 a")?.focus();
    }
  }, [all]);
  return (
    <div>
      {children}
      {all ? (
        <div ref={extra} data-revealed>
          {more}
        </div>
      ) : (
        <ShowAllButton
          label={label}
          rest={rest}
          onClick={() => {
            revealed.current = true;
            setAll(true);
          }}
        />
      )}
    </div>
  );
}

/** A Data table that shows `rows` and, under a "Show all" button, `allRows` (the same rows with the rest of each group). */
export function RevealTable({
  columns,
  rows,
  allRows,
  label,
  caption,
}: {
  columns: DataColumn[];
  rows: DataRow[];
  allRows: DataRow[];
  label: string;
  caption: string;
}) {
  const [all, setAll] = useState(false);
  const revealed = useRef(false);
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (all && revealed.current) {
      revealed.current = false;
      const shown = new Set(rows.map((r) => r.key));
      const first = allRows.findIndex((r) => !shown.has(r.key));
      frame.current?.querySelectorAll("tbody tr")[first]?.querySelector<HTMLElement>("a")?.focus();
    }
  }, [all, rows, allRows]);
  return (
    <div ref={frame}>
      <DataTable columns={columns} rows={all ? allRows : rows} caption={caption} />
      {allRows.length > rows.length && !all ? (
        <ShowAllButton
          label={label}
          className="border-t-0"
          onClick={() => {
            revealed.current = true;
            setAll(true);
          }}
        />
      ) : null}
    </div>
  );
}
