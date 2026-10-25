import { Award, Calendar } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { buttonClasses } from "@/components/button/Button";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { FilmList, FilmRow } from "@/components/film-row/FilmRow";
import { FilmMarks } from "@/components/marks/MarksProvider";
import { Notice } from "@/components/notice/Notice";
import { PageHeader } from "@/components/page-header/PageHeader";
import { Segmented } from "@/components/segmented/Segmented";
import { RaceRowsSkeleton } from "@/components/skeleton/Skeleton";
import { StagePill, STAGE_LABELS } from "@/components/stage-pill/StagePill";
import { TextLink } from "@/components/text-link/TextLink";
import { YearSwitcher } from "@/components/year-switcher/YearSwitcher";
import { getSignals, type SignalsData } from "@/data/signals";
import { formatFigure } from "@/lib/accuracy";
import { findAward } from "@/lib/awards";
import { RACE_CATEGORIES, parseCategory, seasonDate, type RaceCategory, type SeasonState } from "@/lib/race";
import { figureSentence, parseView, signalsHref, type AwardSignal, type FilmSignal, type SignalsView } from "@/lib/signals";
import { oscarStage, outcomeStage, type Outcome } from "@/lib/stage";
import { LIVE_YEAR, OLDEST_YEAR, yearRange } from "@/lib/years";

type Query = Record<string, string | string[] | undefined>;

const YEARS = yearRange(LIVE_YEAR, OLDEST_YEAR);
// Film · this award's result (or the strong award count) · the Oscar result · marks.
const AWARD_COLUMNS = ["minmax(0,1fr)", "132px", "168px", "84px"];
const FILM_COLUMNS = ["minmax(0,1fr)", "112px", "168px", "84px"];

const shortName = (row: { key: string; award: string }) => findAward(row.key.split("/")[0])?.shortName ?? row.award;

/**
 * Guide §8.13 Strong signals (`/signals/[year]?category=&view=`): PageHeader with the year
 * switcher, the category and view controls (both in the address), and the awards that predict the
 * category best with the films each picked, by award or by film.
 */
export function SignalsPage({ year, query }: { year: number; query: Promise<Query> }) {
  return (
    <Suspense fallback={<RaceRowsSkeleton label="Loading strong signals" />}>
      <Page year={year} query={query} />
    </Suspense>
  );
}

async function Page({ year, query }: { year: number; query: Promise<Query> }) {
  const params = await query;
  const category = parseCategory(params.category);
  const view = parseView(params.view);
  const oscar = RACE_CATEGORIES.find((c) => c.slug === category)!.oscar;
  return (
    <>
      <PageHeader
        title={`${year} strong signals`}
        sub={
          <p>
            {oscar} · the films picked by the awards that predict it best ·{" "}
            <TextLink href={`/accuracy/${category}`}>Accuracy</TextLink>
          </p>
        }
        actions={<YearSwitcher year={year} years={YEARS} liveYear={LIVE_YEAR} href={signalsHref("{year}", category, view)} />}
      />
      <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 md:mt-7">
        <Segmented
          label="Category"
          items={RACE_CATEGORIES.map((c) => ({ label: c.name, href: signalsHref(year, c.slug, view), current: c.slug === category }))}
        />
        <Segmented
          label="View"
          items={[
            { label: "By award", href: signalsHref(year, category, "award"), current: view === "award" },
            { label: "By film", href: signalsHref(year, category, "film"), current: view === "film" },
          ]}
        />
      </div>
      <Suspense fallback={<RaceRowsSkeleton label="Loading strong signals" />}>
        <Signals year={year} category={category} oscar={oscar} view={view} />
      </Suspense>
    </>
  );
}

async function Signals({ year, category, oscar, view }: { year: number; category: RaceCategory; oscar: string; view: SignalsView }) {
  // Wait for the request, so `next build` never reads the database.
  await connection();
  const today = new Date().toISOString().slice(0, 10);
  const data = await getSignals(category, year, today);
  if (data.byAward.length === 0) {
    const name = RACE_CATEGORIES.find((c) => c.slug === category)!.name;
    return (
      <EmptyState
        title={`No strong awards for ${name} yet`}
        icon={Award}
        className="mt-10 md:mt-12"
        actions={
          <Link href={`/accuracy/${category}`} className={buttonClasses({ variant: "secondary" })}>
            See the accuracy figures
          </Link>
        }
      >
        No award has caught half of the Oscar nominees, or had its winner nominated in 80% of years, over at least 5 counted years.
      </EmptyState>
    );
  }
  return (
    <>
      {view === "award" ? (
        <ByAward data={data} year={year} category={category} oscar={oscar} today={today} />
      ) : (
        <ByFilm data={data} year={year} category={category} oscar={oscar} today={today} />
      )}
      <Footnote year={year} category={category} />
    </>
  );
}

/** What the Oscar column says for a film: its stage, or "Not nominated" once the nominees are out. */
function oscarPill(oscar: Outcome | null, state: SeasonState, category: RaceCategory) {
  const nominationsOut = state === "nominations" || state === "finished";
  if (oscar && !(nominationsOut && oscar === "eligible")) return <StagePill stage={oscarStage(oscar, category)} />;
  if (nominationsOut) return <StagePill stage="not-nominated" />;
  return <span className="text-ink-muted">Not yet</span>;
}

function nextText(next: AwardSignal<unknown>["next"], today: string): string | null {
  return next ? `${next.what === "nominations" ? "nominations" : "winner"} ${seasonDate(next.on, today)}` : null;
}

