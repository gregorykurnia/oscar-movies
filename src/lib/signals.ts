// Strong signals (plan Phase 7 notes, guide §8.13): for one Oscar category and year, the award
// categories that have predicted it best and the films they picked. Pure: `src/data/signals.ts`
// reads the accuracy rows, the year's editions and results, and calls this.
import type { EditionStatus, Figure } from "./accuracy";
import type { AccuracyRow } from "./accuracy-page";
import { isNomination, type Outcome } from "./stage";

/** "caught": its "Oscar nominees it caught" is ≥ 50%; "winner": its winner was Oscar-nominated ≥ 80% of years. */
export type StrongKind = "caught" | "winner";

/** The fewest counted years (the accuracy page's Years column) a strong figure may rest on. */
export const MIN_YEARS = 5;

/** The kinds an accuracy row is strong in, caught first; empty when it isn't strong. */
export function strongKinds(row: Pick<AccuracyRow, "caught" | "nomination" | "years">): StrongKind[] {
  if (row.years < MIN_YEARS) return [];
  const kinds: StrongKind[] = [];
  // Whole-number comparisons, so 4 of 5 is exactly 80%.
  const { caught, nomination } = row;
  if (caught && caught.count > 0 && 2 * caught.hits >= caught.count) kinds.push("caught");
  if (nomination && nomination.count > 0 && 5 * nomination.hits >= 4 * nomination.count) kinds.push("winner");
  return kinds;
}

/** The figure behind a kind: the caught figure, or Winner → Oscar nomination. */
export function kindFigure(row: Pick<AccuracyRow, "caught" | "nomination">, kind: StrongKind): Figure {
  return (kind === "caught" ? row.caught : row.nomination)!;
}

const share = (f: Figure) => f.hits / f.count;

/** The award category's edition of the chosen year, with only this category's results. */
export type SignalEdition = {
  status: EditionStatus;
  nominationsOn: string | null;
  winnersOn: string | null;
  results: ReadonlyArray<{ movieId: number; outcome: Outcome }>;
};

export type SignalsInput<F extends { id: number; title: string }> = {
  /** Every accuracy row of the Oscar category (`queryAccuracy`). */
  rows: ReadonlyArray<AccuracyRow>;
  /** Each row's edition of the year, by row key; missing or null when the award has none. */
  editions: ReadonlyMap<string, SignalEdition | null>;
  /** The films any edition lists, by ID. */
  films: ReadonlyMap<number, F>;
  /** Each film's outcome in the Oscar category that year; missing when it has none. */
  oscar: ReadonlyMap<number, Outcome>;
  /** `YYYY-MM-DD`, for the next date of an award that hasn't announced yet. */
  today: string;
};

export type SignalFilm<F> = {
  film: F;
  /** Its result in the award's edition: won, or nominated (or runner-up). */
  outcome: Outcome;
  /** Its Oscar outcome in the category that year, or null. */
  oscar: Outcome | null;
};

/** The next date an award that hasn't announced has: its nominations, or its winner once the nominees are out. */
export type NextDate = { what: "nominations" | "winner"; on: string };

export type AwardSignal<F> = {
  row: AccuracyRow;
  /** One figure sentence per kind, caught first. */
  kinds: { kind: StrongKind; figure: Figure }[];
  /** Winners first, then by title; null when the edition has nothing to list yet. */
  films: SignalFilm<F>[] | null;
  /** Only when `films` is null: the next date, or null when the award has none (or no edition). */
  next: NextDate | null;
};

export type FilmPick = {
  row: AccuracyRow;
  outcome: Outcome;
  /** The figure that made the film count: the winner figure for the winner of an award strong that way, else the caught figure. */
  kind: StrongKind;
  figure: Figure;
};

export type FilmSignal<F> = {
  film: F;
  oscar: Outcome | null;
  /** Wins first, then in the by-award order. */
  picks: FilmPick[];
};

