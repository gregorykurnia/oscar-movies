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
  // On phone the result goes under the favourite's title, so the table fits without scrolling.
  { key: "result", label: "Result", hidePhone: true },
];

const pct = (hits: number, count: number) => Math.round((hits / count) * 100);

/** A record of hits: "79%" "11 of 14" with a meter, or "–" when there is nothing to count (guide §11: missing is "–", never 0). */
const record = ({ hits, count }: { hits: number; count: number }) =>
  count === 0 ? { value: DASH } : { value: `${pct(hits, count)}%`, of: `${hits} of ${count}`, meter: pct(hits, count) };

const NO_PREDICTION = "No prediction stored for this season";

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

  const tableRows: DataRow[] = rows.map((row) => {
    const result =
      row.result?.kind === "won" ? (
        <StagePill stage="won" />
      ) : row.result ? (
        <span className="text-ink-muted">{lostTo(row.result.to)}</span>
      ) : (
        <Missing />
      );
    return {
      key: String(row.year),
      cells: [
        row.year,
        row.favourite ? (
          <span key="film" className="inline-flex items-center gap-2.5 text-left">
            <Flags codes={row.favourite.film.flags} className="max-md:hidden" />
            <span>
              <Link
                href={`/movies/${row.favourite.film.slug}`}
                className="underline decoration-line-strong decoration-1 underline-offset-[3px] outline-none hover:decoration-ink focus-visible:shadow-focus"
              >
                {row.favourite.film.title}
              </Link>
              {/* Phone: the result under the title (the Result column is left out). */}
              <span className="mt-1 block md:hidden">
                {result}
              </span>
            </span>
          </span>
        ) : (
          <Missing key="film" />
        ),
        row.favourite ? <b key="chance" className="font-medium">{Math.round(row.favourite.pWin * 100)}%</b> : <Missing key="chance" />,
        <span key="result">{result}</span>,
      ],
    };
  });

  return (
    <section id="backtest" aria-labelledby="backtest-h" className="mt-12 scroll-mt-20 md:mt-16">
      <SectionHeading id="backtest-h" title="Backtest" note="The app's favourite on the eve of each ceremony" />
      <StatsStrip
        stats={[
          { ...record(favouriteWon), label: `Favourite won ${oscar}` },
          { ...record(nominees), label: "Nominees in the top slots, eve of nominations" },
          {
            value: noise === null ? DASH : `±${noise}`,
            of: noise === null ? undefined : "points",
            label: favouriteWon.count === 0 ? "Normal noise, once seasons are counted" : `Normal noise with ${favouriteWon.count} ${seasons} of history`,
          },
        ]}
      />
      <div className="mt-6">
        <DataTable caption={`The app's eve-of-ceremony favourite for ${oscar}, by season`} columns={COLUMNS} rows={tableRows} />
      </div>
    </section>
  );
}

/** "–" with its reason for screen readers. */
function Missing() {
  return (
    <span className="text-ink-muted">
      <span aria-hidden="true">{DASH}</span>
      <span className="sr-only">{NO_PREDICTION}</span>
    </span>
  );
}
