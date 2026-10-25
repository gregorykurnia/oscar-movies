import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { Flag, submittingLabel } from "@/components/flag/Flag";
import { FilmMarks } from "@/components/marks/MarksProvider";
import { PageHeader } from "@/components/page-header/PageHeader";
import { RaceRowsSkeleton } from "@/components/skeleton/Skeleton";
import { StagePill } from "@/components/stage-pill/StagePill";
import { TextLink } from "@/components/text-link/TextLink";
import { YearSwitcher } from "@/components/year-switcher/YearSwitcher";
import { getLastUpdate } from "@/data/loads";
import { Notice } from "@/components/notice/Notice";
import { getRacePrecursors, type RacePrecursors } from "@/data/precursors";
import { getOscarEdition, getOscarResults, type OscarEdition, type OscarEntry } from "@/data/oscars";
import { getPrecursorAwardCount, getRacePredictions } from "@/data/predictions";
import type { FilmRowData } from "@/data/films";
import { formatDate } from "@/lib/format";
import { eve } from "@/lib/predict/season";
import {
  RACE_CATEGORIES,
  seasonDate,
  seasonState,
  showsStagePills,
  stageLine,
  tabLead,
  type RaceCategory,
  type SeasonState,
} from "@/lib/race";
import {
  chanceColumns,
  formatChance,
  leaderOf,
  leadersOf,
  nominateSnapshot,
  raceRows,
  raceSnapshot,
  showAllText,
  splitRows,
  stagePillsBefore,
  withEveNominations,
  type Chance,
  type RaceSnapshot,
} from "@/lib/race-chances";
import { signalsHref } from "@/lib/signals";
import { oscarStage } from "@/lib/stage";
import { editionLabel, LIVE_YEAR, OLDEST_YEAR, yearRange } from "@/lib/years";
import { CategoryTabs } from "./CategoryTabs";
import { ContenderRow, type ChanceColumns } from "./ContenderRow";
import { RaceList } from "./RaceList";
import { RaceYearSwitcher } from "./RaceYearSwitcher";
import { StageLine } from "./StageLine";
import { WhyPanel } from "./WhyPanel";

const YEARS = yearRange(LIVE_YEAR, OLDEST_YEAR);

/**
 * Guide §8.1 The Oscar race, for `/` (the live season) and `/race/[year]`: PageHeader with the
 * year switcher, the race tabs, and per category the stage line, the contender rows with their
 * chances and "why" (live; past seasons show the final prediction, made on the eve of the
 * ceremony), "Show all" and the footnote. Season states: guide §8.12.
 */
export function RacePage({ year }: { year: number }) {
  return (
    <>
      <PageHeader
        title={`The ${year} race`}
        sub={
          <p>
            {editionLabel(year)}.
            <Suspense fallback={null}>
              <SubNote year={year} />
            </Suspense>
          </p>
        }
        actions={
          <Suspense fallback={<YearSwitcher year={year} years={YEARS} liveYear={LIVE_YEAR} href="/race/{year}" />}>
            <RaceYearSwitcher year={year} years={YEARS} liveYear={LIVE_YEAR} />
          </Suspense>
        }
      />
      <Suspense fallback={<RaceRowsSkeleton />}>
        <Race year={year} />
      </Suspense>
    </>
  );
}

/**
 * After the ceremony: when the final prediction was made (its eve). Before it, the live season's
 * last update. "After" is the rows' own rule (the winners are loaded and the eve's prediction is
 * stored), read from Best Picture, so the sub line never says "final" over live chances.
 */
async function SubNote({ year }: { year: number }) {
  // Wait for the request, so `next build` never reads the database.
  await connection();
  const [edition, picture, final] = await Promise.all([
    getOscarEdition(year),
    getOscarResults(year, "picture", "submitted"),
    getRacePredictions(year, "picture", "eve_ceremony"),
  ]);
  const finished = seasonState(picture.map((e) => e.outcome)) === "finished";
  if (edition?.winnersOn && finished && final.length > 0) {
    return ` Final prediction, made ${formatDate(new Date(`${eve(edition.winnersOn)}T00:00:00Z`), true)}.`;
  }
  if (year !== LIVE_YEAR) return null;
  const at = await getLastUpdate();
  return at ? ` Updated ${formatDate(new Date(at), true)}.` : null;
}

