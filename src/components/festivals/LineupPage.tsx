import { connection } from "next/server";
import { Suspense } from "react";
import { FilterChips } from "@/components/chip/FilterChips";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { FilmList, FilmRow } from "@/components/film-row/FilmRow";
import { FilmMarks } from "@/components/marks/MarksProvider";
import { PageHeader } from "@/components/page-header/PageHeader";
import { Segmented } from "@/components/segmented/Segmented";
import { RaceRowsSkeleton } from "@/components/skeleton/Skeleton";
import { StagePill } from "@/components/stage-pill/StagePill";
import { TextLink } from "@/components/text-link/TextLink";
import { YearSwitcher } from "@/components/year-switcher/YearSwitcher";
import { getYearEditions } from "@/data/awards";
import { getLineup, type LineupSection } from "@/data/lineup";
import { getMarks } from "@/data/watch-list";
import type { AwardSummary } from "@/lib/awards";
import { DASH, formatDate } from "@/lib/format";
import {
  filmCount,
  filterPhrase,
  hasLineups,
  LINEUP_SORT_LABELS,
  LINEUP_SORTS,
  LINEUPS_START,
  lineupHref,
  lineupNote,
  lineupQuery,
  parseLineupQuery,
  prizesOf,
  sectionId,
  viewLineup,
} from "@/lib/lineup";
import { MARK_FILTER_LABELS, MARK_FILTERS, markSets } from "@/lib/mark-filter";
import { LIVE_YEAR, OLDEST_YEAR, yearRange } from "@/lib/years";

type Query = Record<string, string | string[] | undefined>;

const YEARS = yearRange(LIVE_YEAR, OLDEST_YEAR);
// Film · prize · marks.
const COLUMNS = ["minmax(0,1fr)", "260px", "84px"];

/**
 * Guide §8.3 festival lineup (`/festivals/[festival]/[year]`): PageHeader with the year switcher,
 * then a toolbar (the sort as a segmented control and the mark chips) over one film list per
 * section: the film with its flags, year and scores, the prizes it won there as pills, and its
 * marks. The sort and the chip are in the address. A year before 2025 says lineups start then.
 */
export function LineupPage({ festival, year, query }: { festival: AwardSummary; year: number; query: Promise<Query> }) {
  const tracked = hasLineups(year);
  return (
    <>
      <PageHeader
        back={{ label: `Festivals ${year}`, href: `/festivals/${year}` }}
        title={`${festival.shortName} ${year}`}
        sub={
          tracked ? (
            <Suspense fallback={<p>{festival.name}</p>}>
              <Sub festival={festival} year={year} />
            </Suspense>
          ) : (
            <p>{festival.name} · Festival lineup</p>
          )
        }
        actions={
          <Suspense
            fallback={<YearSwitcher year={year} years={YEARS} liveYear={LIVE_YEAR} href={`/festivals/${festival.slug}/{year}`} />}
          >
            <SwitchYear festival={festival} year={year} query={query} />
          </Suspense>
        }
      />
      {tracked ? (
        <Suspense fallback={<RaceRowsSkeleton label="Loading lineup" />}>
          <Lineup festival={festival} year={year} query={query} />
        </Suspense>
      ) : (
        <EmptyState title={LINEUPS_START} className="mt-10 md:mt-12" actions={<TextLink href={`/awards/${festival.slug}/${year}`} className="text-small">{`Prizes for ${year}`}</TextLink>}>
          Earlier years show prizes only.
        </EmptyState>
      )}
    </>
  );
}

async function Sub({ festival, year }: { festival: AwardSummary; year: number }) {
  // Wait for the request, so `next build` never reads the database.
  await connection();
  const edition = (await getYearEditions(year)).find((e) => e.slug === festival.slug);
  const name = edition?.ordinal ? `${edition.ordinal} ${festival.name}` : festival.name;
  const date = edition?.winnersOn ? formatDate(new Date(`${edition.winnersOn}T00:00:00Z`), true) : null;
  return (
    <p>
      {[name, date, "Festival lineup"].filter(Boolean).join(" · ")}
      {" · "}
      <TextLink href={`/awards/${festival.slug}/${year}`}>Prizes</TextLink>
    </p>
  );
}

/** The year switcher keeps the sort and the mark chip when it changes the year. */
async function SwitchYear({ festival, year, query }: { festival: AwardSummary; year: number; query: Promise<Query> }) {
  const state = parseLineupQuery(await query);
  return (
    <YearSwitcher year={year} years={YEARS} liveYear={LIVE_YEAR} href={`/festivals/${festival.slug}/{year}${lineupQuery(state)}`} />
  );
}

