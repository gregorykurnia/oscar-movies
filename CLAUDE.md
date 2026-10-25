# Oscar Movies

A web app about Oscar movies (what it does is decided in `PRODUCT_PLAN.md`, Steps 1–2). Read these before doing any work:

1. `docs/build-plan.md`: how this app is being built, where the process stands, and what's waiting for the owner. Check the model at the start of each session against its picks (or the task's pick in `IMPLEMENTATION_PLAN.md` §7 during the build). If the current model is lower, say so and suggest switching.
2. `PRODUCT_PLAN.md`: what the app does. Source of truth for features.
3. `IMPLEMENTATION_PLAN.md`: stack, schema, routes, the phase checklists and the model for every task. **Build one task at a time:** check the model and effort against the task's pick, do the task, run the checks, tick it in the plan, commit and push, then stop and tell the owner the next task with its model and effort. Do several tasks in one go only when the owner says so, and stop anyway when the model changes, at the end of a phase, or at anything that needs the owner. Under `autorun`, each session does its one task and ends.
4. `DESIGN_GUIDE.md`: **binding visual rules for every page** (including forms, settings, 404 and error pages). `design-preview.html` is the visual reference. Open it in a browser and match it.

## Non-negotiables
- All styling uses the tokens in `src/styles/tokens.css` (copied from `DESIGN_GUIDE.md` §3). No raw hex values in components. Don't leave shadcn's default styling.
- Every page renders inside `AppShell` and starts with `PageHeader`.
- Run the design review checklist (`DESIGN_GUIDE.md` §15) before marking a phase done.
- Tests run against the Neon `test` branch, never `production`.
- Secrets live in `.env.local` / `.env.test` (gitignored). Never print, commit or copy connection strings into docs.
- Don't add features beyond `PRODUCT_PLAN.md` without asking. Ideas go to the owner first.

