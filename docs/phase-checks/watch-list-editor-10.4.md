# Task 10.4: fresh-eyes follow-up

Source: `be7e5ce`, reviewed 2026-11-11. The checker received the **reference** images, not the current app captures. Opened both supplied copies at original resolution in `/tmp/autorun-fresh-2mBGYr/`.

| Finding | Assessment |
|---|---|
| Phone: Cinema XXI splits between lines | Real reference fault. Keep the platform together when it fits, matching the implemented row; align the icon with the first date line. |
| Phone and laptop: one chance figure is gold | Real reference inconsistency in the My order editor frame. Use neutral ink, matching the list's existing treatment outside a chance sort. |
| Phone and laptop: Out 3 Oct versus 12 Dec 2026 | Intentional: guide §8.3 distinguishes past/current-year dates from upcoming dates. |
| Phone and laptop: compact 87 · 4 of 4 score notation | Intentional: guide §7 specifies the average and available-source count in this compact form; movie-page score tiles provide labels. |
| Laptop: popover hides a later film's title | Intentional: guide §8.3 specifies a floating popover rather than an inline panel. |
| Laptop: saved TBD versus a date in the editor | Intentional unsaved draft: Save commits it; Cancel keeps the saved row. |

The four intentional choices are also recorded in `docs/approved-looks.md`. Guide/reference revision v1.5.1 corrects the two reference defects without changing the app's behavior or tokens.

Focused regression screenshots and row crops: `screenshots/phase-10/10.4/fresh-check/`, at 360, 390, 844 and 1280 pixels. `before-*` preserves the old reference. The canonical `screenshots/phase-10/ref-wl-editor-{360,390,1280}.png` files now contain the corrected reference.

Checks:
- `npm run typecheck`: passed.
- `npx eslint tests/screens/watch-editor.spec.ts`: passed.
- `npx vitest related src/components/watch-list/ReleaseEditor.tsx src/components/watch-list/WatchListPage.tsx src/lib/watch-list.ts --run --maxWorkers=2`: 33 passed.
- `OSCAR_TEST_PORT=3104 npx playwright test tests/screens/watch-editor.spec.ts --project screens --grep 'release editor reference'`: four cases failed before the fix (360px venue spans two lines; chance color wrong at all widths); four passed with `--last-failed` after the fix.
- The 844px drawing initially cropped the popover's base because narrower film columns make rows taller than the reference's fixed 1100px canvas. Extended that capture canvas to include the complete drawing, added an editor/frame boundary assertion, and reran only the 844px case: passed. This full-page reference drawing is distinct from the actual 844×390 app, checked in the original task.
- Opened all final images and row/base crops at original size, and compared the 360px/1280px before/after frames. No app source changed; the task's already-passing full unit/build/browser-flow results remain applicable.

LOOKED: reference-360.png · The sheet rests on the frame base over dimmed film rows; Cinema XXI is whole on the next line, all chance figures are neutral, and every editor label and action is inside the sheet.
LOOKED: reference-390.png · Cinema XXI fits beside its date; the sheet covers lower rows, with whole fields, status and actions and no clipped panel edges.
LOOKED: reference-844.png · The complete popover sits under Hamnet and in front of the fourth row; the expanded drawing includes its base and Save; all editor text is whole.
LOOKED: reference-1280.png · The popover intentionally hides the fourth film's title while its flag and result remain beside it; the first chance is neutral, the venue is whole, and all editor text and edges are inside the frame.
LOOKED: reference-360-crop-row.png · Calendar aligns with the first date line; Cinema XXI stays together below it; marks remain beside the title and no row text is cut.
LOOKED: reference-390-crop-row.png · Venue and date fit one line under the scores; neutral chance and nomination figures fit above the lower rule.
LOOKED: reference-844-crop-row.png · The score average wraps whole above the release line; film, result columns and marks have clear space between them.
LOOKED: reference-1280-crop-row.png · Scores and release text sit under the title; 34% is neutral ink and no text touches another column or the frame edge.
LOOKED: reference-360-crop-base.png · Clear, Cancel and Save sit above the rounded sheet base, with whole labels and no overlap.
LOOKED: reference-1280-crop-base.png · Platform ends above the action row; Clear, Cancel and Save and the popover base are intact.

DECISION: not fixed the phone/laptop date-format difference, because guide §8.3 uses Out for released dates and includes the year for upcoming dates.
DECISION: not fixed the phone/laptop compact average/count notation, because guide §7 specifies it and the movie-page tiles supply the full labels.
DECISION: not fixed the laptop popover hiding the next film, because guide §8.3 explicitly places a floating editor over later rows.
DECISION: not fixed saved TBD versus the editor's date draft, because Save commits the draft and Cancel keeps the saved release unchanged.
