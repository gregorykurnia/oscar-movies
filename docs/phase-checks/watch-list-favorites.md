# Phase 11 Watch list favorites checks

2026-11-21 · Task 11.3 · Source `23374ea05ef05d2c9a96da369d1d1ba72a4648f5`.

Open **Watch list** from the main navigation. The Starred chip sits beside Platform and Release. The saved view can also be opened directly at `/watch-list?sort=mine&starred=1`.

## Run and evidence

The Playwright setup verified `app_meta.db_branch = test` over both Neon connections before starting Next on port 3100. It used the source-hash-matched `.next-test` build and the catalogue provider fixtures. Each Playwright command ran with one worker and zero retries. The separate output directories preserved the full-suite trace when the gallery ran. The gallery restored its original fixture marks and its new PNGs were moved to the 11.3 directory, preserving the 11.2 gallery.

```sh
npm run test:e2e -- --output screenshots/phase-11/11.3/e2e-artifacts
npx playwright test tests/screens/watch-stars.spec.ts --project screens --output screenshots/phase-11/11.3/gallery-artifacts
npm run typecheck
npx vitest run --project unit src/lib/watch-list.test.ts src/components/watch-list/StarButton.test.tsx src/app/actions/watch-list.test.ts
git diff --check
```

For the reference images, standalone Playwright Chromium rendered `#wl-filter` in `design-preview.html` at 390px in Phone mode and at 1280px in Desktop mode. The reference predates the star controls. `DESIGN_GUIDE.md` §8.3 describes their appearance and placement. The 390px and 1280px live frames retain the reference’s outlined add field, sort above filters, and ruled film sections.

A temporary read-only spec ran once with `npx playwright test tests/screens/watch-stars-offline.Mt5dIWGI.spec.ts --project screens --output screenshots/phase-11/11.3/offline-artifacts`. It opened `/watch-list?sort=mine`, reached the first Want to watch Star by Tab at 390px and captured the focus ring. It then resized to 1280px and used `context.setOffline(true)` to capture the notice and compare the Star and Want to watch controls. The spec was removed after the run. Logs, screenshots and traces are under `screenshots/phase-11/11.3/`.

The first Chromium invocation received SIGTERM after reporting 54 passes (`e2e-interrupted.log`). A detached restart hit the port guard before either suite ran any tests (`e2e-port-in-use.log`, `gallery-port-in-use.log`). Host inspection verified that PID `2275424`, the server started by the interrupted run, owned port 3100. The process group was stopped and the port was checked before running the suites again. Playwright teardown stopped the servers for the completed Chromium, gallery and offline runs (PIDs `2278737`, `2288586`, `2289278`). A final host listener check found port 3100 free.

## Results

| Check | Result | Evidence |
|---|---|---|
| TypeScript and focused unit tests | Passed, **85 tests in 3 files** | `typecheck.log`, `unit.log` |
| Full Chromium suite | **150 passed, 1 failed** in 10.6 minutes. The Phase 11 favorites test passed. | `e2e.log`, `e2e-artifacts/` |
| Watch list screenshot gallery | **1 passed** in 21.6 seconds. Used 360×800, 390×844, 844×390 and 1280×900. | `gallery.log`, 20 PNGs |
| Reference and focus/offline captures | Reference rendered in Chromium. **1 focused check passed**, and exposed the offline behavior below. | `reference.log`, `offline.log`, 5 PNGs |

The full Chromium suite covered both sections, reload and direct links, combined filters, filter clearing, empty states and unstarring from a filtered view. The focused units covered the filter rules, the save action and retry. The gallery checked horizontal fit, title/release geometry across the star change, non-overlapping actions, the 44px Star target, and contrast on the winning and out rows. On a full gold wash the text and icon outline measure **4.77:1**. The gold fill measures **2.88:1**, so the darker outline is needed to meet the icon threshold.

## Failures for 11.R

