# IMDb and DOC NYC imports (Phase 6)

Findings from the 2026-10-24 session that set up Phase 6. Tasks 6.1–6.4 read this instead of
exploring again.

## 1. Why
Most small critics groups have no Wikipedia page, so 4.2–4.9 left them `no_data` or `partial`
(Atlanta, Black, Indiana, Utah, Philadelphia, IDA… have nothing in any category; Cinema Eye 2012–2020
has only its winner). IMDb's award records cover nearly all of them. The owner accepted IMDb as a
source (personal project; IMDb's API says "limited non-commercial use"), credited on the sources
section next to Wikipedia. **Wikipedia stays wherever it has data;** IMDb fills gaps.

## 2. IMDb's GraphQL API (`scripts/research/lib/imdb.ts`)
- `POST https://caching.graphql.imdb.com/` with a browser `User-Agent` and `x-imdb-client-name: imdb-web-next`
  (`lib/imdb.ts` sets both). GET and the project's research user agent get 403; the web pages
  (`imdb.com/event/...`) answer 202 (bot check). No key, no introspection.
- No query lists an edition's nominees. Two steps instead: `eventTitles(ev)` (advanced title search
  by award event, released from 2010; a title with no IMDb release date is missed, so a nominee list
  can be one short: Kansas City 2015's Documentary and Animated, found in the 6.R spot-check), then `titleNominations(tt)` (all of a title's nominations,
  every event, one cached answer per title; filter by `event` locally).
- `searchTitles(text)` gives hits with their directors; `chooseTitle` takes the one feature within
  two years sharing a director.
- The fetcher's `postJson` caches by URL and body in `.cache/imdb` (gitignored). A survey started
  2026-10-24 fills it with every title of every mapped event (~5,500 titles); whatever it didn't
  reach is fetched on first use.
- **Edition years are ceremony calendar years.** An edition in year Y honours films of Y or Y − 1;
  `editionSeasons` decides by its nominees' film years (the app's year for known films, else
  IMDb's release year), ties by the event's usual lag. One year can hold two editions (Atlanta 2021
  has instance 1 for 2020 films and 2 for 2021 films).
- **No dates** for small groups (`dateRange` holds only the year). Never invent one: an edition
  filled from IMDb without a stated day stays `partial`, note "IMDb gives no announcement date".
  (Partial editions still count in every figure, nominees too when they name any: `src/lib/accuracy.ts`.)
