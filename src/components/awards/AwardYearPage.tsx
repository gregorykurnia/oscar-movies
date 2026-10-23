import { connection } from "next/server";
import { Suspense } from "react";
import { FilterChips } from "@/components/chip/FilterChips";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { countryName } from "@/components/flag/Flag";
import { FilmList, FilmRow } from "@/components/film-row/FilmRow";
import { FilmMarks } from "@/components/marks/MarksProvider";
import { Notice } from "@/components/notice/Notice";
import { PageHeader } from "@/components/page-header/PageHeader";
import { Segmented } from "@/components/segmented/Segmented";
import { RaceRowsSkeleton } from "@/components/skeleton/Skeleton";
import { StagePill } from "@/components/stage-pill/StagePill";
import { StatsStrip } from "@/components/stats-strip/StatsStrip";
import { TextLink } from "@/components/text-link/TextLink";
import { YearSwitcher } from "@/components/year-switcher/YearSwitcher";
import { getAwardYear, type AwardCategoryResults, type AwardEdition } from "@/data/awards";
import { accuracyStats, oscarCell, oscarName } from "@/lib/award-page";
import { kindLabel, type AwardSummary } from "@/lib/awards";
import { getMarks } from "@/data/watch-list";
import { formatDate } from "@/lib/format";
import { keepMarked, markChips, markFilterQuery, markSets, parseMarkFilter, MARK_FILTER_LABELS, type MarkFilter, type MarkSets } from "@/lib/mark-filter";
import { outcomeStage } from "@/lib/stage";
import { LIVE_YEAR, OLDEST_YEAR, yearRange } from "@/lib/years";

type Query = Record<string, string | string[] | undefined>;

const YEARS = yearRange(LIVE_YEAR, OLDEST_YEAR);
// Film column · this award's result · the Oscar result · marks.
const COLUMNS = ["minmax(0,1fr)", "132px", "220px", "84px"];

function subLine(award: AwardSummary, edition: AwardEdition | null): string {
  const name = edition?.ordinal ? `${edition.ordinal} ${award.name}` : award.name;
  const date = edition?.winnersOn ? formatDate(new Date(`${edition.winnersOn}T00:00:00Z`), true) : null;
  return [name, date, kindLabel(award.kind)].filter(Boolean).join(" · ");
}

/**
 * Guide §8.2 Award page, one year (`/awards/[award]/[year]`), for every major award and festival
 * prize: back link to the awards index, PageHeader with the year switcher, a jump control to the
 * categories the award gave that year, and per category the award's own name over its accuracy
 * strip and film list (Film · this award's result · Oscar result · marks). The Watched, Unwatched
 * and Want to watch chips are in the address and filter every category's list by the live marks.
 */
export function AwardYearPage({ award, year, query }: { award: AwardSummary; year: number; query: Promise<Query> }) {
  return (
    <>
      <PageHeader
        back={{ label: `Awards ${year}`, href: `/awards/${year}` }}
        title={`${award.shortName} ${year}`}
        sub={
          <Suspense fallback={<p>{award.name}</p>}>
            <Sub award={award} year={year} />
          </Suspense>
        }
        actions={
          <Suspense fallback={<YearSwitcher year={year} years={YEARS} liveYear={LIVE_YEAR} href={`/awards/${award.slug}/{year}`} />}>
            <SwitchYear award={award} year={year} query={query} />
          </Suspense>
        }
      />
      <Suspense fallback={<RaceRowsSkeleton />}>
        <Categories award={award} year={year} query={query} />
      </Suspense>
    </>
  );
}

async function Sub({ award, year }: { award: AwardSummary; year: number }) {
  // Wait for the request, so `next build` never reads the database.
  await connection();
  const data = await getAwardYear(award.slug, year);
  return <p>{subLine(award, data?.edition ?? null)}</p>;
}

/** The year switcher keeps the mark chip when it changes the year. */
async function SwitchYear({ award, year, query }: { award: AwardSummary; year: number; query: Promise<Query> }) {
  const filter = parseMarkFilter(await query);
  return <YearSwitcher year={year} years={YEARS} liveYear={LIVE_YEAR} href={`/awards/${award.slug}/{year}${markFilterQuery(filter)}`} />;
}

