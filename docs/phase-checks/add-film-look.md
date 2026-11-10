# Task 9.6 visual verification

Verified 2026-11-10 against implementation commit `4ad4f66`.

- Recaptured the affected states at 390×844, 844×390 and 1280×900 with `npx playwright test tests/e2e/watch-list.spec.ts --project chromium --grep 'add-film look'`: all 3 scenarios passed; unchanged guarded test build reused.
- Opened 28 viewport screenshots and 6 panel crops at original resolution in `screenshots/phase-9/`. The runner's session-record matching pattern recognizes all 34 literal image paths. Earlier views used variable/template paths, which that pattern did not recognize; the runner itself was not changed.
- Checked empty, loading, offline, provider failure, unknown year, duplicate choice, long title, saving, failed save and saved row, including the selected film and its action together on the turned phone. The scenarios also check overflow, covered controls, page errors, and focused accessibility on upright phone and laptop.

Faults found during the implementation and confirmed corrected: landscape fallback actions below the viewport; gold focus styling on an invalid year; countryless titles out of alignment and unsupported award facts shown as zero. No additional application defects found in this recapture. Result lists continue below short viewport edges and the local search popover covers underlying rows by design; the panel crops confirm whole text, clear actions and intact frame edges.

Earlier task evidence remains valid: typecheck, changed-file lint, 47 related tests, 1,124 full unit tests, guarded production build and 21 smoke/Watch list browser tests passed. This follow-up changes documentation only. Full phase checks remain task 9.7; production remains untouched.
