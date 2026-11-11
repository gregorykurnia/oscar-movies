# Watch list: sort by release date, tentative dates, filters

Phase 10 brief (planned 2026-11-11). Read **Request and smallest design** and the task's entry under **Task briefs** before each task.

## Request and smallest design

Owner, 2026-11-11: “In the watchlist - i wanna be able to like sort by the release date. I also wanna be able to mark for the release date there for the movies whether the date is tentative or its confirmed. And also have filters based on the platform or any other filters needed.” Defaults below were proposed and accepted (“Ok”) the same day.

The simplest design that does this:

1. **Sort by release date.** A sixth sort, **Release date** (`?sort=release`). Want to watch: by date, earliest first (so films already out come first, then the soonest coming), then TBD (a platform but no date), then films with no release note; ties by title. The season section ("Not watched yet") has no release notes and follows Oscar stage, as under My order.
2. **Tentative or confirmed.** One stored flag per film's date. In the release editor, a two-choice control (Confirmed / Tentative) shows while a date is set. A date typed into an empty field starts as **Tentative**; editing an existing date keeps its choice. Clearing the date (TBD) drops the flag. Dates saved before this phase count as **Confirmed**, so no row changes look. On the row, a tentative date carries a muted "tentative" word after it (exact look set in 10.1); a confirmed date looks as it does today.
3. **Filters on Want to watch**, kept in the address and combined with each other:
   - **Platform** (`?platform=<name>`): All platforms (default), each platform on a currently wanted film (case and accents ignored, shown as the owner typed it most recently), and **No platform** (`?platform=none`). One at a time.
   - **Release** (`?release=out|coming|tbd`): All (default), **Out now** (date on or before today in Jakarta, `todayInJakarta`), **Coming** (date after today), **TBD** (no date). A tentative date counts by its date.
   - While any filter is on: the season section is hidden (its films have no release notes), the drag handles are hidden (reordering a filtered subset is ambiguous; drag stays on unfiltered My order only), the heading's count reads "3 of 12 films", and a **Clear filters** link returns to the unfiltered address. No match shows the guide's empty state with Clear filters.
   - An unknown filter value in the address is ignored, as unknown sorts are.

Left out (follow-ups for the owner to pick, not built): several platforms at once, a Confirmed-only filter, country or year filters, release sort for the season section, fetching release dates automatically.

## Before the run

Nothing to set up: no new service, account or secret. Build and test on `staging` against the Neon `test` branch. The production migration is an owner step after the build.

## Existing code and constraints

- `src/db/schema.ts` `marks`: `release_on date` (null = TBD), `platform text` (1–40 chars), `want_rank`. Release notes stay when a film stops being wanted.
- `src/app/actions/watch-list.ts` `setRelease(movieId, releaseOn, platform)` with Zod validation; `src/data/watch-list.ts` reads wanted films, notes and used platforms (`getUsedPlatforms`).
- `src/lib/watch-list.ts`: `WATCH_SORTS`, `parseWatchQuery`, `watchHref`, `sortWanted`, `releaseLine`, `todayInJakarta`, `platformOptions`. Pure and unit tested (`src/lib/watch-list.test.ts`).
- `src/components/watch-list/WatchListPage.tsx` (toolbar, both sections), `ReleaseEditor.tsx` (date, TBD, platform), `SortableWantList.tsx` (drag under My order).
- Backups: marks snapshot in `src/lib/data-files.ts`, restore in `scripts/lib/marks.ts` / `scripts/marks.ts` (tests: `src/lib/data-files.test.ts`, `scripts/lib/marks.test.ts`); procedure in `docs/runbook.md`.
- Visual rules: `DESIGN_GUIDE.md` §8.3 (Watch list), §7 (Segmented, Fields), §11, §13; `design-preview.html` (v1.4 marks the Phase 9 pieces).
- e2e: `tests/e2e/watch-list.spec.ts`, `tests/e2e/smoke.spec.ts`.

## Storage

- New column `marks.release_tentative boolean not null default false`, with a check that it is true only when `release_on` is set. Additive migration; old rows read as confirmed.
- `setRelease` takes the flag; a TBD save stores false. The marks backup writes the flag only when true, so old backup files stay valid and restore as confirmed; a new file round-trips it.

