import { connection } from "next/server";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { PageHeader } from "@/components/page-header/PageHeader";
import { Segmented } from "@/components/segmented/Segmented";
import { RaceRowsSkeleton } from "@/components/skeleton/Skeleton";
import { TextLink } from "@/components/text-link/TextLink";
import { getAccuracy } from "@/data/accuracy";
import { getBacktest } from "@/data/backtest";
import { SHORTLIST_RULE_CATEGORIES, SHORTLIST_RULE_NOTE } from "@/lib/accuracy";
import { parseSort, seasonsSpan } from "@/lib/accuracy-page";
import { patternsHref } from "@/lib/patterns/page";
import { RACE_CATEGORIES, type RaceCategory } from "@/lib/race";
import { signalsHref } from "@/lib/signals";
import { LIVE_YEAR } from "@/lib/years";
import { AccuracyTable } from "./AccuracyTable";
import { Backtest } from "./Backtest";
import { Method } from "./Method";

type Query = Record<string, string | string[] | undefined>;

/**
 * Guide §8.5 Accuracy (`/accuracy/[category]`): PageHeader, the category control with the link to
 * the method, then the table of every award's figures for that Oscar category, grouped and
 * sortable, with the years counted and the footnote on "–", then the Backtest (every finished
 * season's favourite) and the method in plain words (`#method`). The sort is in the address
 * (`?sort=win&dir=desc`).
 */
export function AccuracyPage({ category, query }: { category: RaceCategory; query: Promise<Query> }) {
  const oscar = RACE_CATEGORIES.find((c) => c.slug === category)!.oscar;
  return (
    <>
      <PageHeader
        title={`Accuracy: ${oscar}`}
        sub={
          <Suspense fallback={<p>How often each award&apos;s results matched the Oscars.</p>}>
            <Sub category={category} />
          </Suspense>
        }
      />
      <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 md:mt-7">
        <Segmented
          label="Category"
          items={RACE_CATEGORIES.map((c) => ({ label: c.name, href: `/accuracy/${c.slug}`, current: c.slug === category }))}
        />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-small">
          <TextLink href={signalsHref(LIVE_YEAR, category)}>Strong signals, {LIVE_YEAR}</TextLink>
          {category === "documentary" || category === "international" ? (
            <TextLink href={patternsHref(LIVE_YEAR, category)}>Nomination patterns, {LIVE_YEAR}</TextLink>
          ) : null}
          <TextLink href={`/accuracy/${category}#method`}>How the % chance works</TextLink>
        </div>
      </div>
      <Suspense fallback={<RaceRowsSkeleton label="Loading accuracy" />}>
        <Table category={category} oscar={oscar} query={query} />
      </Suspense>
      <Suspense fallback={<RaceRowsSkeleton label="Loading the backtest" />}>
        <BacktestSection category={category} oscar={oscar} />
      </Suspense>
      <Method />
    </>
  );
}

async function Sub({ category }: { category: RaceCategory }) {
  // Wait for the request, so `next build` never reads the database.
  await connection();
  const { seasons } = await getAccuracy(category, new Date().toISOString().slice(0, 10));
  return <p>How often each award&apos;s results matched the Oscars, {seasonsSpan(seasons)}.</p>;
}

async function BacktestSection({ category, oscar }: { category: RaceCategory; oscar: string }) {
  await connection();
  const { seasons } = await getAccuracy(category, new Date().toISOString().slice(0, 10));
  return <Backtest backtest={await getBacktest(category, seasons)} oscar={oscar} />;
}

async function Table({ category, oscar, query }: { category: RaceCategory; oscar: string; query: Promise<Query> }) {
  await connection();
  const [{ rows: all }, params] = await Promise.all([
    getAccuracy(category, new Date().toISOString().slice(0, 10)),
    query,
  ]);
  // A critics group with no finished season of results would read "– – – 0": it is left out and
  // counted in the footnote (`/data` shows which groups have no data).
  const rows = all.filter((r) => r.kind !== "critics" || r.years > 0);
  const noData = new Set(all.filter((r) => r.kind === "critics" && r.years === 0).map((r) => r.award)).size;
  if (rows.length === 0) {
    return (
      <EmptyState title="No awards to compare yet" className="mt-10 md:mt-12">
        No award is loaded for {oscar} yet.
      </EmptyState>
    );
  }
  const hasDash = rows.some((r) => r.nominees === null || r.win?.count === 0);
  return (
    <section aria-label="Accuracy by award" className="mt-10 md:mt-12">
      <AccuracyTable
        // The sort lives in the address; a new category, or a link to another sort (the nav's
        // Accuracy), starts from the address's sort.
        key={`${category}:${params.sort ?? ""}:${params.dir ?? ""}`}
        rows={rows}
        initialSort={parseSort(params.sort, params.dir)}
        caption={`How well each award foretells ${oscar}`}
        oscar={oscar}
      />
      <footer className="mt-4 space-y-1.5 text-caption text-ink-muted">
        {hasDash ? (
          <p>
            &ldquo;–&rdquo; means the figure doesn&apos;t apply: awards that announce winners only, or whose nominees aren&apos;t known, have no nominees figures, and a list such
            as AFI&apos;s has no winner.
          </p>
        ) : null}
        {noData > 0 ? (
          <p>
            {noData} critics {noData === 1 ? "group has" : "groups have"} no {oscar} results for a finished season yet, so{" "}
            {noData === 1 ? "it isn't" : "they aren't"} listed. <TextLink href="/data">Data and sources</TextLink> shows what
            each award has.
          </p>
        ) : null}
        <p>
          Years counts the finished seasons in which the award has results for {oscar}. A film counts by the furthest it went at the
          Oscars, in any year. Oscar nominees it caught counts the Oscar nominees of the years the award named its nominees, and how
          many of them it had nominated.
        </p>
        {SHORTLIST_RULE_CATEGORIES.has(category) ? (
          <p>
            {SHORTLIST_RULE_NOTE} A winner or nominee that didn&apos;t make that season&apos;s shortlist (for a festival, that
            season&apos;s or the next) is left out of the first three figures, and a year whose winners all missed it isn&apos;t
            counted for the winner figures. Oscar nominees it caught counts every Oscar nominee as before.
          </p>
        ) : null}
      </footer>
    </section>
  );
}
