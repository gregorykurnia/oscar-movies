# Oscar Movies: Implementation Plan

**Status:** Phase 9 planned 2026-11-10: add any film from Watch list (`PRODUCT_PLAN.md` v1.7; brief `docs/watch-list-any-film.md`). Phases 0–8 build tasks and reviews are complete; historical rows are in `IMPLEMENTATION_PLAN-done.md`, with owner sign-offs still tracked in `docs/build-plan.md`. The current `DESIGN_GUIDE.md` and `design-preview.html` are binding.

**AI Build Log project:** Oscar Movies

> **How to build from this plan (for every implementer, human or model):** one task at a time, in order.
> 1. Check your model and effort against the task's pick. If they differ, say so and suggest switching before you start.
> 2. Do that one task, and only that task. Read the sections it names, not the whole plan.
> 3. Run the checks in `CLAUDE.md`.
> 4. Tick the task here, with a one-line note if anything turned out different from the plan, in the same commit as the work.
> 5. Commit and push, as `CLAUDE.md` says.
> 6. Stop and report what was done, the commit, and the next task with its model and effort. Wait for the owner.
>
> Do several tasks in one go only when the owner says so (for example "do tasks 3 to 5" or "carry on while the model stays the same"), still ticking, committing and pushing after each. Stop anyway when the next task's model is different, at the end of a phase, or at anything that needs the owner.
>
> When the owner leaves it to `autorun`, each session does one task and ends, and the runner starts the next on that task's model (`docs/build-plan.md` §7.4). This plan is written so `autorun all` can run it from the first task to the last: every task line carries its pick, each phase ends with its end-to-end task and review row, and lines with no pick (marked *Owner*) are left for the owner. Every open question has a default in §11, so no task stops to ask.

## 1. Stack

The default stack (`docs/build-plan.md`): Next.js App Router + TypeScript, Neon Postgres, Drizzle ORM + drizzle-kit, Server Actions + Zod, Tailwind CSS v4 + shadcn/ui (restyled), `next/font` (Geist), `lucide-react`, Vitest + Playwright, GitHub, Vercel Hobby. Versions: whatever `create-next-app@latest` and `npm install` give at scaffold time (2026-10-22: Next 16.4, React 19.3, Drizzle 0.45, Tailwind 4.3, Zod 4, Vitest 5, Playwright 1.64), saved exact (`.npmrc`: `save-exact=true`). Check Next.js APIs against the installed docs (`node_modules/next/dist/docs/`), never memory: caching and `revalidateTag` changed in 16. Node: the LTS Vercel offers by default (`engines.node`); the server's Node 26 is fine locally.

| Concern | Choice | Why |
|---|---|---|
| DB driver | `@neondatabase/serverless`: `drizzle-orm/neon-http` in the app, `neon-serverless` (WebSocket `Pool`) in scripts | HTTP is fastest for single queries on Vercel; scripts need real transactions |
| Flags | `country-flag-icons` (3:2 SVG React components, MIT) | Named in the design guide §7; no emoji |
| Research parsing | `cheerio` | Reads Wikipedia's parsed HTML tables in the import scripts (scripts only, never shipped to the browser) |
| Toasts | `sonner` (via shadcn), restyled | Guide §7, §14 |
| Script runner | `tsx` | Runs the TypeScript scripts in `scripts/` |
| Scores | OMDb API (IMDb, Tomatometer, Metascore in one call; free key, 1,000 calls a day) + TMDB API (user score; free key) | Product plan §7 feasibility: the only legal free sources |
| Movie facts and IDs | Wikipedia + Wikidata APIs (no key), TMDB as fallback | Wikidata gives IMDb ID (P345), TMDB ID (P4947), countries (P495 → ISO code P297), original title (P1476), language (P364), all CC0, so the facts can live in the repo |
| Scheduled job | Vercel Cron (Hobby: once a day) | The daily score batch (§5.4) |
| Search | Postgres `unaccent` + `pg_trgm` | Accent-free title matching under 100 ms (feasibility) |

## 2. Environments and secrets

| Environment | Neon branch | Env vars live in |
|---|---|---|
| Local development and previews | `production` (default, §11) | `.env.local` |
| Automated tests (Vitest database tests, Playwright) | `test` | `.env.test` |
| Vercel Preview | `test` (no deployments: `staging` is off; kept for completeness) | Vercel, Preview environment |
| Vercel Production | `production` | Vercel, Production environment |

