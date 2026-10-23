# Launch checks (task 3.8)

Run once on 2026-10-23 against the production build on the `test` branch (`npm run launch:check`, spec `tests/launch/launch.spec.ts`; the security scan was read by hand over the whole app, not just a diff). Nothing was fixed here: every item below goes to a fix task or to 3.R. Severity: **fix** (do before the release), **should** (do in 3.R if cheap), **accept** (written down, no change).

## 1. Accessibility (axe-core 4.14, WCAG 2.0/2.1/2.2 A and AA plus best practice)

14 pages at 390 and 1280 (28 views): home, race 2024, Oscars 2025, BAFTA 2025, awards index, festivals index, submissions, a movie, watch list, accuracy, 2025 grid, year summary, data, 404. **Two rule violations in 28 views; everything else passes** (labels, names, roles, landmarks, heading order, link names, table markup, focus order rules).

| # | Where | Finding | Severity |
|---|---|---|---|
| A1 | Home and `/race/2024` at 390 | `color-contrast`, serious, 4 nodes: the inactive category tabs' names (`CategoryTabs.tsx:102`, `text-ink-subtle` = #8C877E on paper, 3.45:1) at the phone size `text-section-phone` (20px, medium weight). Guide §3 allows `ink-subtle` only for text of 24px and up. At 1280 the tab is `text-section` (larger) and passes. Fix: use `ink-muted` below the `md` breakpoint (or `ink-subtle` only from `md`); check the hover colour still reads as hover. | fix |
| A2 | `/data` at 390 | `scrollable-region-focusable`, serious: the coverage table's scroll frame (`DataTable.tsx:53`, `-mx-2 overflow-x-auto`) scrolls sideways on a phone but holds nothing focusable, so a keyboard user can't scroll it. Fix: give the frame `tabIndex={0}`, `role="region"` and an `aria-label` (the table's caption) when it has no sortable headers; keep the focus ring from the tokens. Other tables on 390 hold sort buttons or links, so they pass; a rule in the shared frame covers any later table. | fix |

Not covered by the scan (needs a person): screen-reader reading order of the race's "why" panel and the grid's cells, 200% zoom, and the real phone. The Phase 3 review's design checklist (guide §15) already lists contrast, focus and keyboard.

## 2. Performance of `/` and `/grid/2025`

Three cold runs each on the production build (`next start`, localhost, so no network cost: it measures the app's own work). Phone = 390 wide with the CPU slowed 4x. Medians.

| Page, viewport | TTFB | FCP | LCP | CLS | Long tasks (blocking) | HTML | JS | DOM nodes |
|---|---|---|---|---|---|---|---|---|
| `/` phone | 9 ms | 664 ms | 740 ms | **0.136** | 9 (529 ms) | 293 KB | 179 KB | 1361 |
| `/` laptop | 11 ms | 372 ms | 372 ms | 0.079 | 2 (56 ms) | 293 KB | 189 KB | 1365 |
| Grid phone | 8 ms | 472 ms | 528 ms | **0.136** | 5 (440 ms) | 80 KB | 185 KB | 1624 |
| Grid laptop | 11 ms | 308 ms | 308 ms | 0.084 | 2 (62 ms) | 80 KB | 192 KB | 1627 |

Load and LCP are well inside the "good" thresholds (LCP under 2.5 s). Both pages are prerendered, so TTFB on Vercel will be the CDN's, not a database round trip. Not measured here and left for the owner's phone check: real mobile network and the live deployment's region (`sin1`).

| # | Finding | Severity |
|---|---|---|
| P1 | **Layout shift, 0.136 on a phone (limit 0.1) and about 0.08 on a laptop, on both pages.** One shift each: the footer (`footer.border-t`) jumps down when streamed content arrives after the first paint (at about 1.6 s on the slowed phone), so the shell is painted with a short page and the real content pushes the footer. Fix: give each streaming section's Suspense fallback the height of what replaces it (or a `min-height` on `main` of about one screen), then re-measure with `npm run launch:check -- --grep performance` (it prints the shifted nodes). | fix |
| P2 | Home's HTML is 293 KB (the race renders every tab's rows in one document; not broken down further). Fine on the CDN; on a slow phone it is the largest download. Not worth changing now; look at it if the owner's phone feels slow. | accept |
| P3 | Phone main-thread work: 9 long tasks (529 ms of blocking over 50 ms each) on `/` at 4x slowdown, about 56 ms on a laptop. Not profiled further (likely hydration). Revisit only if the owner's phone feels slow. | accept |

The screenshot spec, sort and the "why" are unchanged by these findings.

## 3. Security (`/security-review`'s areas, by hand over the whole app)

No high or medium findings: nothing that exposes data, runs attacker-supplied code or lets a visitor touch more than the marks table.

What was checked and holds:
- **Secrets.** `.env*` is gitignored; the only tracked file is `.env.example` (names only). A search of tracked files and of every commit for connection strings, key shapes and bearer tokens finds only the fake one in `scripts/lib/target.test.ts`. No `NEXT_PUBLIC_` variable exists, so no secret can reach the browser. `APP_URL` only sets `metadataBase`.
- **Routes with secrets.** `/api/cron/scores` and `/api/revalidate` compare the Bearer token with `timingSafeEqual`, refuse everything when the secret isn't set, and `/api/revalidate` accepts only the two known tags.
- **The one write.** The marks Server Action validates with a strict zod schema (positive integer id, two booleans, never both), writes only when the film exists, returns `{ ok: false }` on any failure and logs without echoing the error to the visitor. Next's built-in same-origin check protects Server Actions.
- **Injection.** Search is the only free text: capped in length, accent-folded, `LIKE` and regex characters escaped, and passed as parameters through Drizzle's `sql` templates. No `sql.raw`, `dangerouslySetInnerHTML`, `eval` or `innerHTML` anywhere in `src`. Address parameters (`sort`, `dir`, `filter`, `critics`) are matched against fixed lists.
- **Links and pages.** The only external link is the Creative Commons licence (`rel="noreferrer"`); no `target="_blank"`. `/styleguide` and its sub-pages return 404 when `VERCEL_ENV` is `production`. `robots.txt` disallows all and every response sends `X-Robots-Tag: noindex, nofollow`.
- **Dependencies.** `npm audit --omit=dev`: 0 vulnerabilities in what ships.

| # | Finding | Severity |
|---|---|---|
| S1 | No security headers beyond `X-Robots-Tag` (`next.config.ts`). Add `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`) and a minimal `Permissions-Policy`. A full CSP needs care with Next's inline scripts: leave it out unless a nonce setup is wanted. Two lines in the existing `headers()` block. | should |
| S2 | The search route and the marks action are public with no rate limit; anyone with the address can write marks (the owner's choice: no sign-in) or run many searches (a trigram query each). Worst case is a cost or a changed mark, never a leak. A Vercel Firewall rate-limit rule on `/api/search` is a production setting, so it is the owner's to add; nothing in the code needs to change. | accept (owner: optional firewall rule) |
| S3 | `npm audit` (dev tools only) lists 9: `eslint-config-next` → `fast-glob`/`micromatch`/`braces` (regex slowness on crafted patterns) and `drizzle-kit` → `esbuild` (its dev server answers any website). None ship; none run on a server. The offered fix is a downgrade (`eslint-config-next@14`, `drizzle-kit@0.18`), so it is not applied. Look again when those packages publish fixed versions. | accept |
| S4 | One database role serves the app's reads, the marks write and (through the same pooled string) nothing else. A read-only role for the pages and a second for the marks action would limit a bug to one table. Optional hardening, and a production setting. | accept (owner) |

## 4. What this task changed

`tests/launch/launch.spec.ts` (the scan and the timings; writes `test-results/launch/`, which Playwright empties at the start of every run), the `launch` Playwright project, `npm run launch:check`, and `axe-core` 4.14.0 as a direct dev dependency (it was already installed through `eslint-config-next`). No app code was changed.
