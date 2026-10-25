// Search words (plan §5.5, guide §7 Search): how a typed query is folded for matching, where the
// match sits in a title (for the gold underline) and which awards match. Pure, shared by the
// route, the data layer and `SearchCommand`. The film match itself runs in the database
// (`src/data/search.ts`) on `movies.search_key`, which is folded the same way (`f_unaccent(lower(…))`).
import type { Stage } from "@/components/stage-pill/StagePill";

/** The longest query the search looks at. */
export const SEARCH_MAX_LENGTH = 80;
export const MAX_FILMS = 8;
export const MAX_AWARDS = 5;

/** One film in the results: what the row shows and where it goes. */
export type SearchFilm = {
  /** The film's ID, for writes that take one (Add a film on the Watch list). */
  id: number;
  slug: string;
  title: string;
  originalTitle: string | null;
  /** BCP 47 tag of the original title, for `lang=`. */
  originalLang: string | null;
  year: number;
  /** The submitting or main production country (ISO 3166-1 alpha-2), for the flag. */
  flag: string | null;
  /** The Oscar categories the film appears in ("Best Picture", "International"). */
  categories: string[];
  /** The furthest Oscar stage the film reached, or null when it has no Oscar result. */
  stage: Stage | null;
  href: string;
};

export type AwardKind = "oscars" | "major" | "festival" | "critics";

/** An award or festival as the search lists it. */
export type SearchableAward = {
  slug: string;
  name: string;
  shortName: string;
  kind: AwardKind;
  /** The newest year with results loaded: the page a result opens. */
  year: number;
  calendarOrder: number;
};

export type SearchAward = {
  slug: string;
  name: string;
  shortName: string;
  kindLabel: string;
  href: string;
};

export type SearchResponse = { films: SearchFilm[]; awards: SearchAward[] };

export const KIND_LABELS: Record<AwardKind, string> = {
  oscars: "Oscars",
  major: "Major award",
  festival: "Festival",
  critics: "Critics group",
};

// What Postgres's `unaccent` turns into plain letters but Unicode decomposition does not.
const LETTERS: Record<string, string> = { ø: "o", đ: "d", ł: "l", æ: "ae", œ: "oe", ß: "ss", ı: "i", þ: "th", ð: "d" };

type Folded = {
  text: string;
  /** For each character of `text`, where it starts and ends in the original string. */
  starts: number[];
  ends: number[];
};

/** Lower case, accents off, curly apostrophes straight; remembers where each character came from. */
function fold(value: string): Folded {
  let text = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let index = 0;
  for (const char of value) {
    const end = index + char.length;
    const plain = char
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[’‘`ʼ]/g, "'")
      .replace(/[\s\S]/gu, (c) => LETTERS[c] ?? c);
    for (const c of plain) {
      text += c;
      for (let i = 0; i < c.length; i++) {
        starts.push(index);
        ends.push(end);
      }
    }
    index = end;
  }
  return { text, starts, ends };
}

/** The query as the search compares it: folded, one space between words, trimmed, capped. */
export function normalizeQuery(raw: string): string {
  return fold(raw.slice(0, SEARCH_MAX_LENGTH * 2))
    .text.replace(/\s+/g, " ")
    .trim()
    .slice(0, SEARCH_MAX_LENGTH);
}

/** `value` with the characters `LIKE` treats as wildcards escaped. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/** `value` as a literal inside a regular expression. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const isLetter = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}]/u.test(char);

/**
 * Where the (already normalized) query sits in `text`, as `[start, end)` in `text`. A match at the
 * start of a word wins over one inside a word. Null when it isn't there.
 */
export function matchRange(text: string, query: string): [number, number] | null {
  if (!query) return null;
  const folded = fold(text);
  let inside: number | null = null;
  for (let at = folded.text.indexOf(query); at !== -1; at = folded.text.indexOf(query, at + 1)) {
    if (!isLetter(folded.text[at - 1])) return [folded.starts[at], folded.ends[at + query.length - 1]];
    inside ??= at;
  }
  return inside === null ? null : [folded.starts[inside], folded.ends[inside + query.length - 1]];
}

export type TextPart = { text: string; match: boolean };

/** `text` cut into the part that matches the query and the rest, for the gold underline. */
export function highlightParts(text: string, query: string): TextPart[] {
  const range = matchRange(text, query);
  if (!range) return [{ text, match: false }];
  const [start, end] = range;
  return [
    { text: text.slice(0, start), match: false },
    { text: text.slice(start, end), match: true },
    { text: text.slice(end), match: false },
  ].filter((part) => part.text !== "");
}

/**
 * The awards and festivals whose name or short name has a word starting with the query, best
 * first (a name that starts with it, then a later word), at most five. Ties keep the calendar order.
 */
export function matchAwards(awards: SearchableAward[], rawQuery: string, limit = MAX_AWARDS): SearchAward[] {
  const query = normalizeQuery(rawQuery);
  if (!query) return [];
  const ranked: Array<{ award: SearchableAward; rank: number }> = [];
  for (const award of awards) {
    const ranks = [award.name, award.shortName].map((text) => {
      const folded = fold(text).text;
      if (folded.startsWith(query)) return 0;
      for (let at = folded.indexOf(query); at !== -1; at = folded.indexOf(query, at + 1)) {
        if (!isLetter(folded[at - 1])) return 1;
      }
      return null;
    });
    const rank = Math.min(...ranks.map((r) => r ?? Infinity));
    if (rank !== Infinity) ranked.push({ award, rank });
  }
  return ranked
    .sort((a, b) => a.rank - b.rank || a.award.calendarOrder - b.award.calendarOrder)
    .slice(0, limit)
    .map(({ award }) => ({
      slug: award.slug,
      name: award.name,
      shortName: award.shortName,
      kindLabel: KIND_LABELS[award.kind],
      href: `/awards/${award.slug}/${award.year}`,
    }));
}
