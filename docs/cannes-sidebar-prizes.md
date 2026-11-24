# More Cannes prizes

Phase 13 brief (planned 2026-11-24). Before each task, read **Request and smallest design** and that task's entry under **Task briefs**.

## Request and smallest design

Owner, 2026-11-24: "put more cannes category in this site: Un Certain Regard, Un Certain Regard Jury, FIPRESCI In Competition, FIPRESCI Un Certain Regard, Critics Week Grand Prize, Directors Fortnight Audience".

Cannes gets six more prizes, shown everywhere its three main prizes show now. The simplest design that does this:

1. **Six new categories under the existing Cannes award** in `data/awards.json`, after the three main ones (sort order 4–9), winners only like the rest of Cannes:

   | Slug | Name shown | Sort |
   |---|---|---|
   | `ucr-prize` | Un Certain Regard Prize | 4 |
   | `ucr-jury-prize` | Un Certain Regard Jury Prize | 5 |
   | `fipresci-competition` | FIPRESCI Prize: Competition | 6 |
   | `fipresci-ucr` | FIPRESCI Prize: Un Certain Regard | 7 |
   | `critics-week-grand-prize` | Critics' Week Grand Prize | 8 |
   | `fortnight-audience-award` | Directors' Fortnight Audience Award | 9 |

2. **They count towards International Feature, not Picture** (`oscarCategory: "international"`). Every mapped category is a precursor, and each film with a precursor result becomes a race contender. Mapped to Picture, about six small films a year would join the Picture race; these sections' winners are mostly non-English films that end up as International submissions. *Default the owner can change:* one field per category, then reload.
3. **Same years as the rest of Cannes: 2012–2026.** A prize not given a year has no row that year (Directors' Fortnight's Audience Award began in 2024, its first official prize; 2020 had no festival). A tie is two `won` rows, listed under `ties` in `scripts/research/sources/festivals.json` like the main prizes'.
4. **Source:** each year's Wikipedia page (`<year> Cannes Film Festival`) already has these prize lines under "Un Certain Regard", "Independent awards › FIPRESCI Prizes", "Critics' Week" and "Directors' Fortnight". The existing `readPrizeLines` reader takes them, classified by heading and label like Sundance's. Films matched by IMDb ID, never by title.
5. **English-language films stay out of the International race.** Mapping to International makes every winner a contender there, and some are in English (UCR 2023, How to Have Sex; FIPRESCI 2019, A Hidden Life), which can't win that Oscar. Safeguard: the International race and its accuracy leave out films whose original language (`lang` in `data/movies`) is English. Their prizes still show on every page. This also covers Toronto's International People's Choice. *The owner can drop it at approval.*
6. **No schema change, no migration.** The loader inserts new categories from `awards.json`; the pages read categories from the database.

Release order: a normal release for the code (caption and label fixes), then the production data load by `docs/update-the-race.md` step 5 once the owner says go.

Left out (follow-ups for the owner to pick, not built): other sidebar prizes (Caméra d'Or, Queer Palm, Ecumenical Jury, Critics' Week's other awards, Fortnight's Europa Cinemas Label), the acting and directing prizes of the competition, Cannes lineups before 2025.

## Before the run

Nothing to set up: no new service, account or secret. Build and test on `staging` against the Neon `test` branch. The production load and the release are owner steps after 13.R.

## Existing code and constraints