- `tests/e2e/phase-1.spec.ts:71` · “marking a film watched shows on every page it appears on.” At line 117, Playwright timed out with `Error: element(s) not found` looking for The Secret Agent’s pressed Want to watch button. The accessibility snapshot shows the film and its pressed mark. The row helper chooses the nearest ancestor with any `aria-pressed` button, which now resolves to the inner block containing Star. Scope the assertion to the full film row in 11.R. Evidence is in `e2e-artifacts/phase-1-marking-a-film-wat-5b802-on-every-page-it-appears-on-chromium/`.

## Visual evidence

| Frame | Inspection |
|---|---|
| `filtered-top-390.png`, `filtered-390.png` | The active Starred chip and Clear filters fit beside or below the other filters. The 390px opening view ends after the queue film’s release line, above the row actions. The scrolled view shows both actions and the Want to watch count, with the bottom cutting into Anora’s row. |
| `filtered-toolbar-844.png`, `filtered-844.png` | Landscape fits all filters in one line. At that scroll position the queue actions cross the bottom edge. Scrolling to the queue heading shows the complete film row down to its bottom rule, with remove and Starred separated. |
| `filtered-1280.png` | The filtered queue is fully visible. Its date and both actions sit on one line above the rule. The right-hand columns and marks fit. The lower edge cuts into Anora’s row after the heading and count. |
| `baseline-row-360.png`, `tight-360.png`, `tight-row-360.png`, `unstarred-row-360.png`, `saving-row-360.png` | Comparing the CSS-reconstructed baseline and the live states, the long title wraps to the same seven lines and the date/platform to two. The live base has a separate action line. Queue and Star fit side by side, and the disabled saving frame shows the muted star on that same line. |
| `winner-row-360.png`, `winner-unstarred-360.png`, `last-queue-row-360.png`, `last-queue-starred-360.png`, `last-want-row-360.png`, `last-want-starred-360.png` | First and last rows in both lists have both star states. The controls sit below each date line and above the stage and nominations. Mark circles stay beside the heading. Winner wash remains inside the row rules. Names and final digits fit. |
| `excluded-390.png`, `empty-390.png` | Both 0-of-2 counts sit over full empty-state panels. The combined-filter explanation wraps in the panel, and both reset buttons are clear above the footer. The top edge intersects the preceding add field because these frames are scrolled. |
| `failure-360.png`, `failure-base-360.png` | The toast sits above the bottom edge with the full title, Try again and close visible. The row above shows the reverted outline Star. The seven-line toast title makes the toast cover Hamnet’s lower controls and most of the next section heading. |
| `focus-row-390.png`, `offline-1280.png`, `offline-row-1280.png` | Tab draws a whole gold ring around Star without touching Queue or the stage line. The offline notice sits below the page heading. The pressed bookmark is muted, and the adjacent Star remains enabled in the fully visible Conclave row. |

Direct-link evidence is in the `filtered-*` captures. Unscaled edge and overlap crops are `queue-edges-1280.png`, `queue-overlaps-390.png`, `toolbar-edge-844.png`, `tight-base-360.png` and `focus-overlap-390.png`. The preceding reference captures are `reference-390.png` and `reference-1280.png`.

### Visual findings for 11.R

- **Offline Star still enabled.** The browser’s offline notice says marks can’t be saved. The usual Want to watch button disables, while the new Star stays enabled. `offline.log` records `Star enabled while offline: true`.
- **Long-title failure toast covers the next film’s controls.** At 360px the 217px-tall toast leaves a broad blank column under Try again while the title wraps into seven lines. Review the long-title layout while retaining the full title and a reachable Retry.
- **Filtered header copy describes a different view.** The direct link selects My order and hides the season, while the subtitle still says the films are sorted by release date and followed by season contenders. The mismatch is visible at 390px and 1280px.

Guide §15 sign-off and all fixes remain with 11.R.
