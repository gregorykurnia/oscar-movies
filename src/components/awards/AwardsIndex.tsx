import { connection } from "next/server";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { FeatureLink, IndexList, IndexRow, IndexSection } from "@/components/index-list/IndexList";
import { PageHeader } from "@/components/page-header/PageHeader";
import { RaceRowsSkeleton } from "@/components/skeleton/Skeleton";
import { StagePill } from "@/components/stage-pill/StagePill";
import { YearSwitcher } from "@/components/year-switcher/YearSwitcher";
import { getYearEditions, type YearEdition } from "@/data/awards";
import { getOscarResults } from "@/data/oscars";
import type { AwardSummary } from "@/lib/awards";
import { awardsOfKind, editionState, givesLabel, oscarsLine, rowDate, type IndexState } from "@/lib/awards-index";
import { FIRST_LINEUP_YEAR, hasLineups, lineupPath, opensLineup } from "@/lib/lineup";
import { editionLabel, LIVE_YEAR, OLDEST_YEAR, yearRange } from "@/lib/years";

const YEARS = yearRange(LIVE_YEAR, OLDEST_YEAR);

/**
 * Guide §8.7 Awards index (`/awards/[year]`): PageHeader with the year switcher, then the Oscars as
 * one feature link, then major awards, festivals and critics groups as lists in calendar order. A
 * row with no data reads "No data" and has no page to open; a partly loaded one reads "Partly
 * loaded" and opens its page.
 */
export function AwardsIndexPage({ year }: { year: number }) {
  return (
    <>
      <PageHeader
        title={`Awards ${year}`}
        sub="The Oscars, then major awards, festivals and critics groups, in calendar order."
        actions={<YearSwitcher year={year} years={YEARS} liveYear={LIVE_YEAR} href="/awards/{year}" />}
      />
      <Suspense fallback={<RaceRowsSkeleton label="Loading awards" />}>
        <Sections year={year} />
      </Suspense>
    </>
  );
}

/**
 * Guide §8.7 festivals index (`/festivals/[year]`): the festivals for a year, on the same template.
 * From 2025 a lineup festival opens its lineup; before, and for DOC NYC, its prizes.
 */
export function FestivalsIndexPage({ year }: { year: number }) {
  return (
    <>
      <PageHeader
        title={`Festivals ${year}`}
        sub={hasLineups(year) ? "Festival lineups, in calendar order." : "Festival prizes, in calendar order."}
        actions={<YearSwitcher year={year} years={YEARS} liveYear={LIVE_YEAR} href="/festivals/{year}" />}
      />
      <Suspense fallback={<RaceRowsSkeleton label="Loading festivals" />}>
        <FestivalSection year={year} />
      </Suspense>
    </>
  );
}

async function Sections({ year }: { year: number }) {
  // Wait for the request, so `next build` never reads the database.
  await connection();
  const [editions, winners] = await Promise.all([getYearEditions(year), getOscarResults(year, "picture", "won")]);
  const byAward = new Map(editions.map((e) => [e.slug, e]));
  const oscars = byAward.get("oscars");
  const dates = new Map(editions.map((e) => [e.slug, e.winnersOn]));
  const majors = awardsOfKind("major", dates);
  const festivals = awardsOfKind("festival", dates);
  const critics = awardsOfKind("critics", dates);
  return (
    <>
      <div className="mt-10 md:mt-12">
        <FeatureLink href={`/awards/oscars/${year}`} name={editionLabel(year)}>
          <OscarsLine
            winnersOn={oscars?.winnersOn ?? null}
            pictureWinner={winners[0]?.film.title ?? null}
            state={editionState(oscars)}
          />
        </FeatureLink>
      </div>
      <IndexSection id="majors-h" title="Major awards" count={majors.length} first>
        <AwardRows awards={majors} year={year} byAward={byAward} />
      </IndexSection>
      <IndexSection id="festivals-h" title="Festivals" count={festivals.length}>
        <AwardRows awards={festivals} year={year} byAward={byAward} />
      </IndexSection>
      <IndexSection id="critics-h" title="Critics groups" count={critics.length}>
        {critics.length > 0 ? (
          <AwardRows awards={critics} year={year} byAward={byAward} />
        ) : (
          <EmptyState headingLevel={3} title="No critics groups yet">
            Their results aren&apos;t in the app yet.
          </EmptyState>
        )}
      </IndexSection>
    </>
  );
}

async function FestivalSection({ year }: { year: number }) {
  await connection();
  const editions = await getYearEditions(year);
  const byAward = new Map(editions.map((e) => [e.slug, e]));
  const festivals = awardsOfKind("festival", new Map(editions.map((e) => [e.slug, e.winnersOn])));
  return (
    <IndexSection
      id="festivals-h"
      title="Festivals"
      count={festivals.length}
      note={hasLineups(year) ? undefined : `prizes only before ${FIRST_LINEUP_YEAR}`}
      first
    >
      <AwardRows awards={festivals} year={year} byAward={byAward} lineups />
    </IndexSection>
  );
}

function AwardRows({
  awards,
  year,
  byAward,
  lineups = false,
}: {
  awards: AwardSummary[];
  year: number;
  byAward: Map<string, YearEdition>;
  /** The festivals index: a lineup festival opens its lineup from 2025, its prizes before; DOC NYC always its prizes. */
  lineups?: boolean;
}) {
  return (
    <IndexList>
      {awards.map((award) => {
        const edition = byAward.get(award.slug);
        const state = editionState(edition);
        // A lineup can be loaded before its festival's prizes, so from 2025 a festival with an edition opens it.
        const lineup = lineups && opensLineup(award.slug, year);
        const opens = lineup ? lineupPath(award.slug, year) : `/awards/${award.slug}/${year}`;
        const linked = lineup ? edition !== undefined : state !== "no-data";
        return (
          <IndexRow
            key={award.slug}
            href={linked ? opens : undefined}
            name={award.name}
            gives={givesLabel(award)}
            end={state === "loaded" ? rowDate(award.kind, edition?.winnersOn ?? null) : <StatePill state={state} />}
          />
        );
      })}
    </IndexList>
  );
}

/** The Oscars' line: the ceremony's day and the Best Picture winner, then a pill while the edition isn't whole. */
function OscarsLine({
  winnersOn,
  pictureWinner,
  state,
}: {
  winnersOn: string | null;
  pictureWinner: string | null;
  state: IndexState;
}) {
  const line = oscarsLine(winnersOn, pictureWinner);
  return (
    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {line ? <span>{line}</span> : null}
      <StatePill state={state} />
    </span>
  );
}

/** "No data" or "Partly loaded"; nothing for a loaded edition. */
function StatePill({ state }: { state: IndexState }) {
  if (state === "loaded") return null;
  return <StagePill stage={state === "partial" ? "partly-loaded" : "no-data"} />;
}
