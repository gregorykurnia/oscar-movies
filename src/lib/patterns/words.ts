// The nomination patterns' words (IMPLEMENTATION_PLAN.md Phase 8 notes): pattern labels, reasons,
// Snub risk signs, best-predictor labels and groups, and "How to pick the five". Award names come
// from the caller (`awardName`), so these stay pure.
import type { Figure } from "../accuracy";
import { fewFilms, type Pattern, type Predictor, type PredictorGroup, type Reason, type SnubRisk } from "./index";
import { STRONG_CAP, type PatternCategory, type SnubSign } from "./rules";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "3+ strong awards, not US-only", "1 strong award, US-only", "No strong awards" (International). */
export function patternLabel(p: Pattern): string {
  const count =
    p.strong === 0 ? "No strong awards" : p.strong >= STRONG_CAP ? `${STRONG_CAP}+ strong awards` : plural(p.strong, "strong award");
  return p.usOnly === null ? count : `${count}, ${p.usOnly ? "US-only" : "not US-only"}`;
}

/** "20 of 21", or "no films before" when there were none. */
export function figureWords(f: Figure, noun = "nominated"): string {
  return f.count === 0 ? "no films before" : `${f.hits} of ${f.count} ${noun}`;
}

/** The figure of a sign or a snub-rule reason, adding "few films" under five. */
function signFigure(f: Figure, noun: string): string {
  return f.count === 0 ? "no films before" : `${f.hits} of ${f.count} ${noun}${fewFilms(f) ? " (few films)" : ""}`;
}

export const SNUB_RISK_LABEL = "Snub risk";

const SIGNS: Record<SnubSign, { text: string; noun: string }> = {
  busy: { text: "among the most-nominated, but no Spirit or IDA nomination", noun: "such films got in" },
  sweep: { text: "a critics' sweep with no filmmakers' group", noun: "got in" },
};

/**
 * Guide §7: a figure never breaks inside its phrase. Joins "8 of 20 nominated", "2 nominations",
 * "1 at a strong award" and "none at a strong award" with no-break spaces.
 */
export const keepFigures = (text: string) =>
  text.replace(/\b(\d+ of \d+ [a-z]+|\d+ nominations?|(?:\d+|none) at (?:a )?strong awards?)/g, (phrase) => phrase.replace(/ /g, "\u00a0"));

/** "a critics' sweep with no filmmakers' group: 1 of 4 got in (few films)". */
export function snubRiskText(risk: SnubRisk): string {
  const sign = SIGNS[risk.sign];
  return `${sign.text}: ${signFigure(risk.figure, sign.noun)}`;
}

/** One reason as a sentence fragment (lower case; the page capitalises or joins). */
export function reasonText(reason: Reason): string {
  switch (reason.kind) {
    case "pattern":
      return `${patternLabel(reason.pattern)}: ${figureWords(reason.figure)}`;
    case "nominations":
      return `${plural(reason.total, "nomination")}, ${
        reason.strong === 0 ? "none at a strong award" : reason.strong === 1 ? "1 at a strong award" : `${reason.strong} at strong awards`
      }`;
    case "weak":
      return `its ${plural(reason.nominations, "nomination")} came from awards whose nominees did no better than the shortlist`;
    case "snub-rule":
      return snubRiskText({ sign: "busy", figure: reason.figure });
    case "filmmakers":
      return `a filmmakers' group nominated it: ${figureWords(reason.figure, "such films got in")}`;
  }
}

export const GROUP_LABELS: Record<PredictorGroup, { title: string; note: string }> = {
  "near-certain": { title: "Near-certain", note: "Got in 85% of the time or more, but few films a year." },
  "all-round": { title: "Best all-round", note: "Got in 65% of the time or more, and caught a quarter of the nominees." },
  "wide-net": { title: "Wide nets", note: "Most nominees had it, and many misses too." },
  warning: { title: "Warning signs", note: "Did no better than the shortlist as a whole." },
};

/** "Spirit Awards documentary nominee", "IDA Best Feature win", "US-only", "3+ strong awards, not US-only". */
export function predictorLabel(p: Predictor, awardName: (category: string) => string): string {
  switch (p.kind) {
    case "award":
      return `${awardName(p.category)} ${p.result === "win" ? "win" : "nominee"}`;
    case "country":
      return p.usOnly ? "US-only" : "Not US-only";
    case "pattern":
      return patternLabel(p.pattern);
    case "snub-rule":
      return "Among the five most-nominated, no Spirit and no IDA Best Feature nomination";
  }
}

/**
 * "How to pick the five", fixed per category, from `docs/research/nomination-predictors.md`
 * (International's written by task 8.3 from its numbers).
 */
export const HOW_TO_PICK: Record<PatternCategory, readonly string[]> = {
  documentary: [
    "Work from the shortlist of 15.",
    "Lock in films with 3+ strong awards, non-US first, and any IDA, European Film Awards or National Society winner.",
    "Next, Spirit Awards nominees, non-US first.",
    "Distrust a film among the five most-nominated with no Spirit or IDA Best Feature nomination, however many critics groups named it.",
    "The last one or two spots are open: prefer a non-US film with a DGA, Cinema Eye or Spirit nomination over a US crowd-pleaser with many critics-group wins.",
  ],
  international: [
    "Work from the shortlist of 15.",
    "Lock in a film the New York critics nominated, or that won the Golden Globe or the European Film Award: nearly all got in.",
    "Next, BAFTA, Golden Globe and Critics Choice nominees: about three in four got in, and most nominees had at least one of them.",
    "Count the critics groups: the five most-nominated got in about 7 times in 10, a film no strong award named about 1 in 5.",
    "Expect about one nominee a year from outside the five most-nominated; no sign has picked which favourite misses.",
  ],
};
