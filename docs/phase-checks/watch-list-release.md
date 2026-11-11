# Phase 10: one-run checks and screenshot report (10.5)

Original one-run snapshot, 2026-11-11. Application/reference source: `5f8a0303e1e4460dabc5209784259053c356e8ed`.
The only runner change during these measurements lets `WATCH_EDITOR_OUT` select a
separate gallery directory; its default remains the 10.4 directory. No application,
schema, fixture, or design fixes were made. Only 10.5 is complete; findings belong to 10.R.

Entry point: Watch list → Release date, then Platform/Release immediately below;
click a film's release line to open Confirmed/Tentative.

## Run and safety

- Host preflight found no competing Next build, browser test, or test server; checks ran sequentially. Unit tests used two workers, Playwright one.
- Database setup validated `.env.test` and `app_meta.db_branch`; browser setup checked both direct and pooled branches. The test build blanks production environment variables, disables Next env-file loading, overrides provider credentials with fixtures, and checks its branch again at startup. No production migration, data write, setting, or release was performed.
- Removed only `.next-test/source.hash` to require one fresh guarded `npm run build`. The gallery reused that build. Both ran on `http://localhost:3105`.
- Full e2e ran **once**, with no retries. Copied its failure identifiers before the gallery could replace Playwright's last-run file. No failing checks were rerun or fixed here.
- Setup/teardown stopped test-server PIDs **2059601** (full suite) and **2066520** (gallery); final host checks found port 3105 free. No server is left running.

Commands, in order (logs under `screenshots/phase-10/10.5/checks/`):

```sh
npm run typecheck
npx eslint tests/screens/watch-editor.spec.ts
npm test -- --maxWorkers=2
npm run test:db
rm -f .next-test/source.hash
OSCAR_TEST_PORT=3105 npm run test:e2e -- --reporter=list,json
cp test-results/.last-run.json screenshots/phase-10/10.5/checks/e2e-last-run.json
OSCAR_TEST_PORT=3105 WATCH_RELEASE_OUT=screenshots/phase-10/10.5/release WATCH_EDITOR_OUT=screenshots/phase-10/10.5/editor PLAYWRIGHT_JSON_OUTPUT_NAME=screenshots/phase-10/10.5/checks/screens.json npx playwright test tests/screens/watch-release.spec.ts tests/screens/watch-editor.spec.ts --project screens --reporter=list,json
```

## Results

| Check | Result | Evidence |
|---|---|---|
| TypeScript / changed-file ESLint | Passed | `checks/typecheck.log`, `checks/lint.log` |
| Full unit suite | **1,158 passed** | `checks/unit.log`; 95.40s |
| Full test-database suite | **159 passed, 4 failed** (19 files passed, 1 failed) | `checks/database.log`; 83.33s |
| Fresh guarded production build | Passed, `.next-test` | Build output at start of `checks/e2e.log` |
| Full Chromium suite | **145 passed, 3 failed**, none skipped/flaky | `checks/e2e.log`, extracted `checks/e2e.json`, `checks/e2e-last-run.json`; 748.40s including build |
| Release/editor/reference gallery | **7 passed** | `checks/screens.log`, `checks/screens.json`, `checks/screens-last-run.json`; 56.75s |

All evidence paths in this report are relative to `screenshots/phase-10/10.5/`
unless a repository path is given. Screenshots/logs are intentionally gitignored;
this report is committed. The gallery clears Playwright's default `test-results/`,
so the older trace paths embedded in the raw full-run JSON are no longer retained.
Use the preserved JSON errors and failure identifiers for the targeted 10.R rerun.

## Failures handed to 10.R

Each test below failed in the original run; none is being treated as passing.

