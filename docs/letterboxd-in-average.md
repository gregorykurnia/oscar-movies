# Letterboxd in the average

Phase 12 brief (planned 2026-11-21). Before each task, read **Request and smallest design** and that task's entry under **Task briefs**.

## Request and smallest design

Owner, 2026-11-21: "can letterboxd score be part of the avg score calc" … "no needa fetch older films yet", built by GPT. Until now the Letterboxd rating showed after the average and wasn't part of it (owner, 2026-11-20).

The simplest design that does this:

1. **The average uses five scores.** Letterboxd (0.5–5) counts × 20, so 3.8 counts as 76, next to IMDb × 10, TMDB × 10, Tomatometer and Metacritic. The average is still the mean of the scores that exist, one decimal. `score_count` runs 0–5. A film with only a Letterboxd rating gets an average from it alone, like any single score today.
2. **Counts say "of 5".** The scores line reads "84 · 5 of 5" and the movie page's Average tile "5 of 5 scores". A film with no Letterboxd rating reads "of 5" with that one missing ("86 · 4 of 5"): no special case for older films.
3. **Letterboxd moves before the average on the scores line**, after TMDB: "IMDb 7.9  RT 95  MC 95  TMDB 7.5  Letterboxd 3.8  **84 · 5 of 5**". The average stays last and in `--ink` 500. "No scores yet" shows all five "–". The movie page's tiles already put Letterboxd before Average; only the count changes. The year grid's film line ("82 average · Letterboxd 3.8") and search results keep their order.
4. **Every sort and filter by average follows by itself**, because they all read the stored `avg_score` column.

Release order: the migration runs on production first and the code goes live straight after, as `CLAUDE.md` says. For the few minutes Vercel takes to deploy, the live site may show "5 of 4" on films with a Letterboxd rating; that gap is accepted.

Left out (follow-ups for the owner to pick, not built): fetching Letterboxd for films outside the refresh window (the owner said not yet), weighting Letterboxd differently from the other scores.

## Before the run

Nothing to set up: no new service, account or secret. Build and test on `staging` against the Neon `test` branch. The production migration is an owner step at the release.

## Existing code and constraints

- `src/db/schema.ts`: `scoreCountSql`, and the generated stored columns `avg_score` (numeric(4,1), indexed by `movies_avg_score_idx`) and `score_count` on `movies`; `lb_rating` is numeric(3,2), 0.5–5. Its comment says Letterboxd isn't in the average: change it.
- Changing a generated column's expression needs a migration. Generate it with drizzle-kit, then read the SQL: both columns must end up with the new expression, `movies_avg_score_idx` must still exist, and nothing else may change. If drizzle-kit can't express it, hand-write the SQL in the generated file as `ALTER TABLE "movies" ALTER COLUMN … SET EXPRESSION AS (…)` for both columns (both Neon branches run Postgres 18, checked 2026-11-21), which keeps the columns and the index. Either way, a second `npx drizzle-kit generate` afterwards must produce no new migration (the snapshot matches the schema).
- Other readers: `score_count` is read only in `src/data/films.ts` and `src/data/movie.ts`, and nothing else computes the average in TypeScript (checked 2026-11-21); grep again for `scoreCount`, `score_count` and `avg_score` and say in the commit what each remaining reader does with a count of 5. A missing Letterboxd rating is stored as null, never 0 (`src/lib/scores/clients.ts` keeps only values above 0).
- Text: `src/components/score-line/ScoreLine.tsx` (order and "of 4"), `src/components/score-tiles/ScoreTiles.tsx` ("of 4 scores"), `src/app/styleguide/foundations.tsx` (the sample line). Search `src`, `tests` and `design-preview.html` for `of 4`, `four scores`, `all four`, `/4` and for the words "not part of the average" / "doesn't use it" to catch the rest; leave unrelated "of 4" (drag position, patterns figures) alone.
- `design-preview.html`: update the scores-line and Average-tile counts and order to match `DESIGN_GUIDE.md` §7 (already updated, v1.5.8). Draw nothing new.
- Visual rules: `DESIGN_GUIDE.md` §7 **Scores line** and **Score tiles** (already updated). Product rule: `PRODUCT_PLAN.md` §3.2 (already updated). Derived value: `IMPLEMENTATION_PLAN.md` §3.2 rule 1 (already updated).
- e2e specs that assert "of 4" counts: `tests/e2e/movie.spec.ts`, `phase-1.spec.ts`, `phase-5.spec.ts`, `phase-8.spec.ts`, and `tests/screens/watch-release.spec.ts`. On `test`, 29 films of 2026 have a Letterboxd rating and most older films have none. Each edited assertion names its film and the exact text its stored scores give (worked out from the database, not copied off the page), and at least one asserts a 2026 film with all five scores reading "N · 5 of 5" with N its five-score mean.

## Checks

Light checks per task (`CLAUDE.md`).
- **Database test** (`tests/db/`, test branch), on rows it writes and cleans up: IMDb 7.0 and Letterboxd 4.0 only → `avg_score` 75.0, `score_count` 2; Letterboxd 3.5 only → 70.0 and 1; no scores → null and 0; IMDb 7.3, RT 91, MC 88, TMDB 7.1, no Letterboxd → 80.8 and 4 (the old four-score average); the same plus Letterboxd 3.67 → 79.3 and 5.
- **Unit tests:** the scores line puts Letterboxd before the average and says "N of 5"; "No scores yet" shows five "–"; the Average tile says "N of 5 scores".
- **e2e:** only the tests edited for the new wording (`file:line`), as `CLAUDE.md` says; the full suite runs once in 12.R.

## Task briefs

**12.1: Letterboxd in the average.** The average counts Letterboxd on every page. Read Request, Existing code and Checks. Edit `src/db/schema.ts` and its comment, the generated `drizzle/` migration, the components and the styleguide sample above, `design-preview.html`, the tests, and add the database test. Migrate `test` only (`npm run db:migrate:test`). Done when:
- The test branch's `movies` has the new expressions: the database test above passes, and `movies_avg_score_idx` still exists.
- The migration's SQL touches only `avg_score`, `score_count` and that index.
- The scores line, the Average tile and the styleguide sample read "of 5", with Letterboxd before the average on the scores line; unit tests cover both.
- Screenshots at 360, 390 and 1280px of: a 2026 film's movie page with all five scores (the tiles and the scores line), the 2026 Documentary race, the Watch list and the styleguide sample. Each shows Letterboxd before the average and "of 5"; where the line wraps, the average and its count stay together on one line ("84 · 5 of 5" never splits). One more shot of a film with no scores shows five "–" and "No scores yet".
- No "of 4" (or the other spellings above) left for score counts in `src`, `tests` or `design-preview.html`.
- A second `npx drizzle-kit generate` produces no new migration.

**12.R: Phase 12 check.** A second family checks the score change before it reaches the live site. Read the whole brief and the 12.1 diff. Run the full e2e suite once and the database tests. Check: the migration SQL against the brief (nothing else changed, the index kept); averages on the test branch for three 2026 films that have a Letterboxd rating, worked out by hand from their stored scores; every sort by average (year grid, Watch list, submissions) still ordered, no film without scores first, and one named film whose place moved because of Letterboxd; 12.1's screenshots against the guide (no new shots unless one is missing); and that no page still says Letterboxd is left out of the average. Quick fixes only; anything bigger becomes a `12.F` row. Done when:
- The full e2e suite and the database tests pass (a red run is a fix, not a finding to note).
- `docs/phase-checks/letterboxd-in-average.md` lists each check above with its result, the three hand-worked averages and the moved film.
