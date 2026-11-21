# IDA 2026 nominations

Phase 10b brief (planned 2026-11-21). Before each task, read **Request and smallest design** and that task's entry under **Task briefs**.

## Request and smallest design

Owner (2026-11-21): "IDA awards is in, can u make quick plan of making sure those go in, u can get gpt models to do it."

What it adds for the owner: the 42nd IDA Documentary Awards nominees count in the 2026 Documentary race, the IDA award page and the film pages.

- The 42nd IDA Documentary Awards announced their nominees on **17 Nov 2026**; the winners are named at the ceremony on **4 Dec 2026** (The Ebell, Los Angeles).
- The app already has IDA (`data/awards.json`, slug `ida`) with two categories: `feature` (Best Feature Documentary) and `director` (Best Director, loose). Only these two go in; IDA's other categories have no place in the app.
- `data/editions/ida/2026.json` is `no_data` today. Smallest design: fill it the way **Update the race** (`docs/update-the-race.md`, sections 2–4) does, for this one edition. No code change unless a script can't read the source.
- Winners are not part of this plan: they come out 4 Dec and go in through **Update the race**.

## Before the run

Nothing to set up. Production waits for the owner: the *Owner, after 10b.R* line under Phase 10b in `IMPLEMENTATION_PLAN.md`.

## Task briefs

### 10b.1 Fill IDA 2026 nominations (data import)

1. On `test`, `npm run race:check -- --target test` must say clean first (if not, load the files first, `docs/update-the-race.md` step 4.1).
2. Run `npx tsx scripts/research/critics.ts --award ida --years 2026 --refresh`, then `npx tsx scripts/research/imdb.ts --award ida --years 2026 --refresh` (IMDb event `ev0000351`).
3. If IMDb doesn't list the 2026 nominees yet, type them from IDA's own announcement on documentary.org (the owner asked for this on 2026-11-21, the "unless the owner asks" case in `docs/update-the-race.md` step 2.2). Put that page's URL in `sourceUrls`. If `scripts/research/sources/imdb.json` or `critics.json` has a way to add rows by hand, use it so a rerun of step 2 keeps them. If neither has one, type them into the edition file and add a line to `docs/update-the-race.md` section 2: IDA 2026 rows are hand-typed until IMDb lists them, so don't rerun the IDA scripts for 2026 before then. No new script code for this.
4. Every film is matched by IMDb ID (or Wikidata QID or TMDB ID) found by title plus year plus director, never by title alone. A Best Director nomination is stored like the other loose director prizes: a result row for the director's film in category `director` (check that the director named really directed that film). A film new to the app gets its facts in `data/movies/2026.json` the way the scripts write them (as the EFA 2026 import did, commit `47ada2d`). A film is left out only if IMDb, Wikidata and TMDB all lack it; name it in **Report** with the searches tried.
5. Edition: `status` `partial`, `nominationsOn` `2026-11-17`, `winnersOn` `2026-12-04`, outcome `nominated`, a `note` saying nominees are in and winners are due 4 Dec 2026.
6. `npm run data:check`; `npx vitest related <changed scripts> --run` if a script changed; `race:check -- --target test`; `npm run load -- --target test --dry-run`, then the load.
7. Write `npm run race:check -- --target production` (read-only; it shows what loading production would change) into **Report** below: the New results and every chance that moves, film by film.

Done when:
- `data/editions/ida/2026.json` holds every Best Feature and Best Director nominee IDA named (as many as IDA lists, no count assumed), each with an ID; any left out meets step 4's rule and is named in **Report**.
- Dates, status and note are as in step 5; the source URL is in `sourceUrls`.
- Running step 2 again leaves the edition file unchanged, or the `docs/update-the-race.md` line of step 3 exists.
- `npm run data:check` passes; `race:check -- --target test` says clean after the load.
- **Report** below is filled.

### 10b.R Check the IDA import (other family)

Check 10b.1 against the source, not against its own report:
- Open IDA's announcement yourself and compare every nominee: film, director, category. Each IMDb ID opens the right film (title, year, director), and each Best Director row is that director's film.
- If 10b.1 used a sources mechanism, rerun the two scripts of 10b.1 step 2: no diff. If it typed the edition file, check the `docs/update-the-race.md` line exists.
- Run the full Playwright suite once (`npm run test:e2e`): new data can break specs that count nominees (the EFA import needed three specs updated, commit `0c6b7b2`). A spec expectation may change only to a count that matches the source; anything else becomes a `10b.F1` row.
- Every move in **Report** is a Documentary film, and every film that moves up is an IDA nominee (or loses ground to one).

Done when:
- Every nominee checked against the source, with differences fixed.
- The e2e suite passes, or the failures not caused by the environment have `10b.F` rows.
- The result is written under **Report**.

## Report

(10b.1 and 10b.R write here.)
