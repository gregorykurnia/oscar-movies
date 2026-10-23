import Link from "next/link";
import { DataTable, type DataColumn, type DataRow } from "@/components/data-table/DataTable";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { Flags } from "@/components/flag/Flag";
import { StagePill } from "@/components/stage-pill/StagePill";
import { StatsStrip } from "@/components/stats-strip/StatsStrip";
import { DASH } from "@/lib/format";
import { lostTo, noisePoints, type Backtest as BacktestData } from "@/lib/backtest";
import { SectionHeading } from "./SectionHeading";

const COLUMNS: DataColumn[] = [
  { key: "season", label: "Season" },
  { key: "favourite", label: "Favourite", alignLeft: true },
  { key: "chance", label: "Chance" },
  { key: "result", label: "Result" },
];

const pct = (hits: number, count: number) => (count === 0 ? 0 : Math.round((hits / count) * 100));

/**
 * Guide §8.5 Backtest: a stats strip (the favourite's record, the nominees found in the top slots on
 * the eve of the nominations, the noise a short history makes normal), then one row per finished
 * season, newest first: the eve-of-ceremony favourite, its chance, and "Won" or "Lost to <film>".
 */
export function Backtest({ backtest, oscar }: { backtest: BacktestData; oscar: string }) {
  const { rows, favouriteWon, nominees } = backtest;
  if (rows.length === 0) {
    return (
      <section id="backtest" aria-labelledby="backtest-h" className="mt-12 scroll-mt-20 md:mt-16">
        <SectionHeading id="backtest-h" title="Backtest" />
        <EmptyState title="No finished seasons yet" headingLevel={3}>
          The backtest starts once a season&apos;s ceremony has passed.
        </EmptyState>
      </section>
    );
  }
  const noise = noisePoints(favouriteWon.count);
  const seasons = favouriteWon.count === 1 ? "season" : "seasons";

  const tableRows: DataRow[] = rows.map((row) => ({
    key: String(row.year),
    cells: [
      row.year,
      row.favourite ? (
        <span key="film" className="inline-flex items-center gap-2.5 text-left">
          <Flags codes={row.favourite.film.flags} />
          <Link
            href={`/movies/${row.favourite.film.slug}`}
            className="underline decoration-line-strong decoration-1 underline-offset-[3px] outline-none hover:decoration-ink focus-visible:shadow-focus"
          >
            {row.favourite.film.title}
          </Link>
        </span>
      ) : (
        <span key="film" className="text-ink-muted" title="No prediction is stored for this season">
          {DASH}
        </span>
      ),
      row.favourite ? <b key="chance" className="font-medium">{Math.round(row.favourite.pWin * 100)}%</b> : <span className="text-ink-muted">{DASH}</span>,
      row.result?.kind === "won" ? (
        <StagePill key="result" stage="won" />
      ) : row.result ? (
        <span key="result" className="text-ink-muted">{lostTo(row.result.to)}</span>
      ) : (
        <span key="result" className="text-ink-muted">{DASH}</span>
      ),
    ],
  }));

  return (
    <section id="backtest" aria-labelledby="backtest-h" className="mt-12 scroll-mt-20 md:mt-16">
      <SectionHeading id="backtest-h" title="Backtest" note="The app's favourite on the eve of each ceremony" />
      <StatsStrip
        stats={[
          {
            value: `${pct(favouriteWon.hits, favouriteWon.count)}%`,
            of: `${favouriteWon.hits} of ${favouriteWon.count}`,
            label: `Favourite won ${oscar}`,
            meter: pct(favouriteWon.hits, favouriteWon.count),
          },
          {
            value: `${pct(nominees.hits, nominees.count)}%`,
            of: `${nominees.hits} of ${nominees.count}`,
            label: "Nominees in the top slots, eve of nominations",
            meter: pct(nominees.hits, nominees.count),
          },
          {
            value: noise === null ? DASH : `±${noise}`,
            of: noise === null ? undefined : "points",
            label: `Normal noise with ${favouriteWon.count} ${seasons} of history`,
          },
        ]}
      />
      <div className="mt-6">
        <DataTable caption={`The app's eve-of-ceremony favourite for ${oscar}, by season`} columns={COLUMNS} rows={tableRows} />
      </div>
    </section>
  );
}
