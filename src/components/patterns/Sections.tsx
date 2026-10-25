import Link from "next/link";
import type { ReactNode } from "react";
import { DataFigure, DataName, DataTable, type DataColumn, type DataRow } from "@/components/data-table/DataTable";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { FilmList } from "@/components/film-row/FilmRow";
import { Flags } from "@/components/flag/Flag";
import type { Stat } from "@/components/stats-strip/StatsStrip";
import { TextLink } from "@/components/text-link/TextLink";
import type { PatternsData } from "@/data/patterns";
import { formatFigure } from "@/lib/accuracy";
import { cn } from "@/lib/cn";
import type { FilmPatterns, PatternCategory, PredictorRow, SeasonPatterns } from "@/lib/patterns";
import { PREDICTOR_GROUPS } from "@/lib/patterns";
import { awardCategoryName, missedFilms, nomineesOf, patternsHref, percent, picksOf } from "@/lib/patterns/page";
import { GROUP_LABELS, HOW_TO_PICK, patternLabel, predictorLabel, keepFigures, reasonText } from "@/lib/patterns/words";
import { Caption, SnubRiskFlag } from "./Pieces";
import { Reveal, RevealTable } from "./Reveal";
import { CONTENDER_COLUMNS, ContenderRow, LIVE_COLUMNS, MISS_COLUMNS, MissRow, NomineeRow, PICK_COLUMNS, PickedRow } from "./Rows";

// The patterns page's sections (guide §8.14), in the page's order. Each is a server component
// that reads `PatternsData` and the season it shows.

const SHOWN_MISSES = 6;
const SHOWN_REST = 3;
const SHOWN_PREDICTORS = 5;
const SHOWN_STRONG = 10;

type Props = { data: PatternsData; season: SeasonPatterns };

/** A page section, 56px below the one before (40 on phone, guide §5); `className` replaces that margin. */
export function Section({ id, title, note, children, className }: { id: string; title: string; note?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={`${id}-h`} id={id} className={cn("scroll-mt-20", className ?? "mt-10 md:mt-14")}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 max-md:flex-col">
        <h2 id={`${id}-h`} className="text-section-phone leading-tight font-medium tracking-heading [overflow-wrap:anywhere] md:text-section">
          {title}
        </h2>
        {note ? <span className="text-small text-ink-muted">{note}</span> : null}
      </div>
      {children}
    </section>
  );
}

function SubHeading({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <h3 className="mt-8 border-b border-line-strong pb-2 text-caption font-medium text-ink-muted">
      {children}
      {note ? <span className="font-normal"> · {note}</span> : null}
    </h3>
  );
}

function ListHeading({ title, note }: { title: string; note: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <h3 className="text-body font-semibold">{title}</h3>
      <span className="text-caption text-ink-muted">{note}</span>
    </div>
  );
}

/** "Eno, Hollywoodgate, Frida and 1 more": what a "Show all" row still hides. */
function hidden(titles: string[]): string {
  const first = titles.slice(0, 3).join(", ");
  return titles.length > 3 ? `${first} and ${titles.length - 3} more` : first;
}

const films = (data: PatternsData, list: FilmPatterns[]) => list.map((film) => ({ film, link: data.films[Number(film.movie)] })).filter((r) => r.link);

/** The strip's cells: how the patterns did over every year they picked, how many nominees were underdogs, how the flag did. */
export function recordStats(data: PatternsData, category: PatternCategory): Stat[] {
  const { backtest, underdogs, flagged } = data;
  const first = backtest.rows[0]?.year;
  const last = backtest.rows.at(-1)?.year;
  const span = first && last ? `${first}–${last}` : "";
  const stat = (f: { hits: number; count: number }, label: string): Stat => ({ value: `${percent(f)}%`, of: `${f.hits} of ${f.count}`, meter: percent(f), label: `${label}, ${span}` });
  return [
    stat({ hits: backtest.hits, count: backtest.nominees }, "Nominees the patterns picked"),
    stat(underdogs, "Nominees that were underdogs"),
    ...(category === "documentary" ? [stat(flagged, "Flagged films got in (Snub risk)")] : []),
  ];
}

