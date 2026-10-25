// `race:check` (IMPLEMENTATION_PLAN.md §3.5, docs/update-the-race.md): what loading `data/`
// would change in the race, without writing anything. The loader's own plan gives the new and
// changed results; the plan is then laid over the database's rows in memory and the predictions
// are worked out twice, before and after, on the same day, so only the update moves them.
import type { LoadPlan } from "./load";
import type { PredictionRow, Tables } from "./compute";

type Film = { id: number; title: string; imdbId: string | null; wikidataId: string | null };

/**
 * The prediction tables as they would be after the plan, plus the films the plan adds (with
 * negative ids, never written). Same lookups as the loader's `applyPlan`.
 */
export function tablesAfterPlan(
  tables: Tables,
  plan: LoadPlan,
  films: ReadonlyArray<Film>,
): { tables: Tables; films: Film[] } {
  let nextId = -1;
  const awardRows = tables.awardRows.map((a) => ({ ...a }));
  for (const row of plan.awards.inserts) {
    awardRows.push({ ...row, id: nextId--, url: row.url ?? null, winnersOnly: row.winnersOnly ?? false, isSelection: row.isSelection ?? false });
  }
  for (const u of plan.awards.updates) Object.assign(awardRows.find((a) => a.id === u.id) ?? {}, u.set);
  const awardIdOf = new Map(awardRows.map((a) => [a.slug, a.id]));
  const awardSlugOf = new Map(awardRows.map((a) => [a.id, a.slug]));

  const categoryRows = tables.categoryRows.map((c) => ({ ...c }));
  for (const { award, ...row } of plan.categories.inserts) {
    categoryRows.push({ ...row, id: nextId--, awardId: awardIdOf.get(award) as number, loose: row.loose ?? false, mappingNote: row.mappingNote ?? null, sortOrder: row.sortOrder ?? 0 });
  }
  for (const u of plan.categories.updates) Object.assign(categoryRows.find((c) => c.id === u.id) ?? {}, u.set);
  const categoryIdOf = new Map(categoryRows.map((c) => [`${awardSlugOf.get(c.awardId)}/${c.slug}`, c.id]));

  const editionRows = tables.editionRows.map((e) => ({ ...e }));
  for (const { award, ...row } of plan.editions.inserts) {
    editionRows.push({
      ...row,
      id: nextId--,
      awardId: awardIdOf.get(award) as number,
      ordinal: row.ordinal ?? null,
      shortlistOn: row.shortlistOn ?? null,
      nominationsOn: row.nominationsOn ?? null,
      winnersOn: row.winnersOn ?? null,
      sourceUrls: row.sourceUrls ?? [],
      note: row.note ?? null,
    });
  }
  for (const u of plan.editions.updates) Object.assign(editionRows.find((e) => e.id === u.id) ?? {}, u.set);
  const editionIdOf = new Map(editionRows.map((e) => [`${awardSlugOf.get(e.awardId)}/${e.year}`, e.id]));

  const allFilms = [...films];
  const movieRows = (tables.movieRows ?? []).map((m) => ({ ...m }));
  const movieIdOf = new Map<string, number>();
  for (const f of films) {
    if (f.imdbId) movieIdOf.set(f.imdbId, f.id);
    if (f.wikidataId) movieIdOf.set(f.wikidataId, f.id);
  }
  for (const m of plan.movies.inserts) {
    const id = nextId--;
    movieIdOf.set(m.key, id);
    allFilms.push({ id, title: m.title, imdbId: m.imdbId ?? null, wikidataId: m.wikidataId ?? null });
    movieRows.push({ id, title: m.title, countries: m.countries ?? null });
  }
  for (const u of plan.movies.updates) {
    if (u.set.imdbId) movieIdOf.set(u.set.imdbId, u.id);
    if (u.set.wikidataId) movieIdOf.set(u.set.wikidataId, u.id);
    const film = allFilms.find((f) => f.id === u.id);
    if (film && u.set.title) film.title = u.set.title;
    const row = movieRows.find((f) => f.id === u.id);
    if (row && u.set.title) row.title = u.set.title;
    if (row && u.set.countries) row.countries = u.set.countries;
  }

  const deleted = new Set(plan.results.deletes.map((d) => d.id));
  const outcomeOf = new Map(plan.results.updates.filter((u) => u.set.outcome).map((u) => [u.id, u.set.outcome!]));
  const resultRows = tables.resultRows
    .filter((r) => r.id === undefined || !deleted.has(r.id))
    .map((r) => (r.id !== undefined && outcomeOf.has(r.id) ? { ...r, outcome: outcomeOf.get(r.id)! } : r));
  for (const r of plan.results.inserts) {
    const movieId = movieIdOf.get(r.movie);
    if (movieId === undefined) throw new Error(`No film ${r.movie} for ${r.label}.`);
    resultRows.push({
      editionId: editionIdOf.get(`${r.award}/${r.year}`) as number,
      categoryId: categoryIdOf.get(`${r.award}/${r.category}`) as number,
      movieId,
      outcome: r.outcome,
    });
  }
  return { tables: { awardRows, categoryRows, editionRows, resultRows, movieRows }, films: allFilms };
}

