import { connection } from "next/server";
import { Suspense } from "react";
import { FilterChips } from "@/components/chip/FilterChips";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { countryName, submittingLabel } from "@/components/flag/Flag";
import { FilmList, FilmRow } from "@/components/film-row/FilmRow";
import { FilmMarks } from "@/components/marks/MarksProvider";
import { Caption, SnubRiskFlag } from "@/components/patterns/Pieces";
import { PageHeader } from "@/components/page-header/PageHeader";
import { Segmented } from "@/components/segmented/Segmented";
import { RaceRowsSkeleton } from "@/components/skeleton/Skeleton";
import { StagePill } from "@/components/stage-pill/StagePill";
import { TextLink } from "@/components/text-link/TextLink";
import { YearSwitcher } from "@/components/year-switcher/YearSwitcher";
import { getOscarEdition, getOscarResults, type OscarEdition, type OscarEntry } from "@/data/oscars";
import { getPatterns } from "@/data/patterns";
import { getMarks } from "@/data/watch-list";
import { awardHistoryPath } from "@/lib/awards";
import { formatDate } from "@/lib/format";
import { keepMarked, markChips, markFilterQuery, markSets, parseMarkFilter, MARK_FILTER_LABELS, type MarkFilter, type MarkSets } from "@/lib/mark-filter";
import type { FilmPatterns } from "@/lib/patterns";
import { filmsById, shortlistCaption, shortlistOrder } from "@/lib/patterns/page";
import { hasShortlist, noResultsNote, oscarYearRows, RACE_CATEGORIES, seasonState, type RaceCategory, type SeasonState } from "@/lib/race";
import { oscarStage } from "@/lib/stage";
import { editionLabel, LIVE_YEAR, OLDEST_YEAR, yearRange } from "@/lib/years";

type Query = Record<string, string | string[] | undefined>;

const YEARS = yearRange(LIVE_YEAR, OLDEST_YEAR);
// Film column · the Oscar result · marks.
const COLUMNS = ["minmax(0,1fr)", "220px", "84px"];

/**
 * Guide §8.2 Award page, one year, for the Oscars (`/awards/oscars/[year]`): back link to the
 * awards index, PageHeader with the year switcher, a jump control, and per category the Oscar's
 * own name over the film list (Film · Oscar result · marks). No accuracy figures: the Oscars are
 * the result the other awards are measured against. The Watched, Unwatched and Want to watch chips
 * beside the jump control are in the address and filter every category's list by the live marks.
 */
export function OscarYearPage({ year, query }: { year: number; query: Promise<Query> }) {
  return (
    <>
      <PageHeader
        back={{ label: `Awards ${year}`, href: `/awards/${year}` }}
        title={`Oscars ${year}`}
        sub={
          <Suspense fallback={<p>{editionLabel(year)}</p>}>
            <Sub year={year} />
          </Suspense>
        }
        actions={
          <Suspense fallback={<YearSwitcher year={year} years={YEARS} liveYear={LIVE_YEAR} href="/awards/oscars/{year}" />}>
            <SwitchYear year={year} query={query} />
          </Suspense>
        }
      />
      <Suspense fallback={<RaceRowsSkeleton />}>
        <Categories year={year} query={query} />
      </Suspense>
    </>
  );
}

async function Sub({ year }: { year: number }) {
  // Wait for the request, so `next build` never reads the database.
  await connection();
  const edition = await getOscarEdition(year);
  const date = edition?.winnersOn ? formatDate(new Date(`${edition.winnersOn}T00:00:00Z`), true) : null;
  return (
    <p>
      {date ? `${editionLabel(year)} · ${date}` : editionLabel(year)}
      {" · "}
      <TextLink href={awardHistoryPath("oscars")}>All years</TextLink>
    </p>
  );
}

/** The year switcher keeps the mark chip when it changes the year. */
async function SwitchYear({ year, query }: { year: number; query: Promise<Query> }) {
  const filter = parseMarkFilter(await query);
  return <YearSwitcher year={year} years={YEARS} liveYear={LIVE_YEAR} href={`/awards/oscars/{year}${markFilterQuery(filter)}`} />;
}

async function Categories({ year, query }: { year: number; query: Promise<Query> }) {
  // Wait for the request: the address and the marks are read per visit.
  await connection();
  const [edition, marks, params, ...results] = await Promise.all([
    getOscarEdition(year),
    getMarks(),
    query,
    ...RACE_CATEGORIES.map((c) => getOscarResults(year, c.slug)),
  ]);
  const filter = parseMarkFilter(params);
  const sets = markSets(marks);
  const states = RACE_CATEGORIES.map((_, i) => seasonState(results[i].map((e) => e.outcome)));
  // Documentary and International list their whole shortlist, with what the patterns say of each film.
  const today = new Date().toISOString().slice(0, 10);
  const patterns = await Promise.all(
    RACE_CATEGORIES.map(async ({ slug }, i) =>
      hasShortlist(slug) && states[i] !== "before" ? filmsById((await getPatterns(slug, today)).seasons.find((s) => s.year === year)) : null,
    ),
  );
  if (!edition) {
    return (
      <EmptyState title="Not loaded yet" className="mt-10 md:mt-12">
        The {editionLabel(year)} aren&apos;t in the app yet.
      </EmptyState>
    );
  }
  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 md:mt-7">
        <Segmented
          label="Jump to category"
          items={RACE_CATEGORIES.map((c) => ({ label: c.name, href: `#${c.slug}` }))}
        />
        <FilterChips label="Filter" items={markChips(`/awards/oscars/${year}`, filter)} />
      </div>
      {RACE_CATEGORIES.map(({ slug, oscar }, i) => {
        const state = states[i];
        const rows = oscarYearRows(results[i], state, hasShortlist(slug));
        return (
          <CategorySection
            key={slug}
            year={year}
            slug={slug}
            name={oscar}
            state={state}
            entries={rows.listed}
            notNominated={shortlistOrder(rows.notNominated, patterns[i] ?? new Map())}
            patterns={patterns[i]}
            filter={filter}
            sets={sets}
            edition={edition}
          />
        );
      })}
    </>
  );
}

