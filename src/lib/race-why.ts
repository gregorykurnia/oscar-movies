// The words of the "why" behind a % (guide §6.6, IMPLEMENTATION_PLAN.md §5.3): a sentence on the
// past contenders with the same two strongest results and how many won, the four strongest
// results with their record, and the years of those past seasons. Pure; names come from the
// award registry (`data/awards.json`), so the stored `why` keeps only slugs.
import registry from "../../data/awards.json";
import type { Why, WhyResult } from "@/lib/predict/types";

type RegistryAward = (typeof registry)[number];

const BY_KEY = new Map<string, { award: RegistryAward; name: string; oscarCategory: string }>(
  registry.flatMap((award) => award.categories.map((c) => [`${award.slug}/${c.slug}`, { award, name: c.name, oscarCategory: c.oscarCategory }] as const)),
);

/**
 * A precursor category as the "why" names it: the award's short name ("BAFTA"); a festival's
 * prize after it ("Cannes Palme d'Or"); an award with several categories towards the same Oscar
 * category gets the part that tells them apart ("Globes (Drama)", "Annie (Independent)").
 */
export function precursorLabel(key: string): string {
  const found = BY_KEY.get(key);
  if (!found) return key;
  const { award, name, oscarCategory } = found;
  if (award.kind === "festival") return `${award.shortName} ${name}`;
  const siblings = award.categories.filter((c) => c.oscarCategory === oscarCategory).length;
  if (siblings < 2) return award.shortName;
  const dash = name.lastIndexOf(" – ");
  return `${award.shortName} (${dash >= 0 ? name.slice(dash + 3) : name})`;
}

type Verb = "won" | "nominated" | "runner-up" | "selected";

/** What a result was: a nomination at a festival is a runner-up place (Toronto), at AFI a place on its list. */
function verbOf(r: Pick<WhyResult, "category" | "result">): Verb {
  if (r.result === "won") return "won";
  const award = BY_KEY.get(r.category)?.award;
  if (award?.isSelection) return "selected";
  return award?.kind === "festival" ? "runner-up" : "nominated";
}

const ITEM_LABEL: Record<Verb, string> = { won: "Won", nominated: "Nominated", "runner-up": "Runner-up", selected: "Selected" };

/** One result of the list: "Won PGA" · "won the Oscar 10 of 14 years". */
export function whyItem(r: WhyResult): { label: string; record: string } {
  const verb = verbOf(r);
  const label = verb === "won" ? `Won ${precursorLabel(r.category)}` : `${ITEM_LABEL[verb]}, ${precursorLabel(r.category)}`;
  if (r.count === 0) return { label, record: "no past record" };
  const record = verb === "won" ? `won the Oscar ${r.hits} of ${r.count} years` : `${r.hits} of ${r.count} won the Oscar`;
  return { label, record };
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** "six", "14": words up to ten (guide §11, "Three of them won Best Picture."). */
function count(n: number): string {
  return n <= 10 ? WORDS[n] : n.toLocaleString("en-US");
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function joinAnd(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const RUN_VERB: Record<Verb, string> = { won: "won", nominated: "nominated at", "runner-up": "runner-up at", selected: "on the list at" };

/** The two strongest results in words: "won PGA and DGA", "won Globes (Drama), nominated at BAFTA". */
export function runText(top: WhyResult[]): string {
  const groups = new Map<Verb, string[]>();
  for (const r of top.slice(0, 2)) {
    const verb = verbOf(r);
    groups.set(verb, [...(groups.get(verb) ?? []), precursorLabel(r.category)]);
  }
  return [...groups].map(([verb, labels]) => `${RUN_VERB[verb]} ${joinAnd(labels)}`).join(", ");
}

/** The sentence on the left: how many past contenders had this run, and how many won. */
export function whySentence(why: Why, oscar: string): string {
  if (why.top.length === 0) {
    return "It has no wins or nominations yet at the awards followed here, so its chance is the share left for a contender with none.";
  }
  const run = runText(why.top);
  const n = why.similar?.count ?? 0;
  if (n === 0) return `No past contender had a season like this one (${run}), so its chance comes from each result's own record.`;
  const won = why.similar!.won;
  const head = `${capital(count(n))} past ${n === 1 ? "contender" : "contenders"} had a season like this one (${run}).`;
  if (n === 1) return `${head} ${won === 1 ? "It won" : "It didn't win"} ${oscar}.`;
  const tail =
    won === 0 ? `None of them won ${oscar}.`
    : won === n ? `${n === 2 ? "Both" : "All of them"} won ${oscar}.`
    : `${capital(count(won))} of them won ${oscar}.`;
  return `${head} ${tail}`;
}

/** "Similar seasons: 2014, 2016, 2019" (each year once), or null when there are none. */
export function similarSeasons(why: Why): string | null {
  const years = [...new Set(why.similar?.films.map((f) => f.year) ?? [])].sort((a, b) => a - b);
  return years.length > 0 ? `Similar seasons: ${years.join(", ")}` : null;
}
