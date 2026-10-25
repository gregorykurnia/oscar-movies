import { ChevronRight, Info } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { countryName, submittingLabel } from "@/components/flag/Flag";
import { FilmList, FilmRow } from "@/components/film-row/FilmRow";
import { FilmMarks } from "@/components/marks/MarksProvider";
import { Notice } from "@/components/notice/Notice";
import { PageHeader } from "@/components/page-header/PageHeader";
import { Segmented } from "@/components/segmented/Segmented";
import { RaceRowsSkeleton } from "@/components/skeleton/Skeleton";
import { StagePill } from "@/components/stage-pill/StagePill";
import { getAwardHistory, type AwardCategoryResults, type AwardHistoryYear } from "@/data/awards";
import type { OscarCategory } from "@/data/oscars";
import { oscarCell, oscarName } from "@/lib/award-page";
import { awardHistoryPath, awardYearPath, kindLabel, type AwardSummary } from "@/lib/awards";
import { formatDate } from "@/lib/format";
import { RACE_CATEGORIES } from "@/lib/race";
import { oscarStage, outcomeStage } from "@/lib/stage";
import { LIVE_YEAR, OLDEST_YEAR } from "@/lib/years";

type Query = Record<string, string | string[] | undefined>;

// Film column · this award's result · the Oscar result · marks; the Oscars have the one result.
const COLUMNS = ["minmax(0,1fr)", "132px", "220px", "84px"];
const OSCARS_COLUMNS = ["minmax(0,1fr)", "220px", "84px"];

/**
 * Guide §8.2 Award page, all years (`/awards/[award]/all?category=`, `/awards/oscars/all`): one
 * award's results for every film year on one page, newest first. Category tabs in the address,
 * then one block per year with the year page's rows. No sort, filter, year jump or accuracy figures.
 */
export function AwardHistoryPage({ award, query }: { award: AwardSummary; query: Promise<Query> }) {
  const oscars = award.kind === "oscars";
  return (
    <>
      <PageHeader
        back={{ label: `${award.shortName} ${LIVE_YEAR}`, href: awardYearPath(award.slug, LIVE_YEAR) }}
        title={`${award.shortName}, all years`}
        sub={`${kindLabel(award.kind)} · every year since ${OLDEST_YEAR}, newest first`}
      />
      <Suspense fallback={<RaceRowsSkeleton />}>
        <Years award={award} oscars={oscars} query={query} />
      </Suspense>
    </>
  );
}

async function Years({ award, oscars, query }: { award: AwardSummary; oscars: boolean; query: Promise<Query> }) {
  // Wait for the request: the address and the marks are read per visit.
  await connection();
  const [history, params] = await Promise.all([getAwardHistory(award.slug), query]);
  if (!history || history.tabs.length === 0) {
    return (
      <EmptyState title="Not loaded yet" className="mt-10 md:mt-12">
        The app has no {award.shortName} results yet.
      </EmptyState>
    );
  }
  const requested = Array.isArray(params.category) ? params.category[0] : params.category;
  const tab = history.tabs.find((t) => t === requested) ?? history.tabs[0];
  const inTab = (c: AwardCategoryResults) => c.category.oscarCategory === tab;
  // A tab with more than one category for this award names each one (Globes Picture: Drama, Musical or Comedy).
  const subheadings = new Set(history.years.flatMap((y) => y.categories.filter(inTab).map((c) => c.category.slug))).size > 1;
  return (
    <>
      {history.tabs.length > 1 ? (
        <div className="mt-6 md:mt-10">
          <Segmented
            label="Category"
            items={history.tabs.map((t) => ({
              label: RACE_CATEGORIES.find((c) => c.slug === t)!.name,
              href: awardHistoryPath(award.slug, t),
              current: t === tab,
            }))}
          />
        </div>
      ) : null}
      {history.years.map((y) => (
        <YearBlock
          key={y.year}
          award={award}
          oscars={oscars}
          data={y}
          categories={y.categories.filter(inTab)}
          tab={tab}
          subheadings={subheadings}
        />
      ))}
      {oscars ? (
        <p className="mt-10 border-t border-line pt-4 text-caption text-ink-muted md:mt-14">
          Only nominees and winners are listed here. The submitted and shortlisted films are on each year&apos;s page.
        </p>
      ) : null}
    </>
  );
}

