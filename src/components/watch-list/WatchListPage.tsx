import { connection } from "next/server";
import { Suspense } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { buttonClasses } from "@/components/button/Button";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { FilmList, FilmRow } from "@/components/film-row/FilmRow";
import { FilmMarks } from "@/components/marks/MarksProvider";
import { PageHeader } from "@/components/page-header/PageHeader";
import { Segmented } from "@/components/segmented/Segmented";
import { ShowAllRow } from "@/components/show-all/ShowAllRow";
import { RaceRowsSkeleton } from "@/components/skeleton/Skeleton";
import { StagePill } from "@/components/stage-pill/StagePill";
import { TextLink } from "@/components/text-link/TextLink";
import { formatChance } from "@/lib/race-chances";
import { getUsedPlatforms, getWantedPlatforms, getWatchList, type StagedFilm, type WantedFilm } from "@/data/watch-list";
import {
  parseWatchQuery,
  clearWatchFilters,
  filterWanted,
  hasWatchFilters,
  noWatchMatches,
  RELEASE_FILTERS,
  RELEASE_FILTER_LABELS,
  SEASON_LIMIT,
  sortWanted,
  sortWatchList,
  todayInJakarta,
  WATCH_SORT_LABELS,
  WATCH_SORTS,
  watchHref,
  watchPlatforms,
  wantedCount,
  type WatchQuery,
} from "@/lib/watch-list";
import { LIVE_YEAR } from "@/lib/years";
import { AddFilm } from "./AddFilm";
import { ReleaseEditor } from "./ReleaseEditor";
import { DragHandle, SortableWantList } from "./SortableWantList";
import { FilterMenu } from "./FilterMenu";

type Query = Record<string, string | string[] | undefined>;

// Film · Oscar stage · nominations · marks; sorted by % chance, a "To win" column joins after the stage.
const COLUMNS = ["minmax(0,1fr)", "132px", "104px", "84px"];
const CHANCE_COLUMNS = ["minmax(0,1fr)", "132px", "88px", "104px", "84px"];
// My order's Want to watch: the drag handle first (guide §8.3).
const HANDLE_COLUMNS = ["28px", ...COLUMNS];

// The "Show all" row's tail ("sorted by Oscar stage"); Oscar keeps its capital.
const SORTED_BY: Record<WatchQuery["sort"], string> = { mine: "Oscar stage", stage: "Oscar stage", chance: "% chance", nominations: "nominations", average: "average score", release: "Oscar stage" };

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
  const [list, platforms, wantedPlatforms, params] = await Promise.all([getWatchList(LIVE_YEAR), getUsedPlatforms(), getWantedPlatforms(), query]);
  // The release lines read "Out" from today's date in Indonesia; the editor offers the platforms used before.
  const release = { today: todayInJakarta(), platforms };
  const choices = watchPlatforms(wantedPlatforms);
  const state = parseWatchQuery(params, choices);
  const filtered = hasWatchFilters(state);
  const clearHref = watchHref(clearWatchFilters(state));
  const want = sortWanted(filterWanted(list.want, state, release.today), state.sort);
  const unwatched = sortWatchList(list.unwatched, state.sort);
  const shown = state.all ? unwatched : unwatched.slice(0, SEASON_LIMIT);
  const mine = state.sort === "mine" && !filtered;

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 md:mt-7">
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-2">
          <span className="flex-none text-caption text-ink-muted max-md:basis-full">Sort by</span>
          <Segmented
            label="Sort by"
            className="min-w-0 max-md:flex-wrap max-md:overflow-visible"
            items={WATCH_SORTS.map((sort) => ({
              label: WATCH_SORT_LABELS[sort],
              href: watchHref({ ...state, sort }),
              current: sort === state.sort,
            }))}
          />
        </div>
        {list.want.length > 0 ? (
          <div className="relative flex basis-full flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-caption text-ink-muted max-md:basis-full">Filter</span>
            <FilterMenu label="Platform" caption="Show films on" choice={state.platform === "none" ? "No platform" : state.platform ?? "All"} active={Boolean(state.platform)} items={[
              { label: "All platforms", href: watchHref({ ...state, platform: undefined }), current: !state.platform },
              ...choices.map((platform) => ({ label: platform, href: watchHref({ ...state, platform }), current: platform === state.platform })),
              { label: "No platform", caption: "Films with no platform noted", href: watchHref({ ...state, platform: "none" }), current: state.platform === "none", separated: true },
            ]} />
            <FilterMenu label="Release" caption="Show films that are" choice={state.release ? RELEASE_FILTER_LABELS[state.release] : "All"} active={Boolean(state.release)} items={[
              { label: "All", href: watchHref({ ...state, release: undefined }), current: !state.release },
              ...RELEASE_FILTERS.map((value) => ({
                label: RELEASE_FILTER_LABELS[value], href: watchHref({ ...state, release: value }), current: value === state.release,
                caption: value === "out" ? "Released on or before today" : value === "coming" ? "A date after today" : "No date yet",
              })),
            ]} />
            {filtered ? <TextLink href={clearHref} scroll={false} className="relative py-1.5 text-caption before:absolute before:-inset-x-1 before:-inset-y-1.5">Clear filters</TextLink> : null}
          </div>
        ) : null}
      </div>

      <Section id="want" title="Want to watch" count={wantedCount(want.length, list.want.length, filtered)} hint={state.sort === "release" ? "by release date" : mine && want.length > 1 ? "drag the handle to reorder" : undefined}>
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
        ) : filtered ? (
          <EmptyState title="No films match these filters" headingLevel={3} icon={Search}
            actions={<Link href={clearHref} scroll={false} className={buttonClasses()}>Clear filters</Link>}>
            {noWatchMatches(list.want.length, state)}
          </EmptyState>
        ) : (
          <EmptyState title="Nothing marked yet" headingLevel={3}>
            Tap the bookmark on any film to put it here.
          </EmptyState>
        )}
      </Section>

      {!filtered ? <Section
        id="season"
        title={`Not watched yet, ${LIVE_YEAR} season`}
        count={unwatched.length}
        hint={(mine || state.sort === "release") && unwatched.length > 1 ? "by Oscar stage" : undefined}
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
      </Section> : null}
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
  count: number | string;
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
        <span className="pr-0.5 text-small text-ink-muted [contain:paint] max-md:basis-full">
          <span>{typeof count === "number" ? filmCount(count) : count}</span>
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
  const unknownResults = stage === null && categories.length === 0 && nominations === 0 && chance === null;
  return (
    <FilmRow
      headingLevel={3}
      title={film.title}
      href={`/movies/${film.slug}`}
      handle={handle ? <DragHandle /> : undefined}
      flag={film.flag}
      reserveFlag
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
          value: pill ? <StagePill stage={pill} /> : <span className="text-ink-muted">{unknownResults ? "–" : "No Oscar result"}</span>,
          phoneHidden: unknownResults,
        },
        ...(sort === "chance"
          ? [{ label: "To win", value: chance === null ? <span className="text-ink-muted">–</span> : `${formatChance(chance)}%`, numeric: true, phoneHidden: unknownResults }]
          : []),
        { label: "Nominations", value: unknownResults ? <span className="text-ink-muted">–</span> : nominations, numeric: true, phoneHidden: unknownResults },
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
