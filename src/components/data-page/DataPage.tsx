import { connection } from "next/server";
import { Suspense } from "react";
import { DataTable, type DataColumn, type DataRow } from "@/components/data-table/DataTable";
import { Notice } from "@/components/notice/Notice";
import { PageHeader } from "@/components/page-header/PageHeader";
import { RaceRowsSkeleton } from "@/components/skeleton/Skeleton";
import { StatsStrip } from "@/components/stats-strip/StatsStrip";
import { getCoverage } from "@/data/coverage";
import { AWARDS } from "@/lib/awards";
import {
  awardYearsLoaded,
  COVERAGE_GROUPS,
  coverageRows,
  refreshedLabel,
  scoresNotice,
  type CoverageRow,
} from "@/lib/coverage";
import { formatCount } from "@/lib/format";
import { LIVE_YEAR, OLDEST_YEAR, yearRange } from "@/lib/years";
import { CoverageLegend, CoverageStrip } from "./CoverageStrip";
import { Sources } from "./Sources";

// Oldest to newest, left to right.
const YEARS = yearRange(LIVE_YEAR, OLDEST_YEAR).reverse();

const COLUMNS: DataColumn[] = [
  { key: "award", label: "Award" },
  { key: "years", label: `${YEARS[0]} to ${YEARS[YEARS.length - 1]}`, alignLeft: true },
  // On phone the status goes under the award's name, so the strip has the room and nothing scrolls.
  { key: "status", label: "Status", alignLeft: true, hidePhone: true },
];

/**
 * Guide §8.9 Data and sources (`/data`): PageHeader, the scores notice when they are more than 3 days
 * old, the stats strip (award years loaded, films, scores last refreshed), the coverage table with a
 * strip per award and its legend, and the Sources cards. The page's own text is static; the figures
 * are read per request so the stale check uses the time of the visit.
 */
export function DataPage() {
  return (
    <>
      <PageHeader title="Data and sources" sub="What's loaded for each award and year, and where it comes from." />
      <Suspense fallback={<RaceRowsSkeleton label="Loading coverage" />}>
        <Coverage />
      </Suspense>
      <Sources />
    </>
  );
}

async function Coverage() {
  // Wait for the request: the stale check needs the time, and `next build` never reads the database.
  await connection();
  const data = await getCoverage();
  const now = new Date();
  const scoresAt = data.scoresAt ? new Date(data.scoresAt) : null;
  const rows = coverageRows(AWARDS, data.editions, YEARS, LIVE_YEAR);
  const { loaded, total } = awardYearsLoaded(rows);
  const notice = scoresNotice(scoresAt, now);

  return (
    <>
      {notice ? <Notice title={notice.title} className="mt-6 md:mt-8">{notice.body}</Notice> : null}
      <StatsStrip
        className="mt-10 md:mt-12"
        stats={[
          {
            value: formatCount(loaded),
            of: `of ${formatCount(total)}`,
            label: "Award years loaded",
            meter: total === 0 ? 0 : (loaded / total) * 100,
          },
          { value: formatCount(data.films), label: "Films" },
          {
            value: refreshedLabel(scoresAt, now),
            label: "Scores last refreshed",
            note: scoresAt ? `${formatCount(data.scoresFilms)} films checked that day` : undefined,
          },
        ]}
      />
      <section aria-label="Coverage by award" className="mt-10 md:mt-14">
        <DataTable caption="Which award years are loaded" columns={COLUMNS} rows={tableRows(rows)} />
        <CoverageLegend />
      </section>
    </>
  );
}

function tableRows(rows: CoverageRow[]): DataRow[] {
  const out: DataRow[] = [];
  for (const group of COVERAGE_GROUPS) {
    const own = rows.filter((r) => r.kind === group.kind);
    if (own.length === 0) continue;
    // A group of one row named like the group (the Academy Awards) needs no heading over it.
    if (!(own.length === 1 && own[0].name === group.label)) out.push({ type: "group", key: `group-${group.kind}`, label: group.label });
    for (const row of own) {
      out.push({
        key: row.slug,
        cells: [
          <span key="name">
            {row.name}
            <span className="mt-0.5 block text-micro text-ink-muted md:hidden">{row.status}</span>
          </span>,
          <CoverageStrip key="strip" cells={row.cells} label={stripLabel(row)} />,
          <span key="status" className="text-ink-muted">
            {row.status}
          </span>,
        ],
      });
    }
  }
  return out;
}

/** "BAFTA: 13 of 15 years loaded; partly loaded: 2025; no data: 2012; live season: 2026". */
function stripLabel(row: CoverageRow): string {
  const years = (kind: string) => row.cells.filter((c) => c.kind === kind).map((c) => c.year);
  const parts = [`${row.name}: ${row.loaded} of ${row.cells.length} years loaded`];
  for (const [kind, word] of [
    ["partial", "partly loaded"],
    ["none", "no data"],
    ["live", "live season"],
  ] as const) {
    const list = years(kind);
    if (list.length > 0) parts.push(`${word}: ${list.join(", ")}`);
  }
  return parts.join("; ");
}