/** Finished seasons: the five it picked next to the five the Oscars nominated. */
export function FiveFinished({ data, season }: Props) {
  const winner = data.info[season.year]?.winner ?? null;
  const picks = picksOf(season);
  const hits = picks.filter((f) => f.nominated).length;
  return (
    <Section id="five" title="The five it picked" note={`${hits} of ${picks.length} were nominated`} className="mt-10">
      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <ListHeading title="What the patterns picked" note="Ranked, from earlier seasons only" />
          <FilmList columns={PICK_COLUMNS} className="min-w-0">
            {films(data, picks).map(({ film, link }) => (
              <PickedRow key={link.id} film={film} link={link} won={Number(film.movie) === winner} />
            ))}
          </FilmList>
        </div>
        <div>
          <ListHeading title="What the Oscars nominated" note="The winner first, then by the patterns' rank" />
          <FilmList columns={PICK_COLUMNS} className="min-w-0">
            {films(data, nomineesOf(season, winner)).map(({ film, link }) => (
              <NomineeRow key={link.id} film={film} link={link} won={Number(film.movie) === winner} slots={season.slots} />
            ))}
          </FilmList>
        </div>
      </div>
    </Section>
  );
}

/** The live year, and before the shortlist: the ranked list with "To be nominated", outside chances and the rest. */
export function FiveLive({ data, season, note }: Props & { note: string }) {
  const percentColumn = season.state === "shortlist";
  const all = films(data, season.films);
  const five = all.filter(({ film }) => (film.pick ?? Infinity) <= season.slots);
  const outside = all.filter(({ film }) => film.outside);
  const rest = all.filter(({ film }) => (film.pick ?? Infinity) > season.slots && !film.outside);
  const columns = percentColumn ? LIVE_COLUMNS : CONTENDER_COLUMNS;
  const noun = percentColumn ? "shortlist" : "contenders";
  const row = ({ film, link }: (typeof all)[number]) => <ContenderRow key={link.id} film={film} link={link} percent={percentColumn} />;
  return (
    <Section id="five" title={percentColumn ? "The five it picks" : "The contenders so far"} note={note} className="mt-10">
      {all.length === 0 ? (
        <EmptyState title="No contenders yet" headingLevel={3}>
          No shortlisted film or award result for {season.year} yet. They appear here as the awards announce them.
        </EmptyState>
      ) : (
        <FilmList columns={columns} head={percentColumn ? [{ label: "To be nominated", numeric: true }] : []}>
          {five.map(row)}
        </FilmList>
      )}
      {outside.length > 0 ? (
        <>
          <SubHeading>Outside chances ({outside.length})</SubHeading>
          <FilmList columns={columns} rule={false}>
            {outside.map(row)}
          </FilmList>
        </>
      ) : null}
      {rest.length > 0 ? (
        <>
          <SubHeading>{percentColumn ? `The rest of the ${noun}` : "The rest of the contenders"} ({rest.length})</SubHeading>
          {rest.length > SHOWN_REST ? (
            <Reveal
              label={`Show all ${all.length} contenders`}
              rest={hidden(rest.slice(SHOWN_REST).map((r) => r.link.title))}
              more={<FilmList columns={columns} rule={false}>{rest.slice(SHOWN_REST).map(row)}</FilmList>}
            >
              <FilmList columns={columns} rule={false}>
                {rest.slice(0, SHOWN_REST).map(row)}
              </FilmList>
            </Reveal>
          ) : (
            <FilmList columns={columns} rule={false}>
              {rest.map(row)}
            </FilmList>
          )}
        </>
      ) : null}
    </Section>
  );
}

const learnedColumns = (first: string): DataColumn[] => [{ key: "name", label: first }, { key: "nominated", label: "Nominated" }, { key: "rate", label: "Rate" }];
const rate = (r: number) => `${Math.round(r * 100)}%`;