async function Race({ year }: { year: number }) {
  // Wait for the request: `next build` never reads the database (production has no tables
  // before its first migration), and "today" is the visit's day.
  await connection();
  const today = new Date().toISOString().slice(0, 10);
  const [edition, results, precursors] = await Promise.all([
    getOscarEdition(year),
    Promise.all(RACE_CATEGORIES.map((c) => getOscarResults(year, c.slug, "submitted"))),
    Promise.all(RACE_CATEGORIES.map((c) => getRacePrecursors(year, c.slug))),
  ]);
  if (!edition) {
    return (
      <EmptyState title="Not loaded yet" className="mt-10 md:mt-12">
        The {editionLabel(year)} aren&apos;t in the app yet.
      </EmptyState>
    );
  }

  const states = results.map((all) => seasonState(all.map((e) => e.outcome)));
  const chances = await Promise.all(
    RACE_CATEGORIES.map(async ({ slug }, i) => {
      const snapshot = raceSnapshot(states[i]);
      const nominate = nominateSnapshot(states[i]);
      const [own, eveOfNominations] = await Promise.all([
        getRacePredictions(year, slug, snapshot),
        nominate ? getRacePredictions(year, slug, nominate) : null,
      ]);
      // A finished season without its eve (no ceremony date) falls back to the live chances.
      const fallback = own.length === 0 && snapshot !== "live";
      const stored = fallback ? await getRacePredictions(year, slug, "live") : own;
      return {
        snapshot: fallback ? ("live" as const) : snapshot,
        stored: eveOfNominations ? withEveNominations(stored, eveOfNominations) : stored,
      };
    }),
  );
  const early = await Promise.all(
    RACE_CATEGORIES.map(({ slug }, i) =>
      chances[i].snapshot === "live" && (states[i] === "before" || states[i] === "shortlist") ? getPrecursorAwardCount(year, slug) : null,
    ),
  );

  const leads = {} as Record<RaceCategory, ReactNode>;
  const panels = {} as Record<RaceCategory, ReactNode>;
  RACE_CATEGORIES.forEach(({ slug }, i) => {
    const all = results[i];
    const state = states[i];
    const rows = raceRows({ state, entries: all, predictions: chances[i].stored });
    const submissions = slug === "international" ? all.length : 0;
    const leader = state === "finished" ? null : leaderOf(rows);
    if (leader) {
      leads[slug] = (
        <>
          {leader.film.flag ? <Flag code={leader.film.flag} size="sm" /> : null}
          <span data-lead-text className="truncate">
            {leader.film.title}
          </span>
          <span className="flex-none">{formatChance(leader.chance!.pWin)}%</span>
        </>
      );
    } else {
      const lead = tabLead({ state, submissions, entries: rows.flatMap((r) => (r.entry ? [{ outcome: r.entry.outcome, title: r.film.title, flag: r.film.flag }] : [])) });
      leads[slug] =
        lead.kind === "winner" ? (
          <>
            {lead.flag ? <Flag code={lead.flag} size="sm" /> : null}
            <span data-lead-text className="truncate">
              {lead.title}
            </span>
          </>
        ) : (
          <span data-lead-text className="truncate">
            {lead.text}
          </span>
        );
    }
    panels[slug] = (
      <CategoryPanel
        year={year}
        category={slug}
        edition={edition}
        today={today}
        state={state}
        snapshot={chances[i].snapshot}
        rows={rows}
        early={early[i] !== null && early[i] < 3}
        precursors={precursors[i]}
        submissions={submissions}
      />
    );
  });

  return <CategoryTabs leads={leads} panels={panels} />;
}

type Row = { film: FilmRowData; entry: OscarEntry | null; chance: Chance | null };

