# Review triage

Every "should fix" item from a phase review goes to exactly one place: fixed in the review, a named later task, or dropped with a reason (`docs/build-plan.md` Step 10). Details are in the review's commit.

## Phase 0 review (2026-10-22)

**Checks:** full Playwright suite 10 of 10 passed; screenshot spec 4 of 4 passed (390 and 1280, now also asserts no sideways scroll); unit 145 passed; marks database tests 5 passed; typecheck, lint, build clean. Light only, so no dark screenshots (guide §1).

**Guide §15** on `/styleguide`, 404, error and `/`, against `design-preview.html` §2, §3 and §5: AppShell and PageHeader on every page; hex grep clean (only `tokens.css`); no dark styles; gold only for its jobs; wording follows §11; no sideways scroll at 390 or 1280; Esc and keyboard covered by unit tests (menu, year switcher); empty, loading, failure and offline states drawn; stress switch works. Differences already recorded in tasks 0.6–0.12 aren't repeated here.

| # | Item | Where it went |
|---|---|---|
| 0-1 | `db:migrate` / `db:migrate:test` used `node --env-file`, which loses to a `DATABASE_URL` exported in the shell, and skipped the env-file and `app_meta` checks | Fixed: `scripts/migrate.ts` (both npm scripts) |
| 0-2 | A marks export could replace the only backup with a shorter list, or a half-written file; a test export could write `data/marks.json` | Fixed: refuses a shrink without `--allow-shrink`, writes then renames, test can't write the production file |
| 0-3 | Writing scripts ignored unknown arguments (`--dryrun` meant a real write) | Fixed: `checkArgs` in `scripts/lib/target.ts` |
| 0-4 | Restore planned outside its write transaction: a tap during a restore could be overwritten | Fixed: the transaction rechecks the planned rows and writes nothing if one moved |
| 0-5 | A rebuild that died halfway could leave `.next-test` passing as up to date | Fixed: the hash is cleared before each build |
| 0-6 | A branch reset from the other copies `app_meta`, with no recovery written down | Fixed: one paragraph in `docs/runbook.md` |
| 0-7 | `/styleguide` at 390: the switch squeezed the title to "Stylegui / de" | Fixed: switch labels "Normal" / "Stress" |
| 0-8 | `/styleguide` part labels in all caps (guide §4, §15) | Fixed: section headings in sentence case |
| 0-9 | `/styleguide` film list sample: Brazil's flag as submitting country on Sentimental Value (Norway) | Fixed: The Secret Agent |
| 0-10 | Home stage line says "Nominations Jan"; the preview's 2026 frame says "Jan 2027" | Task 1.8, done: `StageLine` from the season's dates |
| 0-11 | Home has no year switcher or "Updated" date | Task 1.8, done: year switcher and "Updated" in the PageHeader |
| 0-12 | Error page reference is Next's numeric digest, not the preview's short hex | Dropped: the digest is what finds the error in Vercel's logs; the guide doesn't set a format |

## Phase 1 review (2026-10-22)

**Checks:** full Playwright suite after the fixes 35 of 37 (1-24, 1-25), the two then passed with `--last-failed`; screenshot spec 10 of 10 (390 and 1280, light only); unit 381; database 55 (one ordering flake fixed: `tests/db/scores.test.ts` read "the last" row without an order); `data:check`, typecheck, lint, build clean. Three fresh read-only reviews: writes (marks, loader, restore, scores), pages and data layer, design (guide §15 on `screenshots/phase-1/` against `design-preview.html`). Differences already recorded in tasks 1.1–1.16 aren't repeated here.