/** What the patterns learned: the strong awards and the patterns, each with how it did in earlier seasons. */
export function Learned({ season }: { season: SeasonPatterns }) {
  const strong = season.awards.filter((a) => a.strong);
  const first = season.history[0];
  const last = season.history.at(-1);
  const strongRows: DataRow[] = strong.map((a) => ({
    key: a.category,
    cells: [<DataName key="n" name={awardCategoryName(a.category)} />, `${a.figure.hits} of ${a.figure.count}`, <b key="r" className="font-medium">{rate(a.rate)}</b>],
  }));
  const patternRows: DataRow[] = season.patterns.map((p) => ({
    key: `${p.pattern.strong}-${p.pattern.usOnly}`,
    cells: [patternLabel(p.pattern), p.figure.count === 0 ? "–" : `${p.figure.hits} of ${p.figure.count}`, <b key="r" className="font-medium">{rate(p.rate)}</b>],
  }));
  return (
    <Section id="learned" title="What the patterns learned" note={`From the ${season.history.length} seasons before ${season.year}, ${first}–${last}`}>
      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <ListHeading title="Strong awards" note={`${strong.length} of ${season.awards.length} awards`} />
          {strongRows.length > SHOWN_STRONG ? (
            <RevealTable
              columns={learnedColumns("Award")}
              rows={strongRows.slice(0, SHOWN_STRONG)}
              allRows={strongRows}
              label={`Show all ${strongRows.length} strong awards`}
              caption="Strong awards"
            />
          ) : strongRows.length > 0 ? (
            <DataTable columns={learnedColumns("Award")} rows={strongRows} caption="Strong awards" />
          ) : (
            <p className="border-t border-ink pt-4 text-small text-ink-muted">No award is strong yet.</p>
          )}
        </div>
        <div>
          <ListHeading title="Patterns" note="How films with each did" />
          <DataTable columns={learnedColumns("Pattern")} rows={patternRows} caption="Patterns" />
        </div>
      </div>
      <p className="mt-4 max-w-[760px] text-caption text-ink-muted">
        A strong award is one that nominated at least 6 shortlisted films and has a rate of 60% or more. The rate pulls a small count
        towards the share of shortlisted films nominated ({formatFigure(season.base)}), so 3 of 3 is not 100%.
      </p>
    </Section>
  );
}

/** Why they missed: the shortlisted films that weren't nominated, most-nominated first, each with its reasons. */
export function WhyTheyMissed({ data, season }: Props) {
  const missed = films(data, missedFilms(season));
  if (missed.length === 0) return null;
  const row = ({ film, link }: (typeof missed)[number]) => <MissRow key={link.id} film={film} link={link} />;
  const head = ["Why it missed"];
  const shown = missed.slice(0, SHOWN_MISSES);
  const later = missed.slice(SHOWN_MISSES);
  return (
    <Section id="missed" title="Why they missed" note="Shortlisted films that weren't nominated, most-nominated first">
      {later.length > 0 ? (
        <Reveal
          label={`Show all ${missed.length} films that missed`}
          rest={hidden(later.map((r) => r.link.title))}
          more={<FilmList columns={MISS_COLUMNS} rule={false}>{later.map(row)}</FilmList>}
        >
          <FilmList columns={MISS_COLUMNS} head={head}>
            {shown.map(row)}
          </FilmList>
        </Reveal>
      ) : (
        <FilmList columns={MISS_COLUMNS} head={head}>
          {shown.map(row)}
        </FilmList>
      )}
    </Section>
  );
}

