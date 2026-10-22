import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { buttonClasses } from "@/components/button/Button";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { FilmList, FilmRow } from "@/components/film-row/FilmRow";
import { FilmMarks } from "@/components/marks/MarksProvider";
import { PageHeader } from "@/components/page-header/PageHeader";
import { Segmented } from "@/components/segmented/Segmented";
import { RaceRowsSkeleton } from "@/components/skeleton/Skeleton";
import { StagePill } from "@/components/stage-pill/StagePill";
import { getWatchList, type StagedFilm } from "@/data/watch-list";
import { outcomeStage } from "@/lib/stage";
import {
  parseWatchQuery,
  SEASON_LIMIT,
  sortWatchList,
  WATCH_SORT_LABELS,
  WATCH_SORTS,
  watchHref,
  type WatchQuery,
} from "@/lib/watch-list";
import { LIVE_YEAR } from "@/lib/years";

type Query = Record<string, string | string[] | undefined>;

// Film · Oscar stage · nominations · marks.
const COLUMNS = ["minmax(0,1fr)", "132px", "104px", "84px"];

const filmCount = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "film" : "films"}`;

/**
 * Guide §8.3 film list for the Watch list (`/watch-list`): PageHeader, a toolbar with the sort as a
 * segmented control, then "Want to watch" (every film marked, any year) and "Not watched yet, <year>
 * season" (the live season's films with no mark). The sort is in the address. The lists are read
 * when the page is visited and never change under a tap: unmarking a film leaves its row where
 * it is (the mark just shows off), and the film is gone on the next visit.
 */
export function WatchListPage({ query }: { query: Promise<Query> }) {
  return (
    <>
      <PageHeader
        title="Watch list"
        sub={<p>Films you want to watch, then the {LIVE_YEAR} season&apos;s contenders you haven&apos;t seen.</p>}
      />
      <Suspense fallback={<RaceRowsSkeleton label="Loading the watch list" />}>
        <Lists query={query} />
      </Suspense>
    </>
  );
}

async function Lists({ query }: { query: Promise<Query> }) {
  // Wait for the request: the address and the marks are read per visit.
  await connection();
  const [list, params] = await Promise.all([getWatchList(LIVE_YEAR), query]);
  const state = parseWatchQuery(params);
  const want = sortWatchList(list.want, state.sort);
  const unwatched = sortWatchList(list.unwatched, state.sort);
  const shown = state.all ? unwatched : unwatched.slice(0, SEASON_LIMIT);

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 md:mt-7">
        <div className="flex min-w-0 max-w-full items-center gap-3">
          <span className="flex-none text-caption text-ink-muted">Sort by</span>
          <Segmented
            label="Sort by"
            className="min-w-0"
            items={WATCH_SORTS.map((sort) => ({
              label: WATCH_SORT_LABELS[sort],
              href: watchHref({ ...state, sort }),
              current: sort === state.sort,
            }))}
          />
        </div>
      </div>

      <Section id="want" title="Want to watch" count={want.length}>
        {want.length > 0 ? (
          <Films films={want} />
        ) : (
          <EmptyState title="Nothing marked yet" headingLevel={3}>
            Tap the bookmark on any film to put it here.
          </EmptyState>
        )}
      </Section>

      <Section id="season" title={`Not watched yet, ${LIVE_YEAR} season`} count={unwatched.length}>
        {unwatched.length > 0 ? (
          <>
            <Films films={shown} />
            {unwatched.length > shown.length ? <ShowAll total={unwatched.length} state={state} /> : null}
          </>
        ) : (
          <EmptyState title="Nothing left to watch" headingLevel={3}>
            Every film of the {LIVE_YEAR} season is watched or on your list, or its results aren&apos;t loaded yet.
          </EmptyState>
        )}
      </Section>
    </>
  );
}

function Section({ id, title, count, children }: { id: string; title: string; count: number; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-h`} className="mt-10 md:mt-12">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`${id}-h`} className="text-title-phone font-semibold tracking-title [overflow-wrap:anywhere] md:text-title">
          {title}
        </h2>
        <span className="text-small text-ink-muted">{filmCount(count)}</span>
      </div>
      {children}
    </section>
  );
}

function Films({ films }: { films: StagedFilm[] }) {
  return (
    <FilmList head={["Oscar stage", "Nominations"]} columns={COLUMNS}>
      {films.map(({ film, stage, nominations, flags }) => (
        <FilmRow
          key={film.id}
          headingLevel={3}
          title={film.title}
          href={`/movies/${film.slug}`}
          flags={flags}
          meta={film.year}
          scores={film.scores}
          winner={stage === "won"}
          results={[
            {
              label: "Oscar stage",
              value: stage ? <StagePill stage={outcomeStage(stage)} /> : <span className="text-ink-muted">No Oscar result</span>,
            },
            { label: "Nominations", value: nominations, numeric: true },
          ]}
          marks={<FilmMarks movieId={film.id} title={film.title} />}
        />
      ))}
    </FilmList>
  );
}

function ShowAll({ total, state }: { total: number; state: WatchQuery }) {
  return (
    <div className="mt-5 flex justify-center">
      <Link href={watchHref({ ...state, all: true })} scroll={false} className={buttonClasses()}>
        Show all {total.toLocaleString("en-US")} films
      </Link>
    </div>
  );
}
