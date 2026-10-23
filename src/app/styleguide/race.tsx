import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/button/Button";
import { Flag } from "@/components/flag/Flag";
import { Marks } from "@/components/marks/Marks";
import { CategoryTabs } from "@/components/race/CategoryTabs";
import { ContenderList, ContenderRow } from "@/components/race/ContenderRow";
import { StageLine } from "@/components/race/StageLine";
import { SearchResults } from "@/components/search/SearchCommand";
import { searchFocusedBox, searchKbd } from "@/components/search/search-styles";
import { ShowAllRow } from "@/components/show-all/ShowAllRow";
import { StagePill } from "@/components/stage-pill/StagePill";
import { cn } from "@/lib/cn";
import type { StageLineText } from "@/lib/race";
import { Board, Cell, Spec } from "./parts";
import type { Sample } from "./sample";

/** The boards of the race page's pieces (task 1.17) and of search: the index in components.tsx lists them. */
export const RACE_BOARDS = [
  { id: "race-tabs", title: "Race tabs and stage line", components: ["CategoryTabs", "StageLine"] },
  { id: "contender-rows", title: "Contender row and Show all row", components: ["ContenderRow", "ShowAllRow"] },
  { id: "search", title: "Search", components: ["SearchCommand"] },
] as const;

function stageLines(stress: boolean): Array<[string, StageLineText]> {
  const titles = stress ? "Rindfleischetikettierungsüberwachungsaufgabenübertragungsgesetz" : "Anora";
  return [
    ["Before the nominations", { done: false, lead: "Nominations 22 Jan", rest: "Ceremony 15 Mar" }],
    ["Shortlist out", { done: false, lead: "Shortlist out 16 Dec", rest: "Nominations 22 Jan" }],
    ["Nominations out", { done: false, lead: "Ceremony 15 Mar", rest: `${stress ? "1,204 nominees" : "10 nominees"}, announced 22 Jan` }],
    ["Season over", { done: true, lead: "Ceremony 2 Mar 2025", rest: `${titles} won Best Picture` }],
    ["No rest", { done: false, lead: "Nominations", rest: null }],
  ];
}

const POPOVER = "w-full max-w-[440px] rounded-lg bg-surface p-2 shadow-pop";

/** The search box as it looks open, drawn in place (the live one is in the top bar above). */
function DrawnBox({ value, children }: { value: string; children?: ReactNode }) {
  return (
    <div className={cn(searchFocusedBox, "h-[38px]")}>
      <Search aria-hidden="true" className="size-4 flex-none text-ink-muted" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate text-small">{value}</span>
      {children}
    </div>
  );
}

