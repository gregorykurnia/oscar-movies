import { connection } from "next/server";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { FilmList, FilmRow } from "@/components/film-row/FilmRow";
import { FilmMarks } from "@/components/marks/MarksProvider";
import { PageHeader } from "@/components/page-header/PageHeader";
import { Segmented } from "@/components/segmented/Segmented";
import { ShowAllRow } from "@/components/show-all/ShowAllRow";
import { RaceRowsSkeleton } from "@/components/skeleton/Skeleton";
import { StagePill } from "@/components/stage-pill/StagePill";
import { formatChance } from "@/lib/race-chances";
import { getUsedPlatforms, getWatchList, type StagedFilm, type WantedFilm } from "@/data/watch-list";
import {
  parseWatchQuery,
  SEASON_LIMIT,
  sortWanted,
  sortWatchList,
  todayInJakarta,
  WATCH_SORT_LABELS,
  WATCH_SORTS,
  watchHref,
  type WatchQuery,
} from "@/lib/watch-list";
import { LIVE_YEAR } from "@/lib/years";
import { AddFilm } from "./AddFilm";
import { ReleaseEditor } from "./ReleaseEditor";
import { DragHandle, SortableWantList } from "./SortableWantList";

type Query = Record<string, string | string[] | undefined>;

// Film · Oscar stage · nominations · marks; sorted by % chance, a "To win" column joins after the stage.
const COLUMNS = ["minmax(0,1fr)", "132px", "104px", "84px"];
const CHANCE_COLUMNS = ["minmax(0,1fr)", "132px", "88px", "104px", "84px"];
// My order's Want to watch: the drag handle first (guide §8.3).
const HANDLE_COLUMNS = ["28px", ...COLUMNS];

// The "Show all" row's tail ("sorted by Oscar stage"); Oscar keeps its capital.
const SORTED_BY: Record<WatchQuery["sort"], string> = { mine: "Oscar stage", stage: "Oscar stage", chance: "% chance", nominations: "nominations", average: "average score" };

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
        sub={<p>Films you want to watch, in your order, then the {LIVE_YEAR} season&apos;s contenders you haven&apos;t seen.</p>}
      />
      <AddFilm />
      <Suspense fallback={<RaceRowsSkeleton label="Loading the watch list" />}>
        <Lists query={query} />
      </Suspense>
    </>
  );
}

async function Lists({ query }: { query: Promise<Query> }) {
  // Wait for the request: the address and the marks are read per visit.
  await connection();
  const [list, platforms, params] = await Promise.all([getWatchList(LIVE_YEAR), getUsedPlatforms(), query]);
  // The release lines read "Out" from today's date in Indonesia; the editor offers the platforms used before.
  const release = { today: todayInJakarta(), platforms };
  const state = parseWatchQuery(params);
  const want = sortWanted(list.want, state.sort);
  const unwatched = sortWatchList(list.unwatched, state.sort);
  const shown = state.all ? unwatched : unwatched.slice(0, SEASON_LIMIT);
  const mine = state.sort === "mine";

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

      <Section id="want" title="Want to watch" count={want.length} hint={mine && want.length > 1 ? "drag the handle to reorder" : undefined}>
        {want.length > 0 && mine ? (
          // Keyed by the films, so a list read again (a film added) starts from the stored order.
          <SortableWantList
            key={want.map((f) => f.film.id).join(",")}
            films={want.map((f) => ({ id: f.film.id, title: f.film.title, row: <Row film={f} sort={state.sort} handle release={release} /> }))}
            head={head(state.sort)}
            columns={HANDLE_COLUMNS}
          />
        ) : want.length > 0 ? (
          <Films films={want} sort={state.sort} release={release} />
        ) : (
          <EmptyState title="Nothing marked yet" headingLevel={3}>
            Tap the bookmark on any film to put it here.
          </EmptyState>
        )}
      </Section>

      <Section
        id="season"
        title={`Not watched yet, ${LIVE_YEAR} season`}
        count={unwatched.length}
        hint={mine && unwatched.length > 1 ? "by Oscar stage" : undefined}
      >
        {unwatched.length > 0 ? (
          <>
            <Films films={shown} sort={state.sort} />
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

function Section({
  id,
  title,
  count,
  hint,
  children,
}: {
  id: string;
  title: string;
  count: number;
  /** After the count: how the section is ordered under My order. */
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-h`} className="mt-10 md:mt-12">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`${id}-h`} className="text-section-phone leading-tight font-medium tracking-heading [overflow-wrap:anywhere] md:text-section">
          {title}
        </h2>
        <span className="text-small text-ink-muted">
          <span>{filmCount(count)}</span>
          {hint ? ` · ${hint}` : null}
        </span>
      </div>
      {children}
    </section>
  );
}

const head = (sort: WatchQuery["sort"]) => [
  "Oscar stage",
  ...(sort === "chance" ? [{ label: "To win", numeric: true as const }] : []),
  { label: "Nominations", numeric: true as const },
];

function Films({ films, sort, release }: { films: StagedFilm[]; sort: WatchQuery["sort"]; release?: ReleaseContext }) {
  return (
    <FilmList head={head(sort)} columns={sort === "chance" ? CHANCE_COLUMNS : COLUMNS}>
      {films.map((film) => (
        <Row key={film.film.id} film={film} sort={sort} release={release} />
      ))}
    </FilmList>
  );
}

type ReleaseContext = { today: string; platforms: string[] };

function Row({
  film: staged,
  sort,
  handle = false,
  release,
}: {
  film: StagedFilm | WantedFilm;
  sort: WatchQuery["sort"];
  /** My order's Want to watch: the row starts with its drag handle. */
  handle?: boolean;
  /** Want to watch rows only: the release line and its editor. */
  release?: ReleaseContext;
}) {
  const { film, stage, pill, categories, nominations, chance } = staged;
  return (
    <FilmRow
      headingLevel={3}
      title={film.title}
      href={`/movies/${film.slug}`}
      handle={handle ? <DragHandle /> : undefined}
      flag={film.flag}
      meta={[film.year, ...(categories.length > 0 ? [categories.join(", ")] : [])].join(" · ")}
      scores={film.scores}
      note={
        release && "releaseOn" in staged ? (
          <ReleaseEditor
            movieId={film.id}
            title={film.title}
            releaseOn={staged.releaseOn}
            platform={staged.platform}
            today={release.today}
            usedPlatforms={release.platforms}
          />
        ) : undefined
      }
      winner={stage === "won"}
      results={[
        {
          label: "Oscar stage",
          value: pill ? <StagePill stage={pill} /> : <span className="text-ink-muted">No Oscar result</span>,
        },
        ...(sort === "chance"
          ? [{ label: "To win", value: chance === null ? <span className="text-ink-muted">–</span> : `${formatChance(chance)}%`, numeric: true }]
          : []),
        { label: "Nominations", value: nominations, numeric: true },
      ]}
      marks={<FilmMarks movieId={film.id} title={film.title} />}
    />
  );
}

function ShowAll({ total, state }: { total: number; state: WatchQuery }) {
  return (
    <ShowAllRow
      href={watchHref({ ...state, all: true })}
      scroll={false}
      label={`Show all ${filmCount(total)}`}
      rest={`sorted by ${SORTED_BY[state.sort]}`}
    />
  );
}