async function Lineup({ festival, year, query }: { festival: AwardSummary; year: number; query: Promise<Query> }) {
  // Wait for the request: the address and the marks are read per visit.
  await connection();
  const [{ edition, sections }, marks, params] = await Promise.all([getLineup(festival.slug, year), getMarks(), query]);
  // The edition's status is about its prizes; whether there's a lineup is whether it has screenings
  // (a coming festival's lineup can be loaded months before its prizes).
  if (sections.length === 0) {
    return edition ? (
      <EmptyState title="No lineup for this year" className="mt-10 md:mt-12">
        {year === LIVE_YEAR
          ? `${festival.name} hasn't published its ${year} lineup yet.`
          : `The app has no ${festival.shortName} lineup for ${year}.`}
      </EmptyState>
    ) : (
      <EmptyState title="Not loaded yet" className="mt-10 md:mt-12">
        The {year} {festival.shortName} lineup isn&apos;t in the app yet.
      </EmptyState>
    );
  }

  const state = parseLineupQuery(params);
  const shown = viewLineup(sections, state, markSets(marks));
  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 md:mt-7">
        <div className="flex min-w-0 max-w-full items-center gap-3">
          <span aria-hidden="true" className="flex-none text-caption text-ink-muted">Sort by</span>
          <Segmented
            label="Sort by"
            className="min-w-0"
            items={LINEUP_SORTS.map((sort) => ({
              label: LINEUP_SORT_LABELS[sort],
              href: lineupHref(festival.slug, year, { ...state, sort }),
              current: sort === state.sort,
            }))}
          />
        </div>
        <FilterChips
          label="Filter"
          items={MARK_FILTERS.map((filter) => ({
            label: MARK_FILTER_LABELS[filter],
            href: lineupHref(festival.slug, year, { ...state, filter: state.filter === filter ? null : filter }),
            pressed: state.filter === filter,
          }))}
        />
      </div>
      {shown.length > 0 ? (
        shown.map((section) => <SectionFilms key={section.order} section={section} year={year} />)
      ) : (
        <EmptyState
          title="No films match"
          className="mt-7"
          actions={
            <TextLink href={lineupHref(festival.slug, year, { ...state, filter: null })} className="text-small">
              Show all films
            </TextLink>
          }
        >
          Nothing in the {year} {festival.shortName} lineup is {state.filter && filterPhrase(state.filter)}.
        </EmptyState>
      )}
      <Footnote leftOut={lineupNote(edition?.note ?? null)} />
    </>
  );
}

function SectionFilms({ section, year }: { section: LineupSection; year: number }) {
  const id = sectionId(section);
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="mt-10 scroll-mt-20 md:mt-12">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 max-md:flex-col">
        <h2
          id={`${id}-h`}
          className="text-section-phone leading-tight font-medium tracking-heading [overflow-wrap:anywhere] md:text-section"
        >
          {section.name}
        </h2>
        <span className="text-small text-ink-muted">{filmCount(section.films.length)}</span>
      </div>
      <FilmList head={["Prize"]} columns={COLUMNS}>
        {section.films.map((film) => {
          const prizes = prizesOf(film.prize, section.name);
          return (
            <FilmRow
              key={film.id}
              title={film.title}
              href={`/movies/${film.slug}`}
              flag={film.flag}
              // The lineup's year goes without saying; a film from another year says which.
              meta={film.year === year ? undefined : String(film.year)}
              scores={film.scores}
              winner={prizes.length > 0}
              results={[
                {
                  label: "Prize",
                  // On phone a film with no prize has no Prize line at all.
                  phoneHidden: prizes.length === 0,
                  value:
                    prizes.length > 0 ? (
                      <span className="inline-flex max-w-full flex-wrap gap-1.5 align-middle">
                        {prizes.map((prize, i) => (
                          <StagePill key={`${i}-${prize}`} stage="won" wrap>
                            {i > 0 ? <span className="sr-only">; </span> : null}
                            {prize}
                          </StagePill>
                        ))}
                      </span>
                    ) : (
                      <span className="text-ink-muted">{DASH}</span>
                    ),
                },
              ]}
              marks={<FilmMarks movieId={film.id} title={film.title} />}
            />
          );
        })}
      </FilmList>
    </section>
  );
}

/** Where the lineups come from (guide §8.9): Wikipedia's tables, and the sections with no published count to check against. */
function Footnote({ leftOut }: { leftOut: string | null }) {
  return (
    <footer className="mt-10 space-y-1.5 border-t border-line pt-4 text-caption text-ink-muted md:mt-12">
      <p>
        Lineups are based on Wikipedia articles, used under CC BY-SA 4.0. Short films, series, VR works and restorations are left
        out.
      </p>
      {leftOut ? <p>Also left out: {leftOut}</p> : null}
      <p>
        Some sections have no published count to check against, so for those Wikipedia&apos;s table is the only source.{" "}
        <TextLink href="/data">Data coverage and sources</TextLink>
      </p>
    </footer>
  );
}
