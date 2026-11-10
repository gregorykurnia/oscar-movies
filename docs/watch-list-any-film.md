# Add any film from Watch list

Feature brief for Phase 9, 2026-11-10. Tasks and completion marks live only in `IMPLEMENTATION_PLAN.md` §6.

## Request and smallest design

> “i wanna be able to add it directly into this website app even if it doesn’t exist from before from any movie”

From the main navigation, open **Watch list → Add a film**. Keep the existing local matches and add **Search more films** immediately below them, including when there are none. It searches TMDB; the owner chooses the correct title and year, then adds it to Want to watch. **Add manually** stays visible beside this action: title and release/planned year suffice even without any external ID. New films go to the top under My order and remain after reload.

Planning default, not an extra owner requirement: catalogue search plus manual fallback. Manual-only would be smaller but require typing every missing film's details; catalogue-only would still strand films the provider lacks. Reuse the existing TMDB service, components, scores batch, movie pages and marks. No new service, posters, sign-in, award editing, bulk imports, general film editor, or automatic Indonesia release/platform lookup.

## Before the run

No new owner setup is required for building. Planning inspection found `TMDB_READ_TOKEN` and database variable names populated in `.env.local` and `.env.test`; values were not printed, and connectivity/token validity was not tested. The existing test harness verifies both database connections against `app_meta.db_branch = test`. Build and test on `staging`; never use the local preview's production connection for checks. Missing/refused catalogue credentials must leave manual entry usable. Production migration and real-device checks gate release only.

## Existing code and constraints

- `src/components/watch-list/AddFilm.tsx` calls `/api/search` and currently shows the reported “ask Claude” message. Its keyboard selection, abort handling, statuses and refresh behavior should be retained.
- `src/data/search.ts` already searches all stored films, including those without awards. `src/data/watch-list.ts` starts wanted films from marks and left-joins award results, so independent films belong in the same tables.
- `src/db/schema.ts` requires an IMDb or Wikidata ID (`movies_has_id`); year is a non-null smallint. `src/data/movie.ts` caches even a missing movie under `awards` and `scores`.
- `scripts/lib/load.ts` matches IMDb then Wikidata, rejects changed slugs and leaves unmentioned movies intact. `scripts/lib/marks.ts` and `src/lib/data-files.ts` assume IMDb/Wikidata identities and cannot reconstruct an app-only movie today.
- `src/data/marks.ts` uses single-statement writes because the app's Neon HTTP client has no interactive transactions. `src/db/index.ts` already offers a request-closeable WebSocket client for transactions.
- `scripts/research/lib/tmdb-search.ts` is reference material only: it assumes a known year, rejects films without IMDb IDs, and uses filesystem caching. Do not import that research pipeline into request handlers.

## User flow and states

1. Local search continues working as today. Show Search more films and Add manually even with local matches: a partial title match is not proof that the desired film exists. Neither action sits behind a collapsed details section. Global navigation search stays local.
2. Search more films keeps the typed text and opens an inline catalogue panel below the input, before the toolbar. Search on explicit action, then debounce changes by 300ms; cancel/discard obsolete responses. List at most 20 films per page, with a next-page action when supplied by TMDB. Show title, original title when different, release year or “Year unknown”, and a short overview for disambiguation. No poster, invented flag, Oscar stage or score. Selecting a result reveals confirmation with the title/year and **Add to Want to watch**. A result with no release year asks for its release/planned year rather than guessing.
3. Add manually opens the same compact form with the typed title filled in. Require a trimmed title (1–300 characters) and integer release/planned year (1800–9999); no 2012–current-season restriction. No country/ID/score required. Check stored matches for title plus year and offer **Use this film** or **Add a different film**; never merge by title. Keep the same draft identity across retries. Editing the draft after a failed attempt must not overwrite an already saved film with that identity.
4. Save success refreshes marks and the list, clears the draft, restores focus to Add a film and confirms success. Under My order the row is first; under other sorts keep the selected sort and give an Open film link. Already-wanted/watched selections follow existing add behavior (want on, watched off, move to top), preserving release date and platform.
5. Empty catalogue, missing token, timeout, refusal, rate limit and offline errors are different from “no matches”. Each leaves the query and manual entry available. Failed saves keep the draft and offer retry, with no success toast. Disable double submission. Escape/cancel closes only the current panel and returns focus. Controls are real buttons outside listbox options, with labels, live status and visible focus.
6. Saved films work in global search, their movie page, watched marks, order and release notes. No award facts means the existing honest empty award state and missing scores, with no fabricated nominations or “snub”. Current-season contenders, grids and predictions remain driven by actual results.

## Storage, identity and saving

