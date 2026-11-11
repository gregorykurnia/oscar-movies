# Task 10.3: Watch list release sort and filters

Scope: `Watch list → Sort by → Release date`, then the Platform and Release menus immediately below. Built to guide v1.5 and the 10.1 reference. The tentative-date editor and row wording remain task 10.4.

The address combines sort, platform, release and Show all. Unknown choices are ignored. Release dates sort earliest first, followed by platform-only TBD notes, then empty notes; title breaks ties. The season retains Oscar-stage order. Filtering hides the season and drag handles, gives a filtered/total count and offers Clear filters while retaining the sort and Show all.

DECISION: Read all currently wanted platforms in recency order rather than reusing the editor's capped history; this preserves the latest spelling and includes every filter choice.
DECISION: Align menus with their own triggers and switch to right-edge alignment when needed, rather than anchoring both phone menus to the group; the fresh check found the latter hid which filter opened them.

## Validation

- TypeScript and changed-file ESLint passed; focused unit checks cover parsing, normalization, ordering, date boundaries, counts and keyboard behavior.
- The existing test-database rollback case passed with an assertion excluding unwanted platforms.
- Full unit suite: **100 files / 1,150 tests passed** (`npm test`; a two-worker run also passed).
- Guarded production build (`npm run build`, `.next-test`, Neon `test`) and **19/19 smoke/Watch list behavior checks passed**: `npx playwright test tests/e2e/smoke.spec.ts tests/e2e/watch-list.spec.ts --project chromium --grep-invert 'add-film look'`. Phase 9's unrelated Add-film screenshot cases were excluded. Full phase-wide checks remain 10.5/10.R.
- Diff review: checked date order, unknown addresses, filtered drag/season suppression, preserved address choices and test-only database targeting. The keyboard check found the missing space in the button's accessible name; fixed with an explicit label.

The first combined browser invocation was rejected by the e2e guard's two-spec limit. Smoke and Watch list run together; the focused gallery runs separately. The initial full-unit command ended with SIGTERM before reporting results; its complete retry is recorded below.

The first browser run was invalidated by another project's server taking port 3100 during the build: `EADDRINUSE` in our server log, and smoke saw `DEUS Team Space` with no `noindex, nofollow` header. Stopped only our runner (13 failed, one interrupted, five not run). Fixed `tests/e2e/global-setup.ts` to recheck the port after the build and wait for our child's `Ready in` message before probing HTTP. This prevents a different app answering the readiness probe. All direct database writes remained on the guarded test branch. The requested specs are rerun because none of that attempt tested our app.

## Look evidence

Gallery: `screenshots/phase-10/10.3/` (gitignored). Before frames are `before-{360,390,844,1280}.png`. The gallery opens `design-preview.html` in a browser and saves the 10.1 reference. It captures release sort, matching filters and no match at 360×800, 390×844, 844×390 and 1280×900; additional frames expose menu choices, the empty-state action, landscape controls and a long platform name. It checks page width, menu bounds, uncovered toolbar controls and uncaught page errors. All data changes use the guarded Neon test branch and restore its previous marks.

Final gallery: the corrected four-shape case passed (11.8s, build included in the 2.7m invocation). The long-platform-only recapture passed (2.3s); it now waits for the streamed heading and button to become visible before capture. The reference-only case passed (10.7s) with the design preview's sticky navigation hidden. Only affected frames were recaptured. The final type check caught `TS2339: Property 'remove' does not exist on type 'Node'` in reference capture cleanup; fixed using the parent's `removeChild`. The interrupted build's generated `next-env.d.ts` was restored to its tracked paths.

Final typecheck and changed-file lint passed. Completed check logs are preserved in the gallery's `checks/` directory (behavior, unit, database, gallery, long-platform, reference, typecheck and lint). Task servers were stopped by their owning setup/teardown; no production data or settings changed. Task 10.3 alone is complete; 10.4 onward remain unticked.

Visual findings fixed: active filters initially rendered white because conflicting utility classes survived `cn`; changed their surface/ink classes to exclusive branches. The new rendered-color assertion failed against that build before the fix. Desktop popovers initially inherited their button's maximum width, squeezing captions; they now retain the reference's 248px width, with a gallery assertion. Landscape detail frames now scroll the whole toolbar into view instead of targeting an already-visible sort link. Remaining bottom-edge row continuation and top-edge clipping in deliberately scrolled empty-state frames are normal scrolling, with the relevant controls and actions fully shown.

The first visual-fix retry correctly refused an occupied port. A subsequent rebuild ended with SIGTERM before capture; it left no owned server. Retried only the changed gallery, preserving the successful reference captures. The `--last-failed` cache was removed during the interrupted setup, so the retry selects the same single failed case explicitly (`tests/screens/watch-release.spec.ts:11`).

The initial images below were opened at original resolution, with additional 100% crops of the count, phone menu edge, wrapped platform control and laptop menu. Before images were compared at all four widths. That hunt missed the platform wrap, inconsistent phone heading/count placement, winner-wash bounds and ambiguous phone menu placement. The fresh-check follow-up below supersedes that initial assessment.