/** The shortlisted films with the most nominations that didn't get in, every season since 2015. */
export function MostAwardedMisses({ data }: { data: PatternsData }) {
  if (data.misses.length === 0) return null;
  const columns: DataColumn[] = [
    { key: "film", label: "Film" },
    { key: "year", label: "Year" },
    { key: "nominations", label: "Nominations" },
    { key: "strong", label: "Strong awards", hidePhone: true },
    { key: "pick", label: "Pick" },
  ];
  const rows: DataRow[] = data.misses.flatMap(({ year, film }) => {
    const link = data.films[Number(film.movie)];
    if (!link) return [];
    return [
      {
        key: `${year}-${link.id}`,
        cells: [
          <span key="f" className="inline-flex items-start gap-2.5 text-left">
            <Flags code={link.flag} className="mt-1" />
            <span>
              <TextLink href={`/movies/${link.slug}`}>{link.title}</TextLink>
              <Caption>
                <span>{keepFigures(reasonText(film.reasons.find((r) => r.kind === "pattern") ?? { kind: "pattern", pattern: film.pattern, figure: { hits: 0, count: 0 } }))}</span>
                {film.snubRisk.length > 0 ? <SnubRiskFlag /> : null}
              </Caption>
            </span>
          </span>,
          year,
          film.nominations,
          film.strongAwards.length,
          film.pick !== null ? `#${film.pick}` : "–",
        ],
      },
    ];
  });
  const first = data.backtest.rows[0]?.year;
  return (
    <Section id="most-awarded" title="Most-awarded misses" note={`Every season since ${first}: the shortlisted films with the most nominations that didn't get in`}>
      <DataTable columns={columns} rows={rows} caption="Most-awarded misses" />
    </Section>
  );
}

function predictorRows(data: PatternsData, group: (typeof PREDICTOR_GROUPS)[number], list: PredictorRow[]): DataRow[] {
  return list.map((row) => ({
    key: row.key,
    cells: [
      predictorLabel(row.predictor, awardCategoryName),
      <DataFigure key="g" pct={percent(row.gotIn)} count={`${row.gotIn.hits} of ${row.gotIn.count}`} meter={group !== "wide-net"} />,
      <DataFigure key="c" pct={percent(row.caught)} count={`${row.caught.hits} of ${row.caught.count}`} meter={group === "wide-net"} />,
    ],
  }));
}

/** Best predictors, in four groups, each with "got in" and "caught". */
export function BestPredictors({ data }: { data: PatternsData }) {
  const { predictors } = data;
  const groups = predictors.groups.filter((g) => g.rows.length > 0);
  const columns: DataColumn[] = [{ key: "predictor", label: "Predictor" }, { key: "got-in", label: "Got in" }, { key: "caught", label: "Caught" }];
  const header = (group: (typeof PREDICTOR_GROUPS)[number]) => ({
    type: "group" as const,
    key: `group-${group}`,
    label: (
      <>
        <b className="font-medium text-ink">{GROUP_LABELS[group].title}</b> <span className="font-normal">{GROUP_LABELS[group].note}</span>
      </>
    ),
  });
  const short: DataRow[] = groups.flatMap((g) => [header(g.group), ...predictorRows(data, g.group, g.rows.slice(0, SHOWN_PREDICTORS))]);
  const full: DataRow[] = groups.flatMap((g) => [header(g.group), ...predictorRows(data, g.group, g.rows)]);
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const { shortlist } = predictors;
  return (
    <Section
      id="predictors"
      title="Best predictors"
      note={`All ${predictors.seasons.length} finished seasons together: ${shortlist.count} shortlisted films, ${shortlist.hits} nominees (${percent(shortlist)}% of the shortlist got in)`}
    >
      <p className="mb-3 max-w-[760px] text-caption text-ink-muted">
        <strong className="font-medium text-ink">Got in</strong> is the share of the films that had it which were nominated.{" "}
        <strong className="font-medium text-ink">Caught</strong> is the share of the nominees that had it. Shown when at least 6 films had it.
      </p>
      <RevealTable columns={columns} rows={short} allRows={full} label={`Show all ${total} predictors`} caption="Best predictors" />
    </Section>
  );
}

