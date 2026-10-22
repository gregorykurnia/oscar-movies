// The race's season states (plan §3.2 rule 4, guide §8.12) and the words of its stage line and
// tab leads. Pure, shared by the race pages; results only until the chances arrive (Phase 3).
import { isNomination, OUTCOMES, type Outcome } from "@/lib/stage";
import { formatDate } from "@/lib/format";

export const RACE_CATEGORIES = [
  { slug: "picture", name: "Picture", oscar: "Best Picture" },
  { slug: "documentary", name: "Documentary", oscar: "Best Documentary Feature" },
  { slug: "international", name: "International", oscar: "Best International Feature" },
  { slug: "animated", name: "Animated", oscar: "Best Animated Feature" },
] as const;

export type RaceCategory = (typeof RACE_CATEGORIES)[number]["slug"];

/** The category in the address (`?category=`); anything unknown is Picture. */
export function parseCategory(value: string | string[] | null | undefined): RaceCategory {
  const slug = Array.isArray(value) ? value[0] : value;
  return RACE_CATEGORIES.find((c) => c.slug === slug)?.slug ?? "picture";
}

/** The race's address for a year and category: the live season is `/`, Picture has no `?category=`. */
export function raceHref(year: number, category: RaceCategory, liveYear: number): string {
  const path = year === liveYear ? "/" : `/race/${year}`;
  return category === "picture" ? path : `${path}?category=${category}`;
}

/**
 * Where a category's season stands, from the Oscar results it has (not the dates, which only
 * say when the next step is due): nothing yet, the shortlist, the nominations, or finished.
 */
export type SeasonState = "before" | "shortlist" | "nominations" | "finished";

export function seasonState(outcomes: Outcome[]): SeasonState {
  if (outcomes.includes("won")) return "finished";
  if (outcomes.some(isNomination)) return "nominations";
  if (outcomes.includes("shortlisted")) return "shortlist";
  return "before";
}

/**
 * The rows the race shows: the shortlist while it's the latest step, then the nominees only
 * (with the winner). Before the shortlist there are none until the precursors arrive (Phase 2–3).
 * Keeps the given order (furthest first).
 */
export function raceEntries<T extends { outcome: Outcome }>(entries: T[], state: SeasonState): T[] {
  if (state === "before") return [];
  if (state === "shortlist") return entries.filter((e) => OUTCOMES.indexOf(e.outcome) >= OUTCOMES.indexOf("shortlisted"));
  return entries.filter((e) => isNomination(e.outcome));
}

/** Stage pills after the titles everywhere but the nominations, where every row is a nominee. */
export function showsStagePills(state: SeasonState): boolean {
  return state === "shortlist" || state === "finished";
}

/** The Oscars' dates for a year, as ISO dates ("2026-01-22"). */
export type SeasonDates = {
  shortlistOn: string | null;
  nominationsOn: string | null;
  winnersOn: string | null;
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * A season date in the stage line (guide §11: the year is left out when it's the season's):
 * "22 Jan" while the date is near, "21 Jan 2027" when it falls in another calendar year more than
 * 90 days off, and always with the year once the season is over.
 */
export function seasonDate(iso: string, today: string, withYear = false): string {
  const date = new Date(`${iso}T00:00:00Z`);
  const now = new Date(`${today}T00:00:00Z`);
  const far = date.getUTCFullYear() !== now.getUTCFullYear() && Math.abs(date.getTime() - now.getTime()) > 90 * DAY;
  return formatDate(date, withYear || far);
}

/** "Anora", "A and B", "A, B and C". */
function joinTitles(titles: string[]): string {
  if (titles.length <= 1) return titles[0] ?? "";
  return `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}

export type StageLineText = {
  /** The season is over: the dot turns ink. */
  done: boolean;
  /** The step in ink 500 ("Nominations 22 Jan"). */
  lead: string;
  /** The rest, in ink-muted ("Ceremony 15 Mar"). */
  rest: string | null;
};

/** Guide §6.4: the stage line under the tabs, for one category. */
export function stageLine({
  category,
  state,
  dates,
  entries,
  today,
}: {
  category: RaceCategory;
  state: SeasonState;
  dates: SeasonDates;
  /** The rows the race shows (`raceEntries`), with their titles. */
  entries: { outcome: Outcome; title: string }[];
  today: string;
}): StageLineText {
  const d = (iso: string | null, withYear = false) => (iso ? seasonDate(iso, today, withYear) : null);
  const step = (label: string, iso: string | null, withYear = false) => {
    const date = d(iso, withYear);
    return date ? `${label} ${date}` : label;
  };
  const oscar = RACE_CATEGORIES.find((c) => c.slug === category)!.oscar;

  switch (state) {
    case "finished": {
      const winners = entries.filter((e) => e.outcome === "won").map((e) => e.title);
      return { done: true, lead: step("Ceremony", dates.winnersOn, true), rest: `${joinTitles(winners)} won ${oscar}` };
    }
    case "nominations": {
      const n = entries.length;
      const announced = d(dates.nominationsOn);
      return {
        done: false,
        lead: step("Ceremony", dates.winnersOn),
        rest: `${n} ${n === 1 ? "nominee" : "nominees"}${announced ? `, announced ${announced}` : ""}`,
      };
    }
    case "shortlist":
      return { done: false, lead: step("Shortlist out", dates.shortlistOn), rest: step("Nominations", dates.nominationsOn) };
    case "before":
      // Picture and Animated have no shortlist to wait for (Animated's eligible list has no date).
      if (category === "documentary" || category === "international") {
        return { done: false, lead: step("Shortlist", dates.shortlistOn), rest: step("Nominations", dates.nominationsOn) };
      }
      return { done: false, lead: step("Nominations", dates.nominationsOn), rest: step("Ceremony", dates.winnersOn) };
  }
}

/** Under a tab's name (guide §6.3), until the chances arrive: the winner, or a count. */
export type TabLead = { kind: "winner"; title: string; flag: string | null } | { kind: "text"; text: string };

export function tabLead({
  state,
  entries,
  submissions,
}: {
  state: SeasonState;
  entries: { outcome: Outcome; title: string; flags: string[] }[];
  /** International: how many countries have submitted a film. */
  submissions: number;
}): TabLead {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  switch (state) {
    case "finished": {
      const winners = entries.filter((e) => e.outcome === "won");
      return { kind: "winner", title: joinTitles(winners.map((w) => w.title)), flag: winners[0]?.flags[0] ?? null };
    }
    case "nominations":
      return { kind: "text", text: plural(entries.length, "nominee", "nominees") };
    case "shortlist":
      return { kind: "text", text: `${entries.length} shortlisted` };
    case "before":
      return { kind: "text", text: submissions > 0 ? plural(submissions, "submission", "submissions") : "No contenders yet" };
  }
}
