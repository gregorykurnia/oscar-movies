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
  { key: "status", label: "Status", alignLeft: true },
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
    out.push({ type: "group", key: `group-${group.kind}`, label: group.label });
    for (const row of own) {
      out.push({
        key: row.slug,
        cells: [
          row.name,
          <CoverageStrip key="strip" cells={row.cells} label={`${row.name}: ${row.loaded} of ${row.cells.length} years loaded`} />,
          <span key="status" className="text-ink-muted">
            {row.status}
          </span>,
        ],
      });
    }
  }
  return out;
}
