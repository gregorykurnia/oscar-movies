# Task 10.3: Watch list release sort and filters

Scope: `Watch list → Sort by → Release date`, then the Platform and Release menus immediately below. Built to guide v1.5 and the 10.1 reference. The tentative-date editor and row wording remain task 10.4.

The address combines sort, platform, release and Show all. Unknown choices are ignored. Release dates sort earliest first, followed by platform-only TBD notes, then empty notes; title breaks ties. The season retains Oscar-stage order. Filtering hides the season and drag handles, gives a filtered/total count and offers Clear filters while retaining the sort and Show all.

DECISION: Read all currently wanted platforms in recency order rather than reusing the editor's capped history; this preserves the latest spelling and includes every filter choice.
DECISION: Anchor phone menus to the filter group's left edge rather than allowing the second menu to extend past the screen; desktop menus remain under their buttons.

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

All final images below were opened at original resolution, with additional 100% crops of the count, phone menu edge, wrapped platform control and laptop menu. Before images were compared at all four widths. Final hunt: no remaining unintended clipping, overlap, unreadable text or reference-color/width mismatch; lower-row continuation and scrolled-off headers are described explicitly.

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