- Coverage is uneven: Atlanta has winners from the 2017 edition and nominees only for 2025. A
  category with winners only, for a group that announces nominees, stays `partial` ("IMDb lists
  only the winners").
- The label to map is `category.text`, else the award's name (`labelOf`). Cinema Eye's Audience
  Choice and DOC NYC's prizes have no category text.

## 3. Merge rules (task 6.1)
For each award in `sources/imdb.json` and each film year:
1. A category with results in the existing edition keeps them (Wikipedia). If it has a winner but
   no nominees and IMDb's winners are the same films, IMDb's nominees are added.
2. A category with no results (and no `absent` entry in `sources/critics.json`) is filled from IMDb.
3. A `no_data` edition becomes `partial` (or stays `no_data` when IMDb has nothing); its source URL is
   the IMDb event page (`https://www.imdb.com/event/<ev>/<year>/<instance>/`).
4. Where both have a category, differences are reported (agreement per group), never written.
5. Rerunning a Wikipedia script (`majors.ts`, `critics.ts`) rewrites its editions, dropping IMDb's
   additions: rerun `imdb.ts` for that award after it.
6. Title types: `FEATURE_TYPES` only (no shorts, series, miniseries, episodes), plus any IMDb ID
   already in `data/movies/`. New films get facts from `researchImdbFilms` (Wikidata by P345, else
   TMDB), and only films the merge writes: a row only compared, or in a category the group didn't
   give, adds no film.
7. Added in the Phase 6 review: a category IMDb lists with no winner (late 2025 editions) isn't
   filled ("IMDb lists no winner in: …"); two or more winners are written as a tie and named ("IMDb
   names more than one winner (a tie) in: …"); a `winnersOnly` group gets its winners only; an honoree
   list (`honorees`, Cinema Eye's Unforgettables) is written as `nominated`, a list with no winner, so
   it never counts as a win; a series or short left out doesn't make an edition `partial`; the
   Wikipedia script's "Not found on the source" reads "Not on Wikipedia" once IMDb fills those
   categories. A status an earlier run lowered stays lowered: rerun the Wikipedia script first to reset it.

Built in 6.1 (`scripts/research/imdb.ts`; run `--survey` first, `--dry-run` to see agreement without
writing). `sources/imdb.json` holds, besides `events`: `labels` (per award, IMDb label → category; a
label not listed is not read, so map every spelling a group used over the years), `honorees`
(categories where every film named wins, such as Cinema Eye's Unforgettables: no tie warning, not
"winners only"), `seasons` (an IMDb edition the season rule gets wrong) and `leaveOut`
("<award> <film year> <tt>", with why). IMDb's part of a note is one sentence at its end,
"From IMDb's award records: <filled categories>; nominees for <categories>.", plus "IMDb gives no
announcement date.", "Not on IMDb: …" and "Left out: …"; a rerun reads it back, so running twice
changes nothing. Agreement measured in 6.1 (2012–2025, categories both list): winners 328 of 334,
nominee lists 242 of 251 over NYFCC, LAFCA, Boston Society, WAFCA, San Diego and Chicago. IMDb's
slips are mostly a film filed one season off (San Diego 2022 lists 2023's *Still* as a winner,
Chicago 2017 lists 2018's *Capernaum*). Cinema Eye 2021–2025: IMDb filled Direction, Production,
Audience and Unforgettables, which the 15th–19th Wikipedia pages also list but `majors.ts` doesn't
read yet (6.2 may teach it, then rerun `imdb.ts`).

## 4. Event map (`scripts/research/sources/imdb.json`)
One or more IMDb events per award slug. Not on IMDb: New Jersey and Puerto Rico (stay `no_data`).
Two events: San Francisco (Bay Area + its older name), Astra (Hollywood Critics Association + Astra
Film Awards), Columbus (Columbus FCA + Central Ohio FCA; check they are one group before keeping
both). Chicago IC is `ev0025345` (Chicago Indie Critics), not `ev0005263`. PGA `ev0000531`, DGA
`ev0000212`, BAFTA `ev0000123` and the other majors are fully loaded and need nothing.

Cinema Eye labels → categories (registry has five, all Documentary): "Outstanding Achievement in
Nonfiction Feature Filmmaking" (and 2025's "Outstanding Nonfiction Feature") → `feature`;
"Outstanding Achievement in Direction" → `direction`; "Outstanding Achievement in Production" →
`production`; award "Cinema Eye Audience Choice Prize" → `audience`; "The Unforgettables" →
`unforgettables`. Leave out the broadcast and television categories.

## 5. DOC NYC (task 6.4)
- docnyc.net is WordPress and answers the research user agent. Films by section:
  `/wp-json/wp/v2/film?festival-section=<id>&per_page=100&page=<n>`; section 642 "Short List:
  Features" (220 films: 10 a year 2012–13, 15 from 2014; 4 tagged 2011, ignore), section 1129
  "Winner's Circle" (64 films, 2019–2026). Years from the `event-year` taxonomy
  (`/wp-json/wp/v2/event-year`: 2012=696, 2013=701, 2014=7, 2015=706, 2016=760, 2017=788, 2018=869,
  2019=1097, 2020=1165, 2021=1253, 2022=1356, 2023=1389, 2024=1441, 2025=1483, 2026=1545).
- Each film page (`link`) has `<div class='content-item'><b>Director:</b> Name<br></div>` and a
  `Year:` item; the fetcher's `getText` reads pages. Match with `searchTitles` + `chooseTitle`
  (titles are in capitals), facts with `researchImdbFilms`.
- Fixes: *Mr. Nobody Against Putin* is tagged 2024 and 2025 (it is 2025's); *The Great Hack* has no
  year (check the 2019 list post).
- Winner's Circle has no prize: both categories are selections (`isSelection`), every film
  `nominated`. Edition year = the festival year = the film year.
- Announcement days (`nominationsOn`, from the posts): 2014-11-10, 2015-10-13, 2016-09-28,
  2017-10-08, 2018-09-27, 2019-10-10, 2020-11-09, 2024-10-17, 2025-10-14, 2026-10-14. 2012, 2013 and
  2021–2023 have no dated post: leave the day out and say so in the note.
- Registry: `doc-nyc` is a festival (calendar order 60) with no lineup; 6.5 keeps the festivals
  index from linking it to a lineup page.