## Checks

Light checks per task (`CLAUDE.md`). Unit tests: address parsing for the new sort and filters (unknown values ignored), release-date order including TBD and no-note films, each filter and their combination, the count words, the tentative release line, the flag's read-back. e2e: set a tentative date, reload, see it tentative, switch to confirmed; open a filtered address and see only matching films with drag handles and the season section hidden. Full suite and screenshots once, in 10.5.

## Task briefs

**10.1 — Draw the new controls.** The owner can see where sort, filters and the tentative mark go before they're built. Read Request and smallest design and `DESIGN_GUIDE.md` §8.3, §7, §11, §13. Edit the guide and `design-preview.html` together, bump the guide to v1.5 and mark the new pieces "v1.5". Existing tokens only. Done when:
- The reference shows the Release date sort, both filters (laptop and 360 px phone), a tentative and a confirmed row, the editor's Confirmed / Tentative control, a filtered list with its count and Clear filters, and the no-match state.
- Phone and laptop shots: the toolbar wraps with no sideways scroll, every control is reachable, the tentative word is readable but quieter than the date.

**10.2 — Store tentative dates.** A date's tentative or confirmed choice is saved and survives a backup restore. Read Storage and Existing code. Edit `src/db/schema.ts`, the generated `drizzle/` migration, `src/app/actions/watch-list.ts`, `src/data/watch-list.ts`, the backup/restore files listed above, their tests and `IMPLEMENTATION_PLAN.md` §3.1. Migrate `test` only (`npm run db:migrate:test`). Done when:
- The test branch has the column; existing rows read as confirmed; the database refuses tentative without a date.
- `setRelease` saves and reads back both choices; a TBD save clears it.
- An old backup fixture restores as confirmed; a tentative note round-trips; the production migration command is in the task's commit body.

**10.3 — Sort and filter the Watch list.** The owner can order Want to watch by release date and narrow it by platform and release. Read Request and smallest design and the 10.1 reference. Edit `src/lib/watch-list.ts`, `WatchListPage.tsx`, small adjacent components and their tests; add the filtered-address case to `tests/e2e/watch-list.spec.ts`. Done when:
- `?sort=release`, `?platform=` and `?release=` work alone and together, and unknown values are ignored.
- Filtered: only matching films, the "3 of 12 films" count, Clear filters, no drag handles, no season section; no match shows the empty state.
- Laptop and phone screenshots match the reference.

**10.4 — Mark a date tentative.** The owner can say whether a date is firm, and the row shows it. Read Request and smallest design and the 10.1 reference. Edit `ReleaseEditor.tsx`, `releaseLine` in `src/lib/watch-list.ts`, their tests and `tests/e2e/watch-list.spec.ts`. Done when:
- A new date starts Tentative; an edited date keeps its choice; TBD hides the control.
- After reload the row shows "tentative" for a tentative date and nothing extra for a confirmed one; screen readers hear the same.
- The e2e case passes; editor screenshots on phone and laptop match the reference.

**10.5 — Run the phase checks once.** The finished feature is tested end to end without touching live data. Run the full e2e suite and the Watch list screenshots (phone, turned phone, laptop) once on a free machine; write the results, commands, source commit and screenshot paths to `docs/phase-checks/watch-list-release.md`. Done when:
- Every check above has a result, and each failure is listed with its test name.
- Every test server this task started is stopped. This row reports; fixes go to 10.R.

**10.R — Phase 10 review.** The owner's release notes are never lost or shown wrong. Read this brief, the Phase 10 diff, the 10.5 report and guide §15; check the migration, the backup round trip, filter and sort edge cases (today's date in Jakarta, TBD, no note) and the screenshots with fresh eyes. Fix confirmed findings and rerun only affected checks. Done when:
- No data-loss or wrong-date finding is left; each other finding is fixed, given a named task or dropped with a reason.
- The guide checklist is recorded, and the production migration, a real-phone check and the release are on the Waiting for the owner list in `docs/build-plan.md`.

## Release handoff

After 10.R: the owner approves `npm run db:migrate` (production, additive column), then says "release" (a normal release: it has a migration).