function ByAward({ data, year, category, oscar, today }: { data: SignalsData; year: number; category: RaceCategory; oscar: string; today: string }) {
  return (
    <>
      {data.byAward.map((a) => {
        const name = shortName(a.row);
        const heading = `${name} · ${a.row.note}`;
        return (
          <section key={a.row.key} aria-label={heading} data-award={a.row.key} className="mt-10 md:mt-12">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 max-md:flex-col">
              <h2 className="text-section-phone leading-tight font-medium tracking-heading [overflow-wrap:anywhere] md:text-section">{a.row.award}</h2>
              <span className="text-small text-ink-muted">{a.row.note}</span>
            </div>
            <div className="mb-4 grid gap-0.5 text-body text-ink-muted">
              {a.kinds.map(({ kind, figure }) => {
                const { lead, rest } = figureSentence(kind, figure, a.row.years);
                return (
                  <p key={kind} data-figure={kind}>
                    <strong className="font-medium text-ink">{lead}</strong> · <span className="whitespace-nowrap">{rest}</span>
                  </p>
                );
              })}
            </div>
            {a.films ? (
              <FilmList head={[name, `Oscar, ${oscar}`]} columns={AWARD_COLUMNS}>
                {a.films.map((f) => (
                  <FilmRow
                    key={f.film.id}
                    title={f.film.title}
                    href={`/movies/${f.film.slug}`}
                    flag={f.film.flag}
                    scores={f.film.scores}
                    winner={f.outcome === "won"}
                    headingLevel={3}
                    results={[
                      { label: name, value: <StagePill stage={outcomeStage(f.outcome)} /> },
                      { label: "Oscar", value: oscarPill(f.oscar, data.oscarState, category) },
                    ]}
                    marks={<FilmMarks movieId={f.film.id} title={f.film.title} />}
                  />
                ))}
              </FilmList>
            ) : (
              <NotYet text={nextText(a.next, today)} year={year} />
            )}
          </section>
        );
      })}
    </>
  );
}

/** A strong award with nothing to list yet. */
function NotYet({ text, year }: { text: string | null; year: number }) {
  return (
    <div className="flex items-start gap-3 border-t border-ink border-b border-b-line py-[18px] text-small text-ink-muted">
      <Calendar aria-hidden="true" className="mt-[3px] size-4 flex-none text-ink-subtle" strokeWidth={1.75} />
      <span>
        {text ? (
          <>
            <strong className="font-medium text-ink">Not announced yet</strong> · {text}
          </>
        ) : (
          <>
            <strong className="font-medium text-ink">No results for {year}</strong> · the app has none from this award yet
          </>
        )}
      </span>
    </div>
  );
}

function ByFilm({ data, category, oscar, today }: { data: SignalsData; year: number; category: RaceCategory; oscar: string; today: string }) {
  const { byFilm, pending } = data;
  return (
    <>
      {pending.length > 0 ? (
        <Notice tone="neutral" title={`${pending.length} strong ${pending.length === 1 ? "award hasn't" : "awards haven't"} announced yet.`} className="mt-6 md:mt-7">
          {pending
            .map((a) => {
              const next = nextText(a.next, today);
              return `${shortName(a.row)} ${categoryName(a.row)}${next ? `: ${next}` : ""}`;
            })
            .join(" · ")}
          .
        </Notice>
      ) : null}
      {byFilm.length === 0 ? (
        <p className="mt-10 text-small text-ink-muted">No film has been picked by a strong award yet.</p>
      ) : (
        <FilmList
          filmLabel="Film and the strong awards that picked it"
          head={[{ label: "Strong awards", numeric: true }, `Oscar, ${oscar}`]}
          columns={FILM_COLUMNS}
          className="mt-6"
        >
          {byFilm.map((f) => (
            <FilmRow
              key={f.film.id}
              title={f.film.title}
              href={`/movies/${f.film.slug}`}
              flag={f.film.flag}
              scores={f.film.scores}
              meta={<Picks film={f} />}
              headingLevel={2}
              results={[
                { label: "Strong awards", value: f.picks.length, numeric: true },
                { label: "Oscar", value: oscarPill(f.oscar, data.oscarState, category) },
              ]}
              marks={<FilmMarks movieId={f.film.id} title={f.film.title} />}
            />
          ))}
        </FilmList>
      )}
    </>
  );
}

/** "Won Cinema Eye Outstanding Nonfiction Feature (93%) · Nominated IDA Feature (71%)". */
function Picks({ film }: { film: FilmSignal<unknown> }) {
  return (
    <span data-picks className="text-small text-ink [overflow-wrap:anywhere]">
      {film.picks.map((p, i) => (
        <span key={p.row.key}>
          {i > 0 ? <span className="text-ink-muted"> · </span> : null}
          <span className="text-ink-muted">{STAGE_LABELS[outcomeStage(p.outcome)]}</span> {shortName(p.row)} {categoryName(p.row)}{" "}
          <span className="text-ink-muted">({formatFigure(p.figure)})</span>
        </span>
      ))}
    </span>
  );
}

/** The award's own name for the category, without the accuracy table's notes ("looser match", "a list, no winner"). */
function categoryName(row: { note: string }): string {
  return row.note.split(" · ")[0];
}

function Footnote({ year, category }: { year: number; category: RaceCategory }) {
  return (
    <footer className="mt-10 border-t border-line pt-4 text-caption text-ink-muted md:mt-12">
      <p>
        A strong award is one whose &ldquo;Oscar nominees it caught&rdquo; is 50% or more, or whose winner was Oscar-nominated 80% or
        more of years, over at least 5 counted years. The figures are today&apos;s: they count every finished season, {year}{" "}
        included once its Oscars have been held.{" "}
        <TextLink href={`/accuracy/${category}#method`}>How accuracy is counted</TextLink>
      </p>
    </footer>
  );
}
