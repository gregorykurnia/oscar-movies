# Watch list: star favorites and a Starred filter

Phase 11 brief (planned 2026-11-20). Before each task, read **Request and smallest design** and that task's entry under **Task briefs**.

## Request and smallest design

Owner, 2026-11-20: "In watchlist i wanna be able to drag to reorder the 'want to watch', and also be able to 'star' favorites in watchlist, and filter by it." Dragging already works under **My order** (`?sort=mine`). The owner chose to keep using it, so drag isn't part of this phase. The star shows on Watch queue and Want to watch rows (owner's pick).

The simplest design that does this:

1. **A star per film.** One stored flag per film. A **Star** button on every Watch queue and Want to watch row sits in the same quiet pill line as the Queue button, with the same 44px hit area and focus ring.
   - Off, it shows an outline star in `--ink-subtle` and the word "Star" in `--ink-muted`.
   - On, it shows a star filled in `--gold` and "Starred" in `--gold-ink`.
   - It's one tap to turn on or off, and it saves at once. While saving, it's disabled in `--ink-faint`, so a double tap sends one save.
   - It's a toggle button (`aria-pressed`) named "Star <title>".
   - Season rows and every other page have no star.
2. **The star stays with the film.** It survives a film leaving the list (watched, unwanted, out of the queue), the same way release notes stay, and shows again if the film is wanted again. Only a wanted film can be starred or unstarred, because only wanted rows show the button. Old films start unstarred.
3. **Starred filter** (`?starred=1`). It's a `Chip` named "Starred" in the Filter group, after Platform and Release, and it works with both of them. Any value other than `1` is ignored. While it's on:
   - **Want to watch** shows only its starred films, with no drag handles. The count reads "N of M films", where M counts Want to watch only (the queue isn't part of M, the same as today).
   - **Watch queue:** with Starred as the only filter, the queue stays, narrowed to its starred films, with no handles. It's hidden when it has none. Once Platform or Release is also on, the queue is hidden, as it is today.
   - The season section is hidden, and **Clear filters** clears Starred along with the rest.
   - Unstarring a film while the filter is on reads the page again, as the Queue button does. The row leaves and the count drops, and when the last one goes the empty state shows.
   - **Empty states:** if no wanted film is starred: "Nothing starred yet. Tap Star on a film to keep it here." If starred films exist but Platform or Release excludes them, it uses `noWatchMatches`, with "starred" added to the words ("None of the 12 films you want to watch is starred and on Netflix.").
4. **Failure:** if a save fails, the star goes back to how it was and the usual failure toast offers "Try again". This copies `QueueButton.tsx`.

Left out (follow-ups for the owner to pick, not built): stars on other pages, a "starred first" sort, Platform and Release narrowing the queue, and starring season rows.

## Before the run

Nothing to set up: there's no new service, account or secret. Build and test on `staging` against the Neon `test` branch. The production migration is an owner step after the build.

## Existing code and constraints

- `src/db/schema.ts` `marks`: `want`, `want_rank`, `queue_rank`, release notes. The schema comment explains each column.
- `src/app/actions/watch-list.ts`: `setQueued(movieId, queued)` is the pattern for a one-flag action (Zod, `{ ok }` result). `src/data/watch-list.ts` reads `WantedFilm` rows for `queue` and `want`.
- `src/lib/watch-list.ts`: `WatchQuery`, `parseWatchQuery`, `watchHref`, `hasWatchFilters`, `clearWatchFilters`, `filterWanted`, `wantedCount`, `noWatchMatches`. These are pure functions, tested in `src/lib/watch-list.test.ts`.
- `src/components/watch-list/WatchListPage.tsx` holds the toolbar, the Filter group and `Row`, which renders the release line and `QueueButton`. `QueueButton.tsx` is the button pattern. `src/components/chip/Chip.tsx` is the filter chip.
- Backups: the marks snapshot is in `src/lib/data-files.ts` and restore is in `scripts/lib/marks.ts` (tests: `src/lib/data-files.test.ts`, `scripts/lib/marks.test.ts`, `tests/db/marks.test.ts`). The procedure is in `docs/runbook.md`.
- Visual rules: `DESIGN_GUIDE.md` §8.3 (Watch list, "Watch queue"), §7 (Chip, Filter menu), §11 and §13. The live Watch list is the reference: this phase draws nothing new in `design-preview.html`, the same as v1.5.6.
- e2e: `tests/e2e/watch-list.spec.ts`, `tests/e2e/smoke.spec.ts`.

## Storage

- A new column, `marks.favorite boolean not null default false`. It's tied to no other column, because a star outlives the want mark. It's an additive migration, and old rows read as unstarred.
- `setFavorite(movieId, favorite)` refuses a film that isn't wanted (including an unknown one) and touches no other column. Every other marks write (watched, want, queue, reorder, release notes) leaves `favorite` alone.
- The Star button passes the row's `markVersion` as the third argument and reuses it for Try again. A repeat confirms a value that's already saved. A changed row with a different star requires a fresh read before another edit.
- The marks backup writes `favorite` (`true` or `false`) for every mark row, so a new file can say "unstarred". A missing key means an older file, and restore keeps the film's current star, the same way an older file's missing `queueRank` is kept. Old backup files stay valid.

## Checks

Light checks per task (`CLAUDE.md`).
- **Unit tests:** parsing `starred` (only `1` counts), the filter on its own and with Platform and Release, the queue narrowed or hidden, the count words and both empty-state wordings, `watchHref` keeping and clearing the flag, the flag reading back, and the Star button's failure path (the star reverts, the toast's Try again saves again).
- **e2e:** star one Want to watch film and one queue film, reload, and see both starred. Open `?starred=1` and see just those two, the queue film under Watch queue, with no handles and no season section. Unstar the Want film on the filtered page and see it leave. The spec clears any star it set in an `afterEach`, so a failed run leaves no stars on `test`.
- **Full suite and screenshots:** once, in 11.3.

