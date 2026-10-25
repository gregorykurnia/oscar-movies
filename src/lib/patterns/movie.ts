// The movie page's Nomination patterns panel and Strong tag (guide §8.6 v1.2, Phase 8 notes):
// what the patterns say about a film shortlisted in Documentary or International. Pure; the page
// reads `src/data/patterns.ts` and passes the season's patterns in.
import type { Stage } from "@/components/stage-pill/StagePill";
import { isShortlisted, oscarStage, type Outcome } from "../stage";
import { LIVE_YEAR } from "../years";
import { FIRST_SEASON, PICKS_FROM, type FilmPatterns, type PatternCategory, type SeasonPatterns } from "./index";
import { patternsHref, PATTERN_TABS } from "./page";
import { figureWords, patternLabel, snubRiskText } from "./words";

/** The Oscar boxes a panel can come from: a shortlist place or better, 2012 on, in a patterns category. */
export function panelCategory(box: { year: number; category: string; outcome: Outcome }): PatternCategory | null {
  if (box.year < FIRST_SEASON || !isShortlisted(box.outcome)) return null;
  return box.category === "documentary" || box.category === "international" ? box.category : null;
}

export type NominationPanel = {
  year: number;
  category: PatternCategory;
  /** "Best Documentary Feature" */
  categoryName: string;
  /** The film's pattern and how films with it did before; null where the patterns have no earlier seasons to read. */
  pattern: { label: string; record: string } | null;
  /** "Pick #k of N"; null before 2015 (no pick) or without a season. */
  pick: { rank: number; of: number } | null;
  /** Its Oscar result in this category, for the stage pill: a shortlisted film is "Not nominated" once the nominees are out. */
  stage: Stage;
  /** The Snub risk flag: `result` says how a past year went; each sign is a sentence with its figure. */
  flag: { result: "missed" | "got-in" | null; signs: string[] } | null;
  /** That year's patterns page; null before 2015, which has none. */
  href: string | null;
};

const sentence = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;

/** The panel for a film's shortlisted box; `season` is the patterns' season (null for 2012, which has none). */
export function nominationPanel(input: {
  movieId: number;
  box: { year: number; category: PatternCategory; outcome: Outcome };
  season: SeasonPatterns | null | undefined;
}): NominationPanel {
  const { box, season } = input;
  const film: FilmPatterns | undefined = season?.films.find((f) => Number(f.movie) === input.movieId);
  const reason = film?.reasons.find((r) => r.kind === "pattern");
  const flagged = film && film.snubRisk.length > 0;
  // Without a season (2012 has no earlier seasons to read) the nominees are out unless it is the live year.
  const nomineesOut = season ? season.state === "nominations" : box.year < LIVE_YEAR;
  const stage = box.outcome === "shortlisted" && nomineesOut ? "not-nominated" : oscarStage(box.outcome, box.category);
  return {
    year: box.year,
    category: box.category,
    categoryName: PATTERN_TABS.find((t) => t.slug === box.category)?.oscar ?? box.category,
    pattern: film && reason?.kind === "pattern" ? { label: patternLabel(reason.pattern), record: figureWords(reason.figure) } : null,
    pick: film && season && film.pick !== null ? { rank: film.pick, of: season.films.length } : null,
    stage,
    flag: flagged
      ? {
          result: film.nominated === null ? null : film.nominated ? "got-in" : "missed",
          signs: film.snubRisk.map((s) => sentence(snubRiskText(s))),
        }
      : null,
    href: box.year >= PICKS_FROM ? patternsHref(box.year, box.category) : null,
  };
}

/** A result row's key for the Strong tag: the film year, the Oscar category and "award/category". */
export const strongKey = (year: number, oscarCategory: string, category: string) => `${year}:${oscarCategory}:${category}`;

/**
 * The film's results at the season's strong awards, as `strongKey`s: only those the patterns
 * counted (announced before the Oscar nominations), so the tags match the "N strong awards" captions.
 */
export function strongKeys(season: SeasonPatterns | null | undefined, movieId: number): string[] {
  const film = season?.films.find((f) => Number(f.movie) === movieId);
  return (film?.strongAwards ?? []).map((category) => strongKey(season!.year, season!.category, category));
}
