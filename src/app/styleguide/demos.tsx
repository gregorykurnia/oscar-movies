"use client";

import { useState } from "react";
import { DataFigure, DataName, DataTable, type DataColumn, type DataRow, type DataSort } from "@/components/data-table/DataTable";
import { Toast, type ToastProps } from "@/components/toast/Toast";

// The two pieces that need handlers. A server page can't pass functions, so they live here.

/** A toast drawn in place (the Toaster only places it, bottom right). The buttons do nothing. */
export function ToastDemo(props: Omit<ToastProps, "onRetry" | "onClose"> & { retry?: boolean; close?: boolean }) {
  const { retry, close, ...rest } = props;
  return <Toast {...rest} onRetry={retry ? () => {} : undefined} onClose={close ? () => {} : undefined} />;
}

const COLUMNS: DataColumn[] = [
  { key: "award", label: "Award", sortable: true },
  { key: "won", label: "Won the Oscar", sortable: true },
  { key: "nominated", label: "Nominated", sortable: true },
  { key: "years", label: "Years", hidePhone: true },
];

type Entry = { key: string; award: string; won: number | null; nominated: number | null; years: number; group: string };

/** Same figures, one row per award, the group rows a table has when it holds sections. */
export function SortableTableDemo({ awardName, huge }: { awardName: string; huge: boolean }) {
  const [sort, setSort] = useState<DataSort>({ key: "won", direction: "descending" });
  const entries: Entry[] = [
    { key: "pga", award: "PGA", won: 79, nominated: 100, years: 14, group: "Major awards" },
    { key: "dga", award: "DGA", won: 71, nominated: 93, years: 14, group: "Major awards" },
    { key: "actor", award: awardName, won: 50, nominated: 79, years: 14, group: "Major awards" },
    { key: "tiff", award: "Toronto, People's Choice", won: 36, nominated: null, years: huge ? 1204 : 14, group: "Festivals" },
    { key: "gotham", award: "Gotham", won: 21, nominated: 64, years: 12, group: "Critics groups" },
  ];
  const dir = sort.direction === "descending" ? -1 : 1;
  const value = (e: Entry) => (sort.key === "award" ? e.award : (e[sort.key as "won" | "nominated"] ?? -1));
  const sorted = [...entries].sort((a, b) => {
    const [x, y] = [value(a), value(b)];
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  });
  const rows: DataRow[] = [];
  for (const group of ["Major awards", "Festivals", "Critics groups"]) {
    const inGroup = sorted.filter((e) => e.group === group);
    if (inGroup.length === 0) continue;
    rows.push({ type: "group", key: group, label: group });
    for (const e of inGroup) {
      rows.push({
        key: e.key,
        cells: [
          <DataName key="a" name={e.award} note={e.group === "Major awards" ? "Best Picture" : undefined} />,
          <DataFigure key="w" pct={e.won} count={`${Math.round(((e.won ?? 0) * 14) / 100)} of 14`} meter={sort.key === "won"} />,
          <DataFigure key="n" pct={e.nominated} reason="Festivals give prizes only" />,
          e.years.toLocaleString("en-US"),
        ],
      });
    }
  }
  return <DataTable caption="Accuracy by award" columns={COLUMNS} rows={rows} sort={sort} onSort={setSort} />;
}
