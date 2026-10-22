# Review triage

Every "should fix" item from a phase review goes to exactly one place: fixed in the review, a named later task, or dropped with a reason (`docs/build-plan.md` Step 10). Details are in the review's commit.

## Phase 0 review (2026-10-22)

**Checks:** full Playwright suite 10 of 10 passed; screenshot spec 4 of 4 passed (390 and 1280, now also asserts no sideways scroll); unit 145 passed; marks database tests 5 passed; typecheck, lint, build clean. Light only, so no dark screenshots (guide §1).

**Guide §15** on `/styleguide`, 404, error and `/`, against `design-preview.html` §2, §3 and §5: AppShell and PageHeader on every page; hex grep clean (only `tokens.css`); no dark styles; gold only for its jobs; wording follows §11; no sideways scroll at 390 or 1280; Esc and keyboard covered by unit tests (menu, year switcher); empty, loading, failure and offline states drawn; stress switch works. Differences already recorded in tasks 0.6–0.12 aren't repeated here.

| # | Item | Where it went |
|---|---|---|
| 0-1 | `db:migrate` / `db:migrate:test` used `node --env-file`, which loses to a `DATABASE_URL` exported in the shell, and skipped the env-file and `app_meta` checks | Fixed: `scripts/migrate.ts` (both npm scripts) |
| 0-2 | A marks export could replace the only backup with a shorter list, or a half-written file; a test export could write `data/marks.json` | Fixed: refuses a shrink without `--allow-shrink`, writes then renames, test can't write the production file |
| 0-3 | Writing scripts ignored unknown arguments (`--dryrun` meant a real write) | Fixed: `checkArgs` in `scripts/lib/target.ts` |
| 0-4 | Restore planned outside its write transaction: a tap during a restore could be overwritten | Fixed: the transaction rechecks the planned rows and writes nothing if one moved |
| 0-5 | A rebuild that died halfway could leave `.next-test` passing as up to date | Fixed: the hash is cleared before each build |
| 0-6 | A branch reset from the other copies `app_meta`, with no recovery written down | Fixed: one paragraph in `docs/runbook.md` |
| 0-7 | `/styleguide` at 390: the switch squeezed the title to "Stylegui / de" | Fixed: switch labels "Normal" / "Stress" |
| 0-8 | `/styleguide` part labels in all caps (guide §4, §15) | Fixed: section headings in sentence case |
| 0-9 | `/styleguide` film list sample: Brazil's flag as submitting country on Sentimental Value (Norway) | Fixed: The Secret Agent |
| 0-10 | Home stage line says "Nominations Jan"; the preview's 2026 frame says "Jan 2027" | Task 1.8 (the real stage line, from the season's dates) |
| 0-11 | Home has no year switcher or "Updated" date | Task 1.8 (recorded in 0.10) |
| 0-12 | Error page reference is Next's numeric digest, not the preview's short hex | Dropped: the digest is what finds the error in Vercel's logs; the guide doesn't set a format |