Add one nullable, unique `movies.local_id` UUID. Assign it once to each new in-app draft/import; it is the durable identity for manual films and also marks records requiring a movie snapshot in backups. Existing researched films stay null. Expand `movies_has_id` to accept IMDb, Wikidata, TMDB or local ID; preserve all existing uniqueness/format constraints and add a positive TMDB check. Do not populate fake external IDs. Keep existing year types, using the explicit year field when a source has none. Unknown countries are `[]`, language and scores null.

Generate a stable, collision-safe slug on the server from title/year plus TMDB ID or local UUID. A provider result is saved using its ID and freshly fetched validated details, not client-supplied metadata. Only an explicitly entered missing year may supplement the source. Do not overwrite a researched film's facts or scores when it is merely being added to the list.

Resolve all available external IDs together before inserting. If they point to different rows, return a recoverable conflict with no writes; do not pick the first row. Reuse a single matching film; preserve all existing IDs, slug, marks, order notes and metadata. A repeated local UUID reuses its film only when the draft represents the same saved input; changed input must get a new draft identity. UUID/ID uniqueness plus conflict re-read covers double clicks, concurrent adds and an uncertain network response. Title/year matches are warnings for manual entry, never unique keys or automatic merges. Manual films without external IDs may need a later explicit correction to link to researched records; a general merge UI is outside this feature.

Fetch provider details before opening a transaction. Add a small server-only transaction helper in `src/db/index.ts` using the existing Pool driver with `DATABASE_URL_POOLED`, closing it in `finally`. Keep page reads on HTTP. The transaction resolves/creates the film and calls existing `writeWantAtTop` against the same transaction; failure rolls back both. Use one shared advisory transaction lock before any identity/rank reads or writes. Route every rank-changing app action through the same request-scoped transaction helper: new film saves, existing add/reorder in `src/app/actions/watch-list.ts`, and watched/want changes in `src/app/actions/marks.ts`. Acquire the same lock in restore’s existing transaction before its stale-plan recheck and writes. Keep low-level mark SQL and ordinary HTTP reads; `writeRelease` stays HTTP because it does not change ranks. This prevents a new add racing an existing toggle/reorder and giving two different films rank 1. Keep retries bounded (one re-read after unique conflict); no token signing, receipts table, queues or new framework.

After commit invalidate the movie cache, including cached misses, with the installed Next.js Server Action cache APIs (`awards` tag currently covers movie reads), then refresh the list/provider. Cache invalidation failure after commit must not claim the database rolled back: return saved identity and a refresh hint. A retry must not create another film.

Risk reasons for the additions: local UUID permits ID-free films and stable retries; a transaction prevents a saved movie without its wanted mark; ID reconciliation prevents duplicates/remakes from being confused; the backup snapshot prevents app-only films disappearing during rebuilds. All other infrastructure is out of scope.

## Catalogue and scores

Add a server-only TMDB client under `src/lib/movie-catalogue/`, a read-only `/api/movie-catalogue` route, and separate Server Actions in `src/app/actions/add-film.ts`. Keep `/api/search`'s contract unchanged. Use the configured `TMDB_READ_TOKEN` only on the server and a fixed TMDB host. Validate query length (1–200), page (1–500), positive integer IDs, API JSON and returned field lengths; use an 8-second timeout and distinguish 401/403, 404, 429 and network/invalid-response failures. Do not log the token or raw headers. Search GET requests never insert rows.

Use `/3/search/movie` and `/3/movie/{id}?append_to_response=external_ids`; show adult-filter behavior consistently with the existing research client (`include_adult=false`). Manual entry remains available for any film absent from those results. Preserve real original titles/language and supplied country codes; do not infer a nationality from language. Import TMDB's score only with valid votes using existing score parsing; leave other scores null and `scores_checked_at` due so the existing batch can fill IMDb/RT/Metacritic when an IMDb ID is present. Do not call OMDb for every search or make saving depend on score refresh. Existing `/data` attribution remains visible.

