import { Suspense } from "react";
import { PageHeader } from "@/components/page-header/PageHeader";
import { RaceFrame, parseCategory } from "@/components/race/RaceFrame";
import { RaceRowsSkeleton } from "@/components/skeleton/Skeleton";
import { countFilms } from "@/data/films";
import { LIVE_YEAR, editionLabel } from "@/lib/years";

// The race for the live season (guide §8.1). Placeholder until the data layer and chances
// arrive (1.6, 3.x): the frame and its "Nothing yet" state, with how many films are loaded.
export default function Home({ searchParams }: { searchParams: Promise<{ category?: string | string[] }> }) {
  return (
    <>
      <PageHeader title={`The ${LIVE_YEAR} race`} sub={`${editionLabel(LIVE_YEAR)}.`} />
      <Suspense fallback={<RaceRowsSkeleton />}>
        <Race searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Race({ searchParams }: { searchParams: Promise<{ category?: string | string[] }> }) {
  // The address first: it makes this part of the page wait for the request, so `next build` never
  // reads the database (production has no tables until its first migration, and Vercel builds `main`).
  const { category } = await searchParams;
  const filmCount = await countFilms();
  return <RaceFrame category={parseCategory(category)} filmCount={filmCount} />;
}