export function HowToPick({ category, name }: { category: PatternCategory; name: string }) {
  return (
    <Section id="how" title="How to pick the five" note={`${name}, in plain words`}>
      <ol className="max-w-[760px] border-t border-ink">
        {HOW_TO_PICK[category].map((text, i) => (
          <li key={text} className="grid grid-cols-[36px_minmax(0,1fr)] gap-2 border-b border-line py-3.5 text-body">
            <span aria-hidden="true" className="text-[18px] leading-[1.4] font-light tracking-[-0.02em] text-ink-muted">
              {i + 1}
            </span>
            <span>{text}</span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** Each year worked out from the seasons before it only: the patterns' hits, and the app's current method's. */
export function BacktestStrip({ data, year, category }: { data: PatternsData; year: number; category: PatternCategory }) {
  const { backtest, engineBacktest } = data;
  if (backtest.rows.length === 0) return null;
  const engine = new Map(engineBacktest.rows.map((r) => [r.year, r.hits]));
  const span = `${backtest.rows[0].year}–${backtest.rows.at(-1)!.year}`;
  const cells = backtest.rows.length + 1;
  const cell = "block min-w-0 border-l border-line px-2.5 pt-3.5 pb-4 max-md:border-t max-md:[&:nth-child(4n+1)]:border-l-0 max-md:[&:nth-child(4n+1)]:pl-0 max-md:[&:nth-child(-n+4)]:border-t-0 md:first:border-l-0 md:first:pl-0";
  return (
    <Section id="backtest" title="Backtest" note="Each year worked out from the seasons before it only, as it would have run live">
      <div
        data-backtest
        style={{ "--cells": cells } as React.CSSProperties}
        className="grid grid-cols-4 border-y border-line md:grid-cols-[repeat(var(--cells),minmax(0,1fr))]"
      >
        {backtest.rows.map((r) => {
          const current = r.year === year;
          return (
            <Link
              key={r.year}
              href={patternsHref(r.year, category)}
              aria-current={current ? "page" : undefined}
              className={cn(cell, "outline-none hover:bg-paper focus-visible:shadow-focus", current && "bg-gold-wash hover:bg-gold-wash")}
            >
              <span className={cn("block text-caption text-ink-muted", current && "font-medium text-gold-ink")}>{r.year}</span>
              <span className="mt-1.5 block text-[24px] leading-[1.1] font-light tracking-num whitespace-nowrap xl:text-[28px]">
                {r.hits}
                <small className="ml-1 text-[13px] tracking-normal text-ink-muted"> of {r.picks.length}</small>
              </span>
              <span className="mt-1 block text-micro text-ink-muted">Current {engine.get(r.year) ?? "–"}</span>
            </Link>
          );
        })}
        <div className={cell}>
          <span className="block text-caption text-ink-muted">{span}</span>
          <span className="mt-1.5 block text-[24px] leading-[1.1] font-light tracking-num whitespace-nowrap xl:text-[28px]">
            {backtest.hits}
            <small className="ml-1 text-[13px] tracking-normal text-ink-muted"> of {backtest.nominees}</small>
          </span>
          <span className="mt-1 block text-micro text-ink-muted">Current {engineBacktest.hits}</span>
        </div>
      </div>
      <p className="mt-3 max-w-[760px] text-caption text-ink-muted">
        The large figure is the patterns&apos; nominees found in their five. &ldquo;Current&rdquo; is the app&apos;s other method, run the same way.
        Once the shortlist is out, the race uses whichever picked more over these years, and the current method on a tie.
      </p>
    </Section>
  );
}

export function Footnote({ data, year, category }: { data: PatternsData; year: number; category: PatternCategory }) {
  const { predictors } = data;
  return (
    <footer className="mt-10 border-t border-line pt-4 text-caption text-ink-muted md:mt-12">
      <p>
        Tendencies from {predictors.seasons.length} seasons and {predictors.shortlist.hits} nominees, not rules. Each year is worked out from the
        seasons before it, so {year} saw only what was known on the eve of its nominations. Documentary and International count only films
        that made the Oscar shortlist. <TextLink href={`/accuracy/${category}#method`}>How accuracy is counted</TextLink>
      </p>
    </footer>
  );
}
