# Phase 9 checks: add any film

Task 9.7, 2026-11-10. Source: `22a8b0d` (staging). This is the one-run evidence and failure handoff to **9.R**, not phase approval. No application code or production data/settings changed.

## Isolation and commands

The browser harness checks `.env.test` against `.env.local` without displaying credentials, verifies `app_meta.db_branch = test` over direct and pooled connections, refuses an occupied port 3100, and runs the production build in `.next-test`. Server-side catalogue fixtures use fake credentials and require both the test flag and actual branch guard. Database tests independently load `.env.test` and verify the branch. Runs were sequential. Initial process inspection had sandbox visibility; later host inspection found an older interactive Codex and browser connectors, so exclusive machine use cannot be certified. No other active build/test was observed; unrelated processes were not stopped.

- Full browser run: `PLAYWRIGHT_JSON_OUTPUT_FILE=screenshots/phase-9/checks/e2e.json npm run test:e2e -- --reporter=list,json`.
- Database run: `npm run test:db`.
- Broad accessibility scan: `npm run launch:check -- --grep 'axe-core on the main pages'` (performance is a release check, not rerun here).
- Gallery: the full browser command includes `watch-list.spec.ts`'s three `add-film look` scenarios; no duplicate screenshot run or unrelated-page screenshots.

Raw run output lives in `screenshots/phase-9/checks/` (gitignored). The full run was interrupted before writing failure IDs; its log/traces, rather than an invented `e2e-last-run.json`, are preserved. Select its failed tests by file/line as listed below. The successful continuation's separate IDs file is retained only as evidence of that continuation.

## Results and failure handoff

The full invocation was externally terminated with **SIGTERM / exit 143** after 137 of 146 results (134 passes, three failures). It did not write its end-of-run JSON or `.last-run.json`. The cause of the signal is unproven. Before any further browser invocation, the full log and all three failure traces/error contexts were preserved under `screenshots/phase-9/checks/interrupted-e2e-results/`, and this failure list was saved:

| ID | Failure | Handoff |
|---|---|---|
| P9-E1 | `phase-3.spec.ts:110`: La bola negra expected `0.08679797`, received `0.07623731` (precision 6). The previously noted suite-order concern recurred. | 9.R: inspect prediction recomputation/cache and cross-test restoration; do not call it an environment flake without evidence. |
| P9-E2 | `race.spec.ts:122`: `Show all N contenders · … under 3%` button not found within 5 seconds. | 9.R: inspect whether E1's changed live-season state/cache affects this assertion. |
| P9-E3 | `watch-list.spec.ts:424`: expected “Couldn't save the order” status containing “Your list is back as it was.”; status not found within 5 seconds. | 9.R: inspect reorder failure injection, write handling and rollback announcement. |
| P9-E4 | Nine cases lacked a completed result after the process termination: Watch list phone editor, both-path navigation, three gallery cases, and four year-summary cases. Test-server teardown did not run. | Stop only the recorded server process group, then execute only these missing cases once; retain the original three failures. |

The owned server (PID/process group 1506551, recorded by the harness) was stopped and port 3100 verified free. The original failure IDs file is **unavailable**, not silently replaced by a later run. Until 9.R creates a new failure selection, select E1–E3 by their file/line paths. Partial-run cleanup of the interrupted case cannot be independently established from the lost in-memory snapshot; inspect test marks/ranks during review. No production cleanup is involved.

The nine missing browser cases subsequently **passed, 9/9**, in 50.4 seconds. Command: `PLAYWRIGHT_JSON_OUTPUT_FILE=screenshots/phase-9/checks/e2e-remaining.json npx playwright test tests/e2e/watch-list.spec.ts:577 tests/e2e/watch-list.spec.ts:644 tests/e2e/watch-list.spec.ts:714 tests/e2e/year-summary.spec.ts --project chromium --reporter=list,json`. Its separate `e2e-remaining-last-run.json` was preserved; it does not erase the original failures. Combined evidence: **143 passes, three failures, zero unexecuted cases**, rather than a clean uninterrupted full run.