| Test | Observed failure / next review check |
|---|---|
| `tests/db/data.test.ts:166` — marks and the watch list → **read the seeded marks** | At assertion line 169: `expected [] to deeply equal [...]`; the expected Anora-watched and Conclave-wanted fixture marks are absent. Verify fixture setup rather than assuming an application regression. |
| `tests/db/data.test.ts:214` — **list the want-to-watch films, including ones with no Oscar result** | At line 222: expected `['conclave', 'test-data-want']`, received `['test-data-want']`. Same missing fixture. |
| `tests/db/data.test.ts:228` — **list the want-to-watch films in the owner's order with their release notes, unranked last** | At line 244: two inserted rows returned; the expected third, Conclave, is absent. |
| `tests/db/data.test.ts:275` — **drop watched and wanted films from the season's section** | At line 282: expected wanted `['conclave']`, received `[]`. These four failures precede our browser/gallery writes. |
| `tests/e2e/phase-3.spec.ts:117` — **an update that adds an award result changes the chances** | `Test timeout of 240000ms exceeded.` Also reports a failed results query from `scripts/lib/load.ts:416` through the final restore at test line 164. Test-dataset restoration was **not verified**; 10.R must inspect/restore the test baseline before interpreting dependent failures. |
| `tests/e2e/phase-6.spec.ts:155` — **the 2024 Documentary grid has a column for each Cinema Eye and DOC NYC category with each film's result, and critics groups after the festivals** | At line 201: `Expected: > 50; Received: 23`; the poll timed out after 5s. Check expanded-critics behavior and the test dataset; connection to the earlier loader failure is unproven. |
| `tests/e2e/phase-7.spec.ts:141` — **a film typed into the Watch list, moved to second place and given a date and platform, keeps all three after a reload** | At line 186: button `/12 Dec 2030 · Netflix/` not found within 5s. Likely an old selector conflicting with the new default Tentative word; verify the actual saved note, then update only the affected case. |

The current Watch list cases for combined sort/filters and tentative → reload →
confirmed → TBD passed. The smoke cases also passed. The backup/restore and
release-note unit/database checks are included in the totals above; the database
failures are restricted to the four named fixture expectations.

## Gallery, look check, and findings

56 PNGs were produced, including references and four additional unscaled crops.
Shapes: **360×800**, **390×844**, **844×390**, **1280×900**, light only.

- `release/`: release sort, matching filters, no match, phone/laptop menus, long platform, landscape/detail frames, and the 360/1280 binding reference.
- `editor/`: tentative rows and editors at all four shapes; 360px Confirmed, TBD, suggestions, saving and failed-save states; button/base crops; `fresh-check/` has the four editor references and row crops.
- `crops/`: `row-release-360.png`, `filter-menu-360.png`, `editor-overlap-1280.png`, `reference-tentative-360.png`. These are 100% extracts, never resized. The first crop helper lacked Pillow (`ModuleNotFoundError`); the installed Sharp library produced the extracts successfully.

The gallery asserts no horizontal page overflow, editor bounds at every shape,
uncovered sort/filter controls, menu bounds/width/alignment, phone count placement,
winner-wash bounds, intact platform wrapping/calendar alignment, selected filter
colour, and no uncaught page errors in the release/filter gallery. These are
focused layout checks, not a full accessibility audit. Guide §15's complete phase
sign-off remains 10.R; its reference drawings are light only despite the older
build-plan dark-mode wording.

Visual findings, both assigned to **10.R**:

1. **Saving hides the selected date status.** In `editor/saving-360.png`, both Confirmed and Tentative have the same muted surface; compare the selected Tentative surface in `editor/editor-360.png`. Preserve a visible selected state while disabled, or record an explicit design reason for retaining this. All date/platform fields and the action row still fit.
2. **Filter reference calendar alignment drifts from the app.** In `release/reference-360.png` (Hamnet) and `crops/reference-tentative-360.png`, the calendar is vertically centred between the date and Netflix lines. In `editor/row-360.png` and its crop, it aligns with the first date line. Check the remaining reference frame against the guide's first-line alignment and the corrected 10.4 editor reference.

The other opened frames show scrolling at their top/bottom edges, not clipped
controls. Floating menus/editor cover later list content intentionally, as recorded
in `docs/approved-looks.md`. The saved row remaining tentative while an unsaved
Confirmed/TBD draft is open is also intentional. No product/layout change was made
to resolve these findings in this reporting row.

Full-resolution observations (all opened with `detail: original`; relevant action,
row, reference and overlap crops were opened at 100% too):