- `scripts/research/festivals.ts`: `FESTIVALS` (Cannes has `lists` for its three list articles), `PAGE_LABELS` (the year page's label for each, the second source), Sundance's path (`sundanceWinners`, `sundanceCategory` in `lib/festival-pages.ts`) is the model for prizes read from the year page by heading and label. `festivals-check.ts` compares sources.
- `scripts/research/lib/festival-pages.ts`: `readPrizeLines` returns `{ heading, label, film }`. The 2024 page reads "Un Certain Regard Prize: Black Dog by Guan Hu" and "Un Certain Regard Jury Prize: Souleymane's Story …" under "Un Certain Regard", and "In Competition: The Seed of the Sacred Fig …" / "Un Certain Regard: …" under "FIPRESCI Prizes". Older pages may word them differently ("Prix Un Certain Regard", "Nespresso Grand Prize", "Grand Prix" under Critics' Week): match by heading plus label, and print every Cannes prize line the classifier skips so nothing is lost silently.
- Wikipedia pages are cached in `.cache/wiki/` (2012–2026 Cannes pages are there); run with `--offline` first, `--refresh` only for 2026 or a page that changed.
- `src/lib/lineup.ts`: `prizesOf` and `screeningCaption(s, …, listed)` drop a screening prize that the page already lists as a won category. Its `names()` matches "Palme d'Or" and Sundance's names; "Un Certain Regard Jury Prize" against the screening's "Jury Prize (Un Certain Regard)" and "FIPRESCI Prize: Competition" against "FIPRESCI Prize" in the competition do not match yet.
- `src/lib/race-why.ts` `precursorLabel` ("Cannes Palme d'Or"): must read well for the new names ("Cannes Un Certain Regard Prize", not "Cannes Un Certain Regard Prize Prize").
- `src/lib/awards-index.ts` `givesLabel` reads "Picture" for Cannes today (test in `awards-index.test.ts`); with International categories it changes. Follow what it does for Toronto, which has both.
- Accuracy: winners-only awards show "Not counted: only the winners are known" (`tests/e2e/accuracy.spec.ts:61`); the new categories behave the same, no code change expected.
- Visual rules: `DESIGN_GUIDE.md` (no new components; every page already lists categories). Product rule: `PRODUCT_PLAN.md` §2 Festivals line (updated in planning).

## Checks

Light checks per task (`CLAUDE.md`). The full e2e suite runs once, in 13.R.

## Task briefs

### 13.1 Read the six prizes (script)

Adds the six categories to `awards.json` and teaches `festivals.ts` to read them from the year pages.
- Category rows as in the table above.
- A Cannes-only classifier (heading + label → category slug) beside `sundanceCategory`. Unit-test fixtures, copied from the cached pages: every year 2012–2026 has at least one line, and these are covered by name: "Prix Un Certain Regard", "Nespresso Grand Prize", "Grand Prix" under Critics' Week (not the main Grand Prix), "Jury Prize" under Un Certain Regard (not the main Jury Prize), "Un Certain Regard" as a label under FIPRESCI, the FIPRESCI parallel-sections line (skipped), a tie line, and an unrelated prize (Caméra d'Or, skipped).
- The script prints each skipped Cannes line from the six sections' headings, then a count per category per year.

Done when:
- `npx vitest run scripts/research` passes, with the fixtures above.
- A dry run for 2012–2026 (`--offline` plus a `--dry` flag that prints and writes nothing, added in this task) prints a table of 15 years × 6 categories; every skipped line from those headings is listed under its year.
- On a real 2024 run, `git diff data/editions/cannes/2024.json` shows only added results, among them Black Dog (UCR Prize) and The Seed of the Sacred Fig (FIPRESCI Competition), matched by IMDb ID.

### 13.2 Fill 2012–2026 and load `test`

Puts every year's winners in the data files, checked, and loads them to `test`.
- Run the script for 2012–2026 with `--offline`; `--refresh` only for a page whose offline run shows a gap. Settle what it printed by `docs/update-the-race.md` step 3: an unresolved film is found by a Wikidata search (title, year, director); one still unresolved is left out and listed in the report with its year and prize.
- Read every skipped line 13.1's run printed and say in the report why each is not one of the six.
- Second source for every result: the section's own Wikipedia article where one lists winners by year, otherwise IMDb's Cannes award records (`docs/imdb-import.md`). The report has one table, prize × year, each cell "agrees", "differs: <what>" or "no second source".
- Ties and years with no prize are written as in **Request and smallest design** 3.

Done when:
- `npm run data:check` passes.
- The report's table covers all six prizes for 2012–2019 and 2021–2026 (Fortnight from 2024), every cell filled; every "differs" says which source the data follows and why.
- Every empty prize-year (no row) is named in the report with its reason.
- `npm run load -- --target test --dry-run` adds the six categories, their results, and only the new films and contenders those bring; it changes no existing result or screening. After the real load, a second dry run plans nothing.

### 13.3 English-language films out of the International race

Keeps the International race to films that can win it, now that more International precursors come in.
- The International race and its accuracy leave out films whose original language is English (**Request and smallest design** 5), in `src/lib/predict/` (or where contenders are gathered), with unit tests. Other categories are unchanged.

Done when:
- Unit tests: How to Have Sex (English, UCR 2023) is not a 2023 International contender; a non-English UCR winner is; a film with no `lang` stays in; Picture contenders are unchanged.
- `npm run load -- --target test` recompute (or the project's recompute command) runs, and the report lists the International contenders it removed for 2012–2026.

### 13.4 The prizes read right on every page `[look]`

Makes the new prizes show once and read well on the pages that already list Cannes prizes.
- `names()` in `src/lib/lineup.ts`: a won new category hides the same prize in the screening caption; other prizes still show.
- `precursorLabel` and `givesLabel`: fix any output that reads wrong. Expected: Cannes reads "Picture, International" (or the form Toronto's mixed categories use) on the awards index.
- Search `src` and `tests` for code or copy that assumes three Cannes prizes or that Cannes only gives Picture (about text, metadata, `oscarCategory` filters); fix or list each in the commit.
- `tests/e2e/awards-year.spec.ts`: `/awards/cannes/2024` lists the nine prizes in sort order.

Done when:
- Unit tests for the caption, each one a fixed input and its exact caption: every new category against its screening wording (UCR Jury Prize "Jury Prize (Un Certain Regard)", FIPRESCI "FIPRESCI Prize" in competition and in UCR, Critics' Week, Fortnight), each hidden once; a film with a new win plus Best Director keeps "Best Director"; a Caméra d'Or screening with no won category keeps it; a page with only the three main categories gives the same captions as today.
- Unit tests: `precursorLabel` for all six slugs gives "Cannes <name>" with no word doubled.
- Screenshots at 360, 390, 844 and 1280px (this project's standard widths) show:
  - `/awards/cannes/2024`: nine prizes in sort order, "Directors' Fortnight Audience Award" wrapped cleanly, no overlap;
  - `/awards/cannes/2023`: no Fortnight prize and no empty row for it; `/awards/cannes/2020`: reads as today;
  - a year with a tie among the new prizes: both films shown;
  - the movie page of a film with two Cannes prizes, one main and one new if any exists (else two new): both under Cannes, each once;
  - the awards index's Festivals list: Cannes's label reads right;
  - `/festivals/cannes/2025`: each film line with a prize, listed in the report with its caption text and no prize named twice;
  - the International race page for 2025: any Cannes sidebar winner's "why" line naming the prize in full.
- The e2e spec passes.

### 13.R Phase 13 check

Checks the data and the pages before the owner releases.
- Check 20 results across years and prizes against the festival's own site (festival-cannes.com, semainedelacritique.com, quinzaine-cineastes.fr, fipresci.org), not the Wikipedia year page; rerun the script `--offline` and confirm no diff.
- International predictions on `test`, before and after the load, for 2025 and for the backtest seasons: the top five's moves for 2025, and any change to the accuracy figures the International race shows.
- The release is safe before the production load: run the caption unit tests' "three main categories" case and open `/awards/cannes/2024` and a 2025 lineup on `test` data loaded without the new rows if the loader allows it, or say why the unit test covers it.
- Full `npm run test:e2e` once, `npm run build`.

Done when:
- The report (`docs/phase-checks/cannes-sidebar-prizes.md`) has the 20 checks with their source URLs, the predictions and accuracy moves, the release-safety note and the e2e result.
- Any fix beyond a few lines is a fix row `13.F1…` under 13.R.

## Report

(Filled in by 13.2 and 13.R in `docs/phase-checks/cannes-sidebar-prizes.md`.)

Red-team (Fable 5.2 Medium, 2026-11-24): taken: wider caption, label and classifier tests; the second-source table in 13.2's Done when; 13.R checks against the festivals' own sites; English-language films out of the International race; screenshots of a missing-prize year, a tie, two prizes on one film and the awards index; the hard-coded-assumption search; a looser dry-run check; release safety before the load; no `--refresh` unless needed; the e2e line asserts all nine. Declined: dropping the 390px screenshot (390 and 844 are this project's standard widths since Phase 11).
