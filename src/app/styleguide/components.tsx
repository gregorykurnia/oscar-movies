import { ArrowLeft, Search } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/button/Button";
import { Chip } from "@/components/chip/Chip";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { FilmList, FilmRow } from "@/components/film-row/FilmRow";
import { Flag, Flags } from "@/components/flag/Flag";
import { LabelledMark, Mark, Marks } from "@/components/marks/Marks";
import { Notice } from "@/components/notice/Notice";
import { backLinkClasses, PageHeader } from "@/components/page-header/PageHeader";
import { ScoreLine } from "@/components/score-line/ScoreLine";
import { ScoreTiles } from "@/components/score-tiles/ScoreTiles";
import { Segmented } from "@/components/segmented/Segmented";
import { RaceRowsSkeleton, Skeleton } from "@/components/skeleton/Skeleton";
import { STAGE_LABELS, StagePill, type Stage } from "@/components/stage-pill/StagePill";
import { ErrorPage } from "@/components/status-page/ErrorPage";
import { NotFoundPage } from "@/components/status-page/NotFoundPage";
import { StatsStrip } from "@/components/stats-strip/StatsStrip";
import { TextLink } from "@/components/text-link/TextLink";
import { yearRange } from "@/lib/years";
import { YearSwitcher } from "@/components/year-switcher/YearSwitcher";
import { SortableTableDemo, ToastDemo } from "./demos";
import { RACE_BOARDS, RaceBoards } from "./race";
import { Board, Cell, Spec } from "./parts";
import type { Sample } from "./sample";

/**
 * Every board on the page, in order: the index at the top and the test read this list, so a
 * component built later is added here and nowhere else. `components` are the names it shows.
 */
export const BOARDS = [
  { id: "marks", title: "Watched and want to watch", components: ["Marks", "Mark", "LabelledMark"] },
  { id: "toast", title: "Toast", components: ["Toast"] },
  { id: "buttons", title: "Buttons and links", components: ["Button", "TextLink"] },
  { id: "stages", title: "Stage pills", components: ["StagePill"] },
  { id: "flags", title: "Flags", components: ["Flag", "Flags"] },
  { id: "scores", title: "Scores", components: ["ScoreLine", "ScoreTiles"] },
  { id: "navigation", title: "Navigation pieces", components: ["Segmented", "Chip", "YearSwitcher"] },
  { id: "notices", title: "Notices, empty and loading", components: ["Notice", "EmptyState", "Skeleton"] },
  { id: "page-header", title: "AppShell and PageHeader", components: ["AppShell", "PageHeader"] },
  { id: "stats-table", title: "Stats strip and data table", components: ["StatsStrip", "DataTable"] },
  { id: "film-rows", title: "Film list and film row", components: ["FilmList", "FilmRow"] },
  ...RACE_BOARDS,
  { id: "status-pages", title: "Not found and error pages", components: ["NotFoundPage", "ErrorPage"] },
] as const;

const STAGES: Array<[Stage, string]> = [
  ["won", ""],
  ["nominated", ""],
  ["shortlisted", "or eligible"],
  ["submitted", "International"],
  ["not-nominated", ""],
  ["runner-up", "Toronto"],
  ["no-data", ""],
  ["partly-loaded", "coverage"],
  ["live", "live season"],
];

const SCORE_NOTES = ["all four", "one missing", "none yet"];
const SCORE_TILE_DATES = { imdb: new Date(Date.UTC(2026, 9, 14)), rt: new Date(Date.UTC(2026, 9, 14)) };
const NOW = new Date(Date.UTC(2026, 9, 22));