- **Variables** (names in `.env.example`, values never in git or docs): `DATABASE_URL` (direct, for migrations and scripts), `DATABASE_URL_POOLED` (the app), `OMDB_API_KEY`, `TMDB_READ_TOKEN`, `CRON_SECRET` (Vercel sends it to the cron route), `REVALIDATE_SECRET`, `APP_URL` (where the loader sends the revalidate call: the live URL, or `http://localhost:3100` in `.env.test`), `EXPECT_DB_BRANCH` (`test` in `.env.test` only).
- **Which database am I on:** each branch has an `app_meta` row `db_branch` = `test` or `production`, written once when the branch is set up. Playwright's global setup and `instrumentation.ts` (when `EXPECT_DB_BRANCH` is set) read it and stop at once if it isn't `test`. Every script that writes takes `--target test|production` explicitly, reads the matching env file, checks `app_meta` against the target, and refuses `production` unless `--yes-production` is passed.
- **Migrations:** `npm run db:migrate:test` first; `npm run db:migrate` (production) only with the owner's approval, before the code that needs it is released. Migrations stay backward compatible for one release (add first, drop a release later).
- **Region:** Neon `aws-ap-southeast-1`; Vercel functions in `sin1` (`vercel.json`), next to it.

## 3. Data

### 3.1 Schema (`src/db/schema.ts`, migrations in `drizzle/`)

Enums: `award_kind` (oscars, major, festival, critics) · `oscar_category` (picture, documentary, international, animated) · `outcome` (submitted, eligible, shortlisted, runner_up, nominated, won) · `edition_status` (loaded, partial, no_data) · `snapshot` (live, eve_nominations, eve_ceremony).

