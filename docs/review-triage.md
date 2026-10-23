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

## Phase 2 review (2026-10-23)

**Checks:** full Playwright suite after the fixes 71 of 73 (two specs still expected the old behaviour: the awards index's fixed order, and a new Shift+Tab step from the wrong link), both passed with `--last-failed`; another project's test browser was running on the server at the time; screenshot spec 19 of 19 (390 and 1280, light only), the five changed pages retaken; unit 591; database 80; `data:check`, typecheck, lint, build clean.

Three fresh read-only reviews: logic and data (accuracy, grid, movie awards, compute, loader, importers), pages and specs, design (guide §15 on `screenshots/phase-2/` against `design-preview.html`). No raw hex or dark styles (grep clean). Differences already recorded in tasks 2.1–2.13 aren't repeated here.

| # | Item | Where it went |
|---|---|---|
| 2-1 | Award pages' Oscar column read "Eligible" for Animated films on the Academy's eligible list after the nominees were out without them | Fixed: `oscarCell` reads Not nominated once the nominations are out. The movie page and the Oscar year page keep "Eligible" there: it is the film's place on the Oscars' own list (1-6) |
| 2-2 | Accuracy counts a precursor winner's Oscar nomination from a season whose ceremony hasn't happened yet | Dropped: a nomination doesn't change once announced; leaving it out would count the film as a miss until the ceremony, then flip it |
| 2-3 | Year grid sort menu: choosing a sort dropped keyboard focus on the page; Esc did nothing with focus on the button | Fixed: focus returns to the button; Esc works anywhere in the menu (`SortMenu`, `grid.spec.ts` checks both) |
| 2-4 | `mark-filters.spec.ts`: the Unwatched step asserted what the page already showed before the click | Fixed: waits for the address, then checks an unmarked film appears |
| 2-5 | Accuracy table kept its own sort after a link to another sort of the same category (the nav's Accuracy) | Fixed: the table resets when the address's sort changes |
| 2-6 | Empty states inside a category section were a second `h2` (Oscar year page, race) | Fixed: `h3` |
| 2-7 | Year summary's Watched counts come from a server read of the marks, where plan §5.1 says counts with marks are worked out on the client | Dropped: the same per-visit read as the Watch list and the mark filters (2.11a); stale only if a save is still in flight when the page opens |
| 2-8 | `awards-year.spec.ts` finds the AFI row by a class name and counts "–" on the page | Dropped: both pass and test what they say; rewrite when that markup changes |
| 2-9 | Movie page, capped critics groups: the list's closing rule and the Show all row's rule both show | Task 4.R: judged with real critics groups (none are loaded until Phase 4) |
| 2-10 | Year summary: no nav item marked | Fixed: `/years/` belongs to Year grid |
| 2-11 | Awards index says "in calendar order" but Satellite (10 Mar) sat before DGA (7 Feb) | Fixed: each list follows that year's dates; an award with no date (AFI) keeps its registry place |
| 2-12 | Movie page: the Major awards / Festivals / Critics groups headings were in the Title style (guide §4: `h3` is Body at 600) | Fixed |
| 2-13 | Accuracy at 390: the Award column shrank to about 75px, one word per line | Fixed: the first column of a data table keeps 140px on phone and the table scrolls in its frame |
| 2-14 | Year summary: "9 · Most nominations" didn't say whose | Fixed: "Nominations for Hamnet, the most", the wins under it (the reference file's wording) |
| 2-15 | Year summary sub line didn't name the ceremony (guide §11 Years) | Fixed: "98th Academy Awards season in numbers. …" |
| 2-16 | Festivals index: h1 "Festivals 2025", then an h2 "Festivals" | Dropped: Phase 5 adds the lineups to this page, and the heading tells prizes from lineups |
| 2-17 | Awards index: the empty Critics groups section doesn't say when they come | Dropped: there is no date to give; Phase 4 loads them and this state goes |
| 2-18 | Award pages: the jump control marks no segment | Dropped: it jumps within the page, so no category is the current view |
| 2-19 | BAFTA's jump segments use the award's long names and scroll on phone | Dropped: they match the section headings (the award's own names, guide §8.2); Globes' Drama and Comedy would read the same in Oscar words; the control scrolls in its frame as guide §7 allows |
| 2-20 | Award pages: the Oscar column head read only "Best Picture" | Fixed: "Oscar, Best Picture", as the reference file |
| 2-21 | Year grid at 1280: nothing shows that the frame scrolls on to the festivals | Dropped: guide §8.4 draws a plain bordered frame; a fade is a new look, for the guide first if the owner wants it |
| 2-22 | Year grid: titles start at different x with one to three flags | Dropped: a slot for three flags would push most titles (one flag) right; phone hides the flags |
| 2-23 | Movie page Awards rows stacked the category under the award, twice the reference file's height | Fixed: award · category · result on one line from 768px, stacked on phone, as the reference file's `.awl`; not-nominated names in regular weight |
| 2-24 | Movie page Awards heading had no meta line | Fixed: "Every followed award that gave these categories in 2024" |
| 2-25 | Movie page left out Festivals when no festival gave a prize | Fixed: the section shows "No followed festival prize." |
| 2-26 | Race precursor line: awards not in calendar order within a group | Dropped: the order is 2.11's rule (wins first, majors before critics groups before festivals, later in the season first) |
| 2-27 | Year summary: zero Watched counts in ink | Fixed: `--ink-muted` (`TextLink` tone `muted`) |

## Phase 3 review (2026-10-23)

**Checks:** full Playwright suite after the fixes 83 of 83 on the first run (another project's Playwright run was on the server at the time); screenshot spec 24 of 24 (390 and 1280, light only, every route into `screenshots/phase-3/`), the tie state retaken after 3-13; launch checks rerun: axe 0 violations in 28 views, layout shift 0 on `/` and the grid at both widths; unit 683; database tests for predictions, coverage and accuracy 11; predictions recomputed on `test` (1919 rows); typecheck, lint, build clean.

Three fresh read-only reviews: logic and data (engine, compute, race:check, backtest, coverage), pages and specs, design (guide §15 on `screenshots/phase-3/` against `design-preview.html`); plus the launch findings (`docs/phase-checks/launch.md`). No data-loss or wrong-write bugs found: `predictions` is replaced inside the load's transaction, `race:check` only reads, cache tags hold. No raw hex (grep clean). Differences already recorded in tasks 3.1–3.10 aren't repeated here.

| # | Item | Where it went |
|---|---|---|
| 3-1 | Launch A1: inactive race tab names `ink-subtle` at the 20px phone size (3.45:1; guide §3 allows it from 24px) | Fixed: `ink-muted` below `md`, `ink-subtle` from `md` |
| 3-2 | Launch A2: `/data`'s table frame scrolls sideways on a phone with nothing focusable | Fixed: a frame that overflows becomes a named, focusable region (`DataTable`, checked on resize); `/data` no longer scrolls on a phone (3-9) |
| 3-3 | Launch P1: layout shift 0.136 on a phone, the footer jumping when streamed content arrives | Fixed: `main` is at least a screen under the top bar, so the footer starts below the fold (short pages scroll a little to reach it). Re-measured: 0 at both widths on `/` and the grid |
| 3-4 | Launch S1: no security headers beyond `X-Robots-Tag` | Fixed: `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy` (no CSP: Next's inline scripts need nonces); the smoke test checks two |
| 3-5 | Launch P2, P3, S3 (293 KB home HTML, phone main-thread time, dev-only audit findings) | Dropped: accepted in `launch.md`; look again if the owner's phone feels slow |
| 3-6 | Launch S2, S4 (rate limit on `/api/search`, a read-only database role) | Owner, optional: production settings; on the Waiting list |
| 3-7 | A "Final prediction" of 99.98% ("100%") for a film that lost (International 2024): after the nominations the fitted softmax had no cap | Fixed: no film above 97% after the nominations (`LATE_CAP`, plan §5.3 and the Method text); owner to confirm the number |
| 3-8 | Undated precursor results (Cinema Eye 2012–2020, AFI 2017) counted as announced in October of those seasons, sharpening 2026 Documentary's live chances | Fixed: an undated result counts from the eve of its season's nominations (plan §5.3) |
| 3-9 | `/data` at 390: the strip cut off at the right, the Status column off-screen and wrapping | Fixed: the status goes under the award's name on phone, the strip takes the room left (2px gaps); the strip's label names partly loaded, no-data and live years |
| 3-10 | `/data`: "Partly" without "loaded"; every major award read "Partly, 1 year no data" because its 2026 edition is still ahead | Fixed: "Partly loaded"; a live-season edition on file but not out yet is gold (live), not a gap |
| 3-11 | Backtest at 390: the Result column off-screen, titles one word per line | Fixed: on phone the result goes under the title, flags hidden, Result column left out |
| 3-12 | Backtest strip with no stored predictions read "0%", "0 of 0" | Fixed: "–" (guide §11); the dashes in rows say "No prediction stored for this season" to screen readers |
| 3-13 | Tied favourites (Documentary 2026, 22% and 22%): only the first was gold | Fixed: every row whose % reads the same as the favourite's is gold (`leadersOf`); when every row ties (Documentary 2026 after 3-8: five at 20%) none is |
| 3-14 | The "why": "Similar seasons" listed all 14 years | Fixed: up to six are listed; more read "Similar seasons: 14, from 2012 to 2025" |
| 3-15 | Stage line "Nominations 21 Jan · Ceremony 14 Mar 2027" (one date with its year, one without) | Fixed: once one date in a line needs its year, every date in that calendar year carries it |
| 3-16 | Sub line said "Final prediction, made …" from the ceremony day (UTC) before the winners were loaded; a finished season with no eve stored labelled live chances "Final prediction" | Fixed: the sub line follows the rows' rule (winners loaded and the eve stored); the column label follows the snapshot shown |
| 3-17 | `phase-3.spec.ts`: the "why" check passed without the why opening (the row's own line names TIFF); the restore wasn't proven; Fjord's label broke under 1% or behind Show all | Fixed: waits for `aria-expanded`, reads the panel; compares every restored chance with the start; builds the label with `formatChance` and opens Show all |
| 3-18 | `race.spec.ts` / `phase-3.spec.ts`: the Show all retry clicked again after a slow first success | Fixed: clicks only while the button is there |
| 3-19 | Method: "10 for Best Picture from 2021 (that year's number before)" hard to read | Fixed: "10 for Best Picture from 2021, and before that as many as it had that year; 5 for the others" |
| 3-20 | Race rows: "– to be nominated" silent to screen readers; the % button under 44px wide for "8%" | Fixed: spoken text for the dash; a 44×44 hit area without moving the underline |
| 3-21 | "Show all … under 3%" also covered rows with no stored chance | Fixed: "under 3%" only when true of every row kept back |
| 3-22 | Live history lined up one day short (cutoffs are exclusive; the live target counts today) | Fixed: the history cutoff is one day on |
| 3-23 | `fillSlots` searched shifts in [−100, 100] only | Fixed: [−1000, 1000] |
| 3-24 | International: between the shortlist day and its load, history counts shortlists while the live race counts every submission | Fixed in the routine: `docs/update-the-race.md` says to load a shortlist on its day |
| 3-25 | Picture's nomination slots before 2021 use the final count, unknown on the eve | Dropped: plan §5.3 asks for that year's number |
| 3-26 | α often lands on 21, the largest in the list | Dropped: §5.3's list; widening it is a model change for the owner's instinct check (on the Waiting list with 3-7) |
| 3-27 | Animated "nothing yet" stage line: the preview says "Eligible list in Dec" | Dropped: no eligible-list date is stored (1.8); the line names the next dated step |
| 3-28 | Accuracy at 390: long category captions wrap to four or five lines | Dropped: a caption clamped to two lines hides the award's name; the table scrolls in its frame |
| 3-29 | `/data`: "Academy Awards" group heading over its one row | Fixed: a group of one row named like the group has no heading |
| 3-30 | `/data`: "2012 to 2026" head at the left (preview: the years at the strip's ends); the scores stat on two lines | Dropped: column heads are text (`DataTable`); both read correctly |
| 3-31 | `/data` strip label gave only the loaded count | Fixed with 3-9 |
