import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Flags } from "@/components/flag/Flag";
import { FilmLabelledMarks } from "@/components/marks/MarksProvider";
import { PageHeader } from "@/components/page-header/PageHeader";
import { ScoreTiles } from "@/components/score-tiles/ScoreTiles";
import { Skeleton, SkeletonRegion } from "@/components/skeleton/Skeleton";
import { StagePill } from "@/components/stage-pill/StagePill";
import { getMovie, type MovieData, type OscarBox } from "@/data/movie";
import { cn } from "@/lib/cn";
import { movieFacts, oscarBoxNote, oscarsHeading, shownOriginalTitle } from "@/lib/movie";
import { RACE_CATEGORIES } from "@/lib/race";
import { oscarStage } from "@/lib/stage";
import { editionLabel } from "@/lib/years";

const CATEGORY_NAMES = Object.fromEntries(RACE_CATEGORIES.map((c) => [c.slug, c.oscar]));

/**
 * Guide §8.6 Movie page (`/movies/[slug]`): back link (the browser's Back when the visit came
 * from this app), title, a sub line with large flags, original title, year, countries and
 * language, the labelled marks, the score tiles and the Oscar result boxes. The Awards sections
 * and festival screenings arrive with Phase 2 and 5.
 */
export function MoviePage({ slug }: { slug: string }) {
  return (
    <Suspense fallback={<MovieSkeleton />}>
      <Movie slug={slug} />
    </Suspense>
  );
}

async function Movie({ slug }: { slug: string }) {
  // Wait for the request, so `next build` never reads the database.
  await connection();
  const film = await getMovie(slug);
  if (!film) notFound();
  const original = shownOriginalTitle(film.title, film.originalTitle);
  return (
    <>
      <PageHeader
        back={{ label: "Back", href: "/", history: true }}
        title={film.title}
        sub={
          <>
            {film.countries.length > 0 ? <Flags codes={film.countries} size="lg" /> : null}
            {original ? (
              <span lang={film.originalLang ?? undefined} className="[overflow-wrap:anywhere]">
                {original}
              </span>
            ) : null}
            <span>{movieFacts(film)}</span>
          </>
        }
      />
      <FilmLabelledMarks movieId={film.id} title={film.title} className="mt-6 flex flex-wrap gap-2" />
      <ScoreTiles scores={film.scores} className="mt-7 md:mt-10" />
      <OscarSection film={film} />
    </>
  );
}

function OscarSection({ film }: { film: MovieData }) {
  const heading = oscarsHeading(film.oscars);
  const manyEditions = film.oscars.length > 0 && heading === null;
  return (
    <section aria-labelledby="oscars-h" className="mt-10 md:mt-14">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="oscars-h" className="text-section-phone leading-tight font-medium tracking-heading [overflow-wrap:anywhere] md:text-section">
          Oscars
        </h2>
        {heading ? <span className="text-small text-ink-muted">{heading}</span> : null}
      </div>
      {film.oscars.length > 0 ? (
        <ul className="flex flex-wrap gap-3">
          {film.oscars.map((box) => (
            <OscarResult key={`${box.year}-${box.category}`} box={box} showEdition={manyEditions} />
          ))}
        </ul>
      ) : (
        <p className="text-small text-ink-muted">No Oscar result for this film yet.</p>
      )}
    </section>
  );
}

function OscarResult({ box, showEdition }: { box: OscarBox; showEdition: boolean }) {
  const note = oscarBoxNote(box);
  return (
    <li
      data-outcome={box.outcome}
      className={cn(
        "flex min-w-[min(100%,260px)] flex-1 basis-[260px] items-center justify-between gap-3 rounded-md border px-[18px] py-4",
        box.outcome === "won" ? "border-transparent bg-gold-wash" : "border-line bg-surface",
      )}
    >
      <div className="min-w-0 font-medium">
        {CATEGORY_NAMES[box.category]}
        <span className="block text-caption font-normal text-ink-muted">
          {showEdition ? `${editionLabel(box.year)} · ${note}` : note}
        </span>
      </div>
      <StagePill stage={oscarStage(box.outcome, box.category)} />
    </li>
  );
}

function MovieSkeleton() {
  return (
    <SkeletonRegion label="Loading the film">
      <Skeleton className="h-9 w-3/5" />
      <Skeleton className="mt-4 h-4 w-2/5" />
      <Skeleton className="mt-6 h-10 w-64 rounded-pill" />
      <Skeleton className="mt-10 h-28 w-full rounded-lg" />
    </SkeletonRegion>
  );
}
