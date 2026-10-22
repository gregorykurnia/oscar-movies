import { connection } from "next/server";
import { Suspense } from "react";
import { FilterChips } from "@/components/chip/FilterChips";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { countryName, Flag } from "@/components/flag/Flag";
import { FilmList, FilmRow } from "@/components/film-row/FilmRow";
import { FilmMarks } from "@/components/marks/MarksProvider";
import { PageHeader } from "@/components/page-header/PageHeader";
import { Segmented } from "@/components/segmented/Segmented";
import { RaceRowsSkeleton } from "@/components/skeleton/Skeleton";
import { StagePill } from "@/components/stage-pill/StagePill";
import { TextLink } from "@/components/text-link/TextLink";
import { YearSwitcher } from "@/components/year-switcher/YearSwitcher";
import { getOscarEdition, getSubmissions } from "@/data/oscars";
import { getMarks } from "@/data/watch-list";
import { DASH, formatDate } from "@/lib/format";
import {
  FILTER_LABELS,
  parseSubmissionQuery,
  SORT_LABELS,
  SUBMISSION_FILTERS,
  SUBMISSION_SORTS,
  submissionsHref,
  submissionsQuery,
  submissionStage,
  toggleFilter,
  viewSubmissions,
} from "@/lib/submissions";
import { editionLabel, LIVE_YEAR, OLDEST_YEAR, yearRange } from "@/lib/years";

type Query = Record<string, string | string[] | undefined>;

const YEARS = yearRange(LIVE_YEAR, OLDEST_YEAR);
// Country · film · Oscar stage · marks.
const COLUMNS = ["176px", "minmax(0,1fr)", "132px", "84px"];

/**
 * Guide §8.3 film list for International submissions (`/submissions/[year]`): PageHeader with the
 * year switcher, then a toolbar (the sort as a segmented control, the Shortlisted and Unwatched
 * chips) over the list: the submitting country's flag and name, the film, its Oscar stage and the
 * marks. The sort and the chips are in the address, and the list is read for that address.
 */
export function SubmissionsPage({ year, query }: { year: number; query: Promise<Query> }) {
  return (
    <>
      <PageHeader
        title={`${year} submissions`}
        sub={
          <Suspense fallback={<p>Best International Feature · {editionLabel(year)}</p>}>
            <Sub year={year} />
          </Suspense>
        }
        actions={
          <Suspense fallback={<YearSwitcher year={year} years={YEARS} liveYear={LIVE_YEAR} href="/submissions/{year}" />}>
            <SwitchYear year={year} query={query} />
          </Suspense>
        }
      />
      <Suspense fallback={<RaceRowsSkeleton label="Loading submissions" />}>
        <Submissions year={year} query={query} />
      </Suspense>
    </>
  );
}

async function Sub({ year }: { year: number }) {
  // Wait for the request, so `next build` never reads the database.
  await connection();
  const edition = await getOscarEdition(year);
  const date = edition?.winnersOn ? formatDate(new Date(`${edition.winnersOn}T00:00:00Z`), true) : null;
  return <p>{["Best International Feature", editionLabel(year), date].filter(Boolean).join(" · ")}</p>;
}

/** The year switcher keeps the sort and the chips when it changes the year. */
async function SwitchYear({ year, query }: { year: number; query: Promise<Query> }) {
  const state = parseSubmissionQuery(await query);
  return <YearSwitcher year={year} years={YEARS} liveYear={LIVE_YEAR} href={`/submissions/{year}${submissionsQuery(state)}`} />;
}

async function Submissions({ year, query }: { year: number; query: Promise<Query> }) {
  // Wait for the request: the address and the marks are read per visit.
  await connection();
  const [edition, entries, marks, params] = await Promise.all([
    getOscarEdition(year),
    getSubmissions(year),
    getMarks(),
    query,
  ]);
  if (!edition) {
    return (
      <EmptyState title="Not loaded yet" className="mt-10 md:mt-12">
        The {editionLabel(year)} aren&apos;t in the app yet.
      </EmptyState>
    );
  }
  if (entries.length === 0) {
    return (
      <EmptyState title="No submissions yet" className="mt-10 md:mt-12">
        The Academy&apos;s International Feature submissions for {year} aren&apos;t loaded yet.
      </EmptyState>
    );
  }

  const state = parseSubmissionQuery(params);
  const watched = new Set(marks.filter((m) => m.watched).map((m) => m.movieId));
  const shown = viewSubmissions(entries, state, watched);

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 md:mt-7">
        <div className="flex min-w-0 max-w-full items-center gap-3">
          <span className="flex-none text-caption text-ink-muted">Sort by</span>
          <Segmented
            label="Sort by"
            className="min-w-0"
            items={SUBMISSION_SORTS.map((sort) => ({
              label: SORT_LABELS[sort],
              href: submissionsHref(year, { ...state, sort }),
              current: sort === state.sort,
            }))}
          />
        </div>
        <FilterChips
          label="Filter"
          items={SUBMISSION_FILTERS.map((filter) => ({
            label: FILTER_LABELS[filter],
            href: submissionsHref(year, { ...state, filters: toggleFilter(state.filters, filter) }),
            pressed: state.filters.includes(filter),
          }))}
        />
      </div>

      {shown.length > 0 ? (
        <FilmList head={["Oscar"]} leadLabel="Country" columns={COLUMNS} className="mt-6 md:mt-7">
          {shown.map((e) => (
            <FilmRow
              key={e.film.id}
              headingLevel={2}
              lead={e.country ? <CountryLead code={e.country} /> : DASH}
              title={e.film.title}
              href={`/movies/${e.film.slug}`}
              scores={e.film.scores}
              winner={e.outcome === "won"}
              results={[{ label: "Oscar", value: <StagePill stage={submissionStage(e.outcome)} /> }]}
              marks={<FilmMarks movieId={e.film.id} title={e.film.title} />}
            />
          ))}
        </FilmList>
      ) : (
        <EmptyState
          title="No submissions match"
          className="mt-7"
          actions={
            <TextLink href={submissionsHref(year, { sort: state.sort, filters: [] })} className="text-small">
              Show all submissions
            </TextLink>
          }
        >
          Nothing in the {year} submissions is {state.filters.map((f) => FILTER_LABELS[f].toLowerCase()).join(" and ")}.
        </EmptyState>
      )}
    </>
  );
}

/** The first column: the submitting country's flag and name. */
function CountryLead({ code }: { code: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Flag code={code} />
      <span className="[overflow-wrap:anywhere]">{countryName(code)}</span>
    </span>
  );
}