async function Categories({ award, year, query }: { award: AwardSummary; year: number; query: Promise<Query> }) {
  // Wait for the request: the address and the marks are read per visit.
  await connection();
  const [data, marks, params] = await Promise.all([getAwardYear(award.slug, year), getMarks(), query]);
  const filter = parseMarkFilter(params);
  const sets = markSets(marks);
  const edition = data?.edition ?? null;
  if (!data || !edition) {
    return (
      <EmptyState title="Not loaded yet" className="mt-10 md:mt-12">
        The {year} {award.shortName} results aren&apos;t in the app yet.
      </EmptyState>
    );
  }
  if (edition.status === "no_data" || data.categories.length === 0) {
    return (
      <EmptyState title="No data for this year" className="mt-10 md:mt-12">
        {edition.note ??
          (year === LIVE_YEAR
            ? `${award.name} hasn't announced its ${year} results yet.`
            : `The app has no ${award.shortName} results for ${year}.`)}
      </EmptyState>
    );
  }
  const { categories } = data;
  return (
    <>
      {edition.status === "partial" ? (
        <Notice tone="neutral" title="Partly loaded." className="mt-6 md:mt-7">
          {edition.note ?? `Some of this year's ${award.shortName} results are missing.`}
        </Notice>
      ) : null}
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 md:mt-7">
        {categories.length > 1 ? (
          <Segmented
            label="Jump to category"
            items={categories.map((c) => ({ label: c.category.name, href: `#${c.category.slug}` }))}
          />
        ) : null}
        <FilterChips label="Filter" items={markChips(`/awards/${award.slug}/${year}`, filter)} />
      </div>
      {categories.map((c) => (
        <CategorySection key={c.category.slug} award={award} data={c} filter={filter} sets={sets} />
      ))}
      <Footnote award={award} categories={categories} />
    </>
  );
}

function CategorySection({
  award,
  data,
  filter,
  sets,
}: {
  award: AwardSummary;
  data: AwardCategoryResults;
  filter: MarkFilter | null;
  sets: MarkSets;
}) {
  const { category, entries: all, oscarState } = data;
  const entries = keepMarked(all, filter, sets, (e) => e.film.id);
  const oscar = oscarName(category.oscarCategory);
  return (
    <section id={category.slug} aria-labelledby={`${category.slug}-h`} className="mt-10 scroll-mt-20 md:mt-12">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 max-md:flex-col">
        <h2
          id={`${category.slug}-h`}
          className="text-section-phone leading-tight font-medium tracking-heading [overflow-wrap:anywhere] md:text-section"
        >
          {category.name}
        </h2>
        <span className="text-small text-ink-muted">
          Counts {category.loose ? "loosely " : ""}towards {oscar}
        </span>
      </div>
      <StatsStrip stats={accuracyStats(category.figures)} className="mb-2" />
      {entries.length === 0 && filter ? (
        <p className="text-small text-ink-muted">
          No {MARK_FILTER_LABELS[filter].toLowerCase()} films in {category.name}.
        </p>
      ) : (
        <FilmList head={[award.shortName, oscar]} columns={COLUMNS}>
          {entries.map((e) => {
            const cell = oscarCell(e.oscar, oscarState, category.oscarCategory);
            return (
              <FilmRow
                key={e.film.id}
                title={e.film.title}
                href={`/movies/${e.film.slug}`}
                flags={e.flags}
                scores={e.film.scores}
                winner={e.outcome === "won"}
                results={[
                  {
                    label: award.shortName,
                    value: award.isSelection ? (
                      <StagePill stage="nominated">Selected</StagePill>
                    ) : (
                      <StagePill stage={outcomeStage(e.outcome)} />
                    ),
                  },
                  {
                    label: "Oscar",
                    value: cell ? (
                      <>
                        <StagePill stage={cell.stage} />
                        {cell.country ? (
                          <span className="ml-2 text-caption text-ink-muted">for {countryName(cell.country)}</span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-ink-muted">Not yet</span>
                    ),
                  },
                ]}
                marks={<FilmMarks movieId={e.film.id} title={e.film.title} />}
              />
            );
          })}
        </FilmList>
      )}
    </section>
  );
}

/** What the figures count, what "–" means, and how the categories map (guide §8.2 footnote). */
function Footnote({ award, categories }: { award: AwardSummary; categories: AwardCategoryResults[] }) {
  const notes = [
    award.winnersOnly && `${award.name} announces its winners only, so there is no nominee figure (–).`,
    award.isSelection && `${award.name} names a list of films and no winner, so only the nominee figure applies.`,
    ...categories.filter((c) => c.category.mappingNote).map((c) => `${c.category.name}: ${c.category.mappingNote}`),
  ].filter((n): n is string => Boolean(n));
  const oscarCategories = [...new Set(categories.map((c) => c.category.oscarCategory))];
  return (
    <footer className="mt-10 space-y-1.5 border-t border-line pt-4 text-caption text-ink-muted md:mt-12">
      <p>
        Figures count the finished seasons since 2012 in which {award.shortName} has results for the category. A film counts by the
        furthest it went at the Oscars.
      </p>
      {notes.map((n) => (
        <p key={n}>{n}</p>
      ))}
      <p>
        How well every award foretells the Oscars:{" "}
        {oscarCategories.map((oc, i) => (
          <span key={oc}>
            {i > 0 ? ", " : ""}
            <TextLink href={`/accuracy/${oc}`}>{oscarName(oc)}</TextLink>
          </span>
        ))}
        .
      </p>
    </footer>
  );
}