export function Components({ s }: { s: Sample }) {
  const years = yearRange(2026, 2012);
  return (
    <>
      <Board
        id="marks"
        title="Watched and want to watch"
        note="Round toggle buttons, 36px (40px on phone), hit area at least 44px. Marking watched clears want to watch. The change shows at once; if saving fails, the mark flips back, shows the failed ring for 2s and a toast says so. Here the states are set by hand; /styleguide/marks has real ones that save."
      >
        <Spec>
          <Cell name="Off">
            <Marks watched={false} want={false} />
          </Cell>
          <Cell name="Watched">
            <Marks watched want={false} />
          </Cell>
          <Cell name="Want to watch">
            <Marks watched={false} want />
          </Cell>
          <Cell name="Saving" note="after 400ms only">
            <Mark kind="watched" on status="saving" />
          </Cell>
          <Cell name="Failed" note="flipped back">
            <Mark kind="watched" on={false} status="failed" />
          </Cell>
          <Cell name="Small" note="30px, year grid">
            <Marks watched want={false} size="sm" />
          </Cell>
          <Cell name="Offline" note="both disabled">
            <Marks watched={false} want disabled />
          </Cell>
        </Spec>
        <Spec>
          <Cell name="Labelled" note="movie page only">
            <div className="flex gap-2">
              <LabelledMark kind="watched" on />
              <LabelledMark kind="want" on={false} />
            </div>
          </Cell>
          <Cell name="Labelled, saving and failed">
            <div className="flex gap-2">
              <LabelledMark kind="watched" on status="saving" />
              <LabelledMark kind="want" on={false} status="failed" />
            </div>
          </Cell>
        </Spec>
      </Board>

      <Board
        id="toast"
        title="Toast"
        note="Only for failures and the odd neutral note; successes need none. Bottom right (bottom, full width on phone), stays until closed or retried. The shell's Toaster places the live ones; here it is drawn in place."
      >
        <Spec>
          <Cell name="Failure toast">
            <ToastDemo
              title="Couldn't save"
              description="Hamnet is back to not watched. Check the connection and try again."
              retry
              close
            />
          </Cell>
          <Cell name="Neutral note">
            <ToastDemo tone="info" title="Link copied" close />
          </Cell>
        </Spec>
      </Board>

      <Board
        id="buttons"
        title="Buttons and links"
        note="Few buttons in this app. Primary is gold-ink and appears at most once per screen. Wording is a verb: “Try again”, “Go to the race”, “Show all 38 contenders”. Hover, focus and press are live: use the pointer and Tab."
      >
        <Spec>
          <Cell name="Primary">
            <Button variant="primary">Try again</Button>
          </Cell>
          <Cell name="Loading">
            <Button variant="primary" loading>
              Try again
            </Button>
          </Cell>
          <Cell name="Disabled">
            <Button variant="primary" disabled>
              Try again
            </Button>
          </Cell>
          <Cell name="Secondary">
            <Button>Go to the race</Button>
          </Cell>
          <Cell name="With icon">
            <Button>
              <Search aria-hidden="true" strokeWidth={1.75} />
              Search
            </Button>
          </Cell>
          <Cell name="Ghost">
            <Button variant="ghost">Clear search</Button>
          </Cell>
          <Cell name="Small">
            <Button size="sm" variant="ghost">
              Try again
            </Button>
          </Cell>
          <Cell name="Long label">
            <Button variant="secondary">{s.showAll}</Button>
          </Cell>
        </Spec>
        <Spec>
          <Cell name="Text link" note="underline line-strong, ink on hover">
            <TextLink href="#">How the % chance works</TextLink>
          </Cell>
          <Cell name="Gold text link">
            <TextLink href="#" tone="gold">
              How the % chance works
            </TextLink>
          </Cell>
          <Cell name="Back link" note="in PageHeader">
            <Link href="#" className={backLinkClasses}>
              <ArrowLeft aria-hidden="true" strokeWidth={1.75} />
              Awards 2024
            </Link>
          </Cell>
        </Spec>
      </Board>

      <Board
        id="stages"
        title="Stage pills"
        note="The Oscar stage is a pill; gold only for a win. A prize name can replace the label."
      >
        <Spec>
          {STAGES.map(([stage, note]) => (
            <Cell key={stage} name={STAGE_LABELS[stage]} note={note}>
              <StagePill stage={stage} />
            </Cell>
          ))}
          <Cell name="Prize name" note="festival prize">
            <StagePill stage="won">{s.stress ? "Palme d'Or, Un Certain Regard, Jury Prize" : "Grand Prix"}</StagePill>
          </Cell>
        </Spec>
      </Board>

      <Board
        id="flags"
        title="Flags"
        note="3:2 artwork with a hairline edge, main country first, up to three then +N. The flag's name is the country."
      >
        <Spec>
          <Cell name="One" note="21×14">
            <Flags codes={["US"]} />
          </Cell>
          <Cell name="Co-production" note="three, then +N">
            <Flags codes={s.coProduction} />
          </Cell>
          <Cell name="Stacked" note="in race rows">
            <Flags codes={["GB", "US"]} stacked />
          </Cell>
          <Cell name="Small" note="15×10, tabs">
            <Flags codes={["BR"]} size="sm" />
          </Cell>
          <Cell name="Large" note="30×20, movie page">
            <Flags codes={["BR", "FR"]} size="lg" />
          </Cell>
          <Cell name="Submitting country" note="first flag named">
            <Flags codes={["BR", "FR", "NL"]} firstLabel="Brazil, submitting country" />
          </Cell>
          <Cell name="Unknown code" note="blank, not broken">
            <Flag code="XX" />
          </Cell>
        </Spec>
      </Board>

      <Board
        id="scores"
        title="Scores"
        note="Missing scores are “–”, never 0, and the average says how many sources it uses."
      >
        <Spec>
          {s.scoreRows.map((scores, i) => (
            <Cell key={i} name="Score line" note={s.stress ? "none yet" : SCORE_NOTES[i]}>
              <ScoreLine scores={scores} />
            </Cell>
          ))}
        </Spec>
        <Cell name="Score tiles" note="movie page: four sources and the average" className="w-full">
          <ScoreTiles
            className="w-full"
            now={NOW}
            scores={
              s.stress
                ? {
                    imdb: { value: null, updatedAt: null },
                    rt: { value: null, updatedAt: null },
                    mc: { value: null, updatedAt: null },
                    tmdb: { value: null, updatedAt: null },
                    average: null,
                    count: 0,
                  }
                : {
                    imdb: { value: 8.1, updatedAt: SCORE_TILE_DATES.imdb },
                    rt: { value: 97, updatedAt: SCORE_TILE_DATES.rt },
                    mc: { value: null, updatedAt: null },
                    tmdb: { value: 7.8, updatedAt: SCORE_TILE_DATES.imdb },
                    average: 86,
                    count: 3,
                  }
            }
          />
        </Cell>
      </Board>

      <Board
        id="navigation"
        title="Navigation pieces"
        note="Other pages switch category or sort with the segmented control. Filters are chips. Everything that changes the view is kept in the address. Race tabs are on their own board below."
      >
        <Spec>
          <Cell name="Segmented" note="category">
            <Segmented
              label="Category"
              items={[
                { label: "Picture", href: "#", current: true },
                { label: "Documentary", href: "#" },
                { label: "International", href: "#" },
                { label: "Animated", href: "#" },
              ]}
            />
          </Cell>
          <Cell name="Filter chips" note="off, on">
            <div className="flex gap-2">
              <Chip pressed={false}>Unwatched</Chip>
              <Chip pressed>Shortlisted</Chip>
              <Chip pressed={false}>Want to watch</Chip>
            </div>
          </Cell>
          <Cell name="Year switcher" note="click to open; arrows, Enter and Esc work">
            <YearSwitcher year={2025} years={years} liveYear={2026} href="/styleguide?year={year}" />
          </Cell>
        </Spec>
      </Board>

      <Board id="notices" title="Notices, empty and loading">
        <Spec>
          <Cell name="Notice, gold" note="season state">
            <Notice tone="gold" title="Early: few results yet." className="max-w-[520px]">
              Chances will move a lot until the Golden Globe and Critics Choice nominations in December.
            </Notice>
          </Cell>
          <Cell name="Notice, neutral" note="coverage">
            <Notice className="max-w-[420px]">Festival lineups are tracked from 2025 on. Earlier years show prizes only.</Notice>
          </Cell>
          <Cell name="Notice, error" note="no connection">
            <Notice tone="error" title="You're offline." role="status" className="max-w-[420px]">
              Showing the page as last loaded. Marks can&apos;t be saved until you&apos;re back.
            </Notice>
          </Cell>
        </Spec>
        <Spec>
          <Cell name="Empty state" className="w-full max-w-[640px]">
            <EmptyState title="No contenders yet" className="w-full">
              The first precursor results arrive in December, starting with the Annie Award nominations.
            </EmptyState>
          </Cell>
          <Cell name="Empty state with actions" className="w-full max-w-[640px]">
            <EmptyState
              title="Nothing on your watch list"
              className="w-full"
              actions={<Button variant="secondary">Go to the race</Button>}
            >
              Add a film with its bookmark and it shows up here.
            </EmptyState>
          </Cell>
        </Spec>
        <Cell name="Loading" note="skeleton rows in the row's own shape, after 300ms only (reload to see them appear)" className="w-full">
          <div className="w-full">
            <RaceRowsSkeleton />
          </div>
        </Cell>
        <Spec>
          <Cell name="Skeleton block" note="slow shimmer; none with reduced motion">
            <Skeleton className="h-5 w-48" />
          </Cell>
        </Spec>
      </Board>

      <Board
        id="page-header"
        title="AppShell and PageHeader"
        note="This page sits in the real AppShell: the top bar above (the phone menu from the menu button at phone width) and the footer below. Every page starts with PageHeader: an optional back link, the one h1, a sub line, actions at the right."
      >
        <Cell name="With back link, sub and year switcher" className="w-full">
          <PageHeader
            className="w-full"
            headingLevel={2}
            back={{ label: "Awards 2024", href: "#" }}
            title="BAFTA 2024"
            sub="78th British Academy Film Awards, 16 Feb 2025"
            actions={<YearSwitcher year={2024} years={years} liveYear={2026} href="/styleguide?year={year}" />}
          />
        </Cell>
        <Cell name="Long title with no spaces" note="wraps anywhere" className="w-full">
          <PageHeader className="w-full" headingLevel={2} title={s.stress ? s.longWord : "The 2025 race"} sub="98th Academy Awards. Updated 20 Dec 2025." />
        </Cell>
      </Board>

      <Board
        id="stats-table"
        title="Stats strip and data table"
        note="Three equal cells between line rules; stacks on phone. A stat that counts films links to the filtered list. The table's heads are buttons: sort it."
      >
        <StatsStrip
          stats={[
            { value: "57%", of: "8 of 14", label: "Favourite won the Oscar", meter: 57 },
            { value: s.stress ? "1,204" : "47", label: "Films with a nomination", href: "#" },
            { value: "–", label: "No data yet" },
          ]}
        />
        <SortableTableDemo awardName={s.awardName} huge={s.stress} />
      </Board>

      <Board
        id="film-rows"
        title="Film list and film row"
        note="Flags, title with a meta line and the scores line, result columns, marks. The first rule is ink; the winner's row has a gold wash. On phone the results drop under the title."
      >
        <FilmList head={["BAFTA", "Oscar, Best Picture"]} className="w-full">
          {s.films.map((film, i) => (
            <FilmRow
              key={film.title}
              title={film.title}
              href={film.href}
              lang={film.lang}
              flags={film.flags}
              meta={film.meta}
              scores={film.scores}
              winner={i === 0}
              badge={i === 2 ? <StagePill stage="shortlisted" /> : undefined}
              results={[
                { label: "BAFTA", value: <StagePill stage={i === 0 ? "won" : "nominated"} /> },
                { label: "Oscar, Best Picture", value: <StagePill stage={i === 0 ? "won" : "not-nominated"} /> },
              ]}
              marks={<Marks watched={i === 0} want={i === 1} />}
            />
          ))}
        </FilmList>
        <FilmList
          head={[{ label: "To win", numeric: true }, { label: "Nominations", numeric: true }]}
          columns={["minmax(0,1fr)", "132px", "132px", "84px"]}
          className="w-full"
        >
          <FilmRow
            title={s.stress ? s.films[2].title : "The Secret Agent"}
            href="#"
            flags={["BR", "FR", "NL"]}
            firstFlagLabel="Brazil, submitting country"
            meta="2025 · International"
            results={[
              { label: "To win", value: "34%", numeric: true, gold: true },
              { label: "Nominations", value: s.nominations, numeric: true },
            ]}
            marks={<Marks watched={false} want />}
          />
        </FilmList>
      </Board>

      <RaceBoards s={s} />

      <Board
        id="status-pages"
        title="Not found and error pages"
        note="Guide §8.11, drawn without the top bar and footer (they are the shell around this page). The live ones are app/not-found.tsx and app/error.tsx. The 404 names the season and the list's size once the data layer knows them; the error shows its digest and the visitor's clock."
      >
        <div className="rounded-lg border border-line bg-paper px-4 md:px-8">
          <NotFoundPage season={2026} toWatch={4} headingLevel={2} />
        </div>
        <div className="rounded-lg border border-line bg-paper px-4 md:px-8">
          <ErrorPage reference="7f3a9c" time="22 Oct 2026, 08:14" headingLevel={2} />
        </div>
      </Board>
    </>
  );
}
