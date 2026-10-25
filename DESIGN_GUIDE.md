# Oscar Movies: Design Guide

**Status:** v1.1 (2026-10-25). v1.0 (2026-10-22) was approved by the owner; v1.1 adds the Phase 7 pieces for the owner's requests of 25 October (one flag per film, the grid's Oscars sort, strong signals, the Watch list's add box, drag order and release dates, and an award's all-years page), all marked "v1.1" in `design-preview.html`. Tokens are unchanged. Changes go through a session that updates this guide and `design-preview.html` together and bumps the version. **Visual reference:** `design-preview.html` (open it in a browser). **Companions:** `PRODUCT_PLAN.md` (what), `IMPLEMENTATION_PLAN.md` (how). **Built from:** direction A, Spotlight (`design/directions/a-spotlight/`, `design/decisions.md`).

> For whoever implements this (human or model): this guide is binding for every page. When a page needs something not covered here, build it from the existing pieces and the tokens. Don't introduce a new look. Run §15 before a phase is marked done.

## 1. Personality

**The idea:** a calm, warm, modern page where the race reads at a glance, like a well-set results sheet. Type, numbers, flags and one gold do all the work; there are no posters or film artwork (declined in the product plan).

**Three qualities:** calm (lots of air, few lines, no boxes around everything), warm (warm white paper and stone greys, never blue-grey), precise (tabular figures, exact counts, "–" for anything unknown).

**Signature elements** (what makes it look like this app):
1. **Large light-weight % numerals** for the chance to win, with the % raised and muted; the leader's in gold.
2. **The gold chance line:** a 2px gold line under each race row, as wide as that film's chance to win.
3. **Word tabs:** the four category names, large, are the tabs, with the leader under each on desktop.
4. **The gold wash:** the "why" behind a % opens inline under its row on a pale gold panel.

Light only. Dark mode is not designed (design brief); adding it later is a Step 12 design addition.

## 2. Semantic colour map

Each colour has one job. Tokens in §3.

| Job | Token | On it |
|---|---|---|
| Page background | `--paper` | `--ink`, `--ink-muted` |
| Top bar, controls, popovers, tables' frame | `--surface` | `--ink`, `--ink-muted` |
| Dividers, row rules, control borders | `--line` (hover: `--line-strong`) | |
| First rule of a list or table | `--ink`, 1px | |
| Main text | `--ink` | |
| Secondary text, labels, column heads, captions | `--ink-muted` (4.5:1 or better on paper, track and gold wash) | |
| Inactive race tabs (26px), icons in idle controls | `--ink-subtle`. Only for text 24px and larger, and icons | |
| Disabled, decoration | `--ink-faint`. Never text someone must read | |
| **Gold: wins, the current stage, actions** | | |
| The chance line, stage dot, meters, won grid cell | `--gold` (never text) | `--on-gold` |
| Leader's %, gold text, primary button, focus ring | `--gold-ink` | `--on-gold` |
| The "why", active marks, won pill, selected year | `--gold-wash` | `--gold-ink`, `--ink`, `--ink-muted` |
| Nominated grid cell ring, rule inside the gold wash | `--gold-soft` | |
| Neutral fills: nominated pill, hover, skeletons, bar tracks, segmented control | `--track` | `--ink`, `--ink-muted` |
| **Failure** | | |
| Error text and icon (failed save, failed page, offline) | `--error` | |
| Error panel | `--error-wash` | `--error`, `--ink` |

Rules: gold appears only for a win, the leader, the current stage, a chance or meter, an active mark and the one primary action. Nominated is never gold text: it's ink on track. There is no green, no blue and no second accent. Flags are the only other colour.

## 3. Design tokens

Copied exactly into `src/styles/tokens.css`. The same block sits at the top of `design-preview.html`.

```css
/* Oscar Movies design tokens, v1.0 (2026-10-22). Light only.
   Source of truth: DESIGN_GUIDE.md §3. Copied unchanged into src/styles/tokens.css. */
:root {
  /* Surfaces */
  --paper: #FCFBF9;          /* page background (warm white) */
  --surface: #FFFFFF;        /* top bar, controls, popovers, dialogs */
  --track: #F1EEE8;          /* bar tracks, skeletons, neutral pills, hover fill */
  --line: #ECE8E2;           /* dividers, row rules, control borders */
  --line-strong: #D9D3CA;    /* control borders on hover, table header rule */

  /* Text */
  --ink: #1D1C1A;            /* text, first-row rule, active nav (16.5:1 on paper) */
  --ink-muted: #6F6B64;          /* secondary text (5.1:1 on paper, 4.6:1 on track and gold-wash) */
  --ink-subtle: #8C877E;         /* large text (24px and up) and icons only (3.4:1) */
  --ink-faint: #A8A39A;          /* decoration and disabled only; never text someone must read */

  /* Gold: wins, the current stage, actions. The only accent. */
  --gold: #B8862B;           /* row lines, chance bars, the stage dot, won cells (3.1:1; never text) */
  --gold-ink: #8A6418;       /* gold text, the leader's %, primary buttons, focus ring (5.2:1) */
  --gold-ink-hover: #7A5814; /* primary button hover and press */
  --gold-soft: #E7D3A8;      /* nominated cell ring, gold rule on the gold wash */
  --gold-wash: #F8F1E2;      /* the "why", active marks, won pill, selected rows */
  --on-gold: #FFFFFF;        /* text and icons on gold-ink or gold */

  /* Failure (the only other hue) */
  --error: #A3271C;          /* error text and icon (6.5:1 on error-wash) */
  --error-wash: #FBEEEC;     /* error panel background */

  /* Overlays */
  --scrim: rgba(29, 28, 26, 0.32);
  --shadow-pop: 0 0 0 1px rgba(29, 28, 26, 0.06), 0 12px 32px -8px rgba(29, 28, 26, 0.18);
  --shadow-toast: 0 0 0 1px rgba(29, 28, 26, 0.06), 0 12px 32px -10px rgba(29, 28, 26, 0.30);
  --flag-edge: inset 0 0 0 1px rgba(29, 28, 26, 0.12);

  /* Shape */
  --radius-xs: 2px;          /* flags */
  --radius-sm: 6px;          /* pills, kbd, grid cells */
  --radius: 10px;            /* controls, panels, the "why" */
  --radius-lg: 14px;         /* popovers, dialogs, score tiles */
  --radius-pill: 999px;      /* marks, chips */

  /* Type */
  --font-sans: "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --text-display: 52px;      --text-display-phone: 34px;   /* PageHeader title */
  --text-section: 26px;      --text-section-phone: 20px;   /* race tabs, section headings */
  --text-title: 21px;        --text-title-phone: 17px;     /* film title in the race, movie page headings */
  --text-body: 15px;         --text-body-phone: 14px;
  --text-small: 14px;        /* precursor line, list rows, nav */
  --text-caption: 13px;      /* scores line, column labels, footnotes */
  --text-micro: 12px;        /* pills, kbd, grid headers */
  --num-xl: 46px;            --num-xl-phone: 34px;         /* % chance to win */
  --num-l: 34px;             --num-l-phone: 28px;          /* stats, score tiles */
  --leading-tight: 1.05;
  --leading-snug: 1.3;
  --leading: 1.5;
  --tracking-display: -0.035em;
  --tracking-heading: -0.02em;
  --tracking-title: -0.015em;
  --tracking-num: -0.04em;
  --weight-light: 300;       /* big numerals only */
  --weight-regular: 400;
  --weight-medium: 500;
  --weight-semibold: 600;    /* display title, wordmark, small headings */

  /* Space (4px base) */
  --space-1: 4px;  --space-2: 8px;   --space-3: 12px;  --space-4: 16px;
  --space-5: 20px; --space-6: 24px;  --space-7: 28px;  --space-8: 32px;
  --space-10: 40px; --space-12: 48px; --space-14: 56px; --space-16: 64px;
  --space-24: 96px;

  /* Layout */
  --content-max: 1120px;
  --gutter: 32px;            --gutter-phone: 16px;
  --topbar-h: 64px;          --topbar-h-phone: 56px;
  --bp-phone: 760px;         /* at or below: phone layout */
  --bp-compact: 1100px;      /* at or below: search box becomes a button */

  /* Motion */
  --ease: cubic-bezier(0.2, 0.7, 0.2, 1);
  --dur-fast: 120ms;         /* hover, press, mark toggle */
  --dur: 200ms;              /* the "why" opening, popovers, tab line */
  --dur-slow: 280ms;         /* phone menu and search sheet */

  /* Focus */
  --focus-ring: 0 0 0 2px var(--paper), 0 0 0 4px var(--gold-ink);
}
```

