# Oscar Movies: Design Decisions

## Step 5: direction chosen (2026-10-22)

**Chosen: A, Spotlight (the original)**, `design/directions/a-spotlight/`. Step 6 expands only this one.

- **Round 1:** A Spotlight, B Board, C Scorecard. The owner preferred A's style.
- **Round 2 (the one extra round):** variants of A. A1 added C's precursor strip, A2 gave the favourite a feature block, A3 led each row with the % over a gold fill. The owner kept the original A, unchanged.
- **Reason, in terms of the brief** (the owner gave none in words; this is Claude's reading, to confirm at Step 6): A is the calmest and roomiest of the options, with "roomy rows on the race" and the most "modern, beautiful UI" feel. It shows one category at a time, with each tab showing that category's leader, and keeps the precursor results as plain text rather than a chart-like strip.
- **What carries into the design guide:** Geist; warm white paper (#FCFBF9) with stone greys; deep Oscar gold only for the leader's %, the gold row lines, the active tab, the stage dot and the active marks; large word tabs with the leader under each; large light-weight % numerals with a thin gold line under each row as wide as the chance to win; the "why" opening inline under the row on a gold wash; round watched and want-to-watch marks.
- **Not taken:** the precursor strip (A1/C), the feature block (A2), the row fill (A3), the sidebar and four-column board (B).
- **Placeholders in the direction file,** to design properly in Step 6: the logo mark, the simplified flag drawings, and the phone menu (only a button in the direction).

## Brief items confirmed

- **Oscar gold as the one accent:** accepted with A.
- **Voice** (plain, brief, warm, no jokes): still inferred; confirm at Step 6.

## Step 6: design guide and preview drafted (2026-10-22)

`DESIGN_GUIDE.md` and `design-preview.html` written from A, waiting for the owner's approval (then v1.0).

- **Placeholders from Step 5, now designed:** the logo mark (an abstract statuette in gold on an ink square, guide §10); the flags (`country-flag-icons` 3:2 SVGs, MIT, with a hairline edge, guide §7); the phone menu (full-screen sheet, guide §6.1).
- **Changed from the direction:** the inactive tab names and the leader lines under the tabs are darker (`--ink-subtle`, `--ink-muted`), because the direction's faint grey (2.4:1) is too light to read; the marks are 36px (40 on phone) with a 44px hit area instead of 34px.
- **Added:** `--ink-subtle`, `--gold-soft`, `--error`, `--error-wash` and a few line, shadow and motion tokens. Error red is the only hue besides gold and the flags.
- **Approved 2026-10-22:** the owner approved the guide and preview as they stand; the guide is frozen as v1.0. The voice (plain, brief, warm, no jokes) and the reading of why A was chosen stand as written, since the owner approved them without changes.
