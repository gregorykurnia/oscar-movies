# Phase 12 check: Letterboxd in the average (12.R)

2026-11-22, Opus 5.5 High (the builder was GPT-6.2 Sol). Brief: [docs/letterboxd-in-average.md](../letterboxd-in-average.md). Screenshots: `screenshots/phase-12/12.1/` (12.1's gallery) and `screenshots/phase-12/12.R/` (the sort checks).

## Results

| Check | Result |
|---|---|
| Full e2e suite (`npm run test:e2e`) | 149 passed, 2 timed out in flows Phase 12 doesn't touch (phase-7 Critics Choice all-years at 5s, Watch queue keyboard at 30s). Both passed on the `--last-failed` rerun (7s, 12.5s); their time limits now have room (15s, 60s). |
| Database tests (`npm run test:db`) | 175 passed, 2 failed on data drift: year-grid and year-summary assumed 2026 Animated is empty, but the EFA 2026 nominations (commit 47ada2d) put 5 films there. Both tests now follow the season as it fills in; 177 pass. `tests/db/scores.test.ts` (the five brief cases) passes. |
| Migration SQL (`drizzle/0010_movies_letterboxd_average.sql`) | Only `ALTER COLUMN … SET EXPRESSION` on `avg_score` and `score_count`, matching `src/db/schema.ts`. No other table, column or index touched. On `test`, both generation expressions include `lb_rating * 20` / `lb_rating is not null`, and `movies_avg_score_idx` still exists (btree on `avg_score`). A second `npx drizzle-kit generate` finds no changes. |
| Hand-worked averages (test branch) | All four match the stored `avg_score` (below). |
| Sorts by average | Year grid (`/grid/2025?category=picture&sort=average`), submissions (`/submissions/2025?sort=average`) and Watch list (`/watch-list?sort=average`, Want to watch and the season section) run highest first with "No scores yet" last: `tests/screens/letterboxd-sorts.spec.ts`. All three sorts read the stored `avg_score` (`src/lib/year-grid.ts`, `src/lib/submissions.ts`, `src/lib/watch-list.ts`, and `src/lib/lineup.ts` for festivals); none recompute it. |
| Moved film | The Secret Agent (below). |
| 12.1's screenshots against guide §7 | Scores line: Letterboxd sits after TMDB and before the average, the average is last in `--ink` 500 and "N · k of 5" stays on one line at 360, 390, 844 and 1280px. Tiles: six tiles in one row at 844/1280, 2×3 on phone with Average last, "5 of 5 scores". No scores: five "–" and "No scores yet" on the tiles and on the styleguide line. No shot missing. |
| No page says Letterboxd is left out | No such words in `src`, `tests` or `design-preview.html`. `PRODUCT_PLAN.md` §3.2 still said Letterboxd shows "after the average on every scores line": fixed (before the average on the scores line; after it on the year grid's film line; after year and categories in search). |

## Hand-worked averages (2026 films with a Letterboxd rating, test branch)

IMDb and TMDB × 10, Letterboxd × 20, RT and MC as they are; mean of those present, one decimal (Postgres rounds half away from zero).

| Film | Stored scores | Worked out | Stored |
|---|---|---|---|
| Tenzing | IMDb 7.4, MC 67, TMDB 8.2, Letterboxd 3.74 | (74 + 67 + 82 + 74.8) / 4 = 74.45 → 74.5 | 74.5, 4 |
| Paradise Lost | IMDb 6.0, MC 56, TMDB 5.7, Letterboxd 2.94 | (60 + 56 + 57 + 58.8) / 4 = 57.95 → 58.0 | 58.0, 4 |
| A Long Winter | IMDb 6.6, MC 79, Letterboxd 3.27 | (66 + 79 + 65.4) / 3 = 70.13 → 70.1 | 70.1, 3 |
| The Last Photograph | TMDB 6.5, Letterboxd 2.68 | (65 + 53.6) / 2 = 59.3 | 59.3, 2 |

No 2026 film on `test` has all five scores (none has a Tomatometer yet); 23 films of 2025 do.

## The moved film

**The Secret Agent** (IMDb 7.2, RT 98, MC 91, TMDB 7.1, Letterboxd 3.80): the four-score average was (72 + 98 + 91 + 71) / 4 = 83.0; with Letterboxd it is (72 + 98 + 91 + 71 + 76) / 5 = 81.6. Among the ten 2025 Best Picture nominees it falls from 3rd to 6th, behind Sinners (82.6), Marty Supreme (82.2) and Train Dreams (82.1), and still ahead of Hamnet (81.3, no Letterboxd). On the 2025 Picture year grid it now follows Train Dreams and reads "82 average · Letterboxd 3.8" (`screenshots/phase-12/12.R/grid-picture-average-1280.png`, asserted in the sort spec).

## Findings left for later (not Phase 12)

- The Watch list's intro always says "the films you want to watch by release date", also under another sort (`/watch-list?sort=average`). Wording from Phase 10, not this change.
- Screenshots at 1× pixel ratio make the decimal point faint ("Letterboxd 3.9" can read as "39" at 390px). Real phones are 2–3×; not a page fault.