## 4. Typography

One family: **Geist** (`next/font/google`, weights 300, 400, 500, 600), with system sans fallback. **Tabular figures everywhere** (`font-feature-settings: "tnum" 1` on `body`). No italics, no all caps (except `kbd`), no other family.

| Style | Size (desktop / phone) | Weight | Tracking | Line height | Used for |
|---|---|---|---|---|---|
| Display | 52 / 34 | 600 | −0.035em | 1.05 | PageHeader title, one per page |
| % numeral XL | 46 / 34 | 300 | −0.04em | 1 | Chance to win in the race; the `%` at 20 / 15, raised, `--ink-muted` (gold-ink for the leader) |
| Section | 26 / 20 | 500 | −0.02em | 1.25 | Race tabs, section headings (`h2`), phone menu items (20) |
| Numeral L | 34 / 28 | 300 | −0.04em | 1.1 | Stats, score tiles; unit or "of N" at 15–16 in `--ink-muted` |
| Title | 21 / 17 | 500 | −0.015em | 1.3 | Film title in race rows; 17 / 16 in film lists |
| Body | 15 / 14 | 400 | 0 | 1.5 | Running text, PageHeader sub |
| Small | 14 | 400 / 500 | 0 | 1.5 | Precursor line, list rows, nav, buttons |
| Caption | 13 | 400 | 0 | 1.5 | Scores line, column labels, footnotes, meta lines |
| Micro | 12 | 400 / 500 | 0 | 1.4 | Pills, `kbd`, grid headers, "to win" |

Section headings inside a section (`h3`) are Body size at 600. Long titles wrap anywhere (`overflow-wrap: anywhere`), never truncate, except in the race tab's leader line (one line, ellipsis).

## 5. Layout and spacing

- **Width:** content max 1120px, centred. Gutters 32px (desktop), 16px (phone).
- **Breakpoints:** phone at 760px and below; compact at 1100px and below (the search box becomes a search button). In the app these are media queries (`max-width: 760px`, `max-width: 1100px`); the preview uses container queries only so it can show both widths.
- **Spacing scale:** 4px base: 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 96 (`--space-*`). Nothing off the scale.
- **Page rhythm:** top bar 64 / 56; page padding 56 top, 96 bottom (28 and 64 on phone); PageHeader to first content 40–48; between sections 56 (40 on phone).
- **Lists, not cards.** Content sits on the paper, separated by 1px `--line` rules, with the list's first rule in `--ink`. Bordered surfaces only for: score tiles, Oscar result boxes, the year grid, source cards, popovers and the empty state.
- **Depth** comes from lines. Shadows only on things that float: popovers and search (`--shadow-pop`), toasts (`--shadow-toast`), and a row lifted while it is dragged (`--shadow-pop`).
- **No sideways page scroll**, ever. The year grid and wide tables scroll inside their own frame.

## 6. Signature elements

### 6.1 AppShell

Every page renders inside it: top bar, `<main>` page, footer.

- **Top bar** (`--surface`, 1px `--line` bottom, 64px): wordmark (links to the race) · main nav · search box at the right (260px, 38px high, `--paper` fill, placeholder "Search films and awards", `/` key hint).
  - **Nav, in order:** Race, Awards, Year grid, Accuracy, Submissions, Festivals, Watch list. 14px `--ink-muted`; the current one `--ink` 500 with `aria-current="page"`. Year summary is reached from the year grid; Data and sources from the footer.
  - **Compact (≤1100px):** the search box becomes a 40px search icon button.
  - **Phone (≤760px):** menu button · wordmark · search button. The race is one tap away from any page through the wordmark.
- **Phone menu:** a full-screen sheet over the page (opens in 280ms, slides down, scrim behind; Esc and the close button shut it; focus is trapped and returns to the menu button). Header row matches the top bar with a close (×) button. Items at 20px 500, 56px tall; the current one in `--ink` with a 3px gold bar at the left edge; others `--ink-muted`. Race shows "2026 season", Watch list shows "N to watch" as a caption. Footer: "Data coverage and sources".
- **Footer** (1px `--line` top, caption `--ink-muted`): "Oscar Movies, a personal project" · "Scores from IMDb, Rotten Tomatoes, Metacritic and TMDB" · link "Data coverage and sources".

### 6.2 PageHeader

Every page starts with it. Optional back link (16px arrow + label, `--ink-muted`, above the title) · Display title · sub line (Body, `--ink-muted`; may hold flags, a text link) · actions at the right, aligned to the title's baseline (the year switcher; nothing else on most pages). On phone the actions stay top right; the title wraps.

- The back link names where it goes ("Awards 2024", "2024 year grid"); on the movie page, which is reached from everywhere, it's "Back" (browser history; falls back to the race).

### 6.3 Race tabs

Four equal columns; each tab is the category name at Section size (`--ink-subtle` when inactive, `--ink-muted` on hover, `--ink` when selected) with the leader under it (small flag, title, %; caption, one line, ellipsis; title `--ink` 500 on the selected tab). The selected tab has a 2px gold line on the bottom rule. On phone: names only, 20px, in a row that scrolls sideways, edge to edge. Arrow keys move between tabs (`role="tablist"`); the selected category is kept in the address (`?category=`).

### 6.4 Stage line

Under the tabs: a gold 8px dot with a 4px gold-wash halo, then the next step in `--ink` 500 and the rest in `--ink-muted` ("**Nominations 22 Jan** · Ceremony 15 Mar"). When the season is over, the dot is `--ink` with a `--track` halo ("**Ceremony 2 Mar 2025** · Anora won Best Picture"). The column labels ("To be nominated", "To win") sit at the right of the same line on desktop.