The first database invocation also ended with **SIGTERM / exit 143**, after `patterns.test.ts` reported four tests, two failed. Its log names the failures but has no final assertion diff/JSON:

- **P9-D1:** Documentary backtest expecting 35/55 with the snub rule, 33/55 without, engine 31.
- **P9-D2:** Documentary 2024 query: five picks, named films, backtest and flagged-film record.

Both are assigned to **9.R** for seeded-data/research-load isolation diagnosis alongside E1. The remaining database files run once with `npm run test:db -- --exclude tests/db/patterns.test.ts --reporter=default --reporter=json --outputFile=screenshots/phase-9/checks/database-remaining.json`; no completed failing case is rerun here. A read-only test-list probe also failed before discovery (`DATABASE_URL is not set`, because `--list` skips global setup); the real guarded nine-case command succeeded.

The detached database continuation ended before producing test output or an exit file. The same unexecuted files then completed in an attached terminal: **19 files, 151 passed / four failed (155 tests), 49.93 seconds**. Including the first patterns file: **20 files, 153 passed / six failed (159 tests)**. Every database case has a recorded result, although the first two failures lack assertion diffs because that invocation was terminated.

| ID | Additional database failure | Handoff |
|---|---|---|
| P9-D3 | `data.test.ts:169`, seeded marks: Anora/Hamnet/I'm Still Here wanted instead of the expected seeded marks. | 9.R: establish and restore the test-only baseline; inspect interrupted `withOrder` cleanup. |
| P9-D4 | `data.test.ts:222`, wanted films: expected Conclave and `test-data-want`; received Anora, Hamnet, I'm Still Here and the test film. | 9.R: same seeded-mark isolation issue. |
| P9-D5 | `data.test.ts:244`, owner order/release notes: the three existing wanted fixtures displace expected Conclave. | 9.R: same issue; preserve the original notes when repairing cleanup. |
| P9-D6 | `data.test.ts:279`, season exclusion: wanted list expected Conclave, received Anora/Hamnet/I'm Still Here. | 9.R: same issue. |

All **29 add/backup/schema database tests passed** (`add-film`: 10, `marks-backup`: 8, `schema`: 11). The 16 loader cases also passed, including all three external-ID reconciliation paths. The test branch was not reseeded to conceal the failed isolation checks; production was never targeted.

### Completed checks and explicit omissions

- **Browser:** 143/146 passed across the interrupted full invocation and nine-case continuation; E1–E3 remain failed. The gallery's focused axe/layout/console/keyboard assertions passed at all three sizes (axe on 390/1280).
- **Database:** 153/159 passed across the interrupted first file and 19-file continuation; D1–D6 remain failed.
- **Accessibility:** `launch:check -- --grep 'axe-core on the main pages'` completed in 57.9 seconds; parsed `checks/axe.json`: **28 page/viewport records, zero violations**. This script records violations without asserting, so the JSON was checked independently.
- **Build/unit/light evidence:** the guarded production-build hash matched `22a8b0d` on every browser invocation. Reused task 9.6's successful typecheck/lint and 16 focused component tests after its last repair. The last full unit run passed 1,126 tests before that focused repair; a full-unit rerun on the final repaired source remains unverified here. This task changes docs only, so its own light checks are diff/plan/report checks; no redundant build or unit run.
- **Cleanup:** port 3100 is free and all three recorded server PIDs (1506551, 1509496, 1511000) plus the failed detached wrapper (1510406) are gone. A guarded, read-only test query found zero remaining Phase 9 fixture films (Pulang ke Rumah, Upcoming fixture, Test atomic, Test provider film prefixes). The three wanted test marks remain as failure evidence; restoring an unknown pre-interruption in-memory mark snapshot was not attempted.
- **Not claimed:** a clean uninterrupted suite, complete original-run failure IDs/diffs, exclusive host use, restored original test marks, current full-unit results, release/performance/security checks, production migration/release or real-iPhone keyboard behavior. **9.R owns the test-isolation/cleanup findings and any needed targeted reruns**; production and physical-phone steps stay on Waiting for the owner.