LOOKED: release/release-360.png · Controls rest above ruled rows; first row reaches the bottom; no overlay; visible text whole.
LOOKED: release/release-390.png · Rows sit between rules; next row crosses bottom; no overlay; visible date and controls whole.
LOOKED: release/release-844-detail.png · Toolbar sits over the table; next title crosses bottom; header scrolled away; visible text whole.
LOOKED: release/release-1280.png · Rows rest under headings; Hamnet crosses bottom; no overlay; date, platform and columns whole.
LOOKED: editor/editor-360.png · Sheet rests on viewport base above dimmed list; header scrolled away; all fields and buttons whole, including base crop.
LOOKED: editor/editor-390.png · Sheet rests at bottom over the list; page intro above frame; text, date status and actions whole.
LOOKED: editor/editor-844.png · Popover floats over season rows; target row above frame but film named inside; all fields and Save fit, including base crop.
LOOKED: editor/editor-1280.png · Popover floats over later rows; lower list continues; saved note and dialog text whole; overlap crop confirms complete base.
LOOKED: release/filtered-360.png · Gold filter sits above count and ruled row; row continues below bottom; labels whole, no overlay.
LOOKED: release/empty-844-detail.png · Empty panel rests below count; header scrolled away; full border, copy and Clear filters fit uncovered.
LOOKED: release/platform-360.png · Menu floats over heading and row; lower row continues; menu edges, choices and check whole.
LOOKED: release/release-menu-360.png · Menu floats over heading and row; lower list continues; menu text and check fit; edge crop confirms clear bounds.
LOOKED: release/long-platform-360.png · Wrapped platform control rests above row; release note crosses bottom; full filter label fits without overlap.
LOOKED: editor/confirmed-360.png · Sheet rests at bottom over list; intro scrolled away; Confirmed selection, date, platform and actions whole.
LOOKED: editor/tbd-360.png · Shorter sheet rests at bottom over saved row; date status absent; empty date, explanation and actions whole.
LOOKED: editor/suggestions-360.png · Suggestions panel sits within sheet above actions; background heading partly covered; Netflix and all controls whole.
LOOKED: editor/saving-360.png · Disabled fields sit above spinner at sheet base; nothing clipped; labels readable but selected status no longer distinct.
LOOKED: editor/failed-360.png · Failure notice rests above action row inside sheet; background covered; error, draft and Save whole.
LOOKED: editor/row-360.png · Tentative note wraps above row base and season heading; intro scrolled away; icon/date, platform and marks whole, confirmed in crop.
LOOKED: release/reference-360.png · Four ruled rows rest above footer; nothing cut or covered; text whole, but Hamnet calendar sits between two release lines.
LOOKED: release/reference-1280.png · Table rests above footer; frame complete, no overlay; labels, dates and all four rows readable.
LOOKED: release/filtered-844-detail.png · Toolbar rests over count and first row; Hamnet crosses bottom; header scrolled away; visible controls/text whole.
LOOKED: release/platform-1280.png · Menu floats over heading/first row; all frame edges clear; choices, count and second row whole.

DECISION: Preserve the existing test state rather than reseeding before a retry; the brief requires one original full-run failure report for 10.R.
DECISION: Select a dedicated editor output directory rather than overwrite 10.4 evidence; this keeps source comparisons available without changing app behavior.

Owner-only migration approval, real-phone verification and normal release remain
the later handoff described in the feature brief. They are outside this completed
reporting task; 10.R is not started.

## Fresh-eye follow-up (10.5, 2026-11-11)

The checker inputs in `/tmp/autorun-fresh-hhZRHU/` were all opened at original
resolution, including both identical crop copies. This follow-up changes only
the reference and screenshot evidence; application behavior stays as measured
above. The seven original test failures and the saving-status visual finding
remain assigned to 10.R. The calendar reference finding is now fixed.

| Checker finding | Disposition |
|---|---|
| 01: score line sliced at the crop's top | Real capture fault. Replace the hard-coded crop with element screenshots of the entire Hamnet row and, separately, its complete release control. The new row contains all score lines and both row edges; the release detail contains no neighbouring score text. |
| 01 and 02: Netflix wraps with a trailing separator on the preceding line | Retained. The phone reserves a separate column for the mark buttons; its release control is 205px wide inside the 328px row. The apparent empty width lies beneath the marks, outside the film column. At 390px the same full note fits on one line. This is shared app/reference wrapping, rather than an early break in a full-width line; recorded in `docs/approved-looks.md`. |
| 01 and 02: calendar centred between two date lines | Real reference fault. Extend the existing `#wl-editor` first-line alignment rules to `#wl-filter`; guide/reference version is v1.5.2. The new regression failed before the fix at 360px (10px offset, limit 4px), then passed at 360/390/844/1280. |
| 02: three uneven sort rows, selected background inset differs from label inset | Retained. Six whole labels wrap as the guide specifies; at 360px they need three rows. All labels have 12px inner padding. The selected white background extends to the track's 3px inset, so comparing its edge with an unselected label compares background and text, not unequal label padding. Added to approved looks. |
| 03: exact duplicate of 01 | Real evidence duplication, not a second UI state. New primary evidence consists of three distinct views: full frame, full row and release-only detail. Their dimensions and hashes differ. The checker copies are preserved as original inputs. |
| 03: repeated clipping/wrapping/alignment findings | Same image and dispositions as 01: clipped-neighbour capture replaced, first-line calendar corrected, film-column wrapping retained with a reason. |

