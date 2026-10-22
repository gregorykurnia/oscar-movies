import { connection } from "next/server";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { countryName } from "@/components/flag/Flag";
import { FilmList, FilmRow } from "@/components/film-row/FilmRow";
import { FilmMarks } from "@/components/marks/MarksProvider";
import { PageHeader } from "@/components/page-header/PageHeader";
import { Segmented } from "@/components/segmented/Segmented";
import { RaceRowsSkeleton } from "@/components/skeleton/Skeleton";
import { StagePill } from "@/components/stage-pill/StagePill";
import { TextLink } from "@/components/text-link/TextLink";
import { YearSwitcher } from "@/components/year-switcher/YearSwitcher";
import { getOscarEdition, getOscarResults, type OscarEdition, type OscarEntry } from "@/data/oscars";
import { formatDate } from "@/lib/format";
import { RACE_CATEGORIES, raceEntries, seasonState, type RaceCategory, type SeasonState } from "@/lib/race";
import { outcomeStage } from "@/lib/stage";
import { editionLabel, LIVE_YEAR, OLDEST_YEAR, yearRange } from "@/lib/years";

const YEARS = yearRange(LIVE_YEAR, OLDEST_YEAR);
// Film column · the Oscar result · marks.
const COLUMNS = ["minmax(0,1fr)", "220px", "84px"];

/**
 * Guide §8.2 Award page, one year, for the Oscars (`/awards/oscars/[year]`): back link to the
 * awards index, PageHeader with the year switcher, a jump control, and per category the Oscar's
 * own name over the film list (Film · Oscar result · marks). No accuracy figures: the Oscars are
 * the result the other awards are measured against.
 */
export function OscarYearPage({ year }: { year: number }) {
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
        actions={<YearSwitcher year={year} years={YEARS} liveYear={LIVE_YEAR} href="/awards/oscars/{year}" />}
      />
      <Suspense fallback={<RaceRowsSkeleton />}>
        <Categories year={year} />
      </Suspense>
    </>
  );
}

async function Sub({ year }: { year: number }) {
  // Wait for the request, so `next build` never reads the database.
  await connection();
  const edition = await getOscarEdition(year);
  const date = edition?.winnersOn ? formatDate(new Date(`${edition.winnersOn}T00:00:00Z`), true) : null;
  return <p>{date ? `${editionLabel(year)} · ${date}` : editionLabel(year)}</p>;
}

async function Categories({ year }: { year: number }) {
  await connection();
  const [edition, ...results] = await Promise.all([
    getOscarEdition(year),
    ...RACE_CATEGORIES.map((c) => getOscarResults(year, c.slug)),
  ]);
  if (!edition) {
    return (
      <EmptyState title="Not loaded yet" className="mt-10 md:mt-12">
        The {editionLabel(year)} aren&apos;t in the app yet.
      </EmptyState>
    );
  }
  return (
    <>
      <div className="mt-6 md:mt-7">
        <Segmented
          label="Jump to category"
          items={RACE_CATEGORIES.map((c) => ({ label: c.name, href: `#${c.slug}` }))}
        />
      </div>
      {RACE_CATEGORIES.map(({ slug, oscar }, i) => {
        const state = seasonState(results[i].map((e) => e.outcome));
        return (
          <CategorySection
            key={slug}
            year={year}
            slug={slug}
            name={oscar}
            state={state}
            entries={raceEntries(results[i], state)}
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

function CategorySection({
  year,
  slug,
  name,
  state,
  entries,
  edition,
}: {
  year: number;
  slug: RaceCategory;
  name: string;
  state: SeasonState;
  entries: OscarEntry[];
  edition: OscarEdition;
}) {
  return (
    <section id={slug} aria-labelledby={`${slug}-h`} className="mt-10 scroll-mt-20 md:mt-12">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`${slug}-h`} className="text-title-phone font-semibold tracking-title md:text-title">
          {name}
        </h2>
        {STATE_NOTE[state] ? <span className="text-small text-ink-muted">{STATE_NOTE[state]}</span> : null}
      </div>
      {entries.length > 0 ? (
        <FilmList head={["Oscar"]} columns={COLUMNS}>
          {entries.map((e) => (
            <FilmRow
              key={e.film.id}
              title={e.film.title}
              href={`/movies/${e.film.slug}`}
              flags={e.flags}
              firstFlagLabel={e.country ? `${countryName(e.country)}, submitting country` : undefined}
              scores={e.film.scores}
              winner={e.outcome === "won"}
              results={[
                {
                  label: "Oscar",
                  value: (
                    <>
                      <StagePill stage={outcomeStage(e.outcome)} />
                      {e.country ? <span className="ml-2 text-caption text-ink-muted">for {countryName(e.country)}</span> : null}
                    </>
                  ),
                },
              ]}
              marks={<FilmMarks movieId={e.film.id} title={e.film.title} />}
            />
          ))}
        </FilmList>
      ) : (
        <EmptyState
          title="No Oscar results yet"
          actions={
            slug === "international" ? (
              <TextLink href={`/submissions/${year}`} className="text-small">
                See the {year} submissions
              </TextLink>
            ) : undefined
          }
        >
          {edition.shortlistOn ? `The shortlist comes out ${formatDate(new Date(`${edition.shortlistOn}T00:00:00Z`), true)}.` : "Nothing is loaded for this category yet."}
        </EmptyState>
      )}
    </section>
  );
}