Under the stage line (v1.1), on every category, one caption line: the text link "Strong signals, 2025" (the race's year; Small, `--ink`) and, in `--ink-muted`, "the films the best-predicting awards picked". It wraps on phone. It leads to §8.13; the page is not in the main navigation.

### 6.5 Contender row and the chance line

Grid: film (1fr) · to be nominated (112px) · to win (200px) · marks (84px). Padding 26 top, 28 bottom.
- **Film:** one flag at the left (the film's primary country, §7 Flags), then the title (Title style, links to the movie page; an Oscar stage pill follows it when the stage isn't the same for every row: Shortlisted, Won), the precursor line ("Won: …  · Nominated: …", labels `--ink-muted`, awards `--ink`; at most the three to five most telling awards), and the scores line.
- **To be nominated:** 18px `--ink-muted`, right-aligned. Live until the nominations are announced; after that it shows each nominee's % from the day before the nominations, and the footnote under the list says so.
- **To win:** % numeral XL, right-aligned, inside a button that opens the "why"; a 2px underline in `--line` (hover `--gold-soft`, open `--gold`); "to win" (or "final prediction" after the ceremony) in micro `--ink-muted` under it. The leader's number and % are `--gold-ink`.
- **The chance line:** 2px `--gold`, on the row's bottom rule, from the left edge, `width = chance%` of the row.
- **Phone:** title block left; % top right with "to win"; "99% to be nominated" under it; marks on their own line under the film, indented to the title.
- After the list: a full-width text button "**Show all 38 contenders** · Bugonia, Train Dreams, The Secret Agent and 33 more under 3%". Under it the footnote "The % chance to win in a category adds up to 100. Tap a % to see the past seasons behind it."

### 6.6 The "why"

Opens inline under its row (not a dialog), spanning the row, indented to the title (37px), on `--gold-wash`, radius 10, padding 22/26. Left: "Why 41%" (Body 600) and two or three sentences in Small `--ink-muted` saying how many past films had a run like this and how many won. Right: up to four results with their record ("Won Gotham, Best Feature — won the Oscar 5 of 13 years"). Bottom, over a `--gold-soft` rule: "Similar seasons: 2014, 2016…" and the link "How the % chance works" (to the accuracy page's method section). One "why" open at a time; opening it moves no focus; Esc closes it and returns focus to the %.

## 7. Components

All shadcn/ui components used are restyled to these specs; nothing keeps shadcn's default look. States in `design-preview.html` §3.

| Component | Spec | States |
|---|---|---|
| **Marks** (watched, want to watch) | Round toggle buttons, 36px (40 on phone), 1px `--line` border, `--surface`, icon 16px `--ink-subtle` (check; bookmark). Hit area at least 44px. Labelled pills (40px high, icon + "Watched" / "Want to watch") on the movie page only; 30px in the year grid. `aria-pressed`; labels "Mark as watched" / "Watched", "Add to want to watch" / "Want to watch". | Off; hover (border `--line-strong`, icon `--ink`); focus ring; press (scale 0.92); on (`--gold-wash`, no border, icon `--gold-ink`, bookmark filled); saving (thin gold ring spinning, only if it takes more than 400ms); failed (flips back, `--error` ring and icon for 2s, plus the toast). Marking watched clears want to watch. |
| **Buttons** | 40px high, radius 9, 14px 500, 16px icon, 8px gap. Primary `--gold-ink` on `--on-gold`, at most one per screen. Secondary `--surface`, 1px `--line`. Ghost: text only. Small: 32px, 13px. | Hover (primary `--gold-ink-hover`; secondary border `--line-strong`; ghost `--track` fill); focus ring; loading (spinner, label hidden, width kept); disabled (`--track`, `--ink-faint` text). |
| **Text link** | `--ink`, 1px underline in `--line-strong`, offset 3px. Inside the gold wash: `--gold-ink` with a `--gold-soft` underline. | Hover: underline in the text colour. |
| **"Show all" row** | Full-width text button on a top rule: bold part `--ink` 500, rest `--ink-muted`. | Hover: bold part underlined. |
| **Stage pill** | 22px high, radius 6, 12px 500. Won: `--gold-wash`, `--gold-ink`, 6px gold dot. Nominated: `--track`, `--ink`. Shortlisted / Eligible: 1px `--line-strong` outline, `--ink-muted`. Submitted: 1px `--line` outline, `--ink-muted`. Not nominated / Not submitted: text only, `--ink-muted`. Runner-up: `--track`, `--ink-muted`. No data / Partly loaded: `--line` outline, 400. Live: as Won without the dot. | Static. |
| **Flags** | `country-flag-icons` 3:2 SVGs (MIT), never emoji. **One flag per film, its primary country** (v1.1): for a film with an International Feature result in any year, the country that submitted it (the latest year if more than one); otherwise the first country Wikipedia lists for it. The same flag on every row, race tab, grid cell, search result and list; never two flags and never "+N". 21×14 in rows, 15×10 in tabs, 30×20 on the movie page, where the one large flag sits in the sub line and every country is named in text ("Brazil, France"). Radius 2 (3 large); a 1px inset edge (`--flag-edge`) so white flags show on paper. Each flag has the country name as its accessible name (International rows add ", submitting country"). | Static. |
| **Scores line** | Caption `--ink-muted`: "IMDb 7.9  RT 95  MC 95  TMDB 7.5  **86 · 4 of 4**" (16px gaps, wraps). The average in `--ink` 500. A missing score is "RT –" (never 0). No scores yet: all four "–" and "No scores yet". | Static. |
| **Score tiles** (movie page) | Five tiles in one bordered strip (radius 14): IMDb "/10", Rotten Tomatoes "%", Metacritic "/100", TMDB "/10", and Average (on `--gold-wash`, number `--gold-ink`, "4 of 4 scores"). Numeral L, label caption, "Updated 14 Oct" micro. Phone: 2×2, average full width. | Missing: "–" in `--ink-muted`, "No score yet". |
| **Year switcher** | Button with the year and a chevron, 40px (36 on phone). Opens a popover (264px, radius 14, `--shadow-pop`): caption "Film year (Oscars the following March)", then a 3-column grid of years, newest first, 2026 to 2012. Current year `--gold-wash` + `--gold-ink`; the live season has a 6px gold dot. Changes the year in the address. | Closed; open (button border `--ink`); year hover / keyboard focus `--track`. Arrow keys move, Enter picks, Esc closes. |
| **Sort menu** (v1.1) | A small secondary button (sort icon, "Sort: Oscars", chevron) opens a menu under it: 248px, radius 14, `--shadow-pop`, padding 8; caption "Sort the films by", then items 40px high, radius 8, Small. The chosen item is on `--gold-wash` with `--gold-ink` 500 and a check; an item may carry a one-line caption (Oscars: "Winner, nominees, shortlist, then the rest"). Used by the year grid (§8.4); the choice is kept in the address. Role `menu` with `menuitemradio`. | Closed; open (button border `--ink`); item hover and keyboard focus `--track`; chosen. Arrow keys move, Enter picks, Esc closes and returns focus to the button. |
| **Watch list pieces** (v1.1) | The Add a film box, the drag handle and lifted row, the release line and its editor are specified, with all their states, in §8.3. They use the tokens and components above and add no token. | See §8.3. |
| **Segmented control** | `--track` container, radius 10, padding 3; items 32px, 14px `--ink-muted`; selected `--surface` with a hairline shadow, `--ink` 500. Used for the category on non-race pages and for sort. Scrolls sideways on phone. | Hover `--ink`; selected; focus ring. |
| **Filter chips** | 32px pill, 1px `--line`, 13px. On: `--gold-wash`, `--gold-ink` 500, with a check. Kept in the address. | Off; hover; on; focus. |
| **Notice** | Inline panel, radius 10, padding 14/16, 16px icon. Gold (`--gold-wash`): the season's state ("Early: few results yet."). Neutral (`--track`): coverage notes. Error (`--error-wash`): offline. Bold first sentence, rest `--ink-muted`. | Static. |
| **Toast** | Bottom right (phone: bottom, full width minus gutters), 380px, `--surface`, radius 10, `--shadow-toast`. Icon, bold title, `--ink-muted` sentence, ghost "Try again", close ×. For failures: error icon, stays until closed or retried ("Try again" repeats what failed: a mark, or a drag move). One success exception (v1.1): adding a film from the Watch list's box shows an info toast (neutral check icon, no button: "Anatomy of a Fall added. It is at the top of Want to watch.") that closes itself after 4 seconds. Other successes need no toast (the mark itself changes). `role="status"`. | Error; info (neutral icon). |
| **Search** | Box in the top bar (§6.1). Typing opens a popover under it (440px, radius 14, `--shadow-pop`) with groups "Films" (flag, title, year and categories, stage pill) and "Awards and festivals" (award icon, name, type). The matched part is underlined in gold. Keyboard row `--track` (a neutral Nominated pill on a keyboard or hovered row takes `--surface` so it stays visible). Footer with key hints. `/` focuses search from anywhere; Esc closes. Phone: a full-screen sheet with the box and "Cancel" at the top. Matches ignore case and accents and include original titles. | Idle; focused (border `--gold-ink`, 3px gold-wash ring); results; keyboard selection; no results ("No movie or award matches "parasyte"." + "Check the spelling, or try the original title."). |
| **Film row** (lists) | Flag · title (17px 500) with a meta line (year · categories, caption) and the scores line · result columns (pills, or numbers at 18px 300 right-aligned) · marks. Head row in caption `--ink-muted`. A winner row gets a `--gold-wash` fade from the left. Phone: film and marks on top, the results as one wrapped caption line under the title with their labels ("BAFTA Won · Oscar Nominated"). | Static; title hover underline. |
| **Stats strip** | Three (or four: an award page's accuracy figures) equal cells between `--line` rules: Numeral L value with "of N" in `--ink-muted`, caption label, optional 2px meter (`--track`, gold fill). Stacks on phone. Each stat that counts films links to the filtered list. | Static; link hover. |
| **Data table** | Header row caption `--ink-muted`, bottom rule `--ink`; sortable headers are buttons, the sorted one `--ink` 500 with an arrow and `aria-sort`. Rows 14px, `--line` rules, figures right-aligned: "**79%** 11 of 14" plus a 72px mini meter under the main sorted figure. Group rows ("Major awards", "Festivals", "Critics groups"): caption 500, `--line-strong` rule, 28px above. "–" where a figure doesn't apply, with the reason in a footnote. | Row hover `--paper`. |
| **Year grid** | See §8.4. Cells: won = `--gold` square 28px with a white check; nominated or on the list = `--gold-wash` with a `--gold-soft` ring; Oscar shortlist = `--line-strong` ring; submitted = 6px `--line-strong` dot; blank = nothing. Critics groups folded into one column: a `--track` count chip of wins. Every cell has a text label (`title` and accessible name). Legend under the grid. | Row hover `--paper`. |
| **Empty state** | Dashed `--line-strong` box, radius 14, centred: 44px gold-wash circle with an icon, title 17px 500, one or two sentences `--ink-muted`, optional actions. | Static. |
| **Skeleton** | The row's own shape in `--track` blocks with a slow shimmer; shown only if loading takes more than 300ms. | Static; reduced motion: no shimmer. |

## 8. Page templates

Each kind of page has one frame in `design-preview.html` §4–5. Phone layouts are in the same frames (switch "Phone 390").

1. **The Oscar race** (`/`, `/race/[year]`): PageHeader ("The 2025 race", "98th Academy Awards. Updated 20 Dec 2025.", year switcher) · race tabs · stage line · the strong signals line (§6.4) · contender rows · "Show all" · footnote. Category in the address. Season states (§8.12).
2. **Award page, one year** (`/awards/[award]/[year]`): back link to the awards index · PageHeader (name and year; edition, date, type; v1.1: the text link "All years" at the end of the sub line, after the festivals' "Lineup" link) · segmented control jumping to the categories the award gives · per category: section heading (the award's own name, "Counts towards Best Picture") · stats strip with the four accuracy figures · film list (Film · this award's result · Oscar result, with "for <country>" under International results · marks). Footnote linking to how the award's categories map. The Oscars' own year page and festival prize pages use this template (festivals add a link to the lineup from 2025).

   **All years (v1.1; `/awards/[award]/all?category=` and `/awards/oscars/all?category=`).** One award's results for every film year on one page, newest first. Reached from the "All years" link in the sub line of the award's and the Oscars' year pages. Drawn in `design-preview.html` §4: "Award page, all years" (Golden Globes, Picture: two categories, a year with no data, a partly loaded year), "All years, no data and no results" (Critics Choice, Documentary) and "All years, the Oscars" (International, with the footnote), each at 390 and 1280.

   - **PageHeader:** back link naming the award's live year page ("Golden Globes 2025") · title "<Award>, all years" (the same short name as the year page) · sub "Major award · every year since 2012, newest first" (the kind label as on the year page: Major award, Critics group, Festival prize; the Oscars say "Academy Awards") · no actions: there is no year switcher.
   - **Category tabs:** the segmented control (§7; `?category=`) with one link per Oscar category the award has results in, any year, in race order (Picture, Documentary, International, Animated), the first one by default; no control at all when there is only one. Below the page header at the usual toolbar distance (40, 24 on phone). It scrolls sideways inside its own frame on phone. No sort, no year jump, no mark chips and no accuracy figures.
   - **Year blocks,** one `section` per film year from the live year down to 2012, at the section rhythm (56, 40 on phone). The heading row is the year at Section size as a **link to that year's page** (a 16px chevron in `--ink-subtle` after it, named "<Award> <year>"; hover underlines it in `--line-strong` and darkens the chevron) with the ceremony date at the right in Small `--ink-muted` ("5 Jan 2025"; nothing when the edition has no date; on phone it drops under the year). Under it, in this order: the partial notice, then the categories.
   - **Category subheadings:** the award's own category name (Body 600) over its list, only when the tab has more than one category for that award ("Best Motion Picture – Drama", "Best Motion Picture – Musical or Comedy"); a tab with one category has none. A year that lacks one of them shows only the ones it has. Each list is the year page's list: head row (Film · the award · "Oscar, <category>"), winners first on the gold fade, then the other rows (flag, title, scores line, the award's pill, the Oscar result of that film year, marks).
   - **"No data":** one line replaces the year's lists, for a `no_data` year or a missing edition: an info icon (16px, `--ink-subtle`), "**No data**" in `--ink` 500, and the edition's note after a dot in `--ink-muted` ("The ceremony for 2025 films has not taken place yet (early 2026)."). It sits on an `--ink` rule with a `--line` rule under it, as the strong signals' "Not announced yet" row, and wraps with its text indented past the icon.
   - **"No results this year":** the same line for an edition that exists but has nothing in this tab, with the edition's note when it has one ("The Critics' Choice Movie Awards gave no documentary prize from the 2016 films on…"). The note is repeated in every such year; that is intended, so each year reads on its own. With no rows, the line carries the note and the partial notice is left out.
   - **Partial notice:** when the edition is `partial` and has rows, the year page's neutral Notice (§7) between the heading and the first list: "**Partly loaded.** <the edition's note, or "Some of this year's Globes results are missing.">".
   - **The Oscars' page:** the same blocks with one result column (Film · Oscar · marks): nominees and winners only, never shortlisted or submitted films; International shows "for <country>" under the pill (beside it on phone); the live year, with no nominations yet, reads "No results this year". Footnote (Caption, `--ink-muted`) after the last block: "Only nominees and winners are listed here. The submitted and shortlisted films are on each year's page."
   - **States:** loading is the race's skeleton rows; an unknown award is the 404 page (§8.11); a failed read is the error page. Marks are live as everywhere. Phone: the Film row's phone layout, year and date wrap, nothing scrolls sideways (the tabs scroll inside their frame).
3. **Film list pages**: Watch list (`/watch-list`; sections "Want to watch" and "Not watched yet, <year> season"; sort by My order, Oscar stage, % chance, nominations or average score; v1.1 pieces below), International submissions (`/submissions/[year]`; first column is the submitting country's flag and name; sort by country, stage or average; chips Shortlisted, Unwatched) and festival lineups (`/festivals/[festival]/[year]`; one section per festival section, a prize pill where won). Same film row, toolbar of segmented sort + chips.

   **The Watch list (v1.1).** PageHeader ("Watch list", sub "Films you want to watch, in your order, then this season's contenders you haven't seen.") · the **Add a film** box · toolbar "Sort by" with the segmented control **My order** (default, `?sort=mine`), Oscar stage, % chance, Nominations, Average score (it scrolls sideways on phone) · section "Want to watch" (count, and under My order "· drag the handle to reorder") · section "Not watched yet, <year> season" (count, and under My order "· by Oscar stage"). Under My order, Want to watch follows the owner's order and the season section follows Oscar stage; under any other sort both sections follow it, the handles are gone and the release lines stay. Drawn in `design-preview.html`: the Watch list frames (§4) and the boards "Add a film", "My order and the drag handle" and "Release line and editor" (§3), each at 390 and 1280.

   - **Add a film.** The label "Add a film" (Small 500) over a 48px box: `--surface`, 1px `--line`, radius 10, a plus icon, placeholder "Type a film title"; at most 640px wide, full width on phone; above the toolbar. After a short pause in typing (300ms) a results popover opens under the box at the box's width (radius 14, `--shadow-pop`) with the app's films matching the text, by title or original title, accents and case ignored, any year (the search API's film results). Rows are as in Search: flag, title with the matched part underlined in gold, "year · categories", Oscar stage pill; the first row is selected. A film already wanted says "On your list" (filled bookmark) and a watched one "Watched" (check), in `--gold-ink` 500 at the end of the meta line; picking either still adds the film at the top (a watched film becomes wanted and not watched, as a tap on the bookmark would). Footer hints: ↑ ↓ move · enter add to Want to watch · esc close. Enter or a tap adds. States: *idle*; *focus* (border `--gold-ink`, 3px `--gold-wash` ring); *searching* (two skeleton rows, only after 300ms); *results*; *no match* (the empty-search style: "No film called "<text>" yet." and "Films come from the awards and festivals the app follows; ask Claude to add one."); *saving* (a spinner in the box and on the picked row, typing paused, `aria-busy`); *added* (the box clears and keeps focus, the film shows at the top of the list, the info toast of §7); *failed* (the text stays, the border turns `--error` with a 3px `--error-wash` ring, and an error Notice under the box says "Couldn't add <title>. Your list is unchanged. Check the connection and try again." with a ghost "Try again"). Keyboard and semantics as Search: `role="combobox"`, `aria-expanded`, `aria-controls` the listbox, `aria-activedescendant`; ↑ ↓ move, Enter adds, Esc closes the results.
   - **My order and the drag handle.** Under My order only, each Want to watch row has a handle: the GripVertical icon (18px, `--ink-subtle`) in a 28×36 button with a 44px hit area, named "Reorder <title>", as the row's first column (on phone it sits left of the film, centred on the row's two lines). Season rows, and every row under another sort, have none. Dragging starts only from the handle, with a mouse, a finger or the keyboard. States: *resting*; *hover* (`--track` fill, `--ink`); *focus* (ring); *lifted by mouse or finger* (the row floats: `--surface`, 1px `--line`, radius 10, `--shadow-pop`, 12px wider on each side (8 on phone), following the pointer; its old place becomes a dashed `--line-strong` slot on `--track` that moves to where the row would drop; the other rows slide aside in 200ms; the page never scrolls sideways, and on phone it scrolls up or down when the pointer nears an edge); *lifted by keyboard* (Space lifts, with the same look and the handle focused; ↑ ↓ move one place, Space drops, Esc puts it back; a neutral Notice above the list says "Moving <title>. Position 1 of 4. ↑ ↓ to move, space to drop, esc to cancel." and a live region announces each move, "Moved <title> to position 2 of 4"); *saving* (the new order shows at once; after 400ms the moved row's handle shows the spinning gold ring and every handle pauses in `--ink-faint` until it is saved); *failed* (the rows go back to the old order, the moved row's handle is `--error` for 2s, and the failure toast says "Couldn't save the order. Your list is back as it was. Check the connection and try again."; "Try again" repeats the move). A film that stops being wanted leaves Want to watch; a film newly wanted goes to the top.
   - **Release line and editor.** Under the scores line of each Want to watch row (not season rows), a small button: a calendar icon (14px, `--ink-subtle`) and Caption text, a pill-shaped `--line-strong` border on hover, a 44px hit area, `aria-haspopup="dialog"`, `aria-expanded`. It reads: "12 Dec 2026 · Netflix" for a date still to come (the date in `--ink` 500, the platform `--ink-muted`; day, month and year); "Out 3 Oct · Cinema XXI" once the date has passed (the year only when it isn't this year); "TBD · Netflix" with no date (all `--ink-muted`); "12 Dec 2026" with no platform; "Add release date" when both are empty (`--ink-muted`). A long platform wraps. A film that is unwanted keeps its date and platform; they just aren't shown. *Editor*: a popover under the button on desktop (360px, radius 14, `--shadow-pop`, padding 16, no scrim), a modal bottom sheet on phone (full width, radius 14 at the top, `--scrim` behind it, slides up in 280ms, with a close ×). Contents: the heading "Release date and platform" (Body 600) with the film's title under it (Caption, `--ink-muted`); the **Date** field (the browser's own date field, 40px high, 44 on phone, calendar icon; hint "The first date you can watch it from Indonesia. Empty means TBD."); the **Platform** field (free text, same size) that lists suggestions under it while it has focus: "Used before" (the owner's earlier platforms, newest first), then "Suggestions" (Netflix, Prime Video, Disney+ Hotstar, Apple TV+, HBO Max, Vidio, MUBI, Catchplay+, KlikFilm, Cinema XXI, CGV, Cinépolis), filtered by the typed text (case and accents ignored), the matched part underlined in gold, the keyboard row on `--track`, scrolling after five rows; the actions: ghost "Clear" at the left (off when both fields are empty; it empties both and saves at once), secondary "Cancel" and primary "Save" at the right (44px high on phone). States: *empty*; *filled*; *suggestions open*; *saving* (fields on `--track`, buttons paused, Save shows the spinner); *failed* (stays open with the values kept, and an error Notice says "Couldn't save. <Title>'s release is as it was. Check the connection and try again."). Keyboard: opening puts focus in the Date field; Tab goes Date, Platform, Clear, Cancel, Save; Enter in a field picks the highlighted suggestion when the list is open and otherwise saves; Esc cancels; closing returns focus to the release button; on phone focus is trapped in the sheet.
4. **Year grid** (`/grid/[year]?category=&sort=&filter=`): PageHeader ("2024 year grid", "Best Picture · 47 films with a nomination", link "Year summary", year switcher) · toolbar (category segmented control; sort button; chips Unwatched, Critics groups folded) · the grid in a bordered frame that scrolls sideways · legend. Columns: film (fixed, 280px; 168px without flags on phone) · Wins · Noms · Oscars · major awards · festivals · critics groups (folded by default; unfolded, one column each, in calendar order). Group header row above the column names; thin vertical rules between groups. Only awards that give that category appear. **Sort** (v1.1): the sort button opens the sort menu (§7): Oscars (default, `?sort=oscar`), Wins, Nominations, Average score, Title; old addresses such as `?sort=wins` keep working. *Oscars* order: the Oscar winner first, then the nominees (a runner-up counts as nominated), then the shortlisted films, then all the others (eligible and submitted films included); within each group, most nominations, then most wins (both high first), then title. In "All categories" a film's furthest Oscar result in any category sets its group. Under Oscars, and only then, a **group row** heads each group that has films: "Oscar winner and nominees 8", "Oscar shortlist 3", "Other films 2" (34px, `--paper`, micro `--ink-muted` 500 with the count regular, a `--line-strong` rule under it, the label sticky at the left with the film column and wrapping on phone; a `th scope="rowgroup"`). Drawn on the Picture frame and on the International frame, which has all three groups.
5. **Accuracy** (`/accuracy/[category]`): PageHeader · category segmented control and the links "Strong signals, <the live year>" (§8.13) and "How the % chance works" · data table grouped Major awards / Festivals / Critics groups, sortable by each figure, with years counted · "Show all N critics groups" · footnote on "–" · section **Backtest** (stats strip, then one row per season: favourite, chance, result pill or "Lost to <film>") · the method in plain words (`#method`).
6. **Movie page** (`/movies/[slug]`): back link · title · sub with one large flag (the primary country), original title, year, every country in text, language · labelled marks · score tiles · **Oscars** (one result box per category; won boxes on the gold wash) · **Awards** by section (Major awards, Festivals, Critics groups): rows of award · category · Won / Nominated / Not nominated (not-nominated rows in `--ink-muted`), critics groups summarised in the heading and capped with "Show all" · festival screenings with section and prize (or the coverage notice).
7. **Index pages**: Awards index (`/awards/[year]`): the Oscars as one feature link, then Major awards, Festivals and Critics groups as two- or three-column lists of name, what it gives (caption) and date; "No data" / "Partly loaded" pills where so. The festivals index uses the same template.
8. **Year summary** (`/years/[year]`): back link to the grid · stats strip (films nominated anywhere; contenders watched with a meter; most nominations) · table per category (films, watched), every count a link to the filtered list.
9. **Data and sources** (`/data`): stats strip (award years loaded, films, scores last refreshed) · coverage table with a 15-year strip per award (loaded `--ink`, partly half-filled, no data outlined, live season `--gold`) and a legend · **Sources** cards: TMDB with its official logo file unaltered and the notice "This product uses the TMDB API but is not endorsed or certified by TMDB."; Wikipedia ("…based on Wikipedia articles, used under CC BY-SA 4.0", linked); IMDb ("Information courtesy of IMDb (imdb.com). Used with permission."); OMDb; Wikidata (CC0).
10. **Search**: §7. No separate results page.
11. **Not found and error** (inside AppShell): eyebrow line ("Error 404" / "Something went wrong") · Display title · sub · actions (primary + secondary) · for 404, three useful links (the live race, this year's awards, watch list) · for errors, a reference code and time in caption.
12. **States** (the race through the season, and generic states):
    - **Nothing yet:** tabs show "No contenders yet" under the empty category; the empty state "No contenders yet" + "The first precursor results arrive in <month>…".
    - **Early:** gold notice "Early: few results yet." with what will move the chances.
    - **Shortlist out:** only shortlisted films, each with a Shortlisted pill; International rows lead with the submitting country's flag.
    - **After the nominations:** nominees only; the "to be nominated" column shows the eve-of-nominations %; the stage line counts the nominees.
    - **After the ceremony and past years:** the winner gets a Won pill, the others Nominated; "final prediction" under each %; stage dot in ink; the sub line says when the final prediction was made.
    - **Loading:** skeleton rows after 300ms. **Failed save:** the mark flips back and the toast appears. **Offline:** error notice under the PageHeader, marks disabled. **No results:** search's message.

13. **Strong signals** (v1.1; `/signals/[year]?category=&view=`): for one Oscar category and year, the awards that have predicted it best and the films they picked. PageHeader ("2025 strong signals", sub "Best Documentary Feature · the films picked by the awards that predict it best" and the text link "Accuracy", year switcher; reached from the race's strong signals line (§6.4) and the accuracy page, so no main-navigation item is marked current) · toolbar: the category segmented control at the left, the view segmented control **By award** (default, `view=award`) and **By film** (`view=film`) at the right; both kept in the address · the view · footnote. Opens on the live season. A strong award is one whose "Oscar nominees it caught" is 50% or more, or whose "Winner → Oscar nomination" is 80% or more, over at least 5 counted years, from the accuracy figures as they stand.
    - **By award:** one section per strong award, announced awards first (the higher of their two figures first), then the ones with nothing to list, by date. The heading is the award (Section size) with the category at the right (`--ink-muted`). Under it the **figure sentence**, one line for each kind the award is strong in, in Body: the claim in `--ink` 500, the counts after a dot in `--ink-muted`: "**Caught 62% of Oscar nominees** · 43 of 70 over 14 years" and "**Its winner was Oscar-nominated 93% of years** · 13 of 14". An award strong both ways shows both lines. Then the film list (§7 Film row): Film · this award's result (Won or Nominated pill) · the Oscar stage in this category · marks; the award's winner row on the gold wash. The films are the ones with a result in the award's edition of that year: nominated or better for the first kind, the winner for the second. **Not announced yet:** when the edition has nothing to list, one row replaces the list, on an ink rule: a calendar icon, "**Not announced yet** · nominations 27 Jan" (the next date it has, `--ink-muted`; "winner 22 Feb" once the nominees are out; no date if it has none).
    - **By film:** one flat list, a head row (Film and the strong awards that picked it · Strong awards · Oscar stage), most strong awards first, then most wins, then title. Each row is the Film row with the **picks** line under the title (as the race's precursor line: "Won" or "Nominated" in `--ink-muted`, the award in `--ink`, its figure in `--ink-muted` in brackets, joined by dots): "Won BAFTA Documentary (86%) · Nominated Cinema Eye Audience Choice (57%)". The figure shown is the one that made the film count: the winner figure for the winner of an award that is strong that way, otherwise the nominees figure. The count is a light numeral (18px) with the label "Strong awards" on phone. Awards with nothing to list are named in a neutral Notice above the list: "1 strong award hasn't announced yet. BAFTA, Documentary: nominations 27 Jan."
    - **Footnote:** "A strong award is one whose "Oscar nominees it caught" is 50% or more, or whose winner was Oscar-nominated 80% or more of years, over at least 5 counted years. The figures are today's, so they include 2025 itself." and the link "How accuracy is counted".
    - **States:** *no strong award*: the empty state (award icon, "No strong awards for Animated yet" and the rule in a sentence, a secondary "See the accuracy figures"); *loading*: skeleton film rows; *failed*: the error page (§8.11). Phone: the film rows are the Film row's phone layout, with the results as one wrapped caption line ("Cinema Eye Won · Oscar Shortlisted"); the figure sentence wraps; both segmented controls scroll sideways inside their frames. Drawn in `design-preview.html` §4 (By award, By film and none), at 390 and 1280.

There are no form or settings templates: the app has no editing forms and no settings (product plan §3.12). The inputs it has are search, the year switcher, sort and filter controls, the marks and, on the Watch list, the Add a film box, the drag handles and the release editor (§8.3).

## 9. Icons and imagery

- **Icons:** `lucide-react`, 24px grid drawn at 18px (16px in marks, buttons and pills' neighbours, 14px in chips and grid cells), stroke 1.75 (2.25 in won grid cells), round caps. Colour follows the text, `--ink-subtle` in idle marks.
- **The set:** Search, Menu, X, ChevronDown, ChevronRight, ArrowLeft, Check (watched, won), Bookmark (want to watch), ArrowDown (sort), ArrowUpDown (sort button), Info, AlertCircle, RotateCcw (try again), Award (search results), Calendar (empty race, release line, date field, "Not announced yet"), Plus (the Add a film box), GripVertical (the drag handle), WifiOff (offline), ExternalLink (source links). Add others only from lucide, at the same size and stroke.
- **Imagery:** none. No posters, stills, photos or illustrations. Colour comes from flags; interest from type and numbers.
- **Third-party logos:** only TMDB's, on the Sources section, as its terms require.

## 10. App identity

- **Name as written:** Oscar Movies (working name).
- **Mark:** an abstract statuette (a head, a tapered figure and a base) in `--gold` on an `--ink` square with radius 8 of 32. Geometric, flat, no gradients. Never without its square, never recoloured. SVG in the preview (`#logo`, `#logo16` for 16px).
- **Wordmark:** the mark at 26px + "Oscar Movies" in Geist 600 16px, −0.01em, `--ink`, 10px gap.
- **Favicon and icons:** `app/icon.svg` (the mark), `app/favicon.ico` (16 and 32, from the 16px drawing), `app/apple-icon.png` 180×180 and a 512×512 PNG: full-bleed ink square, figure 62% of the height, centred; the OS rounds the corners.
- **Page titles:** "<page> · Oscar Movies". Race: "The 2025 race · Oscar Movies"; award: "BAFTA 2024 · Oscar Movies"; movie: "I'm Still Here (2024) · Oscar Movies"; 404: "Page not found · Oscar Movies".
- **Link-preview image:** one static `opengraph-image.png`, 1200×630: `--paper` background, the wordmark at the top left, "The Oscar race, with the odds." (Display style, 15ch wide), "Picture · Documentary · International · Animated" in `--ink-muted`, and a 3px gold chance line at 41% along the bottom. The app stays `noindex`; this is only for links shared in messages.

## 11. Copy and tone

**Voice: plain, brief, warm, no jokes.** (Confirmed with the guide's approval, 2026-10-22.) Write like a knowledgeable friend reading out results: short sentences, concrete numbers, no hype, no exclamation marks, no emoji.

- **Case:** sentence case everywhere ("Year grid", "Watch list", "Show all 38 contenders"). Award and film names as they're officially written.
- **Numbers:** whole-number % with no space ("41%"). Counts with "of" ("8 of 14", "4 of 4", "23 of 61 watched"). Thousands with commas. Missing values "–" (en dash), never 0 or "N/A".
- **Dates:** "20 Dec 2025", "Ceremony 15 Mar" (year left out when it's the season's). No weekday. A release date still to come keeps its year ("12 Dec 2026"); once it has passed it reads "Out 3 Oct" (year only when it isn't this year); no date is "TBD".
- **Years:** the film year everywhere ("The 2025 race"), with the ceremony named in the sub line ("98th Academy Awards").
- **Labels:** "To be nominated", "To win", "Final prediction", "Won", "Nominated", "Shortlisted", "Submitted", "Not nominated", "No data", "Partly loaded", "Watched", "Want to watch", "Contender", "My order", "On your list", "Not announced yet", "No results this year", "TBD".
- **Buttons are verbs:** "Try again", "Go to the race", "Show all 21", "Cancel", "Save", "Clear". The box label is "Add a film"; the empty release line "Add release date". Never "OK", "Submit" or "Click here".
- **Empty states** say what's missing and when it comes: "No contenders yet: the first precursor results arrive in December."
- **Errors** say what happened, what it means for the owner, and what to do, without blame or codes up front: "Couldn't save. Hamnet is back to not watched. Check the connection and try again." · "This page didn't load. It's probably a passing problem with the connection or the database. Your marks are safe." · "This page isn't here. The link may be old, or that year or award isn't in the app."
- **Explanations** (the "why", the method) use real counts and years, and say how sure they are: "Three of them won Best Picture."
- **Search:** placeholder "Search films and awards"; no results "No movie or award matches "<text>"."

## 12. Motion

Quiet and quick. Durations: 120ms (hover, press, marks), 200ms (the "why", popovers, tab line), 280ms (phone menu, search sheet). Easing `--ease` (a soft ease-out).

- What moves: the "why" opens by height and fades in; popovers fade and drop 4px; the tab underline slides to the new tab; the mark scales to 0.92 on press and its fill fades; skeletons shimmer slowly; the phone menu and search sheet slide down from the top; the release editor's sheet slides up from the bottom (280ms); a dragged row follows the pointer with no easing and the other rows slide aside in 200ms.
- What doesn't: the chance lines and numbers don't animate on load (they change only when data changes, without animation); no page transitions; nothing bounces.
- **Reduced motion:** all of the above become instant; no shimmer.

## 13. Accessibility

- **Contrast:** body text `--ink` (16.5:1); secondary `--ink-muted` passes 4.5:1 on paper, surface, track and gold wash; `--ink-subtle` only for text 24px and up and for icons (3.4:1); `--ink-faint` never for text that must be read; gold text is always `--gold-ink` (5.2:1); white on `--gold-ink` 5.4:1.
- **Focus:** every interactive element shows `--focus-ring` (2px paper gap, 2px `--gold-ink`) on keyboard focus. Never removed.
- **Keyboard:** Tab reaches everything in reading order; `/` opens search; Esc closes the "why", popovers, the menu and search; arrow keys in tabs, the year grid of the switcher, the sort menu, search results and the Add a film results; Enter opens or picks. Drag by keyboard (v1.1): Space lifts a row by its handle, arrows move it, Space drops, Esc puts it back, with a live region announcing "Picked up…", "Moved … to position 2 of 4", "Dropped…", "Cancelled". The release editor opens with focus in its first field and returns it to its button.
- **Touch targets:** at least 44×44px (marks, the drag handle and the release line have an invisible extended hit area; the editor's fields and buttons are 44px on phone); 8px between neighbouring targets. Dragging never scrolls the page sideways.
- **Semantics:** one `h1` per page (PageHeader); race tabs are `tablist`/`tab` with `aria-selected`; the % is a `button` with `aria-expanded` and `aria-controls` the "why"; marks are `button` with `aria-pressed`; sortable headers carry `aria-sort`; the year grid is a real `<table>` with headers and labelled cells; flags have the country as their name; the toast is `role="status"`; the Add a film box is a `combobox` over a `listbox`; the drag handle is a button named "Reorder <title>" (`aria-roledescription="sortable"`); the release editor is a `dialog` (modal on phone); the sort menu is a `menu` of `menuitemradio`; skeletons sit in an `aria-busy` region.
- **Colour is never the only signal:** won cells carry a check, pills carry words, the chance has its number.
- **Language:** original titles get `lang` where known (e.g. `lang="pt"`).

## 14. Implementation mapping

- **`src/styles/tokens.css`:** §3 unchanged. Imported first in `app/globals.css`.
- **Tailwind (v4, CSS-first):** an `@theme inline` block maps tokens to utilities, e.g. `--color-paper: var(--paper)`, `--color-surface`, `--color-track`, `--color-line`, `--color-line-strong`, `--color-ink`, `--color-ink-muted`, `--color-ink-subtle`, `--color-ink-faint`, `--color-gold`, `--color-gold-ink`, `--color-gold-soft`, `--color-gold-wash`, `--color-on-gold`, `--color-error`, `--color-error-wash`; `--font-sans: var(--font-sans)`; `--radius-*`; `--shadow-pop`, `--shadow-toast`; breakpoints mobile-first: `--breakpoint-md: 761px` (desktop layout from 761px) and `--breakpoint-xl: 1101px` (full search box from 1101px). Default Tailwind colours and shadows are not used.
- **shadcn variables** (in `globals.css`, after `tokens.css`; they point at the tokens and never hold their own values): `--background: var(--paper)`, `--foreground: var(--ink)`, `--card: var(--surface)`, `--card-foreground: var(--ink)`, `--popover: var(--surface)`, `--popover-foreground: var(--ink)`, `--primary: var(--gold-ink)`, `--primary-foreground: var(--on-gold)`, `--secondary: var(--surface)`, `--secondary-foreground: var(--ink)`, `--muted: var(--track)`, `--muted-foreground: var(--ink-muted)`, `--accent: var(--track)`, `--accent-foreground: var(--ink)`, `--destructive: var(--error)`, `--border: var(--line)`, `--input: var(--line)`, `--ring: var(--gold-ink)`. shadcn's `--radius` is the token of the same name (10px). The grey text tokens are named `--ink-*` so they never collide with shadcn's `--muted`.
- **Theme switch:** none. No `.dark` class, no `prefers-color-scheme` rules. `<html>` has `color-scheme: light`.
- **Fonts:** `next/font/google` Geist 300/400/500/600, variable `--font-geist`, assigned to `--font-sans`.
- **Flags:** `country-flag-icons` (3x2 SVGs, MIT) through one `Flag` component (code, size sm/md/lg, accessible name). `Flags` shows one flag (v1.1); the film's primary country comes from `primaryCountry` in `src/lib/flags.ts`.
- **Shared components** (each in `src/components/`): `AppShell` (TopBar, PhoneMenu, SearchCommand, Footer), `PageHeader`, `YearSwitcher`, `CategoryTabs` (race) and `Segmented`, `Chip`, `StageLine`, `ContenderRow`, `WhyPanel`, `ChanceLine`, `Pct`, `Marks` (round, labelled, small), `StagePill`, `Flag`/`Flags`, `ScoreLine`, `ScoreTiles`, `FilmRow`, `StatsStrip`, `DataTable`, `YearGrid`, `Notice`, `EmptyState`, `Skeleton`, toasts (shadcn Sonner, restyled per §7), and from v1.1 `SortMenu`, the Watch list pieces in `src/components/watch-list/` (`AddFilm`, `ReleaseEditor`, a sortable row built on `FilmRow`; drag with `@dnd-kit` using the handle only, with pointer, touch and keyboard sensors) and the strong signals page in `src/components/signals/`. Pages compose these; no page-level one-off styles.
- **`/styleguide`** (dev only): renders §2 and §3 of the preview (tokens, then every component in every state, the v1.1 boards included as they are built) from the real components, for side-by-side comparison with `design-preview.html`.

## 15. Rules and design review checklist

**Do:** use lists and rules before boxes; keep one primary action per screen; let numbers be big and light; show "–" for unknowns; keep every view in the address; use the flags for colour.

**Don't:** add a second accent colour; use gold for anything that isn't a win, the leader, the current stage, a chance, an active mark or the primary action; add shadows to static content; show more than one flag for a film; use posters, stills, illustrations or emoji; use all caps or italics; truncate film titles (except the race tab's leader line); leave shadcn's default look on anything; add a dark theme.

Run for each new or changed page at the end of every phase:

- [ ] Renders inside `AppShell` and starts with `PageHeader`
- [ ] Matches its template in §8 and its frame in `design-preview.html`
- [ ] No raw hex values or one-off styles in the diff (a grep for hex values in `src/components` and `src/app` returns only the tokens file)
- [ ] Colours follow the semantic map in §2 (gold only for its jobs)
- [ ] Wording follows §11
- [ ] Works at 390px (no sideways page scroll, actions wrap, the grid scrolls inside its frame) and 1280px
- [ ] Light only: no dark-mode styles slipped in
- [ ] Keyboard: Tab reaches everything, focus is visible, Esc closes the "why", popovers, menu and search
- [ ] Empty, loading, failure and offline states are designed, not left as defaults
- [ ] Holds up with stress data (titles with no spaces, the longest real titles, huge counts, missing scores)
- [ ] Screenshots at 390 and 1280 taken and checked against the preview