const STATE_NOTE: Record<SeasonState, string> = {
  before: "",
  shortlist: "Shortlist",
  nominations: "Nominees",
  finished: "Nominees and winner",
};

/** The caption under a shortlisted film's scores: nominations, strong awards, pick and the Snub risk flag. */
function ShortlistCaption({ film }: { film: FilmPatterns }) {
  return (
    <Caption>
      <span>
        {shortlistCaption(film).map((part, i) => (
          <span key={part}>
            {i > 0 ? " · " : null}
            <span className="whitespace-nowrap">{part}</span>
          </span>
        ))}
      </span>
      {film.snubRisk.length > 0 ? <SnubRiskFlag /> : null}
    </Caption>
  );
}

function OscarRow({ entry: e, slug, film }: { entry: OscarEntry; slug: RaceCategory; film: FilmPatterns | undefined }) {
  return (
    <FilmRow
      title={e.film.title}
      href={`/movies/${e.film.slug}`}
      flag={e.film.flag}
      flagLabel={submittingLabel(e.film.flag, e.country)}
      scores={e.film.scores}
      note={film ? <ShortlistCaption film={film} /> : undefined}
      winner={e.outcome === "won"}
      results={[
        {
          label: "Oscar",
          value: (
            <>
              <StagePill stage={oscarStage(e.outcome, slug)} />
              {e.country ? <span className="ml-2 text-caption text-ink-muted md:mt-1 md:ml-0 md:block">for {countryName(e.country)}</span> : null}
            </>
          ),
        },
      ]}
      marks={<FilmMarks movieId={e.film.id} title={e.film.title} />}
    />
  );
}

function CategorySection({
  year,
  slug,
  name,
  state,
  entries: all,
  notNominated: allMissed,
  patterns,
  filter,
  sets,
  edition,
}: {
  year: number;
  slug: RaceCategory;
  name: string;
  state: SeasonState;
  entries: OscarEntry[];
  /** Shortlisted films that missed, in the patterns' order (Documentary and International). */
  notNominated: OscarEntry[];
  /** The season's films as the patterns read them; null where the category has no shortlist. */
  patterns: Map<number, FilmPatterns> | null;
  filter: MarkFilter | null;
  sets: MarkSets;
  edition: OscarEdition;
}) {
  const entries = keepMarked(all, filter, sets, (e) => e.film.id);
  const missed = keepMarked(allMissed, filter, sets, (e) => e.film.id);
  const shortlisted = all.length + allMissed.length;
  // Where the category has a shortlist, its size follows the state ("Shortlist · 15 films").
  const note = !patterns || state === "before" ? STATE_NOTE[state] : state === "shortlist" ? `Shortlist · ${shortlisted} films` : `${STATE_NOTE[state]} · ${shortlisted} shortlisted`;
  return (
    <section id={slug} aria-labelledby={`${slug}-h`} className="mt-10 scroll-mt-20 md:mt-12">
      {/* On phone the note always takes its own line, so every category's heading reads the same. */}
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 max-md:flex-col">
        <h2 id={`${slug}-h`} className="text-section-phone leading-tight font-medium tracking-heading [overflow-wrap:anywhere] md:text-section">
          {name}
        </h2>
        {note ? <span className="text-small text-ink-muted">{note}</span> : null}
      </div>
      {entries.length > 0 || missed.length > 0 ? (
        <>
          {entries.length > 0 ? (
            <FilmList head={["Oscar"]} columns={COLUMNS}>
              {entries.map((e) => (
                <OscarRow key={e.film.id} entry={e} slug={slug} film={patterns?.get(e.film.id)} />
              ))}
            </FilmList>
          ) : null}
          {missed.length > 0 ? (
            <>
              <h3 className="mt-8 border-b border-line-strong pb-2 text-caption font-medium text-ink-muted">
                Shortlisted, not nominated <span className="font-normal">({missed.length})</span>
              </h3>
              <FilmList columns={COLUMNS} rule={false}>
                {missed.map((e) => (
                  <OscarRow key={e.film.id} entry={e} slug={slug} film={patterns?.get(e.film.id)} />
                ))}
              </FilmList>
            </>
          ) : null}
        </>
      ) : all.length + allMissed.length > 0 && filter ? (
        <p className="text-small text-ink-muted">No {MARK_FILTER_LABELS[filter].toLowerCase()} films in {name}.</p>
      ) : (
        <EmptyState
          title="No Oscar results yet"
          headingLevel={3}
          actions={
            slug === "international" ? (
              <TextLink href={`/submissions/${year}`} className="text-small">
                See the {year} submissions
              </TextLink>
            ) : undefined
          }
        >
          {noResultsNote(slug, edition)}
        </EmptyState>
      )}
    </section>
  );
}
