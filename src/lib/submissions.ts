// International submissions (guide §8.3, plan §4): the sort and the chips are in the address
// (`?sort=`, and `?filter=` repeated per chip), and the list is built from the year's rows and
// the marks. Pure, so the address, the filters and the sorts are unit tested.
import type { Stage } from "@/components/stage-pill/StagePill";
import { countryName } from "@/components/flag/Flag";
import type { OscarEntry } from "@/data/oscars";
import { isMarkFilter, MARK_FILTER_LABELS, MARK_FILTERS, passesMark, toggleFilterIn, type MarkFilter, type MarkSets } from "@/lib/mark-filter";
import { isShortlisted, OUTCOMES, oscarStage, type Outcome } from "@/lib/stage";

export const SUBMISSION_SORTS = ["country", "stage", "average"] as const;
export type SubmissionSort = (typeof SUBMISSION_SORTS)[number];
export const SUBMISSION_FILTERS = ["shortlisted", ...MARK_FILTERS] as const;
export type SubmissionFilter = (typeof SUBMISSION_FILTERS)[number];

export const SORT_LABELS: Record<SubmissionSort, string> = {
  country: "Country",
  stage: "Oscar stage",
  average: "Average score",
};
export const FILTER_LABELS: Record<SubmissionFilter, string> = {
  shortlisted: "Shortlisted",
  ...MARK_FILTER_LABELS,
};
/** What the empty state says a film is under each chip. */
export const FILTER_PHRASES: Record<SubmissionFilter, string> = {
  shortlisted: "shortlisted",
  watched: "marked watched",
  unwatched: "unwatched",
  want: "marked want to watch",
};

const DEFAULT_SORT: SubmissionSort = "country";

export type SubmissionQuery = { sort: SubmissionSort; filters: SubmissionFilter[] };

type SearchParams = Record<string, string | string[] | undefined>;

/** The address's sort and filters. Anything unknown is ignored: the default sort, no filters. */
export function parseSubmissionQuery(params: SearchParams): SubmissionQuery {
  const sort = SUBMISSION_SORTS.find((s) => s === [params.sort].flat()[0]) ?? DEFAULT_SORT;
  const values = [params.filter ?? []].flat();
  // Only one mark chip counts: the first in the chips' order, as a hand-typed address may repeat them.
  const mark = MARK_FILTERS.find((f) => values.includes(f));
  return { sort, filters: SUBMISSION_FILTERS.filter((f) => (isMarkFilter(f) ? f === mark : values.includes(f))) };
}

/** The address's query for a sort and filters: "?sort=stage&filter=shortlisted", or "" for the defaults. */
export function submissionsQuery({ sort, filters }: SubmissionQuery): string {
  const params = new URLSearchParams();
  if (sort !== DEFAULT_SORT) params.set("sort", sort);
  for (const filter of SUBMISSION_FILTERS) if (filters.includes(filter)) params.append("filter", filter);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function submissionsHref(year: number, state: SubmissionQuery): string {
  return `/submissions/${year}${submissionsQuery(state)}`;
}

/** The filters with one chip flipped, kept in the order the chips are shown; a mark chip replaces the other mark chips. */
export function toggleFilter(filters: SubmissionFilter[], filter: SubmissionFilter): SubmissionFilter[] {
  return toggleFilterIn(SUBMISSION_FILTERS, filters, filter);
}

/**
 * The Oscar stage pill on this page. An International row that is "eligible" is the one Wikipedia
 * lists as Not nominated (see the research notes in IMPLEMENTATION_PLAN.md task 1.4), so it reads that
 * way rather than "Eligible".
 */
export function submissionStage(outcome: Outcome): Stage {
  return oscarStage(outcome, "international");
}

const countryOf = (e: OscarEntry) => (e.country ? countryName(e.country) : "");

/** The tie-break every sort ends on: the country's name, then the film's title. */
function byCountry(a: OscarEntry, b: OscarEntry): number {
  return countryOf(a).localeCompare(countryOf(b), "en") || a.film.title.localeCompare(b.film.title, "en");
}

const COMPARE: Record<SubmissionSort, (a: OscarEntry, b: OscarEntry) => number> = {
  country: byCountry,
  // Furthest first (won, nominated, shortlisted, not nominated, submitted), then by country.
  stage: (a, b) => OUTCOMES.indexOf(b.outcome) - OUTCOMES.indexOf(a.outcome) || byCountry(a, b),
  // Highest average first; films with no scores last.
  average: (a, b) => {
    const x = a.film.scores.average;
    const y = b.film.scores.average;
    if (x === y) return byCountry(a, b);
    if (x === null) return 1;
    if (y === null) return -1;
    return y - x || byCountry(a, b);
  },
};

/**
 * The rows the page shows: the chips filter (shortlisted: the shortlist and further; a mark chip:
 * `passesMark`), then the sort.
 */
export function viewSubmissions(entries: OscarEntry[], { sort, filters }: SubmissionQuery, marks: MarkSets): OscarEntry[] {
  const mark: MarkFilter | undefined = filters.find(isMarkFilter);
  const shown = entries.filter(
    (e) => (!filters.includes("shortlisted") || isShortlisted(e.outcome)) && (!mark || passesMark(mark, e.film.id, marks)),
  );
  return shown.sort(COMPARE[sort]);
}