## Required scenario evidence

| Scenario | Evidence |
|---|---|
| Manual/catalogue creation, reload, global search and movie navigation | `watch-list.spec.ts`: action persistence test and both-path navigation test |
| Duplicate/retried/concurrent adds reuse identity; notes survive | `tests/db/add-film.test.ts`: duplicate/remake, retries, matching IDs and shared-lock concurrency; browser action test |
| Conflicting external IDs write nothing; mark failure rolls back movie/ranks | `tests/db/add-film.test.ts`: conflicting IDs and forced mark-insert failure |
| Manual duplicate choice preserves remakes | Database duplicate/remake test; browser action test and phone duplicate gallery state |
| Provider failure retains manual entry; cancellation writes nothing; stale search cannot select old film | Browser gallery provider/offline states; `AddFilm.test.tsx` cancellation and delayed-response cases from task 9.6 |
| Current-season/prediction counts remain unchanged | First `tests/db/add-film.test.ts` case compares season films, chances, results and prediction rows before/after |
| Backup reconstruction; later research load | `tests/db/marks-backup.test.ts`; `tests/db/load.test.ts` app-film reconciliation by IMDb/Wikidata/TMDB |
| Empty/loading/error/offline, long titles, focus, keyboard and three screen shapes | Gallery cases in `watch-list.spec.ts`; focused axe inside phone/laptop gallery; broad launch axe scan |

## Visual evidence and guide checklist