Verified references on 2026-11-10: [TMDB movie search](https://developer.themoviedb.org/reference/search-movie), [movie details](https://developer.themoviedb.org/reference/movie-details), [external IDs](https://developer.themoviedb.org/reference/movie-external-ids), [Neon transactions and request lifecycle](https://github.com/neondatabase/serverless/blob/main/README.md). Implementers check installed library docs/Context7 for exact APIs.

## Backups and later research loads

Extend the existing marks export format compatibly: old entries still parse; new entries may carry `tmdb`, `localId` and a validated optional movie snapshot (stable slug, title/year, original title/language, countries, external IDs; scores may be refreshed). Export **every local-ID film**, even if neither marked nor carrying notes, with its current mark state and snapshot. Also export ordinary marked/note-bearing films as today. Never write a test export to `data/marks.json`.

Restore resolves all identities, plans recreating missing app-created films from snapshots, then applies movie creation and marks in one transaction. Dry-run shows both and writes nothing. Refuse conflicting identities/slugs or malformed snapshots before writing; preserve old backups' “missing film is an error” rule when no snapshot exists. Keep shrink protection and atomic file replacement. Round-trip tests must remove the backed-up movie as well as its marks in an isolated test fixture and prove both are recreated, with unchanged stable slug, identity, order, release notes and watched state. A second restore is a no-op.

Extend loader matching to TMDB as well as IMDb/Wikidata, rejecting disagreement. On a matched app-created row preserve `local_id`, existing slug and non-conflicting known IDs; curated metadata may be updated by the normal reviewed load. Preserve strict slug-change rejection for ordinary researched rows. An unrelated load leaves app-created movies and marks intact; matching research reuses the same row and a second load is empty. No title-based merge and no web writes to repo JSON. Update the runbook and race-update backup wording when this is implemented.

## Checks and test isolation

For implementation tasks follow `CLAUDE.md`: typecheck, changed-file lint, related unit tests, full `npm test` and one build. Add targeted database tests for schema, save, restore and loader on Neon test only. For new read/write flows, run `smoke.spec.ts` and `watch-list.spec.ts`, plus only the added/edited specs. Add the new browser cases to `watch-list.spec.ts` so there is no redundant second page spec. A pure backend task may exercise its new route/action via that file before the UI is wired. The design-only task skips app checks.

Provider fixtures must run inside the server as well as browser search: browser interception alone cannot mock a Server Action's TMDB request. Use an injected client for unit/database checks and a deterministic fixture adapter for e2e enabled only with a test flag **and** `EXPECT_DB_BRANCH=test` plus the actual database guard. Refuse that adapter on production; fake TMDB credentials and no provider network in automated tests. Include fixture configuration in the test-build hash. Keep the production build/port-3100 harness. Fixtures cover multiple same-title films, an upcoming/no-IMDb film, unknown year, empty results, malformed data, 401, 429, timeout and deleted result. Restore all affected marks/ranks and delete only test-created films, even after failures.

Required assertions: manual and TMDB addition survive reload and global-search/movie-page navigation; duplicate/retried/concurrent adds reuse identity; external-ID conflict writes nothing; failed mark insert rolls back the movie; existing date/platform survives; manual duplicate choice does not merge remakes; catalogue failure leaves manual entry; cancelling never saves; out-of-order search responses cannot add an old selection; current-season/prediction counts remain unchanged; backup reconstruction and subsequent research load work.

Look check at 390×844, 844×390 and 1280×900: open each screenshot at full size and describe what is where before judging it. Show local no-match actions, catalogue results, selected confirmation, manual form with error, saving/failure and saved row. The add entry/actions appear in the first screen; the selected film and its save action are visible together, with the keyboard accounted for on phone. No sidebar overlap or sideways page scrolling. Run guide §15 and keyboard/a11y checks.

## Task briefs

**9.1 — Define the screens.** The owner can find the new path in the existing Add a film area. Read User flow and states above and `DESIGN_GUIDE.md` Components, Page templates, Copy and tone, Accessibility. Edit the guide and `design-preview.html` together, bump the guide version and replace the old no-match wording. Use existing tokens and form/notice patterns. Done when:
- The reference shows local no-match, catalogue results, confirmation, manual entry, missing year, duplicate choice and recoverable failure.
- Full-size phone/laptop/landscape shots meet the look-check facts above; existing Watch list controls remain reachable.

**9.2 — Allow films without catalogue IDs.** The database can keep a manual film without inventing an ID. Read Storage, identity and saving and current schema/client files. Edit `src/db/schema.ts`, generated `drizzle/` migration and `tests/db/schema.test.ts`; migrate test only. Done when:
- A local-ID-only and a TMDB-only movie are accepted; an entirely unidentified row is rejected.
- Uniqueness, valid IDs and old rows remain safe; migration is additive/backward compatible and its production command is recorded for release.

**9.3a — Preserve films in backups.** An app-added film can be recovered even when its database row is gone. Read Backups and later research loads and implementation plan Data/Running the live app. Edit `src/lib/data-files.ts`, `scripts/lib/marks.ts`, `scripts/marks.ts`, related unit/DB tests and `docs/runbook.md`. Done when:
- Old backup fixtures still restore; new app-only films and notes round-trip without the original movie row; unmarked app films are included.
- Dry-run, conflict refusal, production-file protection, shrink guard and second-run no-op pass.

**9.3b — Reuse films in later research loads.** A later award import keeps the same film and its personal notes. Read Backups and later research loads and implementation plan Data; inspect `scripts/lib/load.ts` and its matching/slug checks. Edit that loader, related unit/DB tests and `docs/update-the-race.md`. Done when:
- Later same-ID research reuses the movie and keeps marks/slug; unrelated loads leave it intact.
- Conflicting external IDs refuse the whole load; researched-row slug protection remains; repeat loads are no-ops.

**9.4 — Find films beyond the app.** A missing title can be found without loading awards. Read Catalogue and scores and Checks and test isolation. Add the server-only catalogue client, route and tests; set up server-side provider fixtures and harness hashing. Done when:
- Search returns bounded, typed movie results with pagination and distinguishable empty/failure states; no GET writes.
- Token stays server-only; malformed replies, timeout/refusal/rate limit and production fixture refusal are tested.

**9.5 — Save one film and its wanted mark together.** A selection or manual draft adds exactly one film safely. Read Storage, identity and saving, Backups and later research loads, and existing marks writes. Edit the transaction helper, new `src/data/add-film.ts`, `src/app/actions/add-film.ts`, existing rank-changing actions (`marks.ts`, `watch-list.ts`), restore’s lock acquisition in `scripts/lib/marks.ts`, validation/client helpers and related unit/DB/action e2e cases. Done when:
- Manual and catalogue saves, explicit duplicate choice, ID conflict, rollback, retry and preserved release notes pass; interleaved new/existing add, want toggle, restore and reorder preserve ranks 1…n or return an honest stale refusal.
- Cached misses invalidate and fresh reads find the film; post-commit refresh errors do not claim a failed save.
- Saved films with no awards remain outside race/accuracy/prediction results; score failures never undo an add.

**9.6 — Connect the Watch list flow.** The owner can complete both paths from the existing page. Read User flow and states and the 9.1 reference. Edit `src/components/watch-list/AddFilm.tsx`, small adjacent components/tests and `tests/e2e/watch-list.spec.ts`; adjust movie empty states only if necessary. Done when:
- Both paths add, reload, open the movie, appear in global search and support existing marks/order/notes.
- Loading, duplicate, missing-year, retry, cancel, keyboard and stale-response cases behave as specified.
- Targeted smoke/page e2e pass and required screenshots show the selected film together with its action.

**9.7 — Run the phase checks once.** The completed flow is tested without touching live data. Read Checks and test isolation, `CLAUDE.md` gates and build-plan Step 10. Run the full e2e suite, database suite and phase a11y/screenshots once on a free machine; reuse unchanged build/unit evidence. Save the failure list before another browser invocation, with commands, source commit and screenshot paths in `docs/phase-checks/watch-list-any-film.md`. Record the previously noted suite-order concern at `phase-3.spec.ts:110` if it recurs. Done when:
- Every required scenario has recorded evidence and every failed/omitted check is explicitly listed.
- All owned test servers/fixture processes are stopped. This row reports; it does not loop over fixes or call the phase approved.

**9.R — Review and finish Phase 9.** The owner's film and notes survive each failure path. Read the brief, Phase 9 diff, check report and guide §15; inspect saves, identity matching, backup reconstruction, fixture isolation and screenshots with fresh eyes. Review on the other model family from the builders. Fix confirmed bounded findings and rerun only affected checks; split substantial fixes into named tasks before closing the phase. Edit `docs/review-triage.md`, phase report and implemented-state documentation. Done when:
- No unresolved data-loss, false-success, production-test or blocking flow finding remains; each other finding is fixed, assigned a named task or dropped with a reason.
- Final affected checks pass, guide checklist is recorded, and release/migration/phone steps are on Waiting for the owner.

## Planning validation

Fresh Sol Max critique on 2026-11-10 identified two material gaps, both incorporated: separate backup recovery from loader reconciliation (9.3a/9.3b), and use the same lock across all rank-changing actions and restore (9.5). No application changes or application checks were performed during planning.

## Release handoff

Owner steps only, after the build: review a test-backed preview on a real phone; approve the exact production migration after seeing its test results; back up with the existing compatible exporter before migration and the new snapshot exporter afterward; run normal release checks and release on explicit instruction. Do not run a write test against the live URL or migrate production during autorun. Feature work can finish while these steps wait.

Task 9.2 migration: `drizzle/0005_movies_local_id.sql` adds nullable unique `movies.local_id` (UUID), accepts TMDB/local identities and requires positive TMDB IDs. Applied to **test only** on 2026-11-10: all 4,377 existing films and 2 marks were unchanged (full-row fingerprints before/after, excluding the new column); existing films retained null local IDs. All 11 schema tests passed, including ID-only films, missing/invalid/duplicate IDs and existing constraints.

Production command, **only after the owner's approval and the compatible pre-migration backup**: `npm run db:migrate` (runs `tsx scripts/migrate.ts --target production --yes-production`). Run before releasing code that reads the new column. No production migration has been run by task 9.2.