| # | Item | Where it went |
|---|---|---|
| 1-1 | Marks: tap, tap again, then follow a link, and Next can run the two saves side by side; if the older lands last the database keeps it while the page shows the newer state | Fixed: one save in flight per film, the newest waiting state sent when it settles (`marks-store.ts`) |
| 1-2 | Waterdrop (2024) showed TMDB 0.0 and an average of 0: TMDB answers `vote_average 0` with a vote, and the merge rule never clears a stored score | Fixed: the parser reads 0.0 as no score; migration `0002_tmdb_zero_votes` clears stored zeros (run on `test`; production with the first production migration, owner) |
| 1-3 | "Try again" on an old marks toast undid a newer tap | Fixed: it does nothing once a newer tap was made |
| 1-4 | Search: after emptying the box, or while "Search isn't available" shows, Enter opened the last hidden result | Fixed: options are only the rows on screen |
| 1-5 | Oscar year page, a category with no results: "The shortlist comes out …" for Picture and Animated too | Fixed: `noResultsNote` (Picture, Animated wait for the nominations) |
| 1-6 | International `eligible` read "Not nominated" on Submissions but "Eligible" on the movie page, search and the watch list | Fixed: `oscarStage` everywhere; grouped stages know when every eligible result is International's |
| 1-7 | The race went from h1 to h3 | Fixed: a visually hidden h2 per category panel |
| 1-8 | Unknown slug or year: tab title "Not found" (guide §10: "Page not found"); status 200 | Title fixed. Status dropped: the same streamed-shell mechanism accepted for the race in 1.8; the page says not found and nothing is indexed |
| 1-9 | `marks:restore` could overwrite a tap made during it, for a film it planned to insert | Fixed: inserts never overwrite; the restore rolls back and asks for a new dry run |
| 1-10 | A save that never answers spins until Vercel ends the function | Dropped: a client timeout would free the film for a newer save that could race the hung one (1-1 again); the function ends at 300s and the mark flips back with a toast |
| 1-11 | A cron run that crashes before its batch writes no `data_loads` row | Dropped: plan §10's alert for a broken cron is `/data`'s stale-score notice (3.5) and Vercel's logs |
| 1-12 | Product plan §3.13: every list can be filtered to watched, unwatched or want to watch; only Submissions has Unwatched | Task 2.11a (added) |
| 1-13 | Oscar year page and Watch list section headings in the Title style, not Section (guide §4) | Fixed |
| 1-14 | Watch list "Show all" was a centred button, not the guide §7 row | Fixed: `ShowAllRow` ("**Show all 100 films** · sorted by Oscar stage") |
| 1-15 | Numeric column labels left-aligned over right-aligned figures | Fixed: `FilmList` head takes `{ label, numeric }` |
| 1-16 | Watch list meta line showed only the year (guide §7: year · categories) | Fixed: "2024 · Picture, International" |
| 1-17 | Search result's flag invisible on the highlighted row (placeholder the same colour as the row) | Fixed: placeholder on `--line`; the screenshot waits for the flag |
| 1-18 | `/styleguide` lacks the Phase 1 components (race tabs, stage line, contender row, Show all row, search states) | Task 1.17 (added) |
| 1-19 | Race list had no closing rule under its last row | Fixed: `ContenderList` bottom rule |
| 1-20 | Oscars 2025 at 390: "Nominees and winner" wraps under some headings, not others | Fixed: on phone the note always takes its own line |
| 1-21 | 404 links read "The race", "Awards" with no year | Fixed: the live season ("The 2026 race", "Awards 2025", as the preview) |
| 1-22 | Phone menu "N to watch" not wired (1.14 follow-up) | Fixed: a live count of films marked want to watch |
| 1-23 | Watch list rows on phone are tall (about 150px) | Dropped: the film row as the guide draws it; no change |
| 1-24 | Home tab title was "The 2026 race" without " · Oscar Movies" (the root layout's template skips its own segment's page); `identity.spec.ts` still expected the Phase 0 "Oscar Movies" | Fixed: absolute title on `/`; the spec checks `/` and `/race/2024` |
| 1-25 | `search.spec.ts` and `phase-1.spec.ts` pressed `/` before the page hydrated (a flaky first press) | Fixed: the specs retry the key until the box has focus |
