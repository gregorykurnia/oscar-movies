// Oscar stages (plan §3.1 rules, §3.2 rule 2): the order of outcomes and the furthest one a film
// reached. Pure, shared by the data layer and the pages.
import type { Stage } from "@/components/stage-pill/StagePill";
import { outcome } from "@/db/schema";

/** In the schema's order: submitted, eligible, shortlisted, runner_up, nominated, won. */
export const OUTCOMES = outcome.enumValues;
export type Outcome = (typeof OUTCOMES)[number];

// submitted < eligible = shortlisted < runner_up = nominated < won.
const RANK: Record<Outcome, number> = {
  submitted: 0,
  eligible: 1,
  shortlisted: 1,
  runner_up: 2,
  nominated: 2,
  won: 3,
};

/** Compare two outcomes by how far they go (for sorting, furthest first: `-compareOutcome`). */
export function compareOutcome(a: Outcome, b: Outcome): number {
  return RANK[a] - RANK[b];
}

/** A nomination: runner-up counts as one (product plan §10). */
export function isNomination(outcome: Outcome): boolean {
  return RANK[outcome] >= RANK.nominated;
}

/** On the shortlist or further (shortlisted, runner-up, nominated, won): not just eligible or submitted. */
export function isShortlisted(outcome: Outcome): boolean {
  return OUTCOMES.indexOf(outcome) >= OUTCOMES.indexOf("shortlisted");
}

/** The stage pill for an outcome. */
export function outcomeStage(outcome: Outcome): Stage {
  return outcome === "runner_up" ? "runner-up" : outcome;
}

/** A film's flags: the submitting country first (International), then its production countries. */
export function flagsFor(countries: string[], submittingCountry?: string | null): string[] {
  if (!submittingCountry) return countries;
  return [submittingCountry, ...countries.filter((c) => c !== submittingCountry)];
}