/** A film's chance in the snapshot the race shows, before and after (null: not a contender). */
export type ChanceMove = {
  year: number;
  category: string;
  movieId: number;
  win: [number | null, number | null];
  nominate: [number | null, number | null];
};

/** Whole percentage points, as the race rounds them (`formatChance`). */
const points = (p: number | null) => (p === null ? null : Math.round(p * 100));

/**
 * Every film whose chance, as the race shows it (whole points), moves: the `eve_ceremony`
 * snapshot for a finished season, `live` for the others. New and dropped contenders count.
 */
export function chanceMoves(before: ReadonlyArray<PredictionRow>, after: ReadonlyArray<PredictionRow>): ChanceMove[] {
  const shown = (rows: ReadonlyArray<PredictionRow>) => {
    const out = new Map<string, PredictionRow>();
    for (const r of rows) {
      if (r.snapshot !== (r.finished ? "eve_ceremony" : "live")) continue;
      out.set(`${r.year}/${r.oscarCategory}/${r.movieId}`, r);
    }
    return out;
  };
  const a = shown(before);
  const b = shown(after);
  const moves: ChanceMove[] = [];
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(key);
    const y = b.get(key);
    const r = (y ?? x) as PredictionRow;
    const win: ChanceMove["win"] = [x ? points(x.pWin) : null, y ? points(y.pWin) : null];
    const nominate: ChanceMove["nominate"] = [x ? points(x.pNominate) : null, y ? points(y.pNominate) : null];
    if (win[0] === win[1] && nominate[0] === nominate[1]) continue;
    moves.push({ year: r.year, category: r.oscarCategory, movieId: r.movieId, win, nominate });
  }
  const size = (m: ChanceMove) => Math.max(Math.abs((m.win[1] ?? 0) - (m.win[0] ?? 0)), Math.abs((m.nominate[1] ?? 0) - (m.nominate[0] ?? 0)));
  return moves.sort((m, n) => n.year - m.year || m.category.localeCompare(n.category) || size(n) - size(m) || m.movieId - n.movieId);
}

const CATEGORY_NAMES: Record<string, string> = {
  picture: "Best Picture",
  documentary: "Documentary Feature",
  international: "International Feature",
  animated: "Animated Feature",
};

function change([from, to]: [number | null, number | null]): string {
  if (from === null) return `new, ${to}%`;
  if (to === null) return `${from}%, no longer a contender`;
  const d = to - from;
  return `${from}% → ${to}% (${d > 0 ? "+" : ""}${d})`;
}

/**
 * The report: the load plan, every new result (the plan prints only counts for those), then the
 * chances that move in full for `season`, and as one line per other season.
 */
export function formatRaceCheck(input: {
  planText: string;
  plan: LoadPlan;
  moves: ChanceMove[];
  season: number;
  titleOf: (movieId: number) => string;
}): string {
  const { plan, moves, season, titleOf } = input;
  const lines = [input.planText];
  if (plan.results.inserts.length > 0) {
    lines.push("New results:");
    for (const r of plan.results.inserts) lines.push(`  ${r.label.replace(/^result /, "")}, ${r.outcome}`);
  }

  const here = moves.filter((m) => m.year === season);
  lines.push(here.length === 0 ? `Chances in ${season}: none move.` : `Chances in ${season} that move (% to win; % to be nominated):`);
  let heading = "";
  for (const m of here) {
    if (m.category !== heading) lines.push(`  ${CATEGORY_NAMES[m.category] ?? m.category}`);
    heading = m.category;
    const parts = [m.win[0] !== m.win[1] ? `win ${change(m.win)}` : null];
    if (m.nominate[0] !== m.nominate[1] && (m.nominate[0] !== null || m.nominate[1] !== null)) {
      parts.push(`nominated ${change(m.nominate)}`);
    }
    lines.push(`    ${titleOf(m.movieId)}: ${parts.filter(Boolean).join("; ")}`);
  }

  const others = new Map<number, ChanceMove[]>();
  for (const m of moves.filter((m) => m.year !== season)) others.set(m.year, [...(others.get(m.year) ?? []), m]);
  if (others.size > 0) {
    lines.push("Other seasons (each is history for the others):");
    for (const [year, list] of others) {
      const most = Math.max(...list.map((m) => Math.abs((m.win[1] ?? 0) - (m.win[0] ?? 0))));
      lines.push(`  ${year}: ${list.length} ${list.length === 1 ? "film moves" : "films move"}, the most ${most} point${most === 1 ? "" : "s"} to win`);
    }
  }
  return lines.join("\n");
}