## Task briefs

**11.1: Store the star.** A star is saved and survives a backup restore. Read Storage and Existing code. Edit `src/db/schema.ts` and its comment, the generated `drizzle/` migration, `src/app/actions/watch-list.ts`, `src/data/watch-list.ts` (`favorite` on `WantedFilm`), the backup and restore files listed above, their tests and `IMPLEMENTATION_PLAN.md` §3.1. Migrate `test` only (`npm run db:migrate:test`). Done when:
- The test branch has the column, and existing rows read as unstarred.
- `setFavorite` saves and reads back both values, for a wanted and a queued film, and refuses an unwanted or unknown film.
- DB tests show that watched, unwanted, re-wanted, queue, unqueue, reorder and release-note saves keep a film's star, and that `setFavorite` leaves the ranks and notes alone.
- An old backup fixture restores with stars unchanged. A starred film round-trips, and a file saying `false` unstars a film starred since the file was made.
- The task's commit body has the production migration command.

**11.2: Star button and Starred filter.** The owner can star films on the Watch list and narrow Want to watch to them. Read Request and smallest design and the 11.1 code. Edit `src/lib/watch-list.ts`, `WatchListPage.tsx`, a new `src/components/watch-list/StarButton.tsx` modelled on `QueueButton.tsx`, their tests, `DESIGN_GUIDE.md` §8.3 (a "Star and Starred filter" line, v1.5.7 in the status line) and `PRODUCT_PLAN.md` §3.13 (a Favorites bullet, v1.10). Add the e2e case under Checks to `tests/e2e/watch-list.spec.ts`. Done when:
- Every Watch queue and Want to watch row shows a Star button (toggle, named "Star <title>", disabled while saving). A starred row shows a gold filled star and "Starred", and season rows show none.
- `?starred=1` works alone and with `?platform=` and `?release=`, and any other value is ignored. A grep finds no Watch list link built outside `watchHref` that drops it.
- With the filter on, the page behaves as point 3 of the design says: the queue narrowed or hidden, the "N of M films" count, both empty states, and unstarring removes the row.
- Screenshots at 1280, 390 and 360. The 360 shot uses the tightest row: `?sort=mine` with a drag handle, the longest wanted title, a release line, "Remove from queue" and "Starred". In it, the title doesn't wrap more than in the shot without the star, toggling doesn't push the title or release line onto a new line, and the Star and Queue pills don't overlap.
- Shots of a starred row on the gold wash of both a winner and an out film: "Starred" in `--gold-ink` reads at 4.5:1 or more, and the star icon at 3:1 or more.
- Shots of the filtered page with its count, and of each empty state.
- The e2e case passes.

**11.3: Run the phase checks once.** The finished feature is tested end to end without touching live data. Run the full e2e suite and the Watch list screenshots (phone, turned phone, laptop) once on a free machine. Write the results, commands, source commit and screenshot paths to `docs/phase-checks/watch-list-favorites.md`. Done when:
- Every check above has a result, and each failure is listed with its test name.
- Every test server this task started is stopped. This row reports, and fixes go to 11.R.

**11.R: Phase 11 review.** No star or other mark is lost or shown on the wrong film. Read this brief, the Phase 11 diff, the 11.3 report and guide §15. Check the migration, the backup round trip, star changes racing with the Queue button and drag, and the filter's edge cases, and look at the screenshots with fresh eyes. Fix only quick confirmed findings and split the rest into fix rows. Done when:
- No data-loss or wrong-film finding is left. Every other finding is fixed, has a named task or is dropped with a reason.
- The guide checklist is recorded. The production migration, a real-phone check and the release are on the Waiting for the owner list in `docs/build-plan.md`.

## Release handoff

After 11.R, the owner approves `npm run db:migrate` (production, one additive column). Then they say "release". It's a normal release, because it has a migration.