LOOKED: release-360.png · Controls rest on paper above ruled rows; next title crosses the bottom edge; no overlay; visible labels whole.
LOOKED: filtered-360.png · Gold filter sits above the count and first row; later rows are below the frame; text and controls uncovered.
LOOKED: empty-360-detail.png · Empty panel rests on paper; intro is above the frame; icon, copy and Clear filters are whole and uncovered.
LOOKED: platform-360.png · Menu floats in front of the section and first row; all choices fit inside its rounded edges and remain readable.
LOOKED: release-menu-360.png · Release menu floats above the row; every caption and check fits; no menu edge or text is cut.
LOOKED: release-390.png · Sort and filters sit above the ruled list; the next release note continues below the bottom; visible text is whole.
LOOKED: filtered-390.png · Gold filter and count sit above two rows; second row continues below the frame; no accidental overlap or clipped controls.
LOOKED: empty-390-detail.png · Scrolling cuts the top bar; empty card, explanation and Clear filters fit completely without overlap.
LOOKED: release-844-detail.png · Toolbar sits above the heading and first ruled row; the next title crosses the bottom; all main controls and text are whole.
LOOKED: filtered-844-detail.png · Filter and count sit above the matching row; next row crosses the bottom; no covering; control labels are whole.
LOOKED: empty-844-detail.png · Heading sits over the empty card; header is above the frame; icon, text and action are whole and unobscured.
LOOKED: release-1280.png · Toolbar rests above the table; the third row continues below the bottom; columns and text align without overlap.
LOOKED: filtered-1280.png · Gold filter sits above two complete rows; no edge cuts, overlays or incomplete text.
LOOKED: empty-1280-detail.png · Empty card sits below the count; its icon, copy and button fit fully; nothing covers them.
LOOKED: platform-1280.png · 248px menu floats over the heading and first row; captions and selected check fit whole inside its edges.
LOOKED: release-menu-1280.png · 248px menu floats over table content; every release caption is whole and readable; nothing clips the menu.
LOOKED: long-platform-360.png · Gold control wraps the full platform name above the count; the row note continues below the bottom; no horizontal clipping or overlap.
LOOKED: count-390-crop.png · Heading and full count sit above a continuous rule; all letters are whole with clear space between them.
LOOKED: platform-360-crop.png · Rounded menu edge and base sit over the row; captions stay inside; underlying text is intentionally covered by the popover.
LOOKED: long-platform-360-crop.png · Two-line platform label sits inside the gold control above Release and Clear filters; no cut text or collision.
LOOKED: release-menu-1280-crop.png · Menu base and rounded edges enclose every caption; it sits in front of table text without cutting its own labels.

## Fresh checker follow-up, 2026-11-11

Opened all twelve original copies in `/tmp/autorun-fresh-E8W1Qm` at original resolution before deciding. New captures go to `screenshots/phase-10/10.3/fresh-check/`; the historical before frames and binding reference remain intact.

| Original finding | Assessment and action |
|---|---|
| 01/02: past date omits year while coming dates include it | Retained: guide §8.3 explicitly omits the current year only for dates already out. The word “Out” distinguishes the two states. |
| 01/02: average/count has no label; 12: average wraps onto its own line | Retained: guide §7 prescribes the compact average/count notation and wrapping score groups. The entire average stays together and readable. |
| 03/04/05/08: 2099 fixture; 04/07/12: release in 2020 before a 2025 film | Corrected new gallery fixtures: coming means thirty days ahead in Jakarta; the past date is October 2025. Historical before frames are not rewritten. |
| 03: lower Hamnet scores cut by viewport; 06: no specific fault supplied | Historical viewport boundaries, with ordinary vertical scrolling. Added phone detail frames to show controls and complete main-row content; 06 has an intact header, field and sort. |
| 04/07/12: winner wash extends beyond list rule | Fixed the shared row's negative margins and balancing padding: content keeps its alignment and the wash now stays inside the list edge. |
| 04/07/12: Won appears on Want to watch | Retained: Want to watch accepts films from any year, including an unwatched past winner; it is separate from the live-season section. |
| 07: Cinema XXI splits; calendar sits between lines | Fixed: keep a platform together when it fits one line and align the calendar with the first date line. Very long platforms may still wrap. |
| 08: heading/count position changes across states | Fixed: count always starts below the heading on phone, matching the reference. Desktop retains the single line. |
| 09: two Clear filters actions | Retained: the reference puts one with the active filters and another in the empty state so either context can recover. |
| 09: empty card's bottom closure cut by capture | Fixed capture: center the panel and assert that all four edges have viewport clearance. |
| 10/11: menu obscures row text, with row marks visible beside it | Retained: the bounded, floating menu is intentionally in front of the list; the visible marks remain row controls outside the menu. |
| 11: Release menu appears under Platform | Fixed: anchor to its own trigger and align its right edge when the normal left alignment would overflow the phone. |

