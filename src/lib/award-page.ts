// The words of an award page (guide §8.2, §11): the accuracy stats strip, what the Oscar column
// says for a film, and the footnotes. Pure, shared by the award pages.
import type { Stat } from "@/components/stats-strip/StatsStrip";
import type { Stage } from "@/components/stage-pill/StagePill";
import { formatFigure, formatFigureCount, type Figure } from "@/lib/accuracy";
import type { AwardFigures, OscarOutcome } from "@/data/awards";
import { RACE_CATEGORIES, type SeasonState } from "@/lib/race";
import { oscarStage } from "@/lib/stage";

/** "Best Picture" for an Oscar category slug, as the race names it. */
export function oscarName(category: string): string {
  return RACE_CATEGORIES.find((c) => c.slug === category)?.oscar ?? category;
}

function stat(figure: Figure | null, label: string): Stat {
  if (figure === null || figure.count === 0) return { value: formatFigure(figure), label };
  return {
    value: formatFigure(figure),
    of: formatFigureCount(figure),
    label,
    meter: (figure.hits / figure.count) * 100,
  };
}

/** The four accuracy figures; "–" for a figure with nothing to count (winners-only awards have no nominee figures). */
export function accuracyStats(figures: AwardFigures | null): Stat[] {
  return [
    stat(figures?.win ?? null, "Winner won the Oscar"),
    stat(figures?.nomination ?? null, "Winner was nominated"),
    stat(figures?.nominees ?? null, "Nominees were nominated"),
    stat(figures?.caught ?? null, "Oscar nominees it caught"),
  ];
}

/**
 * The Oscar column for a film. A film on the Oscar category's list shows its stage there. One
 * that isn't reads Not nominated once the nominations are out, and nothing before that. So does
 * an eligible film (Animated's eligible list) once the nominees are named without it.
 */
export function oscarCell(
  oscar: OscarOutcome,
  state: SeasonState,
  category: string,
): { stage: Stage; country: string | null } | null {
  const nominationsOut = state === "nominations" || state === "finished";
  if (oscar && !(nominationsOut && oscar.outcome === "eligible")) {
    return { stage: oscarStage(oscar.outcome, category), country: oscar.country };
  }
  if (nominationsOut) return { stage: "not-nominated", country: oscar?.country ?? null };
  return null;
}
