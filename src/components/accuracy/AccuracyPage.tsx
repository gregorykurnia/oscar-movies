import { connection } from "next/server";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { PageHeader } from "@/components/page-header/PageHeader";
import { Segmented } from "@/components/segmented/Segmented";
import { RaceRowsSkeleton } from "@/components/skeleton/Skeleton";
import { TextLink } from "@/components/text-link/TextLink";
import { getAccuracy } from "@/data/accuracy";
import { parseSort, seasonsSpan } from "@/lib/accuracy-page";
import { RACE_CATEGORIES, type RaceCategory } from "@/lib/race";
import { AccuracyTable } from "./AccuracyTable";

type Query = Record<string, string | string[] | undefined>;

/**
 * Guide §8.5 Accuracy (`/accuracy/[category]`): PageHeader, the category control with the link to
 * the method, then the table of every award's figures for that Oscar category, grouped and
 * sortable, with the years counted and the footnote on "–". The backtest and the method come with
 * the predictions (task 3.4). The sort is in the address (`?sort=win&dir=desc`).
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
        <TextLink href={`/accuracy/${category}#method`} className="text-small">
          How the % chance works
        </TextLink>
      </div>
      <Suspense fallback={<RaceRowsSkeleton label="Loading accuracy" />}>
        <Table category={category} oscar={oscar} query={query} />
      </Suspense>
    </>
  );
}

async function Sub({ category }: { category: RaceCategory }) {
  // Wait for the request, so `next build` never reads the database.
  await connection();
  const { seasons } = await getAccuracy(category, new Date().toISOString().slice(0, 10));
  return <p>How often each award&apos;s results matched the Oscars, {seasonsSpan(seasons)}.</p>;
}

async function Table({ category, oscar, query }: { category: RaceCategory; oscar: string; query: Promise<Query> }) {
  await connection();
  const [{ rows }, params] = await Promise.all([
    getAccuracy(category, new Date().toISOString().slice(0, 10)),
    query,
  ]);
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
        // The sort lives in the address; a new category starts from the default.
        key={category}
        rows={rows}
        initialSort={parseSort(params.sort, params.dir)}
        caption={`How well each award foretells ${oscar}`}
      />
      <footer className="mt-4 space-y-1.5 text-caption text-ink-muted">
        {hasDash ? (
          <p>
            &ldquo;–&rdquo; means the figure doesn&apos;t apply: awards that announce winners only have no nominees, and a list such
            as AFI&apos;s has no winner.
          </p>
        ) : null}
        <p>
          Years counts the finished seasons in which the award has results for {oscar}. A film counts by the furthest it went at the
          Oscars, in any year.
        </p>
      </footer>
    </section>
  );
}
