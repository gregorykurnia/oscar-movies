# Running the live app

How Oscar Movies is kept safe once it's live (IMPLEMENTATION_PLAN.md §10). Before every release, go through **Checks before a release** at the end. The live URL is in `docs/build-plan.md` (Project details).

## Backups

What can be lost, and where its copy lives:

| Data | Copy | How it comes back |
|---|---|---|
| Award results, movies, editions | `data/` in git | Reload: `npm run load -- --target production --yes-production` (dry run first) |
| Scores | OMDb and TMDB | The next cron run, or `npm run scores:refresh` |
| Accuracy, predictions | Computed | The loader recomputes them |
| **Marks** (watched, want) | `data/marks.json` in git, as fresh as the last export | `npm run marks:restore` (below) |

**Neon's restore window.** Neon Free can restore a branch to any moment in the last 6 hours (Neon console → the project → Branches → `production` → Restore). Use it only for a mistake noticed within hours; anything restored that way loses every mark made after that moment, so export the marks first if the database still answers.

**When the marks are exported** to `data/marks.json` and committed:
- before every production load, correction or race update (the loader does it first and stops if it fails);
- whenever the owner says "back up marks".

```sh
npm run marks:export -- --target production --yes-production   # writes data/marks.json
git add data/marks.json && git commit -m "Back up marks" && git push origin staging
```

The export says how many films the file had before, and it keeps the file as it is when the database has fewer marked films than the file: that usually means marks were lost, and the file may be the only copy. Find out why first. Only if marks were removed on purpose, run it again with `--allow-shrink`. The earlier backups are in git too (`git log -p data/marks.json`). A test export can't write `data/marks.json`, even with `--file`, and every script stops on an argument it doesn't know (a typo in `--dry-run` never becomes a real write).

**Restoring the marks.** Restore writes only films whose marks differ from the file, in one transaction, and never clears a mark the file doesn't mention (it lists those as "keep"). Films are matched by IMDb ID, then by Wikidata QID. If any entry names a film that isn't in the database, it stops and writes nothing.

1. Dry run, and read every line of the plan:
   `npm run marks:restore -- --target production --yes-production --dry-run`
2. If the plan is right, run it without `--dry-run`.
3. Run the dry run again: it must say `0 to write`. If a mark changes between the plan and the write (a tap on the live site), restore writes nothing and asks for a fresh dry run.

To restore from an older backup, take it out of git first (`git show <commit>:data/marks.json > .cache/marks.old.json`) and pass `--file .cache/marks.old.json`.

On `test`, both commands default to `.cache/marks.test.json` (gitignored), so a test run never overwrites the production backup.

**If a branch is reset or restored from the other one** (Neon → Branches → Reset from parent), its `app_meta` row comes along: `test` would then say `production`, and every script and test refuses it (the safe direction). `db:mark-branch` never overwrites a mark, so fix it by hand in the Neon SQL editor on that branch: `update app_meta set value = 'test' where key = 'db_branch';`. `tests/db/marks.test.ts` proves that export then restore changes nothing and that the dry run lists every write.

## Error alerts

- **Failed deployments:** Vercel emails the account owner. Look at the build log in the Vercel dashboard (project `oscar-movies` → Deployments).
- **Runtime errors:** Vercel's runtime logs (dashboard → Logs, or `npx vercel logs <url>`). Hobby keeps them only briefly, so look soon after a problem is reported.
- **The daily scores job:** each run writes a `data_loads` row (`kind = scores`) with its outcome. `/data` shows a notice when scores are more than 3 days old, so a broken cron shows up in the app itself. A run stops early on a refused key, OMDb's daily limit (1,000 calls, shared with `test`) or 10 films in a row failing; its `summary.stoppedBy` says which. To catch up by hand: `npm run scores:refresh -- --target production --yes-production --dry-run`, then without `--dry-run`.
- Who looks: the owner, when an email arrives or a page looks wrong; Claude, when asked ("check the logs").

## Spending limits

Both services run on free plans that can't bill, and it stays that way:
- **Neon Free:** no card on the account. If a limit is reached, the database pauses or refuses; it never charges.
- **Vercel Hobby:** free; no upgrade to Pro without the owner. Hobby stops functions at its limits rather than billing.
- **OMDb and TMDB:** free keys, capped by the services (OMDb: 1,000 calls a day; the score batch stays under it).

If a service asks for a card or an upgrade, stop and ask the owner.

## Rollback

- **Code:** Vercel's Instant Rollback puts the previous production deployment back at once (dashboard → Deployments → the last good production deployment → Instant Rollback, or `npx vercel rollback`). After a rollback, new pushes to `main` don't go live until the rollback is undone in the dashboard ("Undo Rollback") or a deployment is promoted; fix the problem on `staging`, release it, then undo the rollback.
- **Schema:** migrations stay backward compatible for one release (add first, drop a release later), so rolling the code back never meets a schema it can't read. Never roll back a migration by hand; write a new one.
- **Data:** a bad load is fixed by correcting `data/` and loading again (the loader replaces only the editions in the files). Marks: see Backups.
- **Tried once** on a deployment before the launch release (task 3.R). Record the date here: _not yet_.

## Search engines

The app is private, so search engines are kept out three ways:
- `robots.txt` disallows every crawler (`src/app/robots.ts`);
- every page has `<meta name="robots" content="noindex, nofollow">` (the root layout's metadata);
- every response has the header `X-Robots-Tag: noindex, nofollow` (`next.config.ts`).

Check on the live URL (`$URL`):

```sh
curl -s "$URL/robots.txt"                                  # User-Agent: * / Disallow: /
curl -sI "$URL/" | grep -i x-robots-tag                    # X-Robots-Tag: noindex, nofollow
curl -s "$URL/" | grep -o '<meta name="robots"[^>]*>'      # content="noindex, nofollow"
curl -sI "$URL/does-not-exist" | grep -i x-robots-tag      # the 404 sends it too
```

## Security

No sign-in (the owner's choice). The only write from the app is the marks action (validated). The cron route needs `CRON_SECRET` and the revalidate route needs `REVALIDATE_SECRET`. Imports run only from scripts on this server, and every script that writes needs `--target` and, for production, `--yes-production`.

## Checks before a release

- [ ] Marks exported and committed if this release comes with a production load or migration
- [ ] Any production migration approved by the owner and run before the code goes live
- [ ] The four search-engine checks above pass on the live URL after the deploy
- [ ] The live URL loads and reads the database
- [ ] Launch release only: rollback tried once (date recorded above), spending limits checked in both dashboards