function YearBlock({
  award,
  oscars,
  data,
  categories,
  tab,
  subheadings,
}: {
  award: AwardSummary;
  oscars: boolean;
  data: AwardHistoryYear;
  categories: AwardCategoryResults[];
  tab: OscarCategory;
  subheadings: boolean;
}) {
  const { year, edition } = data;
  const name = `${award.shortName} ${year}`;
  const date = edition?.winnersOn ? formatDate(new Date(`${edition.winnersOn}T00:00:00Z`), true) : null;
  const noData = !edition || edition.status === "no_data";
  const rows = categories.filter((c) => c.entries.length > 0);
  return (
    <section aria-labelledby={`y${year}-h`} className="mt-10 md:mt-14">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 max-md:flex-col">
        <h2 id={`y${year}-h`} className="text-section-phone leading-tight font-medium tracking-heading md:text-section">
          <Link
            href={awardYearPath(award.slug, year)}
            aria-label={name}
            className="group inline-flex items-center gap-1.5 rounded-xs outline-none focus-visible:shadow-focus hover:underline hover:decoration-line-strong hover:decoration-1 hover:underline-offset-[5px]"
          >
            {year}
            <ChevronRight aria-hidden="true" className="size-4 text-ink-subtle group-hover:text-ink" strokeWidth={1.75} />
          </Link>
        </h2>
        {date && !noData ? <span className="text-small text-ink-muted">{date}</span> : null}
      </div>
      {noData ? (
        <Line title="No data">
          {edition?.note ??
            (year === LIVE_YEAR
              ? `${award.name} hasn't announced its ${year} results yet.`
              : `The app has no ${award.shortName} results for ${year}.`)}
        </Line>
      ) : rows.length === 0 ? (
        <Line title="No results this year">{edition.note}</Line>
      ) : (
        <>
          {edition.status === "partial" ? (
            <Notice tone="neutral" title="Partly loaded." className="mb-6">
              {edition.note ?? `Some of this year's ${award.shortName} results are missing.`}
            </Notice>
          ) : null}
          {rows.map((c, i) => (
            <div key={c.category.slug} className={i > 0 ? "mt-8" : undefined}>
              {subheadings ? <h3 className="mb-2 text-body font-semibold">{c.category.name}</h3> : null}
              <CategoryList award={award} oscars={oscars} data={c} tab={tab} headingLevel={subheadings ? 4 : 3} />
            </div>
          ))}
        </>
      )}
    </section>
  );
}

/** "No data" and "No results this year": one line in place of the lists, as the strong signals' "Not announced yet". */
function Line({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-t border-ink border-b border-b-line py-[18px] text-small text-ink-muted">
      <Info aria-hidden="true" className="mt-[3px] size-4 flex-none text-ink-subtle" strokeWidth={1.75} />
      <span>
        <strong className="font-medium text-ink">{title}</strong>
        {children ? <> · {children}</> : null}
      </span>
    </div>
  );
}

function CategoryList({
  award,
  oscars,
  data,
  tab,
  headingLevel,
}: {
  award: AwardSummary;
  oscars: boolean;
  data: AwardCategoryResults;
  tab: OscarCategory;
  headingLevel: 3 | 4;
}) {
  const { category, entries, oscarState } = data;
  return (
    <FilmList head={oscars ? ["Oscar"] : [award.shortName, `Oscar, ${oscarName(category.oscarCategory)}`]} columns={oscars ? OSCARS_COLUMNS : COLUMNS}>
      {entries.map((e) => {
        // The Oscars' own rows are the Oscar result; the other awards' films show theirs (or "Not yet").
        const cell = oscars
          ? { stage: oscarStage(e.outcome, tab), country: e.oscar?.country ?? null }
          : oscarCell(e.oscar, oscarState, tab);
        const oscarResult = {
          label: "Oscar",
          value: cell ? (
            <>
              <StagePill stage={cell.stage} />
              {cell.country ? <span className="ml-2 text-caption text-ink-muted md:mt-1 md:ml-0 md:block">for {countryName(cell.country)}</span> : null}
            </>
          ) : (
            <span className="text-ink-muted">Not yet</span>
          ),
        };
        return (
          <FilmRow
            key={e.film.id}
            title={e.film.title}
            href={`/movies/${e.film.slug}`}
            flag={e.film.flag}
            flagLabel={oscars ? submittingLabel(e.film.flag, e.oscar?.country ?? null) : undefined}
            scores={e.film.scores}
            winner={e.outcome === "won"}
            headingLevel={headingLevel}
            results={
              oscars
                ? [oscarResult]
                : [
                    {
                      label: award.shortName,
                      value: award.isSelection ? (
                        <StagePill stage="nominated">Selected</StagePill>
                      ) : (
                        <StagePill stage={outcomeStage(e.outcome)} />
                      ),
                    },
                    oscarResult,
                  ]
            }
            marks={<FilmMarks movieId={e.film.id} title={e.film.title} />}
          />
        );
      })}
    </FilmList>
  );
}
