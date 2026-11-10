# Task 9.6 visual verification

Verified 2026-11-10; review follow-up starts from `107cb29`. Screenshots and original-size panel crops are in `screenshots/phase-9/` (gitignored). Explicit literal paths make the 34 image views recognizable to autorun; its detector was not changed.

## Review fixes

- Local no-match content now uses an inline bordered panel, so film titles, marks, section counts and rules cannot peek out from underneath it. The overlap regression failed before the fix (`369.69px` heading top versus `432.69px` action bottom).
- Phone sort links wrap; pointer and keyboard share one active catalogue result; overview wrapping avoids the lone last word; confirmation has its own heading and instructions; manual edits update the add box.
- Saving retains a spinner plus visible “Adding…” and readable field text. Native disabling exposed focus loss after duplicate/failure responses: focus now returns to the checked duplicate or retry action and brings the whole panel into view, with an assertion for space below Retry.
- The catalogue screenshot keeps its input label in frame. DOM probing found no element at the detached blue ticks; original landscape copies had seven blue edge pixels each. Laptop inspection revealed the same residue at old count positions after layout shifts. The count now contains its paint with a small ink inset; screenshot checks reject blue pixels over bare page space at that edge. Captures also use a neutral pointer and two frames after layout.

The provisional reference refinements use existing design pieces. They are recorded in guide §8.3 and the build plan's Waiting for the owner list for Phase 9 review; no owner response blocks this task.

## Items deliberately retained

| Original report | Decision and evidence |
|---|---|
| TMDB spacing (02–04, 09–11) | Contiguous DOM text, normal letter spacing and the approved Geist font; no inserted gap or alternate typography. |
| Unequal overview row heights (02) | Overviews wrap naturally within two lines; pretty wrapping removes the lone last word without truncating titles or forcing uniform heights. |
| Grey error body (06) | `--ink-muted` on `--error-wash` measures 4.68:1. Paused fields measured 4.58:1 on track and were strengthened to ink anyway. |
| Empty flag slot (07) | Required by guide §8.3; both titles align, and no nationality is invented. |
| Score dashes plus “No scores yet” (07) | Existing specified ScoreLine: the dashes identify missing sources and the caption summarizes coverage. |
| Darker hovered sort item (10) | Intended hover emphasis, distinct from the selected link's surface, weight and `aria-current`; neutral-pointer captures remove incidental hover. |
| Space below valid Title (11) | Only the invalid year gets an error, beneath its own field; no filler hint or error is added to Title. |
| Vertical page continuation (08–09) | The page scrolls to the active task on a short viewport; later rows may continue below it. Input labels and relevant actions remain whole. |

## Validation

- Typecheck, changed-file lint and 16 related component tests pass after the focus repair; the full 99-file/1,126-test unit suite passed before that focused repair.
- The guarded test-only production build passes. The smoke/Watch list run passed 20 cases and exposed the phone focus regression; that failed case passed with `--last-failed` after repair. Untouched passing checks were retained.
- Final three-size gallery verification passes, covering overlap, single active option, synchronized drafts, whole phone sort choices, retry focus/gutter, stray text paint, page errors, and focused accessibility on phone and laptop. All 34 final viewport images/panel crops were reopened at original size after the fixes.
- Full phase checks remain task 9.7. No production data, settings or release changed.
