"use client";

import { useState } from "react";
import { DataFigure, DataName, DataTable, type DataColumn, type DataRow, type DataSort } from "@/components/data-table/DataTable";
import {
  DEFAULT_SORT,
  figureCell,
  groupRows,
  sortQuery,
  type AccuracyRow,
  type SortKey,
  type SortState,
} from "@/lib/accuracy-page";

const COLUMNS: DataColumn[] = [
  { key: "award", label: "Award", sortable: true, firstDirection: "ascending" },
  { key: "win", label: "Winner won the Oscar", sortable: true },
  { key: "nomination", label: "Winner nominated", sortable: true },
  { key: "nominees", label: "Nominees nominated", sortable: true },
  { key: "years", label: "Years", sortable: true, hidePhone: true },
];

const NO_NOMINEES = "Not counted: the award announces winners only";
const NO_WINNER = "Not counted: the award names no winner";

function dashReason(row: AccuracyRow, key: "win" | "nomination" | "nominees"): string | undefined {
  if (key === "nominees") return row.nominees === null ? NO_NOMINEES : undefined;
  return row[key]?.count === 0 ? NO_WINNER : undefined;
}

/**
 * Guide §8.5's table: the rows grouped (Major awards, Festivals, Critics groups) and sorted in
 * each group by the head the visitor picks. The sort is kept in the address with
 * `history.replaceState`, so a reload or a shared link keeps it, without asking the server again.
 * The main sorted figure gets the mini meter.
 */
export function AccuracyTable({
  rows,
  initialSort = DEFAULT_SORT,
  caption,
}: {
  rows: AccuracyRow[];
  initialSort?: SortState;
  caption: string;
}) {
  const [sort, setSort] = useState<SortState>(initialSort);

  const onSort = (next: DataSort) => {
    const state: SortState = { key: next.key as SortKey, direction: next.direction };
    setSort(state);
    window.history.replaceState(null, "", `${window.location.pathname}${sortQuery(state)}${window.location.hash}`);
  };

  const meterKey = sort.key === "win" || sort.key === "nomination" || sort.key === "nominees" ? sort.key : "win";
  const tableRows: DataRow[] = groupRows(rows, sort).flatMap((group) => [
    { type: "group" as const, key: group.kind, label: group.label },
    ...group.rows.map((row) => {
      const figure = (key: "win" | "nomination" | "nominees") => {
        const { pct, count } = figureCell(row[key]);
        return <DataFigure pct={pct} count={count} meter={key === meterKey} reason={dashReason(row, key)} />;
      };
      return {
        key: row.key,
        cells: [
          <DataName key="award" name={row.award} note={row.note} />,
          figure("win"),
          figure("nomination"),
          figure("nominees"),
          row.years,
        ],
      };
    }),
  ]);

  return <DataTable caption={caption} columns={COLUMNS} rows={tableRows} sort={sort} onSort={onSort} />;
}