| Table | Columns (constraints) | Notes |
|---|---|---|
| `movies` | `id` serial PK · `slug` text unique not null · `title`, `original_title`, `original_lang` (BCP 47, for `lang=`) · `year` smallint not null · `countries` text[] not null (ISO 3166-1 alpha-2, main first) · `language` · `imdb_id` text unique (`^tt\d+$`) · `wikidata_id` text unique · `tmdb_id` int unique · check: `imdb_id` or `wikidata_id` not null · `imdb_rating` numeric(3,1) 0–10 · `rt_score`, `mc_score` smallint 0–100 · `tmdb_score` numeric(3,1) 0–10 · `imdb_at`, `rt_at`, `mc_at`, `tmdb_at`, `scores_checked_at` timestamptz · generated stored `avg_score` numeric(4,1) and `score_count` smallint (§3.2 rule 1) · generated stored `search_key` (`f_unaccent(lower(title ∥ ' ' ∥ original_title))`) | Index: `year`, `avg_score`, GIN trigram on `search_key`. `f_unaccent` is an immutable SQL wrapper around `unaccent` (needed for generated columns and indexes) |
| `marks` | `movie_id` PK → movies **on delete restrict** · `watched`, `want` boolean not null default false · `updated_at` · check `not (watched and want)` · from 7.4: `want_rank` integer (the owner's Want to watch order, 1 = top; null when not wanted) · `release_on` date (null = TBD) · `platform` text (≤ 40 characters) | Owner data; from Phase 9 app-added films also require backup. Never written by award imports |
| `awards` | `id` · `slug` unique · `name`, `short_name` · `kind` · `calendar_order` smallint · `winners_only` bool (announces winners only) · `is_selection` bool (AFI: a list, no winner) · `url` | From `data/awards.json` |
| `award_categories` | `id` · `award_id` → awards restrict · `slug` · `name` (the award's own name) · `oscar_category` · `loose` bool + `mapping_note` (director or cast prizes) · `sort_order` · unique (`award_id`, `slug`) | The mapping shown on award pages |
| `editions` | `id` · `award_id` → awards restrict · `year` smallint (the film year it honours, 2012–) · `ordinal` (98th) · `status` · `shortlist_on`, `nominations_on`, `winners_on` date · `source_urls` text[] · `note` · unique (`award_id`, `year`) | One award in one film year. Dates drive the season stage and the eve snapshots |
| `results` | `id` · `edition_id` → editions **cascade** · `category_id` → award_categories restrict · `movie_id` → movies restrict · `outcome` · `country` (submitting country, International only) · unique (`edition_id`, `category_id`, `movie_id`) | Index `movie_id`, `category_id`. One row per film per category: its furthest stage |
| `screenings` | `id` · `edition_id` → editions cascade · `movie_id` → movies restrict · `section`, `section_order` · `prize` · unique (`edition_id`, `movie_id`, `section`) | Festival lineups, 2025 on |
| `accuracy` | `category_id` PK → award_categories cascade · hits and counts for the four figures (§5.2) · `computed_at` | Computed, never typed |
| `predictions` | PK (`year`, `oscar_category`, `snapshot`, `movie_id`) · `p_nominate`, `p_win` real · `rank` · `why` jsonb · `computed_at` | Computed (§5.3) |
| `data_loads` | `id` · `kind` (awards, race-update, correction, scores) · `summary` jsonb · `git_commit` · `loaded_at` | "Updated 20 Dec 2025", the coverage page, the cron's outcome |
| `app_meta` | `key` PK · `value` | `db_branch` (§2) |

**Phase 9 schema extension:** nullable unique `local_id` UUID; `movies_has_id` accepts a TMDB or local ID too. Detailed creation, stable-slug and backup rules are in `docs/watch-list-any-film.md`. Historical schema above describes the existing baseline.

**Rules.** Outcome order: submitted < eligible = shortlisted < runner_up = nominated < won (runner_up counts as a nomination; product plan §10). A result's category must belong to its edition's award (the loader checks). Nothing in the app deletes; the loader only replaces the contents of editions present in the data files. Movies are never deleted by a load; merging duplicates is an explicit correction that moves the marks first.

### 3.2 Derived values
1. **Average:** IMDb × 10, TMDB × 10, Tomatometer and Metacritic as they are; mean of the ones present, one decimal, shown rounded; `score_count` 0–4. No scores: null.
2. **Oscar stage of a film in a year:** its furthest Oscar outcome in that category.
3. **Current season:** the latest year with an Oscars edition (2026 now).
4. **Season stage per Oscar category** (stage line, race states): from the Oscars edition's `shortlist_on`, `nominations_on`, `winners_on` and which outcomes exist.

### 3.3 Data files (the source for every load; reviewed in git)
```
data/awards.json                       awards and their categories, with the Oscar mapping
data/editions/<award>/<year>.json      status, dates, sources, results [{category, imdb|wd, title, outcome, country?}], screenings
data/movies/<year>.json                facts per film, keyed by IMDb ID (or Wikidata QID): slug, titles, lang, countries, language, wd, tmdb
data/marks.json                        the marks export (by IMDb ID or QID, so it survives any reload)
```
Every file has a Zod schema in `src/lib/data-files.ts`; `npm run data:check` validates all of them plus sanity rules: per Oscar year, Picture has 8–10 nominees (10 from 2021) and the others 5, exactly one winner per category from the finished years, the winner is among the nominees, every film resolves to one movie, every loaded edition has its dates, slugs are unique and never change. Raw downloads go to `.cache/` (gitignored).

### 3.4 Research pipeline (how award data gets in)
- `scripts/research/lib/`: Wikipedia fetch (MediaWiki `action=parse`, cached in `.cache/wiki/`, polite user agent, one request at a time), table reader (cheerio), link resolver (article title → Wikidata QID via `pageprops`, batched → P345 IMDb ID, P4947 TMDB ID), facts fetcher (Wikidata, TMDB fallback), and a writer that merges into `data/` without reordering untouched entries (small diffs).
- One script per award (`scripts/research/<award>.ts [--years 2012-2026]`) writes `data/editions/<award>/<year>.json`. **Films are matched by IMDb ID, never by title.** An unresolved film is written with its Wikipedia title and `unresolved: true`; `data:check` lists them, and the task resolves them (by a Wikidata search by title plus year plus director) or records them.
- Editions with no findable source are written with `status: no_data`; partial ones `partial` with a `note`. Never invent a result.
- Sources that aren't Wikipedia (small critics groups) are read from the group's own pages; the URL goes in `source_urls`.
- IMDb's award records fill what Wikipedia lacks (Phase 6, owner's decision of 2026-10-24); its API, the season rule and the merge rules are in `docs/imdb-import.md`.

### 3.5 Loader (`npm run load -- --target test|production [--dry-run] [--only <award>]`)
1. Check `app_meta` against the target (§2). On `production`: export the marks to `data/marks.json` first and stop if that fails.
2. Validate all files (`data:check`). 3. Plan: diff files against the database, per row: insert, update (with the changed fields), delete (results and screenings of a reloaded edition only). Print the plan as a summary (counts per award and year) plus every change to an existing row; `--dry-run` stops here.
4. Apply the plan in **one transaction**; then recompute accuracy and predictions (§5.2–5.3) for affected seasons; write a `data_loads` row; POST `APP_URL/api/revalidate`.
5. A second run plans nothing (tested).
- `npm run marks:export -- --target …` writes `data/marks.json`; `npm run marks:restore -- --target … [--dry-run]` writes marks back by IMDb ID or QID (only rows that differ, dry run first).

### 3.6 Seed data for `test`
`npm run db:seed:test`: loads every data file into `test` with the same loader, then resets the marks to `tests/fixtures/marks.json` (a few known films). Phase 0 has a tiny `data/` set (five 2024 films, the 97th Oscars Picture nominees) so the smoke test has something to read; Phase 1 replaces it with real data. E2E tests that change marks reset their own film's marks before and after. Stress data (no-space titles, missing scores, huge counts) lives in the styleguide's stress switch and in unit tests, not in the database.

## 4. Pages and routes

Every page renders inside `AppShell` and starts with `PageHeader`. Templates are `DESIGN_GUIDE.md` §8.

| Route | Purpose | Template | Phase |
|---|---|---|---|
| `/` | The race, current season (`?category=`) | §8.1 | 0 (empty), 1 (results), 3 (chances) |
| `/race/[year]` | The race for any year | §8.1 | 1 |
| `/awards` → `/awards/[current]` | Awards index for a year | §8.7 | 2 |
| `/awards/[award]/[year]` | One award or festival's results (Oscars from Phase 1) | §8.2 | 1, 2 |
| `/awards/[award]/all?category=` | One award or festival's results, every year (`/awards/oscars/all` for the Oscars) | §8.2 (all-years variant, added in 7.11) | 7 |
| `/grid/[year]?category=&sort=&filter=&critics=` | Year grid (`/grid` redirects) | §8.4 | 2 |
| `/years/[year]` | Year summary | §8.8 | 2 |
| `/accuracy/[category]` (`#method`) | Accuracy table, backtest, method (`/accuracy` → picture) | §8.5 | 2, 3 |
| `/submissions/[year]` | International submissions (`/submissions` redirects) | §8.3 | 1 |
| `/festivals/[year]` | Festivals index (`/festivals` redirects) | §8.7 | 2 (prizes), 5 (lineups) |
| `/festivals/[festival]/[year]` | Festival lineup by section | §8.3 | 5 |
| `/watch-list` | Want to watch, then unwatched current-season films; add box, drag order, release notes from Phase 7 | §8.3 | 1, 7 |
| `/signals/[year]?category=&view=` | Strong signals: the films the best-predicting awards picked (`/signals` redirects) | §8 (added in 7.1) | 7 |
| `/patterns/[year]?category=` | Nomination patterns, Documentary and International (`/patterns` redirects) | §8 (added in 8.4) | 8 |
| `/movies/[slug]` | Movie page | §8.6 | 1, 2, 5 |
| `/data` | Data coverage and sources | §8.9 | 3 |
| `/styleguide` | Every component in every state, for comparison with the preview (404 when `VERCEL_ENV=production`; `?error=1` throws to show the error page) | §14 | 0 |
| `not-found`, `error` | 404 and error pages | §8.11 | 0 |
| `GET /api/search?q=` | Search results (films, awards) | §7 Search | 1 |
| `GET /api/cron/scores` | Daily score batch (Bearer `CRON_SECRET`) | | 1 |
| `POST /api/revalidate` | Called by the loader and the cron (`REVALIDATE_SECRET`) | | 0 |

Marks are written by one Server Action (`src/app/actions/marks.ts`); from Phase 7 the Watch list's order and release notes by the actions in `src/app/actions/watch-list.ts` (7.4). Phase 9 adds validated catalogue/manual film creation and its wanted mark (`docs/watch-list-any-film.md`, Storage, identity and saving).

## 5. Key components and tricky parts

### 5.1 Caching with live marks
Award data changes only on a load, scores once a day, marks any time. Data functions in `src/data/` use `'use cache'` with `cacheTag('awards')` or `cacheTag('scores')` and a long `cacheLife`; `/api/revalidate` expires the tag it's sent. Marks are never cached: the root layout reads all non-empty marks (a few hundred rows) per request inside a Suspense boundary and hands them to a client `MarksProvider`; every `Marks` button reads and writes that provider, so one tap updates every row on the page. Counts that include marks ("23 of 61 watched") are computed from the provider on the client.

### 5.2 Accuracy figures (`src/lib/accuracy.ts`, pure, unit tested)
For each award category mapped to Oscar category C, over **finished** seasons (Oscars `winners_on` passed and results loaded), counting only editions with status `loaded` or `partial` that have results in that category:
- **Winner → Oscar win:** years whose winner won Oscar C / years with a winner (ties: a hit if any winner won).
- **Winner → Oscar nomination:** years whose winner was nominated (or won) / years with a winner.
- **Nominees → Oscar nominees:** of all its nominees (winners, runners-up and AFI's list included), the share nominated for Oscar C. `–` for `winners_only` awards, with the reason in a footnote.
- **Oscar nominees it caught:** of Oscar C's nominees in the years that count for the figure above, the share the award category nominated (or more) in any edition (a festival film can reach the Oscars a year later). `–` when the figure above is.
**Shortlist rule (from 8.1), Documentary and International only:** a result whose film didn't reach the Oscar shortlist (`shortlisted` or better) in C in that film year (festivals: that year or the next, as for the figure above) is left out of the first three figures; a year whose winners are all left out doesn't count for the winner figures. "Caught" is unchanged.
`no_data` years are left out and the year count shows it. A hand-checked fixture (one award, all years worked out by hand in `tests/fixtures/accuracy-*.json`) must match exactly.

### 5.3 Predictions (`src/lib/predict/`, pure, unit tested; product plan §3.4 and feasibility notes)
- **Features:** for a film in season Y and Oscar category C, its results at every award category mapped to C: `won` or `nominated` (a win replaces the nomination for the same award category); for the nomination model also its Oscar `shortlisted`/`eligible`/`submitted` status.
- **History:** every finished season except Y (leave one season out), so past years' predictions don't see their own answer. The method text says so.
- **Weights:** for each (award category, result) pair, the smoothed hit rate `h = (hits + α·p0) / (n + α)`, where `p0` is the base rate among all contenders and α is a pseudo-count (start at 3; chosen by leave-one-season-out log loss); weight `w = ln(h / p0)`, clipped to [−1, 3].
- **% to win:** score = sum of the film's weights; softmax over the category's contenders with temperature T (fitted leave-one-season-out). Adds to 100. Before the Oscar nominations, no film is shown above 90% (the rest spread in proportion); after them, none above 97% (3.R).
- **% to be nominated** (live until the nominations; from them on, the race shows each nominee's `eve_nominations` %, `nominateSnapshot` in `src/lib/race-chances.ts`): logistic `σ(a·score + b)` with a and b fitted leave-one-season-out, then b shifted so the total equals the slots (Picture: that year's number of nominees, 10 from 2021; others 5), each capped at 99%.
- **Contenders before the nominations:** every film with a nomination or win at a followed award or festival in that category that season, plus the Oscar shortlist or eligible list once it exists; after the nominations, the nominees only.
- **Snapshots:** `live` uses every loaded result; `eve_nominations` and `eve_ceremony` use only results announced before the day before the Oscar nominations or ceremony (by `nominations_on`/`winners_on` of each precursor edition; an edition with no date counts from the eve of that season's nominations, 3.R). Past years show `eve_ceremony` as "final prediction"; the backtest uses both eves.
- **Early:** a category with fewer than 3 precursor editions announced that season shows "Early: few results yet."
- **The "why"** (`why` jsonb): the top four results by weight with their record ("won the Oscar 5 of 13 years"); past films with a similar run (same top two results) and how many won; their years.
- Computed by `scripts/compute.ts` (also run by the loader) into `predictions`; pages never compute.

### 5.4 Scores (`src/lib/scores/`, shared by the cron route and `npm run scores:refresh`)
- **Batch:** films whose scores were never checked first, then current- and previous-season films checked more than 7 days ago, then older films checked more than 30 days ago; at most 300 OMDb calls a run (900 while never-checked films remain), stopping at 250 seconds. Calls one at a time, paused on HTTP 429 or OMDb's "limit reached".
- **Merge rule:** a failed call or "N/A" never overwrites a stored score with null; each score's `*_at` changes only when the value was confirmed. `scores_checked_at` always moves, so a failing film doesn't block the queue.
- The run writes a `data_loads` row (`kind: scores`, counts, errors) and revalidates `scores`. The test branch shares the OMDb key's daily quota: refresh `test` only for the years a test needs (`--target test --year 2025 --limit 300`).
- Phase 1 checks OMDb's hit rate on 50 films (mixed years and countries) and records it in §11.

### 5.5 Search (`/api/search`, `SearchCommand`)
`f_unaccent(lower(q))` against `movies.search_key` with `%` (trigram) or prefix `ILIKE`, ranked by similarity then Oscar stage, top 8 films; awards matched by name and short name (about 80 rows), top 5. Debounced 120ms on the client; stale responses dropped. Popover on desktop, full-screen sheet on phone (guide §7).

### 5.6 Marks (`Marks`, `MarksProvider`, `actions/marks.ts`)
One tap: the provider flips at once (watched clears want); the Server Action (Zod: movie id exists, field, value) upserts `marks`. A spinner ring shows only after 400ms. On failure the mark flips back, shows its error ring for 2s and a toast ("Couldn't save. Hamnet is back to not watched. Check the connection and try again." with Try again). Two quick taps on the same mark: the last one wins (requests carry a sequence number; older replies are ignored). Offline (`navigator.onLine` false): marks disabled and the offline notice shows.

### 5.7 Year grid (`YearGrid`)
A real `<table>` in a frame that scrolls sideways; the film column is `position: sticky`. Columns: film, Wins, Noms, Oscars, majors and festivals in calendar order, then critics groups folded into one count chip column (unfolded with `critics=open`, one column each). In Documentary an award with several categories is one column per category (`splitAwards`, cells keyed `award/category` by `columnKey`). Rendered on the server; one category per page. Picture can reach about 100 rows × 80 columns: keep each cell to one element with a `title` and accessible name; no client JS beyond the marks and the toolbar.

## 6. Phase task checklists

Every phase ends with its end-to-end/screenshot check task and its review row. "The reference file" is `design-preview.html` (task text avoids the word, since `autorun` treats any task containing "review" as a phase review). Light checks per task, full checks at the review (`CLAUDE.md`, `docs/build-plan.md` Step 10).

**Before the Phase 9 run:** see the feature brief’s **Before the run** section. No new account or credential is needed to build. Start with 9.1; owner migration/release steps wait until the build is finished.

Phases 0–8: build tasks and reviews done; see [completed tasks](IMPLEMENTATION_PLAN-done.md). Historical owner checks remain in `docs/build-plan.md`.

### Phase 9: Add any film from Watch list

Owner request: “add it directly into this website app even if it doesn’t exist from before from any movie”. Smallest design: keep local Add a film, offer TMDB search and manual title/year entry, and save the film plus its wanted mark together. No award editing or sign-in change. Read [the feature brief](docs/watch-list-any-film.md), **Request and smallest design** and the matching **Task briefs** entry before each task. All defaults, safeguards with reasons and owner-only release steps are settled there; no build task waits for production access.

| ID | Task | Pick | Done |
|---|---|---|---|
| 9.1 | [look] Define missing-film screens in the guide and reference; brief 9.1 (sets the new confirmation/form layout) | Opus 5.5 High || 2026-11-10 · guide v1.4 |
| 9.2 | [no look] Schema and test migration for local/TMDB-only films; brief 9.2 (durable identity without invented IDs) | Sol Max | 2026-11-10 · test migrated |
| 9.3a | [no look] Backup/export/restore of app-created films; brief 9.3a (recover films and personal notes together) | Sol Max | 2026-11-10 · films and notes recover together |
| 9.3b | [no look] Later research-loader matching; brief 9.3b (reuse app-added films without changing identity) | Sol Max | 2026-11-10 · research reuses app films and notes |
| 9.4 | [no look] TMDB search client, route and deterministic fixtures; brief 9.4 (bounded provider requests and failures) | Sol xHigh | 2026-11-10 · bounded search and guarded fixtures |
| 9.5 | [no look] Atomic film creation and wanted mark; brief 9.5 (identity conflicts, rollback and retries) | Sol Max | 2026-11-10 · atomic saves, safe retries and shared rank lock |
| 9.6 | [look] Connect catalogue/manual Add a film paths; brief 9.6 (forms follow the established reference) | Sol xHigh | 2026-11-10 · both paths checked at 390/844/1280 |
| 9.7 | [look] End-to-end phase checks, screenshots and failure report; brief 9.7 (one full run, fixes in the next row) | Sol xHigh | |
| 9.R | [look] Phase 9 review and targeted fixes; brief 9.R (other family from the implementation, data and UX checks) | Opus 5.5 High | |

*Owner, after build:* check the test-backed flow on a real phone, approve the tested production migration and then request a normal release. No production migration, load, or release belongs to an unattended task.

## 7. Who builds it, and how

### 7.1 Project profile
- **Phase 9 risk:** app-created films now exist only in the database until backed up; creation, identity reconciliation and restore carry the same risk as the owner’s marks.
- **What can do real damage:** the watched and want-to-watch marks, and from Phase 7 the owner's order and release notes stored with them (exist nowhere else, open to anyone with the link, Neon Free restores only 6 hours); anything that writes production (loads, migrations, the daily cron); tests reaching production (it happened on another project on this machine, 2026-10-22); wrong film matching or category mapping, which silently skews every accuracy figure and prediction, the app's whole point (reloadable, but only if someone notices).
- **What is visually demanding:** the race with its signature elements (% numerals, chance line, word tabs, the "why") through six season states; the year grid (up to 8,000 cells, sticky column, folding); the component library and AppShell, which set every page's look. Everything else has a frame in the preview.
- **What is new or unusual:** the prediction engine; the Wikipedia → Wikidata → IMDb research pipeline; two rate-limited score APIs sharing one quota; accent-free trigram search; Next 16 caching with live marks.
- **What is routine and repetitive:** film-list pages after the first, indexes, per-award imports after the Oscars, eight critics batches, screenshot runs, tokens and icons.

### 7.2 Tier list for this app

Phase 9 uses the current `~/.claude/playbooks/plans-and-models.md` **Claude or Codex: one pick per task** choices: Sol Max for saved-data work, Sol xHigh for routine implementation/checks, Opus 5.5 High for the visual reference and the review after Codex builds. The table below records the original phases’ picks; it does not override Phase 9 rows.

| Kind of work here | Pick | Reason |
|---|---|---|
| Schema, loader, marks, restore, test isolation | Opus 5.5 High | Can lose the marks or write the wrong database |
| Component library, AppShell, the race, the year grid, phase reviews (Phases 0–3, 5) | Opus 5.5 High | Sets the look, or dense visuals with no exact reference |
| Prediction engine | Opus 5.5 High | New and only partly specified; it's the app's central idea |
| First import of a kind, registries (mapping), accuracy maths, compute wiring, scores, data layer, update routine | Opus 5.5 Medium | Precise, checkable by tests or hand-worked fixtures. The first import is a tier above later ones |
| Later imports, pages from preview templates, search, e2e specs, launch checks, connecting services | Sonnet 5.5 High | Many rules, little damage, references exist. Haiku stops here: these have interaction or failure states |
| Scaffold, tokens, identity files, screenshot runs | Haiku 5.5 Max | Exact copies and scripts with no state |
| Repeats of the film-list pattern (awards and festivals index, year summary, lineup page) | Sonnet 5.5 High, or Haiku 5.5 Max if §7.5 says so | Decided by the calibration trial |

Never Opus 5.5 Low or Sonnet 5.5 Medium (`docs/build-plan.md`).

### 7.3 Per-task picks
On every task line in §6, with a reason in this app's terms.

### 7.4 One task at a time
The rule at the top of this plan, by hand or with `autorun` (`docs/build-plan.md` §7.4).

### 7.5 Calibration trial
Tasks 1.10–1.11: Haiku 5.5 Max builds the International submissions page; Sonnet 5.5 High compares it with the preview and guide §15 and fixes or rebuilds it. If it needed only small fixes, change the picks of 2.7, 2.10 and 5.3 to Haiku 5.5 Max; otherwise leave them. Decided on quality alone.
- **Result (1.11, 2026-10-22): small fixes only, and none were needed in the code.** Haiku 5.5 Max's page matches the preview's film-list frame (toolbar, ink rule, head row, row columns, gold wash on the winner, phone stack with labelled results) and passes guide §15 at 390 and 1280: no sideways page scroll, no raw hex, light only, Tab reaches the sort links and chips, the empty state (filters match nothing) and the not-loaded and no-submissions states are designed, sort and chips are in the address. Rules in `src/lib/submissions.ts` are pure and tested. Only gaps: on phone the sort control scrolls 8px inside its frame (the preview's control does the same), and film flags are left out on purpose (the country leads the row, guide §8.3). **Picks of 2.7, 2.10 and 5.3 changed to Haiku 5.5 Max.** Follow-up for the scores task, not this page: Waterdrop (2024, Albania) shows TMDB 0.0 and an average of 0, where 1.5 says a film with no TMDB votes has no TMDB score. Fixed in 1.R (triage 1-2). Screenshots: `submissions` is now in the screen spec (`npm run screens -- --grep submissions`).

### 7.6 Escalation log
A task moves up one row the first time a cheaper model gets it wrong twice; later tasks of that kind start at the higher row.

| Date | Task | From → to | Why |
|---|---|---|---|

## 8. Testing and verification

| Level | Tool | What it covers |
|---|---|---|
| Unit | Vitest (`npm test`, no database) | Pure logic: averages, stage order, accuracy, predictions, score merge, data-file schemas, search normalisation; components' states (Testing Library) |
| Database | Vitest (`npm run test:db`, `test` branch) | Schema constraints, queries, loader (dry run, one transaction, second run empty), marks export and restore |
| End-to-end | Playwright (`npm run test:e2e`), production build on port 3100, `test` branch | Each phase's Done when; marks writes; search; smoke (`smoke.spec.ts`) |
| Visual | Playwright screenshot spec (`npm run screens -- --grep <page>`), 390 and 1280, light only | Every page and state against the preview, judged in the phase review |
| Data | `npm run data:check`, `npm run race:check` | Every data file and load (§3.3, 3.6) |
| Manual | The owner | Real-data checks at each phase's end; a real phone before release |

Playwright: 1 worker (2 CPUs, 11 GB on the server), servers stopped after each run. Tests that change marks reset their own film. The build per run is skipped when the source hasn't changed since the last test build.

## 9. Project structure
```
src/
  app/                    routes (§4), actions/marks.ts, api/{search,cron/scores,revalidate}
  components/             shared components (guide §14), one folder each with its test
  data/                   cached queries (§5.1)
  db/                     schema.ts, index.ts (clients), meta.ts (branch guard)
  lib/                    accuracy.ts, predict/, scores/, data-files.ts, format.ts, stage.ts
  styles/tokens.css
scripts/                  load.ts, compute.ts, check-data.ts, race-check.ts, marks.ts, scores.ts, research/
data/                     awards.json, editions/, movies/, marks.json
drizzle/                  SQL migrations
tests/                    e2e/, screens/, fixtures/, db/
docs/                     build-plan.md, runbook.md, update-the-race.md, review-triage.md, phase-checks/
```

## 10. Running the live app
- **Backups:** Phase 9 extends marks export/restore with app-created film snapshots (see the feature brief’s **Backups and later research loads**). Neon Free restores 6 hours back. Award data is in the repo and can be reloaded. The marks are exported to `data/marks.json` (committed) before every production load, correction or race update, and whenever the owner says "back up marks". Restore with `marks:restore` (dry run first).
- **Error alerts:** Vercel's runtime logs (short retention on Hobby) and its emails on failed deployments. The cron records each run in `data_loads`; `/data` shows a notice when scores are more than 3 days old, so a broken cron is visible in the app.
- **Spending limits:** Vercel Hobby and Neon Free can't bill. Keep it that way: no card on Neon, no Pro on Vercel without the owner. OMDb and TMDB keys are free and capped by the services.
- **Rollback:** Vercel's instant rollback to the previous production deployment; tried once on a deployment before the launch release (3.R). Migrations stay backward compatible for one release.
- **Search engines:** kept out: `robots.txt` disallows all, every page has `noindex, nofollow`, and an `X-Robots-Tag` header.
- **Security:** no sign-in (owner's choice); the writes are the marks/Watch list actions and, from Phase 9, validated film creation (same no-sign-in access model); cron and revalidate routes need their secrets; imports run only from scripts.

## 11. Not decided yet
| Item | Blocks | Default if unanswered |
|---|---|---|
| OMDb hit rate for Tomatometer and Metascore (checked in 1.5: 50 films, 2012–2023, about 30 countries: IMDb 50, RT 36, MC 32; the 28 International submissions RT 15, MC 14, the other 22 RT 21, MC 18. 2024–2026 on `test`: RT 185 and MC 139 of 380, lowest for 2026) | Nothing | Missing scores show "–"; no fallback (product plan §3.2) |
| Dates of the 99th Oscars (shortlists, nominations, ceremony) | 1.3 | Researched in 1.3 from the Academy's announced calendar; updated by the routine if they move |
| A film with no IMDb ID or Wikidata item | Research import only | Existing research files still require one; Phase 9 Watch list accepts TMDB-only or manual films with a local UUID, covered by the feature brief |
| Ties and joint winners | Accuracy | A hit if any winner won (§5.2) |
| Critics groups' identities | 4.1 | Product plan §10 defaults |

## 12. Things I need to do myself
| When | Action | Why |
|---|---|---|
| Done 2026-10-22 | Neon `production` and `test` branches in `.env.local` and `.env.test` (both checked; `test` has auto-delete off); OMDb key and TMDB token in both files and in Vercel Production (both checked); Vercel logged in; local previews use `production`; production steps wait for the owner during `autorun all` | |
| Before the run (optional) | `autorun notify-setup` in your terminal | Phone notifications when the run stops or finishes |
| Start | `autorun all` in your own terminal, inside `~/oscar-movies` | |
| Mornings after a run | `autorun recap` and `autorun decisions`; then approve the production steps it left (migrations, data loads: Claude shows the dry run first) | Production data stays the owner's call |
| Each phase | Sign off with real data; say "release" | Releases only move on the owner's word |
| End of Phase 0 | Check `/styleguide` against `design-preview.html` | Design sign-off |
| In season (Nov–Mar) | Ask Claude to "update the race" after new results (2–3 times a week) | Live race |
| Before launch | Check the app on a real phone | Real-device check |