export type Signals<F> = {
  /** Announced awards first (higher strong figure first), then the ones with nothing to list (by date). */
  byAward: AwardSignal<F>[];
  /** Most strong awards first, then most wins, then title. */
  byFilm: FilmSignal<F>[];
  /** The strong awards with nothing to list, as in `byAward` (the By film notice). */
  pending: AwardSignal<F>[];
};

/** Whether a result counts for a kind: nominated or better for "caught", the winner for "winner". */
function counts(kind: StrongKind, outcome: Outcome): boolean {
  return kind === "caught" ? isNomination(outcome) : outcome === "won";
}

function nextDate(edition: SignalEdition | null | undefined, today: string): NextDate | null {
  if (!edition) return null;
  const nomineesOut = edition.results.some((r) => isNomination(r.outcome));
  const candidates: NextDate[] = [];
  if (!nomineesOut && edition.nominationsOn) candidates.push({ what: "nominations", on: edition.nominationsOn });
  if (edition.winnersOn) candidates.push({ what: "winner", on: edition.winnersOn });
  return candidates.find((c) => c.on >= today) ?? null;
}

const byTitle = <F extends { title: string }>(a: { film: F }, b: { film: F }) => a.film.title.localeCompare(b.film.title);

/** The strong awards of a category and the films they picked in one year, both views. */
export function buildSignals<F extends { id: number; title: string }>(input: SignalsInput<F>): Signals<F> {
  const awards: AwardSignal<F>[] = [];
  for (const row of input.rows) {
    const strong = strongKinds(row);
    if (strong.length === 0) continue;
    const edition = input.editions.get(row.key);
    const listed = (edition?.status === "no_data" ? [] : (edition?.results ?? [])).filter((r) =>
      strong.some((k) => counts(k, r.outcome)),
    );
    const films = listed
      .filter((r) => input.films.has(r.movieId))
      .map((r) => ({ film: input.films.get(r.movieId)!, outcome: r.outcome, oscar: input.oscar.get(r.movieId) ?? null }))
      .sort((a, b) => Number(b.outcome === "won") - Number(a.outcome === "won") || byTitle(a, b));
    awards.push({
      row,
      kinds: strong.map((kind) => ({ kind, figure: kindFigure(row, kind) })),
      films: films.length > 0 ? films : null,
      next: films.length > 0 ? null : nextDate(edition, input.today),
    });
  }

  const best = (a: AwardSignal<F>) => Math.max(...a.kinds.map((k) => share(k.figure)));
  const byName = (a: AwardSignal<F>, b: AwardSignal<F>) =>
    a.row.award.localeCompare(b.row.award) || a.row.note.localeCompare(b.row.note);
  const announced = awards.filter((a) => a.films).sort((a, b) => best(b) - best(a) || byName(a, b));
  const pending = awards
    .filter((a) => !a.films)
    .sort((a, b) => {
      const [x, y] = [a.next?.on, b.next?.on];
      if (x !== y) return x === undefined ? 1 : y === undefined ? -1 : x.localeCompare(y);
      return byName(a, b);
    });
  const byAward = [...announced, ...pending];

  const films = new Map<number, FilmSignal<F>>();
  for (const a of announced) {
    for (const f of a.films!) {
      const kind: StrongKind = f.outcome === "won" && a.kinds.some((k) => k.kind === "winner") ? "winner" : "caught";
      const entry = films.get(f.film.id) ?? { film: f.film, oscar: f.oscar, picks: [] };
      entry.picks.push({ row: a.row, outcome: f.outcome, kind, figure: kindFigure(a.row, kind) });
      films.set(f.film.id, entry);
    }
  }
  const wins = (f: FilmSignal<F>) => f.picks.filter((p) => p.outcome === "won").length;
  const byFilm = [...films.values()]
    .map((f) => ({ ...f, picks: [...f.picks].sort((a, b) => Number(b.outcome === "won") - Number(a.outcome === "won")) }))
    .sort((a, b) => b.picks.length - a.picks.length || wins(b) - wins(a) || byTitle(a, b));

  return { byAward, byFilm, pending };
}