The new menu placement unit case failed before the fix, then all 17 related unit tests passed. Added rendered geometry checks for phone count position, winner/list bounds, intact Cinema XXI text, calendar alignment with the date, complete empty-card edges and menu/trigger alignment. The first follow-up gallery was safely refused on an occupied test port; its retry builds against the guarded Neon test branch.

DECISION: not fixed 01/02 date shorthand and score notation, or 12's whole average on a separate line, because guide §7/§8.3 explicitly defines these formats and permits score wrapping.
DECISION: not fixed historical 03–06 fixture years or bottom-edge continuation, because before pictures must remain faithful; current fixtures are corrected and new detail frames show whole main-row content. 06 supplies no additional fault.
DECISION: not fixed Won on Want to watch in 04/07/12, because any-year films and past winners can be wanted and unwatched; the inconsistent release fixture is corrected separately.
DECISION: not fixed 09's two Clear filters actions or 10/11's occluded underlying rows, because the binding reference deliberately supplies both recovery locations and a floating menu in front of list content.

Follow-up validation: typecheck and changed-file ESLint passed; 17 related unit cases passed. The complete unit run verified 1,150 cases and timed out only `src/app/styleguide/Styleguide.test.tsx > has one h1 and the stress switch reflects the address` (`Test timed out in 5000ms`); that case passed in an isolated retry at the unchanged timeout. The guarded production build completed. The first gallery attempt refused an occupied port; the build attempt refused it again afterwards and also emitted a Neon idle-client `Error: Unhandled error. ()`. A cached retry then passed the complete corrected four-shape gallery in 20.8s (30.3s including setup). No write flow or data query changed, so the original 19 behavior checks remain applicable; the shared winner-row style will also be covered by the already scheduled phase-wide check.

Final captures and 100% crops were reopened at original resolution. No additional unintended layout fault was found; intentional popover coverage and normal viewport continuation are recorded below. Logs are saved in `fresh-check/checks/`.

LOOKED: release-360.png · Count stays below heading; winner wash meets the rule; Cinema XXI is whole on the next line with the calendar by the date; later rows below frame.
LOOKED: release-360-detail.png · Two complete main rows sit within ruled edges; calendar stays on the first line; lower Hamnet content continues below the frame.
LOOKED: release-390.png · Count is below heading; winner wash is inside list bounds; full date/platform share a line; next row continues below frame.
LOOKED: release-390-detail.png · Three complete rows sit under the controls; date icons align with first lines; the next row begins at the bottom without covering text.
LOOKED: filtered-360.png · Gold filter and count sit above the first row; its results continue below the bottom; control text is whole and uncovered.
LOOKED: filtered-390.png · Count remains below heading; first row is complete; next row continues below bottom; no overlaps.
LOOKED: empty-360-detail.png · Scrolling clips the upper toolbar; dashed card closes with space below it; icon, copy and action are whole and unobscured.
LOOKED: empty-390-detail.png · Add field is partly above the frame; empty panel and bottom border fit fully; all panel text and action are whole.
LOOKED: platform-360.png · Menu floats over heading and row; every menu label is whole inside its rounded edges; underlying row marks stay outside the menu.
LOOKED: release-menu-360.png · Menu's right edge aligns with Release; its whole labels sit in front of the heading and row; nothing cuts the menu itself.
LOOKED: long-platform-360.png · Gold control wraps the whole name above the count; row note continues below bottom; no sideways clipping or control overlap.
LOOKED: release-844-detail.png · Toolbar rests above the table; wash meets the list's left edge; date/platform text is whole; next title crosses the bottom.
LOOKED: filtered-844-detail.png · Controls and count sit above one complete matching row; next row starts at bottom; no unintended covering.
LOOKED: empty-844-detail.png · Heading sits above a fully enclosed empty panel; header is above frame; icon, copy and Clear filters are whole.
LOOKED: release-1280.png · Wash starts at the list rule; columns and main rows align; third row continues below bottom; visible text is whole.
LOOKED: filtered-1280.png · Gold filter rests above two complete rows; all text fits; no cut edges or covering.
LOOKED: empty-1280-detail.png · Card sits below heading and count with its full bottom border visible; copy and action fit; top bar is above frame.
LOOKED: platform-1280.png · 248px menu floats from its trigger over the table; captions and check stay whole inside its edge.
LOOKED: release-menu-1280.png · Menu sits under Release in front of the table; captions fit whole; no clipped menu edge.
LOOKED: release-wrap-crop.png · Wash is bounded by row edges; calendar is beside the first date line; Cinema XXI is whole below; no text overlaps.
LOOKED: menu-anchor-crop.png · Release trigger and popover share a right edge; captions remain inside; underlying row text is intentionally behind the menu.
LOOKED: empty-base-crop.png · Clear filters sits above the closed dashed base with clear padding; no cropped border, text or overlap.