export function RaceBoards({ s }: { s: Sample }) {
  const lines = stageLines(s.stress);
  const panels = {
    picture: lines[3],
    documentary: lines[2],
    international: lines[1],
    animated: lines[0],
  };
  const tabLeads = {
    picture: <><Flag code="US" size="sm" /><span data-lead-text className="truncate">{s.tabLeads.picture}</span></>,
    documentary: <span data-lead-text className="truncate">{s.tabLeads.documentary}</span>,
    international: <span data-lead-text className="truncate">{s.tabLeads.international}</span>,
    animated: <span data-lead-text className="truncate">{s.tabLeads.animated}</span>,
  };
  const { search } = s;
  return (
    <>
      <Board
        id="race-tabs"
        title="Race tabs and stage line"
        note="Guide §6.3–6.4. Four equal tabs, each the category with its lead under it (the winner, or a count); a 2px gold line under the selected one. Phone: names only, in a row that scrolls sideways. Arrow keys, Home and End switch tabs, and the choice is kept in the address (?category=). Each panel here shows one stage line state. The dot is gold while the season is live and ink once it is over."
      >
        <div className="w-full [&>[role=tablist]]:mt-0 md:[&>[role=tablist]]:mt-0">
          <CategoryTabs
            leads={tabLeads}
            panels={{
              picture: <StageLine line={panels.picture[1]} className="mt-[18px] md:mt-7" />,
              documentary: <StageLine line={panels.documentary[1]} className="mt-[18px] md:mt-7" />,
              international: <StageLine line={panels.international[1]} className="mt-[18px] md:mt-7" />,
              animated: <StageLine line={panels.animated[1]} className="mt-[18px] md:mt-7" />,
            }}
          />
        </div>
        <Spec className="w-full">
          {lines.map(([name, line]) => (
            <Cell key={name} name="Stage line" note={name} className="w-full max-w-[640px]">
              <StageLine line={line} />
            </Cell>
          ))}
        </Spec>
      </Board>

      <Board
        id="contender-rows"
        title="Contender row and Show all row"
        note="Guide §6.5 and §7. Flags, the title with its Oscar stage pill, the scores line, and the marks at the right (under the title on phone). The first rule is ink and the list closes with a rule. Pills are left off a list of nominees, where every row would say “Nominated”. The % chance columns arrive with the chances (Phase 3). A long list ends in the Show all row."
      >
        <div className="w-full">
          <ContenderList>
            <ContenderRow
              title={s.films[0].title}
              href="#"
              flags={s.films[0].flags}
              badge={<StagePill stage="won" />}
              scores={s.films[0].scores}
              marks={<Marks watched want={false} />}
            />
            <ContenderRow
              title={s.films[1].title}
              href="#"
              flags={s.films[1].flags}
              badge={<StagePill stage="nominated" />}
              scores={s.films[1].scores}
              marks={<Marks watched={false} want />}
            />
            <ContenderRow
              title={s.films[2].title}
              href="#"
              flags={["BR", "FR", "NL"]}
              firstFlagLabel="Brazil, submitting country"
              badge={<StagePill stage="shortlisted" />}
              scores={s.films[2].scores}
              marks={<Marks watched={false} want={false} />}
            />
            <ContenderRow
              title="No pill on a list of nominees"
              href="#"
              flags={["US"]}
              scores={s.scoreRows[2]}
              marks={<Marks watched={false} want={false} disabled />}
            />
          </ContenderList>
        </div>
        <div className="w-full">
          <ContenderList className="border-b-0">
            <ContenderRow
              title={s.stress ? s.films[1].title : "A film with a long title that wraps under its flags on a phone"}
              href="#"
              flags={s.coProduction}
              badge={<StagePill stage="nominated" />}
              scores={s.scoreRows[1]}
              marks={<Marks watched={false} want={false} />}
            />
          </ContenderList>
          <ShowAllRow href="#" label={s.showAll} rest="sorted by % chance" />
        </div>
        <Spec>
          <Cell name="Show all row" note="short">
            <ShowAllRow href="#" label="Show all 21" className="w-[320px] max-w-full" />
          </Cell>
        </Spec>
      </Board>

      <Board
        id="search"
        title="Search"
        note="Guide §7. One search for the whole app, in the top bar above (press / to open it, Esc to close, ↑ ↓ and Enter to move and open). Wide screens: the box is the input and the results drop under it as a 440px popover. Compact: the icon opens the same popover. Phone: a full-screen sheet with Cancel. The states below are drawn from sample results, in place; the first match is highlighted as the arrows would leave it."
      >
        <Spec>
          <Cell name="Results" note={`“${search.query}” matches films and awards`} className="w-full max-w-[440px]! grid-cols-[minmax(0,1fr)]">
            <div className={POPOVER}>
              <DrawnBox value={search.query}>
                <kbd className={searchKbd}>esc</kbd>
              </DrawnBox>
              <div className="mt-1.5">
                <SearchResults kind="results" id="sg-results" query={search.query} films={search.films} awards={search.awards} activeIndex={0} />
              </div>
            </div>
          </Cell>
          <Cell name="Found by its original title" note="the original title shows, so the match isn't a mystery" className="w-full max-w-[440px]! grid-cols-[minmax(0,1fr)]">
            <div className={POPOVER}>
              <DrawnBox value={search.originalQuery}>
                <kbd className={searchKbd}>esc</kbd>
              </DrawnBox>
              <div className="mt-1.5">
                <SearchResults
                  kind="results"
                  id="sg-original"
                  query={search.originalQuery}
                  films={search.originalFilms}
                  awards={[]}
                  activeIndex={-1}
                />
              </div>
            </div>
          </Cell>
        </Spec>
        <Spec>
          <Cell name="No results" className="w-full max-w-[440px]! grid-cols-[minmax(0,1fr)]">
            <div className={POPOVER}>
              <DrawnBox value={search.noMatch}>
                <kbd className={searchKbd}>esc</kbd>
              </DrawnBox>
              <div className="mt-1.5">
                <SearchResults kind="empty" query={search.noMatch} />
              </div>
            </div>
          </Cell>
          <Cell name="Failed" note="the request failed or the server answered an error" className="w-full max-w-[440px]! grid-cols-[minmax(0,1fr)]">
            <div className={POPOVER}>
              <DrawnBox value={search.originalQuery}>
                <kbd className={searchKbd}>esc</kbd>
              </DrawnBox>
              <div className="mt-1.5">
                <SearchResults kind="failed" />
              </div>
            </div>
          </Cell>
        </Spec>
        <Spec>
          <Cell name="Phone sheet" note="760px and under it fills the screen; here it is drawn at its width" className="w-full max-w-[390px]! grid-cols-[minmax(0,1fr)]">
            <div className="w-full overflow-hidden rounded-lg border border-line bg-surface">
              <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <DrawnBox value={search.query} />
                </div>
                <Button variant="ghost" tabIndex={-1}>
                  Cancel
                </Button>
              </div>
              <div className="px-2 pb-2">
                <SearchResults kind="results" id="sg-sheet" query={search.query} films={search.films} awards={search.awards} activeIndex={0} />
              </div>
            </div>
          </Cell>
        </Spec>
      </Board>
    </>
  );
}