Targeted commands (no full-suite retry):

```sh
OSCAR_TEST_PORT=3105 WATCH_RELEASE_OUT=screenshots/phase-10/10.5/fresh-check/before npx playwright test tests/screens/watch-release.spec.ts --project screens --grep 'open the binding 10.1 reference'
npm run typecheck
npx eslint tests/screens/watch-release.spec.ts
npx vitest related src/lib/watch-list.ts src/components/segmented/Segmented.tsx --run --project unit --maxWorkers=2
OSCAR_TEST_PORT=3105 WATCH_RELEASE_OUT=screenshots/phase-10/10.5/fresh-check/after npx playwright test tests/screens/watch-release.spec.ts --project screens --grep 'open the binding 10.1 reference' --last-failed
```

Results: baseline failed on the new calendar regression; final targeted reference
case passed at all four widths (26.0s including setup). Typecheck, changed-file
ESLint and **41 related unit tests passed**. Logs: `checks/fresh-reference-before.log`,
`checks/fresh-reference-after.log`, `checks/fresh-typecheck.log`,
`checks/fresh-lint.log`, `checks/fresh-unit.log`. The earlier full unit suite/build
still cover unchanged application sources. Test servers **2073046** and **2074254**
stopped; port 3105 is free. Full phase failures were not rerun or reclassified.

New gallery: `fresh-check/after/` with `reference-{360,390,844,1280}.png`,
`reference-<width>-row.png` and `reference-<width>-release.png`.
`fresh-check/before/` preserves comparable pre-fix frames. The three 360px
views are respectively **360×1603**, **328×198** and **205×42**, with different
MD5 hashes. These new images supersede the old clipped reference detail for
review; the original one-run images remain historical evidence.

LOOKED: fresh-check/after/reference-360.png · Four ruled rows sit above footer; complete frame, no overlay; text whole and calendar on first date line.
LOOKED: fresh-check/after/reference-390.png · Rows sit between rules above footer; nothing cut or covered; full date/platform note fits on one line.
LOOKED: fresh-check/after/reference-844.png · Table rests above footer on the full reference canvas; frame complete; rows, labels and notes whole.
LOOKED: fresh-check/after/reference-1280.png · Table sits beneath toolbar above footer; no edge cuts or overlays; all row and release text whole.
LOOKED: fresh-check/before/reference-360-row.png · Whole row rests between rules; scores uncut; calendar sits between date lines, establishing the before fault.
LOOKED: fresh-check/after/reference-360-row.png · Whole row rests between rules; all scores and marks fit; calendar now on first date line, platform below.
LOOKED: fresh-check/after/reference-360-release.png · Calendar sits beside first date line; platform below; control edges clear; no neighbouring text sliced.
LOOKED: fresh-check/after/reference-390-row.png · Whole row sits inside both rules; marks at right; single-line release and all scores whole.
LOOKED: fresh-check/after/reference-844-row.png · Full row spans table columns between rules; no overlays or edge cuts; scores and release readable.
LOOKED: fresh-check/after/reference-1280-row.png · Full row spans columns between rules; all edges, marks, scores and release text whole.

DECISION: not fixed the 01/02/03 platform wrap and trailing inline separator, because release notes stay in the bounded film column beside the marks; expanding beneath them would change the shared row layout. Added to approved looks.
DECISION: not fixed the 02 three-row sort and selected-background inset, because whole labels wrap as specified and every label has equal inner padding; the background's edge is intentionally nearer the track edge. Added to approved looks.