The flow remains at **Watch list → Add a film**. Required viewports: 390×844, 844×390 and 1280×900, light only (guide §15 overrides the generic playbook's dark-theme wording). Images and original-size panel crops are in `screenshots/phase-9/`. Reference captures `ref-b-more-*` are unchanged evidence from the binding `design-preview.html`; task 9.6's before/after record remains in [add-film-look.md](add-film-look.md).

Physical iPhone keyboard/real-phone behavior is not established by desktop Chromium viewport emulation. That owner-only check and the approved test-first production migration/release remain on `docs/build-plan.md`'s Waiting for the owner list; neither blocks this evidence task.

Guide §15 was checked as evidence, without approving the phase: AppShell/PageHeader and reference templates retained; existing token colours and wording retained; no hex/dark styles found in the Watch list source; no sideways scrolling or covered controls in the gallery; keyboard/focus, empty/loading/failure/offline and long-title states exercised. Reorder's failure announcement remains failed (E3). The unchanged reference captures were opened at original size for comparison; no before/after app change was made by 9.7.

**P9-V1 — landscape results continuation, assigned to 9.R:** `results-844.png` cuts through the Upcoming fixture row at the bottom; the manual-entry footer requires vertical scrolling. Review whether this satisfies the first-screen action requirement. The selected confirmation and save action are together and unobscured. Lower rows cut by the page's normal vertical continuation are described below, not misreported as whole text. No other new clipping/overlap fault was found in the inspected frames. This reporting row deliberately leaves application fixes to 9.R.

### Original-size look record

All following files are under `screenshots/phase-9/`; each was opened with original detail. The six `picked-panel-*`/`manual-panel-*` crops and three `*-edge-crop.png` files were also opened at 100% to inspect button bases, borders, frame edges and gaps.

LOOKED: no-match-390.png · Entry panel rests above wrapped sort links and film rows; no overlap; lower rows continue below frame; all entry text whole.
LOOKED: results-390.png · Five results and manual footer fit inside the white panel above sort links; no overlay or clipped text.
LOOKED: picked-390.png · Film title/year sit above both buttons inside the panel; later Hamnet row crosses bottom; confirmation text whole.
LOOKED: manual-error-390.png · Stacked fields, red year error and buttons sit inside the panel above sort links; no covered or clipped form text.
LOOKED: saving-390.png · Readable paused fields sit above spinner/Adding button; panel clears sort links; later rows continue below frame.
LOOKED: save-failed-390.png · Error notice sits above Cancel/Retry inside the panel; no covering; lower Anora scores cross bottom; retry text whole.
LOOKED: saved-row-390.png · New film rests between list rules above Anora; marks are beside it; header is above frame; saved row text whole.
LOOKED: no-match-844.png · Heading, input and action panel fill the landscape frame; sort/list continue below; both entry actions whole and uncovered.
LOOKED: results-844.png · White results panel follows the input; Upcoming fixture crosses bottom and footer is below frame; no overlay; visible complete rows readable.
LOOKED: picked-844.png · Selected film and both buttons share the panel above sort links; input label is above frame; title/actions whole and uncovered.
LOOKED: manual-error-844.png · Side-by-side fields rest above error and action row; sort links cross bottom; all form text whole and uncovered.
LOOKED: saving-844.png · Paused fields and spinner sit above panel base; sort links cross bottom; all saving text whole; no overlay.
LOOKED: save-failed-844.png · Error spans the panel above Cancel/Retry; rounded base meets frame bottom with inset buttons; input label above frame; all task text whole.
LOOKED: saved-row-844.png · New film rests under table headings between rules; input label/header above frame; marks at right; row text whole, no overlap.
LOOKED: no-match-1280.png · Header/nav lead to entry panel above sort and table; Hamnet continues below bottom; both entry actions whole and uncovered.
LOOKED: results-1280.png · Five results and manual footer sit inside the panel above sort/table; later table body crosses bottom; all catalogue text whole.
LOOKED: picked-1280.png · Selected title/year and buttons sit inside the panel above table; later film row crosses bottom; confirmation text whole and uncovered.
LOOKED: manual-error-1280.png · Two fields, year error and buttons sit above sort/table; later film row crosses bottom; all form text whole.
LOOKED: saving-1280.png · Readable paused fields and Adding spinner sit above sort/table; later film row crosses bottom; no covered controls or clipped form text.
LOOKED: save-failed-1280.png · Notice and Retry sit inside the panel above sort/table; lower rows continue; notice and action text whole and uncovered.
LOOKED: saved-row-1280.png · New film rests between table rules above Anora; marks align at right; later film row crosses bottom; saved title/notes whole.
LOOKED: loading-390.png · Skeleton rows sit in white panel above manual footer and sort; Hamnet crosses bottom; labels/actions whole, no overlap.
LOOKED: empty-390.png · Empty message rests above manual footer inside panel; later Hamnet scores cross bottom; all empty-state text whole and uncovered.
LOOKED: offline-390.png · Red notice rests above Retry/manual footer inside panel; later row crosses bottom; failure copy and actions whole, no overlap.
LOOKED: provider-failed-390.png · Provider notice rests above manual footer; later Hamnet row crosses bottom; notice/manual action whole and uncovered.
LOOKED: unknown-year-390.png · Selected title and year error sit above both buttons in panel; later row crosses bottom; all validation/action text whole.
LOOKED: duplicate-390.png · Notice and selected radio row rest above separate/use buttons; list heading crosses bottom; all duplicate text whole, no overlay.
LOOKED: long-title-390.png · Unbroken title wraps within panel above year/overview/buttons; lower release line crosses bottom; full title and actions readable, no overlap.

## Decisions

- Use one full attempt plus only uncompleted cases/files after termination, rather than repeat passing cases; preserve every original failure.
- Keep reports and the existing gallery as this row's deliverable, rather than repair app/tests here; the explicit 9.7 brief assigns fixes to 9.R.
- Retain light-only reference shapes and identify the landscape footer/physical keyboard limits, rather than introduce a provisional layout or infer a real-phone pass.