function CategoryPanel({
  year,
  category,
  edition,
  today,
  state,
  snapshot,
  rows,
  early,
  precursors,
  submissions,
}: {
  year: number;
  category: RaceCategory;
  edition: OscarEdition;
  today: string;
  state: SeasonState;
  snapshot: RaceSnapshot;
  rows: Row[];
  /** Fewer than 3 precursor awards have announced results (live, before the nominations). */
  early: boolean;
  precursors: RacePrecursors;
  submissions: number;
}) {
  const oscar = RACE_CATEGORIES.find((c) => c.slug === category)!.oscar;
  const line = stageLine({
    category,
    state,
    dates: edition,
    entries: rows.flatMap((r) => (r.entry ? [{ outcome: r.entry.outcome, title: r.film.title }] : [])),
    today,
  });
  const labels = chanceColumns(snapshot, rows);
  const columns: ChanceColumns = labels === null ? "none" : labels.nominate ? "both" : "win";
  const pills = state === "before" ? stagePillsBefore(rows.map((r) => r.entry?.outcome ?? null)) : showsStagePills(state);
  const lines = new Map(precursors.map((p) => [p.movieId, p]));
  const leaders = leadersOf(rows);
  const { shown, more } = splitRows(rows, state);
  // From the nominations on, the % to be nominated is the eve of the nominations' (`nominateSnapshot`).
  const nominatedEve = labels?.nominate && nominateSnapshot(state) && edition.nominationsOn ? eve(edition.nominationsOn) : null;
  const showAll = more.length > 0 ? showAllText(rows.length, more.map((r) => ({ title: r.film.title, noChance: r.chance === null }))) : null;

  const render = (r: Row) => (
    <ContenderRow
      key={r.film.id}
      title={r.film.title}
      href={`/movies/${r.film.slug}`}
      flag={r.film.flag}
      flagLabel={submittingLabel(r.film.flag, r.entry?.country ?? null)}
      badge={pills && r.entry ? <StagePill stage={oscarStage(r.entry.outcome, category)} /> : undefined}
      precursors={lines.get(r.film.id)}
      scores={r.film.scores}
      marks={<FilmMarks movieId={r.film.id} title={r.film.title} />}
      columns={columns}
      chance={
        r.chance
          ? {
              id: `${category}-${r.film.id}`,
              pWin: r.chance.pWin,
              pNominate: r.chance.pNominate,
              leader: leaders.has(r),
              final: snapshot === "eve_ceremony",
              why: <WhyPanel pct={formatChance(r.chance.pWin)} why={r.chance.why} oscar={oscar} methodHref={`/accuracy/${category}#method`} />,
            }
          : null
      }
    />
  );

  return (
    <>
      {/* The tab names the panel on screen; the heading keeps the outline h1 → h2 → h3 (1.R). */}
      <h2 className="sr-only">{oscar}</h2>
      <StageLine line={line} columns={labels} className="mt-[18px] md:mt-7" />
      <p data-signals-link className="mt-2.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-small text-ink-muted">
        <TextLink href={signalsHref(year, category)}>Strong signals, {year}</TextLink>
        <span>the films the best-predicting awards picked</span>
      </p>
      {rows.length > 0 && early ? (
        <Notice tone="gold" title="Early: few results yet." className="mt-5">
          Chances will move a lot as more awards announce their nominees and winners.
        </Notice>
      ) : null}
      {rows.length > 0 ? (
        <>
          <RaceList
            className={early ? "mt-5" : "mt-3"}
            rows={shown.map(render)}
            more={more.map(render)}
            moreLabel={showAll?.label}
            moreRest={showAll?.rest}
          />
          {labels ? (
            <p className="mt-10 text-caption text-ink-muted md:mt-12">
              The % chance to win in a category adds up to 100. Tap a % to see the past seasons behind it.
              {nominatedEve
                ? ` The % to be nominated is each nominee's chance on ${formatDate(new Date(`${nominatedEve}T00:00:00Z`), true)}, the day before the nominations.`
                : null}
            </p>
          ) : null}
        </>
      ) : (
        <NothingYet year={year} category={category} edition={edition} today={today} submissions={submissions} />
      )}
    </>
  );
}

/** Guide §8.12 "Nothing yet": what's missing and when it comes. */
function NothingYet({
  year,
  category,
  edition,
  today,
  submissions,
}: {
  year: number;
  category: RaceCategory;
  edition: OscarEdition;
  today: string;
  submissions: number;
}) {
  if (submissions > 0) {
    const shortlist = edition.shortlistOn ? ` The shortlist comes out ${seasonDate(edition.shortlistOn, today)}.` : "";
    return (
      <EmptyState
        title="No contenders yet"
        headingLevel={3}
        className="mt-7"
        actions={<TextLink href={`/submissions/${year}`} className="text-small">See the {year} submissions</TextLink>}
      >
        {submissions === 1 ? "1 country has" : `${submissions} countries have`} submitted a film so far.{shortlist}
      </EmptyState>
    );
  }
  const beforeDecember = today < `${year}-12-01`;
  return (
    <EmptyState title="No contenders yet" headingLevel={3} className="mt-7">
      {beforeDecember
        ? `The first precursor results arrive in December${category === "animated" ? ", starting with the Annie Award nominations" : ""}.`
        : "Nothing is loaded for this category yet."}
    </EmptyState>
  );
}