## Branches: work goes to `staging`, releases go to `main`
- `main` is production: Vercel deploys every push to `main` (the live URL is in `docs/build-plan.md`). It only moves in a **release**, when the owner says "release", "ship it", "go live" or "push to main". Never commit on `main`.
- `staging` is where finished work collects. Vercel ignores it (`vercel.json` turns its deployments off), so nothing goes live. The project folder has `staging` checked out.
- **At the start of every session**, run `git branch --show-current`, and `git fetch origin` once `origin` exists. The branch must be `staging` (if it isn't, `git switch staging`). Then run `git pull --ff-only origin staging`.

## Commit and push after every change (always automatic)
Commit and push to `staging` on `origin` after every change, without asking first, and say what changed in the final message. This includes edits to this file and to the plans. Until `origin` exists, commit locally; the first push sends every commit. So every change goes through these steps before the turn ends:

1. Once the app is scaffolded, run `npm run typecheck`, `npx eslint <changed files>` and the unit tests related to the change (`npx vitest related <changed files> --run`). Run `npx playwright test tests/e2e/smoke.spec.ts` too when the change adds or reworks a flow (a new page, a new way to add, edit or delete something, new database reads or writes), plus the specs the change adds or edits and the spec of the page it's mainly about. A new option, label, filter value or wording in a flow that already works needs unit tests only; a new stored value gets a unit test that it reads back. Once per task, before its last commit, run the full `npm test` and `npm run build`. If a check fails because of the change, fix it first. Never commit or push a change that breaks a check.
   - The full Playwright suite is not a per-change gate. Run it at the end of each phase, before a release, or when the owner asks.
   - Not the specs of every page that uses a shared component or layout the change touched: unit tests cover shared code, and the full suite catches the rest at the phase review. Say in the final message that a full check is worth running.
   - Changes to plans, docs or this file only skip the checks.
   - Don't rerun a check when nothing it covers has changed since it passed.
   - After a Playwright failure, fix it and rerun only the tests that failed: the same spec paths with `--last-failed` added. Once they pass, rerun the full list only if the fix changed code the other tests use (a shared component, a hook, the data layer), not for a fix to the spec or that one page. The same goes for any other slow script (screenshots, compare runs): rerun only what the fix touched, with the script's own filter.
   - A failure from the environment in a flow the change doesn't touch (a dropped database connection, a timeout) is not a blocker. Name the test and the reason in the commit message and the report, then push.
2. Check `git status`. Stage only the files you changed, with `git add <paths>`. If the tree holds changes that aren't yours, leave them unstaged and out of the commit. Never stage `.env*`, `screenshots/`, `.vercel/`, `node_modules/`, `test-results/` or `playwright-report/`.
3. Commit to `staging`. The message says what changed and why. End it with the `Co-Authored-By` line for the model that did the work.
4. Check `git log origin/staging..staging`, because a push sends every unpushed commit. Then push with `git push origin staging`.
5. Tell the owner what changed: the files, what each change does, the commit hash, and, for a visible change, which page to look at in the preview. Say how many commits on `staging` aren't live yet (`git rev-list --count origin/main..origin/staging`).

- A task brief does not change this. Don't hold commits or pushes for approval, even when a brief says to commit locally or wait. Any unpushed commit on `staging` gets pushed in the same turn.
- Never force-push and never rewrite published history.
- The change log, if the project keeps one, lives in `CHANGELOG.md` with one to three lines per entry; details go in the commit body. Never keep it in this file or `AGENTS.md`: both load into every session.

## Releasing to production (only when the owner asks)
Releases run on `staging`.

1. `git fetch origin` and `git pull --ff-only origin staging`. Show the owner what will go live: `git log --oneline origin/main..origin/staging`, summed up in plain words, and anything on the **Waiting for the owner** list.
2. Run `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` and the full Playwright suite (`npm run test:e2e`). For the launch release, also run the "Before a release" checks in Step 10 of `docs/build-plan.md`. Any failure caused by the code stops the release. Fix it first, on `staging`.
3. If anything being released needs a production migration, stop and ask. Run `npm run db:migrate` only when the owner approves, and release only after it has run, because the live site reads the schema. Migrations go to the `test` branch first (`npm run db:migrate:test`).
4. Push `staging` to `main` with exactly `git push origin staging:main` (the form the owner's settings allow; any other is blocked as a production deploy). If auto mode blocks it, give the owner the same command with `!` in front and say the allow rule is missing on this machine. It refuses anything but a fast-forward: if it does, `main` has commits `staging` doesn't; stop and tell the owner. Never merge the other way round or force anything.
   - **"Release now":** push once the light checks pass, and run step 2's checks after. Anything they find is fixed on `staging` and released again.
5. Check that Vercel's production deployment succeeded (`vercel ls`, or the dashboard) and that the live URL loads. Tell the owner the URL, the commit that's now live, and what changed for users.

## Previews (no Vercel needed)
This project lives on the Oracle server (`investment-office`, Tailscale address `100.118.18.29`), not on the Mac.
- `npm run dev`: live-reloading app on port 3000. Best while building.
- `npm run preview`: the production build on port 3000, the way the live app will behave. From the Mac or the phone, with Tailscale on, open `http://100.118.18.29:3000`. Stop `npm run dev` first; they share the build folder and port.
- `npm run preview:share`, while `npm run preview` is running: a temporary public `https://…trycloudflare.com` link, for showing someone without Tailscale. It needs `cloudflared` installed on the server once (not installed yet). Anyone with the link can open the app while it runs, so stop it when done. The link changes every time, and a sign-in provider may need its address added before login works there.
- When the owner says "preview", "show me" or "share a link", start `npm run preview` (and `preview:share` if asked) in the background, wait until it answers, and give the addresses. Stop them when the owner is done.
- Previews use the database in `.env.local`. If that is the `production` branch, anything changed in a preview changes real data, and code that needs an unreleased migration won't work there.
