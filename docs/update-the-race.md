# Update the race

The routine for when the owner says **"update the race"** (product plan §3.12; two or three times a week from November to March). It adds the season's new results to `data/`, shows the owner what changes, and loads it. Files are the source (IMPLEMENTATION_PLAN.md §3.3); the loader is §3.5. A session runs it in about 15–30 minutes.

**The rule:** nothing reaches `production` until the owner has read the `race:check` report and said go. Results are matched by IMDb ID (or Wikidata QID), never by title, and a result that can't be confirmed is left out, never guessed.

## 1. Start

- On `staging`, up to date (`CLAUDE.md`, session start).
- The season is the latest year in `data/editions/oscars/` (2026 for the 2026–27 season).
- `npm run race:check -- --target test` should say **clean** before anything is edited. If it lists writes, `test` is behind the files: load them first (step 4) so the report in step 3 shows only this update.

## 2. Find and add what's new

1. List the season's editions whose day has come and whose results aren't in yet: in `data/editions/<award>/<season>.json`, `status` `no_data` or `partial`, with `nominationsOn` or `winnersOn` today or earlier (or a date announced since the last update). The Oscars' own dates (shortlists in December, nominations in January) are in `data/editions/oscars/<season>.json`; if the Academy moves them, change them there. Load an Oscar shortlist on the day it comes out: until it is loaded, the live race still counts every submission while past seasons, lined up by date, already count only their shortlists.
2. Fetch the results with the award's research script, for the season only. Each writes the edition file and the facts of any new film, and prints what it couldn't resolve:

   | Awards | Command |
   |---|---|
   | Golden Globes, BAFTA, Actor Awards, PGA, DGA, Annie, Cinema Eye, European Film Awards, Spirit Awards, Satellite | `npx tsx scripts/research/majors.ts --award <slug> --years <season> --refresh` |
   | AFI Top 10 | `npx tsx scripts/research/afi.ts --years <season> --refresh` |
   | Cannes, Venice, Berlin, Sundance, TIFF | `npx tsx scripts/research/festivals.ts --award <slug> --years <season> --refresh` |
   | Oscars: Picture, Documentary, Animated (shortlists, nominations, winners) | `npx tsx scripts/research/oscars.ts --years <season> --refresh` |
   | Oscars: International submissions and shortlist | `npx tsx scripts/research/international.ts --years <season> --refresh`, then `oscars.ts --years <season> --offline` |
   | The 62 critics groups (Critics Choice, Gotham, IDA, Peabody and the rest) | `npx tsx scripts/research/critics.ts --award <slug> --years <season> --refresh` |
   | Gaps Wikipedia leaves: Cinema Eye's Direction, Production, Audience Choice and Unforgettables, and every critics group | `npx tsx scripts/research/imdb.ts --award <slug>[,<slug>…] --years <season> --refresh`, **always after** `majors.ts` or `critics.ts` for the same award (they drop IMDb's rows) |
   | DOC NYC (Short List: Features in October or November, Winner's Circle) | `npx tsx scripts/research/docnyc.ts --years <season> --refresh` |

   Small critics groups have no Wikipedia page, so `imdb.ts` is their only source, and IMDb can lag an announcement by weeks: each update reruns it for every season edition still `no_data` or `partial`. A nominations date the script can't read off the page is typed into `scripts/research/sources/majors.json` (or `oscars.json`) from the award's own announcement; the scripts' headers say which. If Wikipedia doesn't have the results yet, wait for the next update: don't type them from news reports unless the owner asks, and then put the source URL in `sourceUrls`.
3. Settle what the script printed: an unresolved film is found by a Wikidata search (title, year, director) or left out and named in the commit; a half-announced edition (nominees in, winners not) stays `partial` with a `note`.
4. `npm run data:check` must pass. For majors and festivals, the second-source checks (`npx tsx scripts/research/majors-check.ts`, `festivals-check.ts`) should agree too, once Wikipedia's category articles have caught up; a lag there is a note, not a blocker.

## 3. Read the report

```sh
npm run race:check -- --target test
```

It writes nothing. It prints:
- the load plan: counts per edition, and every change to an existing row (`update` and `delete` lines);
- **New results**, one per line (award, year, category, film, outcome);
- **Chances in <season> that move**: per Oscar category, each film whose % to win or % to be nominated changes by a whole point, as the race shows it (`new` for a film that becomes a contender);
- one line per other season that moves (finished seasons only move when a finished season's data changes, since each is history for the others).

Check it the way the owner will: every `delete` line is meant (a correction), no film moved category by mistake, and the chances move the way the new results suggest. A new result that moves nothing is normal early in the season: the engine weighs a result by what it meant at the same point of past seasons, so a nomination that past seasons hadn't had yet by this date carries no weight until they had.

## 4. Load `test`, then show the owner

1. `npm run load -- --target test --dry-run`, then `npm run load -- --target test`. `race:check -- --target test` now says clean.
2. Commit the data files on `staging` (`data/`, and `scripts/research/sources/` if a date was typed) and push, as `CLAUDE.md` says. The message names the editions and anything left out.
3. Show the owner the `race:check` report against production: `npm run race:check -- --target production` (read-only; it needs no `--yes-production`). Paste the New results and the moves, and say what was left out and why.

## 5. Load `production` (only after the owner says go)

1. `npm run load -- --target production --yes-production --dry-run`. It exports the marks to `data/marks.json` first and stops if that fails. Read the plan: it must match what the owner saw.
2. `npm run load -- --target production --yes-production`. One transaction, then predictions and accuracy are recomputed and the live site's cache is expired.
3. `npm run race:check -- --target production` says clean.
4. Commit `data/marks.json` ("Back up marks before the race update") and push.
5. Tell the owner: the editions loaded, the biggest moves, and that the race page shows them now. Data loads don't need a release: the live site reads the database.

In an unattended session, stop after step 4 and leave step 5 for the owner (`RUNNER: BLOCKED`).

## When nothing new is announced

When an Oscar eve passes (the day before the nominations or the ceremony) with no new results, run `npm run compute -- --target production --yes-production` so the eve snapshot is stored; the ceremony's results come in through this routine like any other.

## Sample dry run

`tests/fixtures/race-sample/tiff-2026.json` is a made-up correction of TIFF 2026 (People's Choice winner and runner-up swapped, Fjord added as a runner-up). It never goes into `data/`; it runs against a copy:

```sh
rm -rf .cache/race-sample && mkdir -p .cache/race-sample && cp -r data .cache/race-sample/
cp tests/fixtures/race-sample/tiff-2026.json .cache/race-sample/data/editions/tiff/2026.json
npm run race:check -- --target test --data .cache/race-sample/data
```

On `test`, 23 Oct 2026 (task 3.6):

```
race:check against test (files in .cache/race-sample/data/): 4 writes.
  tiff 2026: edition changed; results 1 new, 2 changed, 0 removed
Changes to existing rows:
  update  result tiff 2026 peoples-choice: I Play Rocky (tt11995650): outcome "runner_up" → "won"
  update  result tiff 2026 peoples-choice: La bola negra (tt35511966): outcome "won" → "runner_up"
New results:
  tiff 2026 peoples-choice: Fjord (tt35410859), runner_up
Chances in 2026 that move (% to win; % to be nominated):
  Best Picture
    Fjord: win 14% → 24% (+10); nominated 97% → 99% (+2)
    La bola negra: win 18% → 12% (-6); nominated 99% → 98% (-1)
    I Play Rocky: win 14% → 16% (+2); nominated 98% → 99% (+1)
    ...
race:check: 4 writes waiting. Load them with npm run load -- --target test (dry run first).
```

(The edition's note line and the zero-count lines are left out above.) Nothing was loaded; `race:check -- --target test` on the real `data/` still said clean.
