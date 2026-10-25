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

## Phase 4 review (2026-10-23)

**Checks:** full Playwright suite after the fixes 84 of 88: four specs still held Phase 2 counts or lines that Phase 4's critics groups changed (4-18, 4-19), all four passed when rerun (another project's server held port 3100 for a few minutes before the rerun); screenshot spec 29 of 30 on the first run (`race-2026-early`: Documentary 2026 stopped being "Early" once the Critics Choice Documentary nominees loaded, so the route moved to International), then the seven touched routes 7 of 7 (390 and 1280, light only, every route into `screenshots/phase-4/`); unit 742; database 86; `data:check` (1215 editions), `race:check` clean, typecheck, lint, build clean. Data fixes loaded on `test` (accuracy and predictions recomputed); production untouched.

Two fresh read-only reviews: data honesty (importer, editions, spot-checks of NBR, LAFCA, Boston Society, Washington DC, St. Louis, Critics Choice Documentary, Peabody, Dorian, Gotham, Florida, London, Astra and NSFC against Wikipedia: no invented winners or nominees), pages, specs and design (guide §15 on `screenshots/phase-4/` against `design-preview.html`). No raw hex (grep clean). Differences already recorded in tasks 4.1–4.12 aren't repeated here.

| # | Item | Where it went |
|---|---|---|
| 2-9 | Movie page, capped critics groups: a rule under the list and another under "Show all"; opening it drew an ink rule mid-list and hid the button (focus lost, no way back) | Fixed: `CappedList`, one list, the Show all row's top rule is its only closing rule; the button toggles to "Show fewer" and keeps focus |
| 4-1 | 28 of 64 critics groups have no data in any year: about 28 accuracy rows read "– – – 0" under a footnote that says "–" means doesn't apply, and the open grid had a "No data" column for each | Fixed: accuracy leaves a group with no finished season out of the rows and Show all N, and the footnote counts them with a link to `/data`; the grid drops a critics column with no data in any year (`queryAwardsWithData`) |
| 4-2 | Movie page "Show all N critics groups" counted rows (award × category) | Fixed: distinct groups |
| 4-3 | `accuracy.spec.ts`, `phase-4.spec.ts`, the `accuracy-picture-critics` shot: Show all pressed before hydration, rows read without a retry | Fixed: press only while the button still says Show all, until "Show the first 8" shows (3-18's pattern) |
| 4-4 | Open-grid screenshots stopped at Festivals: the critics columns were never judged | Fixed: the shots scroll the frame to the Critics groups head |
| 4-5 | No movie-page shot with the capped critics list | Fixed: `movie-awards` re-shot, `movie-awards-critics-open` added |
| 4-6 | Accuracy: after "Show the first 8" at the bottom of 50-odd rows the button jumped off screen; no `aria-controls`; the button repeated `ShowAllRow`'s classes | Fixed: scrolls back to the button; `ShowAllButton` shares the row's look. `aria-controls` dropped: `aria-expanded` on the button right under the rows it opens says enough |
| 4-7 | Accuracy Show all said "with Best Picture results where they exist" | Fixed: "with Best Picture results" (the preview's words), now true with 4-1 |
| 4-8 | Specs with counts tied to today's data (`awards-index.spec.ts` 64 entries, `phase-4.spec.ts` "14 −" years) | Dropped: 64 is the registry (changes only with a plan change); the 14 follows `/data`'s fixed 2012–2026 strip; rewrite when either moves |
| 4-9 | St. Louis: the date reader split "St. Louis" at "St.", so every edition's winners' day was its nominations day (and 2015's "winners' day" was the nominations day) | Fixed: `leadDates` reads past "St." and the like; 10 editions corrected, 2015 `partial` (no winners' day stated) |
| 4-10 | Online FCS 2014–15 winners' day was the first announcement (the nominees); Toronto 2013 both days were 7 Jan 2014 (one late category) | Fixed: "The winners were announced on …" after an earlier announcement is the winners' day and the earlier one the nominations day; "awarded" counts as an awards day |
| 4-11 | Peabody 2016 counted *4.1 Miles*, a documentary short, as a documentary winner | Fixed: `leaveOut` with its own note reason ("a documentary short"); no other short in the Peabody lists |
| 4-12 | NBR Animated: a nominees figure built from winners only (its loaded editions name no other animated film) | Fixed: the nominees figure skips a loaded edition that names only winners in that category, and is "–" when none names a nominee; the "–" reason reads "only the winners are known" |
| 4-13 | AAFCA is `winnersOnly`, so its Best Picture top ten (2015–18) never counts | Dropped: four of fourteen years have a top ten; the flag matches the group's usual announcement |
| 4-14 | Runners-up: LAFCA has a nominees figure, Boston Society and NYFCC (runners-up some years) are `winnersOnly` | Dropped: the flags follow each group's announcements (LAFCA names a runner-up in every category every year). With 4-12, removing `winnersOnly` from Boston Society would count only its years with runners-up: an easy change if the owner wants it |
| 4-15 | AWFJ, BIFA 2015–16, AAFCA 2014 are `partial` only for a missing date, which hides their nominees figure | Dropped: a `partial` edition may miss nominees, so the figure counts `loaded` only; a day added by hand in `sources/critics.json` `dates` turns such an edition `loaded` |
| 4-16 | Dorian and AWFJ notes said the date was missing twice | Fixed: the generic "announcement date is not stated" isn't added when the group's own note says it |
| 4-17 | Edition files shorten titles after a colon | Dropped: the files' titles are for reading them; pages show the film record's title (IMDb IDs are right) |
| 4-18 | Race precursor line: with critics groups loaded, a film's wins fill the four places, so a major nomination (The Brutalist's BAFTA) no longer shows; `race.spec.ts` expected it | Dropped: 2.11's order (wins first, majors before critics groups); the spec now checks the wins. Showing majors' nominations before critics wins is a small change in `precursorLine` if the owner prefers it |
| 4-19 | `phase-2.spec.ts` and `year-summary.spec.ts` held 2025 counts from Phase 2 (31 Picture films, 90 in all, Hamnet the most nominated), changed by 4.10's critics nominees | Fixed: each count is read from the page and checked against the grid it opens |

## Phase 5 review (2026-10-23)

**Checks:** full Playwright suite after the fixes 92 of 92 on the first run (nothing else testing on the server); screenshot spec: the two changed routes retaken, 2 of 2 (`festival-lineup-cannes-2025`, `movie-screenings`, 390 and 1280, light only, `screenshots/phase-5/`); unit 784; database: the loader's tests failed on 5-6's new rule (their fixture's screenings sat on a major with no section order), the fixture fixed and the 7 rerun (90 in all); `data:check --base origin/main` (1 warning: a San Diego critics film with no country, not a lineup film), `race:check` clean, typecheck, lint, build clean. Data fixes loaded on `test` (the six rows the new files replace deleted first: five retitled films, Viva Carmen's QID row; no marks or results); a second load plans nothing. Production untouched.

Three fresh read-only reviews: data honesty (importer and data; spot-checks of Cannes 2025 Competition, Un Certain Regard, Critics' Week, Directors' Fortnight, Venice 2025 Competition and Orizzonti, Sundance 2025 U.S. Dramatic, Toronto 2025 Platform, Midnight Madness and prizes, Berlin 2025 Competition, Toronto and Cannes 2026 prizes against Wikipedia: all matched; 304 TMDB and 864 Wikidata matches agree on the director), pages and specs, design (guide §15 on `screenshots/phase-5/` against `design-preview.html`). No raw hex (grep clean). Differences already recorded in tasks 5.1–5.5 aren't repeated here.

| # | Item | Where it went |
|---|---|---|
| 5-1 | 18 lineup films filed only by a QID (Wikidata has no IMDb ID), so OMDb can never score them; Viva Carmen filed twice (Cannes 2026 by QID, Toronto 2026 by tt29034109) | Fixed: a film with no IMDb ID on Wikidata is searched on TMDB with the row's director; 15 found and re-filed (slug and QID kept, `reviseMovies`), Viva Carmen merged; Sisters (Toronto 2026) stays under its QID |
| 5-2 | Stale or disambiguated titles: Rose's Baby (now Up Against It), The Face of Terror (The Face of Horror), Notre Salut (A Man of His Time), "De Gaulle (2026 film)", "The Road Not Taken (2026 film)" | Fixed: `titles` and Wikidata labels lose "(… film)"; slugs follow (none released) |
| 5-3 | Section names differ between years (Sundance World [Cinema] Documentary Competition, Venice Biennale College [-] Cinema) | Fixed: `sectionNames` |
| 5-4 | Sundance prizes read "U.S. Dramatic (Grand Jury Prizes)", "Directing Award (Directing, Screenwriting and Editing)"; Venice Critics' Week prizes named the section in English beside its Italian name | Fixed: `dashPrizeText` ("Grand Jury Prize", "Directing Award"); Venice's heading maps to the section's name |
| 5-5 | 12 lineup films with no country, so no flag (§3.9) | Fixed: the row's production countries when no source gives one |
| 5-6 | `data:check` didn't check section order: two sections sharing a place would merge on the page | Fixed: screenings only on festivals; one `sectionOrder` per section, shared by no other |
| 5-7 | A prize goes on every section a film appears in | Dropped: no film with a prize is in two sections; a prize line names the film, not the section |
| 5-8 | The lineup showed only when the edition's prizes were loaded (status is about prizes); the index didn't link a `no_data` festival | Fixed: a lineup is its screenings; from 2025 the index links any festival with an edition. `data:check` still refuses screenings on a `no_data` edition, so a lineup loaded before its prizes needs the edition `partial` |
| 5-9 | `phase-5.spec.ts`: the chip was clicked before hydration could take it | Fixed: pressed until `aria-pressed` holds |
| 5-10 | The spec's comments claimed checks it didn't make (the chip filtering, the year switcher keeping both, the 2024 index) | Fixed: each is checked |
| 5-11 | Expected orders came from Postgres's byte order, the page sorts with `localeCompare` (Berlin and Toronto differ); the average comparator was unstable for two films with none | Fixed: the spec sorts with the page's comparators |
| 5-12 | Films left out of a lineup (the edition's "Lineup:" note) were never shown | Fixed: "Also left out: …" in the footnote |
| 5-13 | `/festivals/bafta/2025` had the tab title "BAFTA 2025 lineup" on a 404 | Fixed |
| 5-14 | Prize pills keyed by name, read run together; gold wash on any prize | Keys and a spoken "; " fixed. Gold dropped: a prize is a win (guide §2) |
| 5-15 | Movie page: the Palme d'Or twice (its Won row and the screening's caption) | Fixed: the caption leaves out a prize the festival's Won row shows (Sundance's "U.S. Grand Jury Prize: Dramatic" is its section's "Grand Jury Prize"). Toronto's documentary prize keeps both (the source names it two ways) |
| 5-16 | A pre-2025 film with no award result had no coverage line | Fixed |
| 5-17 | Movie page read awards then screenings one after the other | Fixed: in parallel |
| 5-18 | Loose spec assertions (unscoped prize text, `others[0]`); "Sort by" said twice; "Show all films" adds a history entry | Fixed, except the history entry: dropped, it's a link like every Show all |
| 5-19 | Phone: "Prize" on one line and its pill on the next; a "Prize –" line on most rows | Fixed: pills inline; no Prize line on phone without a prize (`FilmRow` `phoneHidden`) |
| 5-20 | "Selected" uses the Nominated look and isn't in guide §7, §11 | Dropped: AFI's top ten already reads "Selected" in that look (2.11); one word, one look. Owner to confirm (Waiting list) |
| 5-21 | Pills repeat their section ("Jury Prize (Un Certain Regard)" under Un Certain Regard) | Fixed: `prizesOf` drops it inside that section |
| 5-22 | Every row's meta line was just "2025" | Fixed: only a film from another year says its year |
| 5-23 | `StagePill` wrap mode `py-[3px]`, `min-h-[22px]` off the scale | Dropped: pill internals keep the preview's 22px height |
| 5-24 | Long lineups (14,000px) have no jump to a section | Dropped: not in guide §8.3; a follow-up for the owner (sections already have ids) |
| 5-25 | Many lineup films read "No scores yet" | Dropped: the daily score job fills them (675 never checked after 5.2); 5-1's 15 films now have the IMDb ID it needs |

## Phase 6 review (2026-10-24)

**Checks:** full Playwright suite 90 of 95 on the first run (nothing else testing; the five failures were specs tied to data Phase 6 changed, 6-25, and the 404 status check of 6-6), then the five rerun with `--last-failed`: 4 of 5, and the last (Seattle 2020 is partly loaded) after one more fix; screenshot spec: the two changed routes retaken, 2 of 2 (`accuracy-documentary-critics`, `awards-doc-nyc-2025`, 390 and 1280, light only); unit 829; database 91; `data:check`, `race:check` clean, typecheck, lint, build clean. Data fixes loaded on `test` (a second load plans nothing; the 40 unused films' rows deleted, none with a mark, result or screening; accuracy and predictions recomputed). Production untouched.

Three fresh read-only reviews (importers and data; pages, specs and design on `screenshots/phase-6/`; a spot-check of ten IMDb-filled editions against the groups' own sites or press: Atlanta 2024, Cinema Eye 2016, IDA 2019, Indiana 2021, Utah 2018, Georgia 2023, Kansas City 2015, North Texas 2022, Southeastern 2013, Black Film Critics 2020; nine match exactly, Kansas City 2015 is two nominees short, 6-22), plus a check of the 34 categories where IMDb gives two or more winners (30 real ties, 2 false, 2 partly confirmed). No raw hex (grep clean).

| # | Item | Where it went |
|---|---|---|
| 6-1 | Cinema Eye's Unforgettables (up to 15 honorees a year) stored as wins: "a hit if any winner did it" put it second among majors (62%, 100%), every honoree had a Won pill and gold wash, and precursor lines read "Won: Cinema Eye" | Fixed: an honoree list is written as `nominated`, a list with no winner (winner figures –, nominee figure 13 of 59 on `test`); mapping note says so. Owner to confirm (Waiting list) |
| 6-2 | Sources: IMDb card said "critics groups and festivals" (no festival comes from IMDb) and "event pages" | Fixed: "many critics groups and Cinema Eye", "award records" |
| 6-3 | `phase-6.spec.ts`: the grid's critics chip clicked before hydration; column heads read before the opened table | Fixed: pressed until the address says `critics=open`; waits for the critics columns |
| 6-4 | `phase-6.spec.ts` fixed the last finished season at 2025 (breaks after the 99th Oscars) | Fixed: read from the database (the newest Oscars held with a Documentary winner) |
| 6-5 | "DOC NYC is the last festival" only checked that Cannes wasn't after it | Fixed: every column after it is a critics group |
| 6-6 | DOC NYC's lineup 404 checked by heading only (`phase-6.spec.ts`, `awards-index.spec.ts`) | Dropped: with Cache Components the 404 page streams in with a 200 status (a prerendered shell), as the earlier specs note; the heading check is what holds |
| 6-7 | DOC NYC (and AFI) have only an announcement day, so the award page's sub line had no date and the indexes showed "–"; "Festival prize" for a list | Date fixed: a list's results day is its announcement day (`resultsDay`, unit-tested on `test`). "Festival prize" dropped: the kind label is shared by every festival; a "Festival list" label is a small change if the owner wants it |
| 6-8 | `npm test` failed 8 unit tests since 6.2 (critics editions now filled from IMDb; Cinema Eye 2021) | Fixed: those tests check there's no Wikipedia data (`no_data`, or IMDb alone); Cinema Eye 2021 back to `loaded` (6-10) |
| 6-9 | Unmapped IMDb labels left data out and wrote a false "Not on IMDb": Online FTV "Best Documentary Feature Film" (2025), Toronto "Allan King Documentary Award" (2012) | Fixed: mapped; Online FTV 2025 and Toronto 2012 filled |
| 6-10 | Leaving out a series or short made a Wikipedia `loaded` edition `partial` (Cinema Eye 2021, Music Box), named it twice, and a lowered status never comes back | Fixed: a series or short left out doesn't lower the status; each film named once; Cinema Eye 2021 `loaded`. The one-way status is documented (`docs/imdb-import.md` §3.7: rerun the Wikipedia script first) |
| 6-11 | 40 films added that no edition lists (rows only compared, in absent categories or dropped nominees), some IMDb link errors (A United Kingdom under 2022, Scala for Scala!!!) | Fixed: only films the merge writes are researched; the 40 removed from `data/movies/` and from `test` |
| 6-12 | Nominees written for `winnersOnly` groups (Oklahoma 143, Las Vegas 74, Kansas City 65, AAFCA) | Fixed: winners only, as the registry says. Kansas City's own site announces nominees (spot-check): flipping its flag is an owner choice (Waiting list) |
| 6-13 | 2025 categories IMDb lists with no winner yet (Utah, North Dakota, Chicago Indie, Black, Central Florida, North Carolina) | Fixed: not filled; the note says "IMDb lists no winner in: …" (Chicago Indie 2025 back to `no_data`) |
| 6-14 | A lone IMDb nominee beside a winner is often the group's runner-up, stored as `nominated` | Dropped: figures are the same (same stage, `partial` editions); guessing "runner-up" from one nominee can be wrong (Southeastern 2013 names two) |
| 6-15 | Two-winner categories carried no tie mark; a false second winner inflates the figures | Fixed: the note names each tie. Of 34 checked against the groups, 30 are real; IDA 2023 Director (Milisuthando) and Online FTV 2017 Animated (Loving Vincent) were nominees, corrected with `notWinners` in `sources/imdb.json`. Cinema for Peace 2012 (sources conflict) and Cinema Eye 2025 Production (one source names both) stay ties |
| 6-16 | Iowa 2024: IMDb files Anora's Best Film win in the edition for 2023 films; the 2024 note says "Not on IMDb: Best Film" | Dropped: IMDb has no edition for Iowa's 2024 films; the 2023 note says why Anora is left out. A per-row season fix isn't worth one row |
| 6-17 | DOC NYC: a film with no IMDb match would leave a `loaded` edition silently short | Fixed: it's left out by name and the edition is `partial` (no film affected today) |
| 6-18 | DOC NYC's hand matches (`ids`) were keyed on the page's film year, not the festival year `leaveOut` uses | Fixed: keyed on the festival year (all seven keys already were) |
| 6-19 | `FEATURE_TYPES` let IMDb miniseries in | Fixed: removed (no film affected) |
| 6-20 | IMDb's title search needs a release date, so a nominee with none is missed | Documented in `docs/imdb-import.md` §2 (6-22 is likely this) |
| 6-21 | Database tests tied to today's data: The Brutalist's precursor line (AWFJ pushed off by IMDb-filled critics wins), the 2025 grid's 17 columns and the year summary's 90 and 20 films (DOC NYC added a column and films) | Fixed: order checked by kind; columns from the registry; counts read from each category's grid |
| 6-22 | Kansas City 2015: Documentary and Animated each one nominee short of the group's list | Dropped: the edition is `partial`, so its nominees don't count in any figure; the gap is documented (6-20) |
| 6-23 | Notes said "Not found on the source: international, documentary, animated" above IMDb's results for those categories (98 editions) | Fixed: "Not on Wikipedia: …" once IMDb fills them |
| 6-24 | Ranked top tens (Atlanta, Southeastern, Black Film Critics) and runners-up stored as nominees | Dropped: as in Phase 4, everything at nomination stage or further counts as a nomination |
| 6-25 | Earlier specs tied to data Phase 6 changed (full suite 90 of 95): `grid.spec.ts` expected Atropia first by title (28 Years Later now is), `phase-2.spec.ts` took the first Cinema Eye row (five since Phase 6), `phase-4.spec.ts` expected San Francisco's gap and IDA's emptiness (both filled from IMDb) and a row for every group with any edition (Chicago Indie has no Best Picture results) | Fixed: title order checked with the page's comparator; the feature row by name; Seattle's gap and New Jersey read from the database; groups with Best Picture results only |

## Phase 7 review (2026-10-25)

**Checks:** full Playwright suite 115 of 120 on the first run (nothing else testing); the five failures were specs tied to changes since the last full run (7-31 to 7-34) and to the new group rows (7-17); fixed, then all five passed with `--last-failed` (the fixes touched specs only). Screenshot spec: the eleven Phase 7 routes retaken, 11 of 11 (22 pictures at 390 and 1280, light only; new `grid-2025-sort-menu`). Unit 910, database 124 (one failed before the fixes: 7-2), typecheck, lint, build clean. Hex grep clean (only test data in `Styleguide.test.tsx`).

**Owner-data checks on `test`** (a throwaway script through the real `marks:export` / `marks:restore` CLI, `test` put back exactly as before): export carries rank, date and platform; reorder, release notes and a mark changed, then restored: a second export is byte-for-byte the first, and a second restore plans nothing; a reorder missing a wanted film, with an unwanted film added, or with a wrong id swapped in is refused and writes nothing, one naming a film twice throws; an old-format file restores the marks and leaves release notes alone (a film wanted again goes last).

**Guide §15** on `screenshots/phase-7/` and the components: AppShell and PageHeader on every page; tokens only; gold only for its jobs; light only; no sideways scroll at 390 or 1280; keyboard and focus (add box, release editor focus and return, drag by keyboard with Esc, sort menu Esc); empty, loading, failure and saving states drawn; long titles wrap; one flag per row in all shots. Failed before the fixes: the grid's group rows and the sort menu (7-17, 7-18) and the signals picks line (7-19).

Three fresh read-only reviews: writes (marks, Watch list actions, backup), pages and data layer, design. Differences already recorded in tasks 7.1–7.14 aren't repeated here.

| # | Item | Where it went |
|---|---|---|
| 7-1 | A restore wrote the file's ranks next to films it left alone, so two films could share a place (an older backup restored after the order changed) | Fixed: the restore transaction numbers every wanted film 1…n again (the more recently marked first on a tie); db test |
| 7-2 | Unwanting a film left a gap in the ranks (1, 3, …), despite 7.4's "1…n"; `test`'s seeded film sat at #2, which failed `mark-write.test.ts` | Fixed: the unwant moves the films below up one in the same statement; `test` renumbered; db tests assert 1…n and no longer assume the seeded order has no gap |
| 7-3 | Between migration 0004 on production and the deploy, the live code's unwant fails the new rank check (and a film wanted there is unranked) | Documented: the Waiting list row says the migration and `git push origin staging:main` go back to back |
| 7-4 | The order toast's "Try again" could start a second save while one was running; if that failed, the rows went back past the first move and the screen and database disagreed | Fixed: one order save at a time |
| 7-5 | Two "to the top" writes landing in the same instant can both get #1 | Dropped: needs two devices at once on a one-owner app; a tie only sorts by title and the next drag renumbers. A lock inside one read-committed statement wouldn't prevent it |
| 7-6 | The stale check compares which films are wanted, not their order: a reorder from an old tab overwrites another tab's reorder | Dropped: last write wins between the owner's own tabs and no film is lost; the refused cases are the ones that could drop or invent a place |
| 7-7 | "Used before" platforms are ordered by any mark change, not by when the platform was set | Dropped: suggestion order only; a separate timestamp would need a migration |
| 7-8 | Specs and a db test expected Critics Choice's live year to read "No data" (breaks when its 2026 results load) | Fixed: a past no-data year (Critics Choice Doc 2012); the Done-when spec checks only that the live year's block is there |
| 7-9 | 2026 hard-coded in the signals, Phase 7, Watch list and all-years specs | Fixed: `LIVE_YEAR` |
| 7-10 | Typing into Add a film right after loading could beat hydration (no search fires) | Fixed: specs and the screens script type again until the option shows |
| 7-11 | Older Watch list specs put back only watched and want, dropping a film's rank and release notes | Fixed: `putBack` restores the whole rows, the other films' places included |
| 7-12 | `getAwardHistory` ran its three reads one after another | Fixed: one `Promise.all`. Skipping the Oscar rows on the Oscars' own page dropped: its stage line reads them |
| 7-13 | Signals footnote said the figures "include {year} itself", untrue before the year's Oscars | Fixed: "they count every finished season, {year} included once its Oscars have been held" |
| 7-14 | A strong award whose category stopped running reads "No results for <year> · the app has none from this award yet" | Dropped: still true; the wording is 7.6's provisional line, on the Waiting list for the owner |
| 7-15 | The infobox parser would split "São Tomé and Príncipe" | Fixed: unit test |
| 7-16 | The flag subquery runs per result row | Dropped: indexed and cheap; the pages are cached |
| 7-17 | Year grid: no group rows under the Oscars sort (guide §8.4 v1.1) | Fixed: "Oscar winner and nominees n", "Oscar shortlist n", "Other films n" (`th scope="rowgroup"`, paper, `--line-strong`); unit test; grid specs count film rows only (they're the row headers with a link) |
| 7-18 | Sort menu not as guide §7 v1.1 (220px, no caption, chosen item only bold, `group` of links) | Fixed: 248px, radius 14, padding 8, "Sort the films by", Oscars' caption, chosen on gold wash, `menu` / `menuitemradio`; screenshot of the open menu added |
| 7-19 | Signals By film: picks carried the accuracy table's notes ("· a list, no winner", "· looser match"), clashing with the dots between picks | Fixed: the category's own name only, also in the not-announced notice; the notes stay beside the By award heading |
| 7-20 | The add box screenshot showed the flag's placeholder | Fixed: the screens script waits for the flag |
| 7-21 | Signals used `CalendarClock`; §9's set has `Calendar` | Fixed |
| 7-22 | The figure sentence's count split across lines at 390 ("5 / of 6") | Fixed: the count doesn't wrap |
| 7-23 | By film's head read "Film", not §8.13's "Film and the strong awards that picked it" | Fixed: `FilmList` takes `filmLabel` |
| 7-24 | All years: an edition's note shows in every tab, including remarks about other categories | Dropped: notes are one per edition in the data; splitting them is a data change. Repeating the note is 7.11's choice, on the Waiting list |
| 7-25 | "for <country>" sat beside the pill at every width; §8.2 says under it on desktop | Fixed on the all-years and Oscar year pages |
| 7-26 | All years' back link goes to the live year before it has results | Dropped: follows §8.2; that page says why it's empty. On the Waiting list |
| 7-27 | The phone sheet's close button was 36px (§13: 44) | Fixed |
| 7-28 | One-off values: `py-[18px]`, `mt-[3px]`, a spelled-out easing curve | Dropped: 18px and 3px are the reference's `.nyet` and film-row values; the drop animation runs through `element.animate`, which can't read `var(--ease)`, so the curve is spelled out with a comment |
| 7-29 | Movie page: no dot between the original title and the year | Fixed |
| 7-30 | Toast titles ended differently ("… added." against "Couldn't save the order") | Fixed: no full stop, as the reference's add toast |
| 7-31 | `awards-index.spec.ts` expected 64 critics groups (63 since Cinema for Peace was dropped) | Fixed |
| 7-32 | `phase-2.spec.ts` expected the nominee figure 16 of 33 and Years in the fifth cell (since 1606655 and 78c2dd4: 39 of 83, and the caught figure 39 of 70 before Years) | Fixed |
| 7-33 | `phase-1.spec.ts` found a Watch list row by its first button, now the release line | Fixed: the nearest block holding the marks |
| 7-34 | `data.spec.ts` read the TMDB logo's pixels before the lazy image was scrolled to | Fixed: scrolls to it first |
