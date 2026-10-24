# New App Playbook

A reusable process for turning an idea into a live, well-designed web app: from the owner describing it in their own words, through a product plan, a chosen design, a technical plan, connecting GitHub, Neon and Vercel, the build, and the checks that keep it working.

**Core principle:** decide before building. Each step produces one document that the next step treats as binding. Product decisions live in the product plan, visual decisions in the design guide, technical decisions in the implementation plan. Code follows the documents; when the code needs something the documents don't answer, the document is updated first.

**Every project is a web app on the default stack** (below): code on GitHub, data in Neon Postgres, hosted on Vercel. Every project's `CLAUDE.md` makes Claude commit and push to a **`staging`** branch after every change and say what changed. Vercel ignores `staging`, so nothing goes live until the owner asks for a **release**, which fast-forwards `main` to `staging`; only `main` deploys to production. Until then the owner looks at changes in a **local preview** (on the Mac, on a phone on the same Wi-Fi, or through a temporary share link).

**The build runs one task at a time, in one folder**, each task on the model and effort the implementation plan picked: by hand, or unattended with `autorun` (§7.4). The plan is written so `autorun all` can take it from the first task to the last.

**The documents** (at the project root unless noted):

| File | Written in | What it decides |
|---|---|---|
| `docs/build-plan.md` | Step 0 | This playbook, copied into the project: the process, its checklist, and what's waiting for the owner |
| `CLAUDE.md` | Step 0 | Project rules, including commit and push to `staging` after every change, releases to `main`, and local previews |
| `PRODUCT_PLAN.md` | Steps 1–3 | What the app does, for whom, and in what order it gets built |
| `design/brief.md` | Step 4 | What the owner wants the design to feel like |
| `design/directions/` | Step 5 | Three design options, and the one picked (`design/decisions.md`) |
| `DESIGN_GUIDE.md` + `design-preview.html` | Step 6 | How every page looks. Binding |
| `IMPLEMENTATION_PLAN.md` | Step 7 | Data, routes, phases, the model for every task, and how the live app is run |

---

## How to run this

1. Say: **"Start a new app from `~/.claude/playbooks/new-app.md`."** Claude does Step 0, which copies this playbook into the project as `docs/build-plan.md`. **From then on, the project's copy is the plan**: Claude reads and ticks that copy, never this file. This file stays a generic template, and later improvements to it don't change a project that's already running (Claude may mention them; the owner decides whether to bring them in).
2. After Step 0, **one step per session**. Each session starts with a model check (below) and reads only what that step needs.
3. Progress is ticked in the **Checklist** at the end of `docs/build-plan.md`. Anything waiting for the owner goes in its **Waiting for the owner** list.

---

## The default stack (every project)

| Concern | Choice |
|---|---|
| App | **Web app**, working at phone and desktop widths |
| Framework | **Next.js (App Router) + TypeScript**, on the current Node.js LTS |
| Database | **Neon Postgres**, with a `production` branch for real data and a `test` branch for tests |
| Data access | **Drizzle ORM** with the Neon serverless driver. **drizzle-kit** migrations, checked into the repo as SQL files |
| Writes and validation | **Server Actions + Zod**: the same validation runs on the server for every write |
| Styling | **Tailwind CSS + shadcn/ui**, every component restyled to the design guide's tokens. No default shadcn look |
| Fonts and icons | `next/font`, and `lucide-react` unless the design guide picks another icon set |
| Tests | **Vitest** (logic, and database tests against the `test` branch) + **Playwright** (end-to-end flows and screenshots) |
| Code | **GitHub**: work on `staging`, release to `main` |
| Hosting | **Vercel**, connected to the GitHub repo. Only `main` deploys (to production); `vercel.json` turns off deployments for `staging` |
| Previews | **Local**: `npm run dev`, `npm run preview` (production build, also on a phone on the same Wi-Fi) and `npm run preview:share` (temporary public link through `cloudflared`) |

- Libraries beyond this (drag and drop, Markdown, tables, charts) are chosen per project in the implementation plan, with a reason each.
- Versions are pinned to the latest stable releases at setup. Check each library against its **current docs** (the installed package's own docs, or Context7), never memory alone: Next.js in particular changes between versions.
- Leaving the default stack (another database, another host, a native app) needs the owner's approval, recorded under **Decisions so far** in the product plan.

---

## Choosing the model for each step

**The model table lives in `~/.claude/CLAUDE.md`, under "Model choice for coding implementation".** Each step says what *kind* of work it is and gives the current pick. If the table has changed since this was written, choose again by the kind of work. The table wins over the picks written here.

**In the project's copy:** Step 0 pastes a dated snapshot of the table here, so sessions that can't read `~/.claude` (Claude Code on the web, another machine) still have it. When the global table can be read and differs from the snapshot, the global table wins, and the snapshot is updated.

**Model table snapshot (2026-10-22, from `~/.claude/CLAUDE.md`).** Lower rank = better.

| Model + effort     | Cost / task | Terminal Bench rank | Presentation Elo rank |
|--------------------|-------------|---------------------|-----------------------|
| Opus 5.5 High      | $1.82       | 8                   | 5                     |
| Opus 5.5 Medium    | $1.34       | 13                  | 20                    |
| Sonnet 5.5 High    | $0.88       | 23                  | 22                    |
| Haiku 5.5 Max      | $0.21       | 38                  | 35                    |
| Opus 5.5 Low       | $0.55       | 40                  | 99                    |
| Sonnet 5.5 Medium  | $0.48       | 43                  | 67                    |
| Haiku 5.5 xHigh    | $0.12       | 44                  | 47                    |
| Haiku 5.5 High     | $0.08       | 54                  | 64                    |
| Haiku 5.5 Medium   | $0.05       | 66                  | 82                    |

| Kind of work | What to optimise | Current pick |
|---|---|---|
| **Product and UX thinking** (interviewing the owner, the product plan) | Judgment *and* presentation: the plan decides how the app feels to use | Opus 5.5 High |
| **Visual design** (directions, design guide, preview, the component library and app shell) | Best Presentation Elo rank | Opus 5.5 High |
| **Architecture and risky code** (implementation plan, data schema, migrations, auth, anything that can lose data or break production, complex interactive UI) | Best Terminal Bench rank | Opus 5.5 High |
| **Careful judgment on a well-specified task** (feasibility check, plan reviews, feature-plan updates, tricky pure logic with tests) | Strong Terminal Bench rank at lower cost | Opus 5.5 Medium |
| **Many rules, low damage** (pages and forms built from the design guide's templates, end-to-end tests, connecting services and secrets, release-check triage) | Middle tier | Sonnet 5.5 High |
| **Mechanical, exact reference** (setup, copying tokens, scripts, screenshot specs, config, ticking checklists, docs, upkeep scans) | Cheapest that is reliable | Haiku 5.5 Max → xHigh → High |

Never pick **Opus 5.5 Low** or **Sonnet 5.5 Medium**: Haiku 5.5 Max beats both on both ranks at under half the cost (see the global table notes). Opus 5.5 Low is also poor for anything visual.

**Where Haiku stops:** Haiku 5.5 rows are for exact copies with no state or interaction logic (tokens, icons, a component gallery, scripts). A screen with interaction, failure states or changes to shared components starts at Sonnet 5.5 High: in a calibration trial, Haiku 5.5 Max bent a shared component, could save a record twice on retry and skipped the failure states.

**Model check:** at the start of every session, compare the current model and effort with the step's pick (or the task's pick during the build). If the current one is lower, say so before starting and suggest switching (`/model` and `/effort`). If it's much higher for a mechanical step, suggest the cheaper one.

### Picks per step

| Step | What | Pick |
|---|---|---|
| 0 | Setup, and copying this playbook into the project | Haiku 5.5 High |
| 1–2 | Idea interview and product plan (same session) | Opus 5.5 High |
| 3 | Feasibility check (fresh session) | Opus 5.5 Medium |
| 4 | Design brief | Haiku 5.5 Max |
| 5 | Three design directions | Opus 5.5 High |
| 5 | Screenshots of the directions | script, no model |
| 6 | Design guide and preview | Opus 5.5 High |
| 7 | Implementation plan | Opus 5.5 High |
| 7 | Plan review (fresh session) | Opus 5.5 Medium |
| 8 | Connect GitHub, Neon and Vercel | Sonnet 5.5 High (secrets and production settings) |
| 9 | Build | per task, chosen for this app in the implementation plan (§7 there), one task at a time |
| 10 | Per-change checks | scripts, no model |
| 10 | End-of-phase review (fresh session) | Opus 5.5 High if the phase changed any page; Opus 5.5 Medium if it changed only data or logic |
| 11 | Release checks | Sonnet 5.5 High (fixes go by the task tiers) |
| 12 | New feature: plan update | Opus 5.5 Medium (Opus 5.5 High if it reshapes the data model) |
| 12 | New feature: design addition | Opus 5.5 High |
| 12 | Bug fix | Sonnet 5.5 High; Opus 5.5 High if data or production is at risk; Haiku 5.5 Max for copy and typo fixes |
| 13 | Upkeep scan | Haiku 5.5 Max (upgrades go by the task tiers; a major framework upgrade is Opus 5.5 High) |

---

## Step 0: Setup (Haiku 5.5 High)

1. Agree the app's working name and folder with the owner (default `~/projects/<kebab-name>`).
2. Create the folder, run `git init -b main`, and write `.gitignore` **before anything else**, so secrets can never be committed: `.env*` (except an `.env.example` with names only), `.vercel/`, `node_modules/`, `.next/`, `screenshots/`, `test-results/`, `playwright-report/`.
3. **Copy this playbook to `docs/build-plan.md`** and fill in its **Project details** (end of the file): the name and folder now, the rest as it becomes known. Paste the model table snapshot into "Choosing the model".
4. Write `CLAUDE.md` from Appendix A, with the name filled in. It carries the staging, release and preview rules from day one.
5. Make the first commit on `main` (the only commit ever made on `main` directly), then create the working branch: `git switch -c staging`. Every later commit goes on `staging`.
6. **GitHub, if the owner has it ready:** ask for the repo URL (an empty repo). Add it as `origin` and push both branches (`git push -u origin main staging`), so the plans are backed up from the start, and the commit-and-push rule applies from now on. If it isn't ready, commit locally; the first push in Step 8 sends everything. Tick Step 0.

## Step 1: The owner describes the app (Opus 5.5 High)

The owner talks first, in their own words, as loosely as they like. Claude doesn't propose anything until the owner has finished.

Then Claude **interviews in rounds of at most 5 questions**, using AskUserQuestion with a recommended default on each, so every question can be answered with one click. The platform and stack are already decided (a web app on the default stack), so don't ask about them. Cover, in roughly this order:

1. **Who and how often:** who uses it (just the owner? a team? the public?), on which devices, how often, in what situation
2. **The jobs:** the 3–5 things people come to do, and which one happens most
3. **The data:** what gets stored, how much, and **how it gets in**: typed by hand, imported from an existing file or spreadsheet, or pulled from another service
4. **Access:** login or not, roles, sharing, privacy, what a visitor can do
5. **Must-haves vs. nice-to-haves**, and what "it works" looks like for the owner
6. **Anything they've seen** that they like or dislike (for features and flow, not looks: looks come in Step 4)
7. **Constraints:** budget for paid services, deadlines, anything the app must connect to

Stop asking when the plan can be written. Whatever is still unknown goes into the plan's **Open questions**, each with a default, so nothing blocks on it.

## Step 2: Product plan (same session, Opus 5.5 High)

Write `PRODUCT_PLAN.md` from the skeleton in Appendix B. It describes **what** and **why**, never code.

**Good-UX checklist**: the plan must answer each of these, either in a feature's requirements or in its UX notes:
- **The most frequent job is the fastest.** It's reachable from anywhere in one step, and its flow has the fewest steps. Write the top 3 flows out step by step and count the steps.
- **Data entry is comfortable** if people type things in: keyboard-friendly, sensible defaults, bulk add where it repeats, validation inline and before saving, typed input never lost on an error.
- **Every list** has an empty state, and search, filter or sort once it can grow past about 20 items. Filters that matter are kept in the address, so a link reproduces the view.
- **Nothing loses data silently.** Destructive actions are confirmed or undoable. Deletes that would break other records are blocked with a reason.
- **Every action gives feedback:** saved, failed, and why it failed in plain words.
- **States are designed, not left to chance:** nothing yet (including the very first visit, before any data exists), loading, failure, no connection, no permission, no results.
- **Phone and desktop** both work, with touch targets big enough for a thumb.
- **Accessibility:** everything reachable by keyboard, visible focus, enough contrast, labels for screen readers.
- **People always know where they are**, and Back does what they expect.

**Starting data:** the plan says how the first real data gets in (typed in after Phase 1, imported from the owner's file, or both), and which phase builds the import if there is one.

**Suggestions:** Claude may propose features the owner didn't mention (things that make the core jobs better), but lists them separately as suggestions. The owner accepts or declines each one. Accepted ones become requirements; declined ones go to **Out of scope**, so they aren't suggested again.

**Build plan:** the plan ends with phases in build order. Each phase is usable by itself, so the owner can start using the app and give feedback early. Each has a one-line **Done when** that a test can check. Phase 0 is always the foundation, and it ends with the app live on Vercel.

Show the owner a short summary: the core jobs, the phases, the suggestions to accept or decline, and the open questions with their defaults. Revise until the owner is happy with the draft. Approval comes after the feasibility check.

## Step 3: Feasibility check (fresh session, Opus 5.5 Medium)

Before any design work, check that the plan can be built well on the default stack, at a cost the owner accepts. Read only `PRODUCT_PLAN.md` and the default stack. Check:

- **Services beyond the stack:** does any feature need email, file uploads, login, payments, AI, scheduled jobs, realtime or a third-party API? For each: which service, what it costs, what the owner will have to set up or send in Step 8.
- **Platform limits:** Vercel's function time and request-size limits (large uploads need direct-to-storage uploads), and Neon's storage, compute and history limits on the owner's plan.
- **Third-party APIs:** do their terms and rate limits allow what the plan needs?
- **Data size and speed:** will the biggest list, search or page stay fast at the expected size?
- **Anything hard to build** that deserves its own phase, or a simpler version first.

Write the result into the product plan's **Technical approach** (feasibility notes and any extra services), and flag every requirement that has to change, with a suggested change. The owner decides; the plan is revised. **Then the owner approves**: set the status to `Approved v1.0 (<date>)`. Later changes bump the version and add a dated line under **Decisions so far**.

## Step 4: Design brief (Haiku 5.5 Max)

A short conversation to capture what the owner wants the design to *feel* like, before anything is drawn. One or two rounds of AskUserQuestion, each with a default:

- **Personality:** pick from pairs, for example calm or energetic, playful or serious, dense and tool-like or airy and editorial, warm or clinical
- **References:** 2–3 apps or sites the owner admires the look of, and what exactly they like about each
- **Colour:** any colours they love or hate; bold or restrained
- **Type:** classic, modern, technical or characterful
- **Light and dark:** both (the default), light only, or dark only
- **Density:** how much on a screen at once
- **Branding:** name, logo, anything that must or must not appear (for example no third-party logos)
- **Voice:** how the app talks: plain and brief, warm, playful, formal
- **Things to avoid**

Write the answers to `design/brief.md`, plus the **#1 screen** (the screen of the most frequent job from the product plan), which the directions will show.

## Step 5: Three design directions (Opus 5.5 High)

Most of the cost is in *building* directions, so each one is kept small, and the owner judges them from screenshots.

- **Three deliberately different directions.** They differ in how people move around, density, type, colour and personality, all within the brief. Not three shades of one idea.
- Each direction is **one static HTML file**: `design/directions/<letter>-<name>/index.html`.
  - It shows the #1 screen, plus one secondary moment if it's needed to show how people move around.
  - It uses **realistic mock data** taken from the product plan, never lorem ipsum.
  - CSS is inline, with no build step, no interactivity and no dark mode. It responds to width, so the same file gives the phone view.
- Each gets a **`README.md` of at most 10 lines:** the idea, how people move around, density, type and colour.
- **Screenshots by script, not by model.** `design/directions/shoot.sh` captures `desktop.png` (1440×900) and `phone.png` (390×844) for each direction and opens them. Use headless Chrome if it's installed, otherwise `npx -y playwright screenshot`, and only load local `file://` pages. Claude looks at **one** screenshot at most, to check it rendered, and doesn't describe the images: the owner looks at them.
- The owner picks one, or asks for a mix ("A's layout with C's colours"). **A mix gets one more round, then it's settled.** Record the choice, and the owner's reason in terms of the brief, in `design/decisions.md`.

## Step 6: Design guide and visual reference (Opus 5.5 High)

Expand only the chosen direction. Write:

- **`DESIGN_GUIDE.md`**, from the skeleton in Appendix C. It's binding for every page, including forms, settings, 404 and error pages, and loading states. It also covers **copy and tone** (voice, labels, button wording, message wording), **icons and imagery**, and **app identity**: the name as it appears, the wordmark, favicon, app icon, page title pattern, and the link-preview image.
- **`design-preview.html`**: one self-contained file that draws every token, every component in every state, and a template for every *kind* of page in the product plan (list, detail, form, settings, empty, error), in **light and dark**, at **desktop and phone** width. It also shows the favicon, app icon and link-preview image. It has a **stress data** switch: very long names with no spaces, huge counts, empty optional fields, the longest realistic text. This file is the visual reference the build is compared against.
- **The tokens** as a CSS block at the top of the preview, copied exactly into the guide (§3 there). The build copies them into `src/styles/tokens.css` unchanged.

Walk the owner through the preview in the browser. When they approve, freeze the guide: `v1.0 (<date>)` at the top. Later changes go through an Opus 5.5 High session that updates the guide and the preview together and bumps the version.

## Step 7: Technical implementation plan (Opus 5.5 High)

Write `IMPLEMENTATION_PLAN.md` from the skeleton in Appendix D. It covers **how**, and it changes as the build goes; the product plan stays the source of truth for **what**. **Keep it lean:** every task session reads it, so a phase's task section fits on about one screen and each task is a few lines (what, which files, Done when, pick and reason), and notes added when a task is ticked are one line. History goes in git and `CHANGELOG.md`, never back into the plan.

1. **Stack:** the default stack, plus any project-specific libraries and the extra services from the feasibility check, each with a reason.
2. **Environments and secrets:**

   | Environment | Neon branch | Env vars live in |
   |---|---|---|
   | Local development | `production` (or a `dev` branch if the owner prefers not to touch real data locally) | `.env.local` |
   | Automated tests | `test` | `.env.test` |
   | Vercel Preview | `test` | Vercel, Preview environment |
   | Vercel Production | `production` | Vercel, Production environment |

   The app uses the pooled connection string; migrations use the direct one. Migrations run on `test` first (`npm run db:migrate:test`); production (`npm run db:migrate`) only with the owner's approval, and before the code that needs it is released to `main`. A migration or import that rewrites existing records also gets a backup right before it, a dry run that lists every planned write for the owner to review, and a second run that plans nothing (so a retry is safe).
3. **Data:** schema, constraints, delete rules, indexes, ordering, search. Plus **seed data** for the `test` branch (fixtures the end-to-end tests rely on) and, if the product plan has one, the **import** for the owner's existing data.
4. **Design mapping:** how the guide's tokens reach the code (`tokens.css`, the Tailwind theme, the shadcn variables), the shared layout components every page uses (`AppShell`, `PageHeader`), and a dev-only `/styleguide` route that renders every component next to the preview for comparison.
5. **Phases:** one per product-plan phase, each a checklist of small tasks naming their files, a **Done when** copied from the product plan, the phase's end-to-end test, its design check, its end-of-phase review row, and a model pick per task (below). The whole plan follows "Implementation plans are written for `autorun all`" in `~/.claude/CLAUDE.md`. A task that runs a slow tool (the full suite, screenshots of every state, anything over about 15 minutes) and then fixes what it finds is split: one task builds the tool, runs it once and lists what failed; then fix tasks by app area, each rerunning only its area.
6. **Running the live app** (set up in Phase 0, checked before release):
   - **Backups:** Neon's restore window on the owner's plan (how far back a branch can be restored), plus an in-app export if the data matters enough to keep a copy elsewhere.
   - **Error alerts:** where errors show up (Vercel's logs and observability, or an error-tracking service if the owner wants alerts), and who looks.
   - **Spending limits:** Vercel's spend settings and Neon's usage limits, set so a mistake can't run up a bill.
   - **Rollback:** Vercel's instant rollback to the previous deployment, and the rule that migrations stay backward compatible for one release, so rolling back the code never breaks on the new schema.
   - **Search engines:** indexed, or kept out (`noindex` and a `robots.txt`) for private apps.
7. **Things the owner does themselves:** logins, approvals, real-data checks, so the rest can run hands-free.

### §7 in the plan: who builds it, and how (required)

**The build models are chosen for this app, not copied from a list.** The same kind of task can need a very different model in different apps: a form in a one-person tracker is mechanical, while a form in an app with roles, permissions and money is risky; a list page in a simple directory is routine, while a list page that is really a dense, interactive chart is hard visual work. So the plan author (Opus 5.5 High, in Step 7) decides every pick from this app's own risks, and writes the reason in this app's terms. Only rows of the **model table** (global, or the snapshot in `docs/build-plan.md`) are used, and never Opus 5.5 Low or Sonnet 5.5 Medium.

**§7.1 Project profile.** Before picking anything, the plan writes down, in a few lines each, what is special about *this* app:
- **What can do real damage:** data that could be lost or corrupted, money, privacy, anything a mistake would break in production
- **What is visually demanding:** screens with no close template in the preview, dense or interactive visuals, the moments the product plan says matter most
- **What is new or unusual:** algorithms, integrations, realtime, AI, unusual interactions
- **What is routine and repetitive:** screens and tasks that follow a pattern already built once

**§7.2 Tier list for this app.** Each kind of work in this app is mapped to a row of the table, using the profile and these questions, in order:

| Question about the task | If yes |
|---|---|
| Can a mistake lose or corrupt data, leak something, or break production? | Best Terminal Bench rank (currently Opus 5.5 High) |
| Is it visual with no exact reference in the preview, or does it set the look for many pages? | Best Presentation rank (currently Opus 5.5 High) |
| Is it hard or new for this app, but well specified, with tests that prove it? | Strong Terminal Bench at lower cost (currently Opus 5.5 Medium) |
| Does it follow the design guide's templates and existing components, with many rules but little damage if wrong? | Middle tier (currently Sonnet 5.5 High) |
| Is it copying an exact reference, config, scripts, or repeating a pattern already built once in this app? | Cheapest reliable (currently Haiku 5.5 Max, then xHigh, then High) |

The first task of a new kind is often a tier higher than the ones after it: once the pattern exists in the code, repeating it is cheaper work. The tier list says so where it applies.

**§7.3 Every task line ends with its pick and a reason specific to this app**, for example: `- [ ] Invoice edit form (src/app/invoices/[id]/edit) · Sonnet 5.5 High: follows the form template, but totals and tax rules must be right`. A reason like "it's a form" isn't enough.

**§7.4 How the build runs: one task at a time.** The plan states this rule at its top (Appendix D), so every implementer sees it:
1. **Model check:** compare the current model and effort with the task's pick. If they differ, say so and suggest switching (`/model`, `/effort`) before starting.
2. **Do that one task**, and only that task.
3. **Run the checks** from `CLAUDE.md`.
4. **Update the checklist:** tick the task in this plan, with a one-line note if anything turned out different from the plan (a changed file, a decision, something left for later).
5. **Commit and push**, as `CLAUDE.md` says.
6. **Stop and report:** what was done, the commit, and the **next task with its model**, saying whether that needs a switch. Wait for the owner before starting it.

**Exceptions only when the owner says so**, for example "do tasks 3 to 5 in one go" or "carry on while the model stays the same". Then the tasks are done one after another, still ticking, committing and pushing after each one, and the implementer stops anyway when the next task's pick is different, at the end of the phase, or at anything that needs the owner (a production migration, a design gap, a check that won't pass, a question about scope). If the owner asks for it, one session can hand tasks to subagents with each task's model and effort (the Agent tool's `model` and `effort` settings) and check each result itself; the stop-and-report rule still applies.

**Unattended runs (`~/.claude/scripts/autorun.sh`).** When the owner wants to leave the build running, the runner does this rule by itself in one folder. It takes the first unticked task, starts a fresh `claude -p` session on that task's model and effort, checks that the task got ticked and committed, and moves on. It stops at the end of a phase (the next task is under a new heading) or after a review row, when a task fails twice (the retry runs on Opus 5.5 High; record it in §7.6), when the folder has uncommitted changes, or at a cap the owner set (`TASK_BUDGET`, `TOTAL_BUDGET`, `MAX_TASKS`; none by default). A session still going after `TASK_MINUTES` (240 by default) is cut off and counts as a failed try, as does one that ends in an error other than an outage or a usage limit. When a session needs the owner (a design gap, a scope question, a production action), it asks its questions and the runner waits: the owner hears through a phone notification, a line in every new terminal, or any `autorun` command, answers with `autorun answer`, and that same session carries on. `autorun all` never waits: sessions make every decision themselves (design gaps get a provisional version from the new design's own pieces, still recorded as a gap) and log each one with its task and commit (`autorun decisions`); only what can't be undone or needs the owner in person (production data or settings, accounts, secrets, merging to the main branch, real-device checks) is left for the owner, after its safe parts are done, and the run moves on. It waits out Claude being unavailable (outages and usage limits only), and stops only at the end, after three tasks in a row fail, or when a phase review or its fixes can't be finished, so the next phase never starts on top of an unfinished review. The owner cross-checks the decisions, the recap and the review notes afterwards, and handles what was left for them before the next run. Each finished session also goes to AI Build Log (repo `projects-steps-documentation`) as a step with its models, tokens, cost and time, into the project on the plan's `AI Build Log project:` line, which is created on the first send; this needs `autorun buildlog-setup` once per machine. The owner starts it in their own terminal, inside the project folder, never from a Claude session (it finds the plan itself; `autorun help` lists everything):
```
autorun help    # every command, with a line on each
autorun check   # the next task and its model; spends nothing
autorun one     # first time: just the next task, then check the result
autorun         # the rest of the phase, in the background
autorun all     # overnight: to the end, deciding for you, no cost caps, then a recap
autorun status  # one screen: current task, whether it looks stuck, done so far, spend, what needs you
autorun decisions   # every decision it made on its own, with task and commit
autorun recap   # the morning recap: done, parked, decisions to check, costs and usage
autorun watch   # see it live; Ctrl-b then d leaves it running
autorun stop    # stop after the current task
autorun answer "..."   # answer a waiting question; the same session carries on
autorun skip    # drop the question and do that task yourself in claude
autorun costs   # per session and model: input, output, cache, cost
autorun notify-setup   # once per machine: phone notifications via the ntfy app
autorun buildlog-setup   # once per machine: every session goes to AI Build Log as a step
```
The plan is written for it from the start (the rule is in `~/.claude/CLAUDE.md`, under "Implementation plans are written for `autorun all`"), and the plan review checks that. With plain `autorun`, the owner reads each phase's review before starting the next phase; with `autorun all`, the review rows run inside the run, and the owner cross-checks them in the morning. Its cost log is automatic and only shows spend; picks are still decided on quality (§7.5).

**§7.5 Calibration:** at the start of the first feature phase, build one middle-tier task with the picked model and the next cheaper row, and compare both against the preview. Keep the cheaper row if its result is just as good, and update the tier list. Decide on quality alone; don't log costs. Hold every task whose pick depends on the result until it's in: building them early on the cheaper model meant redoing them.

**§7.6 Escalation:** a task moves up one row the first time a cheaper model gets it wrong twice. Note it in the tier list, so later tasks of that kind start at the higher row.

If the model table changes mid-build, update §7 before the next task.

### Plan review (fresh session, Opus 5.5 Medium)

A fresh session reads the three documents and checks: every product-plan requirement maps to a phase task; every page in the routes list has a design-guide template; every task has a pick whose reason fits this app's profile (§7.1), with nothing risky or visually demanding left on a cheap row, and nothing routine on an expensive one; the "Running the live app" section is complete; nothing in the plan adds features the product plan doesn't have; the plan follows the `autorun all` rule, and `autorun check` finds its first task and pick. It lists gaps; the owner decides, and the plan is fixed. Then the owner approves the plan.

## Step 8: Connect GitHub, Neon and Vercel (Sonnet 5.5 High)

This happens at the start of Phase 0. The owner sends three things; Claude does the rest.

**What the owner sends:**

| # | What | When |
|---|---|---|
| 1 | The **GitHub repo URL** (an empty repo), if it wasn't sent in Step 0 | Before Phase 0 starts |
| 2 | The **Neon project**: its project ID, and the pooled and direct connection strings for the `production` branch. Safest is to paste the strings into `.env.local` yourself; if you send them in the chat, Claude writes them to `.env.local` straight away and never repeats them | Before Phase 0 starts |
| 3 | The **Vercel project** name (created and connected to the GitHub repo in the Vercel dashboard), or ask Claude to create and connect it | Once the scaffold builds (Phase 0) |

Plus two logins only the owner can do, typed with `!` so they run in the session: `! neon login` and `! vercel login`. Any extra service from the feasibility check (email, file storage, payments) is connected here too, the same way.

**What Claude does, in order:**
1. **GitHub:** add `origin` and push both branches (`git push -u origin main staging`). From now on, the commit-and-push rule in `CLAUDE.md` applies to every change.
2. **Neon:** write `.env.local` (`DATABASE_URL` direct, `DATABASE_URL_POOLED` pooled) and `.env.example` (names only). Create the `test` branch with the Neon CLI and write its strings to `.env.test`. Verify both connections with a one-line query. Never print a connection string, put one in a document or commit one.
3. **Scaffold** the app on the default stack, with the npm scripts that `CLAUDE.md` relies on: `typecheck`, `lint`, `build`, `test`, `test:e2e`, `db:generate`, `db:migrate:test`, `db:migrate`, `preview` (`next build && next start`) and `preview:share` (`cloudflared tunnel --url http://localhost:3000`). Write `vercel.json` with `{ "git": { "deploymentEnabled": { "staging": false } } }` so Vercel never builds `staging` (if the project uses `vercel.ts` instead, put the same `git` setting there). Commit and push.
4. **Vercel:** link the project (`vercel link`), then add the environment variables: Production gets the `production` branch strings, Preview gets the `test` branch strings. Pipe each value from the env file into `vercel env add` so it never prints. Check that the repo is connected, that `main` is the production branch, and that a push to `staging` creates no deployment.
5. **First deploy:** the first release, following "Releasing to production" in `CLAUDE.md`. Check the deployment succeeded and the live URL loads. Record the live URL, Vercel project, Neon project ID and GitHub repo in `docs/build-plan.md` **Project details** (IDs and URLs only, never secrets) and in the implementation plan.

## Step 9: Build, phase by phase

- **Phase 0 (foundation) comes first and includes:** Step 8, the data schema and first migration (on `test`, then on `production` with approval), seed data for `test`, `tokens.css`, the restyled component library, `AppShell` and `PageHeader`, the `/styleguide` route, 404 and error pages, the favicon, app icon, page titles and link-preview image from the guide, the search-engine setting, the "Running the live app" setup, and a smoke test that loads the home page and reads from the database. **The owner checks `/styleguide` against `design-preview.html` before any feature page is built.** This is where the chosen design is locked into code; every later page is assembled from these pieces.
- **One task at a time:** follow §7 of the plan. Check the model, do one task, run the checks, tick it in the plan, commit and push to `staging`, then stop and report the next task, its model, and what to look at in the preview. Carry on without stopping only when the owner says so, and even then stop when the model changes, at the end of a phase, or at anything that needs the owner. Or the owner leaves it to `autorun` (§7.4).
- **The design guide is the spec and the preview is the reference rendering.** Every page renders inside `AppShell` and starts with `PageHeader`. No raw colour values outside `tokens.css`. No default shadcn styling left on any component. Wording follows the guide's copy and tone section.
- **Design gaps:** when a page needs something the guide doesn't cover, build it from existing pieces and tokens. If it genuinely needs something new, stop that task: an Opus 5.5 High session adds it to the guide and the preview (bumping the version), then the task continues. Never invent a one-off look in code.
- **Feature gaps:** anything beyond the product plan goes to the owner as a suggestion first. Nothing gets built because it seemed like a good idea.
- **Starting data:** at the phase the product plan names, build the import (if any) and run it on `test` first, then on production with the owner. Then the owner enters or checks a handful of real records, the plan's first checkpoint.
- **Track progress:** tick tasks in the implementation plan as they're done, and the Checklist in `docs/build-plan.md` as steps finish.
- **Releases:** at the end of each phase, once the owner has signed it off, offer a release. The owner can also ask for one at any time. Nothing reaches the live app otherwise.

## Step 10: Checks

**Every change** (light checks, before every commit; the exact steps are in `CLAUDE.md`):
- `npm run typecheck`, lint on the changed files, and the unit tests related to the change
- the smoke end-to-end test, plus the specs the change adds or edits and the spec of the page it's mainly about, when pages or the database are touched
- once per task, before its last commit: the full `npm test` and `npm run build`. The full end-to-end suite waits for the end of the phase
- a failure caused by the change is fixed before committing. Never commit a change that breaks a check
- a failure from the environment in a flow the change doesn't touch (a dropped connection, a timeout) isn't a blocker: name it in the commit message and the report

**End of every phase:**
1. The phase's end-to-end test (its Done-when scenario, run in a real browser against the `test` branch) passes.
2. **Design review:** a screenshot spec captures every new or changed page at **390px and 1280px, light and dark**. The checklist in the guide's §15 (Appendix C) is run against them and the preview.
3. **End-of-phase review** (fresh session; Opus 5.5 High if the phase changed any page, because judging design drift needs the best Presentation rank; Opus 5.5 Medium if it changed only data or logic): reads the phase's diff, the plan's phase section, the matching guide sections, and the screenshots. Reports bugs, plan drift and design drift. Fixes go by the task tiers. Fix first, then run the full Playwright suite once on a machine as free as it can be (no other build or test running, nothing else editing or testing in that folder, heavy browser tabs closed). Right after it ends, copy `test-results/.last-run.json` and rerun the failures with `--last-failed --last-failed-file <copy>`, since any other Playwright run overwrites it. Before the review commits, it routes every open "should fix" item (its own and any still open from earlier reviews) to exactly one place in `docs/review-triage.md`: a fix task added to the plan's task table and done before the next phase, a named later task, or dropped with a reason. Anything that loses or corrupts data, or shows a failed write as saved, gets a fix task.
4. **Owner check with real data:** a short demo, and the owner signs off the phase.

**Waiting for the owner:** sign-offs, approvals (production migrations, new services) and decisions don't block the next phase from starting, but they mustn't get lost. Each one goes in the **Waiting for the owner** list in `docs/build-plan.md` (what, since when, what it blocks), and Claude mentions the list at the end of every phase. A release isn't done until the list is empty, and a production migration still blocks its own release.

**Test by risk:** end-to-end tests cover user flows and anything that writes data; markup and visual variants get fast unit tests or the screenshot spec. End-to-end runs stop every server they started. They run against a production build, as "Fast test setup" in `~/.claude/CLAUDE.md` says.

**End-of-phase reviews are never skipped:** they are what lets per-change checks stay light. In one project every phase review rejected real work (an undo that could lose payments, lost typing).

**Before a release** (Sonnet 5.5 High runs and triages): the full Playwright suite, an accessibility scan, a performance check of the main pages, `/security-review` (secrets, input handling, access rules), a check that the "Running the live app" items are in place (rollback tried once on a preview), and the owner on a real phone.

## Step 11: Launch

The app has been live since Phase 0, so launch is the last phase's sign-off, an empty **Waiting for the owner** list, and the release checks. Update `CLAUDE.md` so it describes the app as built, and record anything the owner must keep doing in the implementation plan's "Things I need to do myself".

## Step 12: After launch, adding features

Every new feature runs a mini version of this playbook, as two commits:
1. **"Plans: Phase N, <feature>"** (Opus 5.5 Medium; Opus 5.5 High if it reshapes the data model): bump the product plan's version, add the feature's requirements and a dated decision, add its build-plan row with a Done when; add a new phase checklist to the implementation plan, with a pick on every task chosen from the implementation plan's §7 profile and tier list (update the profile first if the feature adds a new kind of risk). The new tasks follow the `autorun all` rule in `~/.claude/CLAUDE.md`, ending with the phase's end-to-end task and review row. It's built one task at a time (by hand or with `autorun`), by the rule in the implementation plan's §7.4. If it needs a new visual piece, an Opus 5.5 High session adds it to the guide and the preview first. If it needs a new service, it goes through the Step 3 questions and the Step 8 connection.
2. **"Phase N, <feature>"**: build it by the plan's picks, with the Step 10 checks.

If the feature needs a production migration, stop and ask before releasing: the migration runs on `test` first, then on production with the owner's approval, and only then is the code released to `main`.

## Step 13: Upkeep (Haiku 5.5 Max, about once a month, and before each new feature)

A short scan that reports, and changes nothing without the owner:
- `npm outdated` and `npm audit`: security fixes are applied straight away (by the task tiers, with the Step 10 checks); other updates are listed
- Node.js LTS and Next.js support dates: an end-of-life coming within 3 months becomes an upgrade task (Opus 5.5 High for a major framework upgrade, using the framework's official upgrade guide)
- Neon and Vercel usage against their plan limits and spending limits
- domain renewal dates, if the app has its own domain
- the **Waiting for the owner** list, if anything is still on it

Record the date and result under **Upkeep log** in `docs/build-plan.md`.

---

## Rules for every session in a project built with this playbook

- Read `CLAUDE.md` first, then `docs/build-plan.md` for where the process stands, then only the documents the current step or task needs.
- Model check at the start (above).
- Don't add features beyond the product plan without asking.
- Never print, commit or copy secrets into documents.
- Tests run against the Neon `test` branch, never `production`.
- Commit and push to `staging` after every change, as `CLAUDE.md` says. Release to `main` only when the owner asks.
- One home per rule: each rule lives in one file (`CLAUDE.md` or the plan) and others point to it. When adding a rule, fix any older one it contradicts.
- One risky change at a time: sign-in, a data-model change and a production migration each land, get tested in a real browser on the real host, and get released on their own. In one project, sign-in and a new data model went in together, sign-in's popup and storage bugs couldn't be isolated, and both were reverted.
- Leave no dev server, emulator or test browser running after a check; look for leftovers before starting one.
- Keep the machine free while a build runs: one browser, and no other AI agents or editor extensions working on the same repo.

---

## Project details (fill in, in the project's copy)

| | |
|---|---|
| App name | Oscar Movies (working name) |
| Folder | `~/oscar-movies` on the Oracle server (`investment-office`) |
| GitHub repo | https://github.com/gregorykurnia/oscar-movies |
| Neon project ID | (region `aws-ap-southeast-1`; ID not recorded yet) |
| Vercel project | `oscar-movies` (gregorykurnia-8729s-projects), region `sin1` |
| Live URL | https://oscar-movies.vercel.app |
| Extra services | OMDb API (free key), TMDB API (free key); IMDb datasets, Wikipedia, Wikidata (no key) |

## Checklist (tick in the project's copy)

- [x] Step 0 (2026-10-22): folder, `.gitignore`, this plan copied with the model table snapshot, `CLAUDE.md`, first commit on `main`, `staging` created (both pushed if GitHub was ready)
- [x] Steps 1–2 (2026-10-22): product plan drafted, suggestions accepted or declined
- [x] Step 3 (2026-10-22): feasibility checked; product plan approved v1.0
- [x] Step 4 (2026-10-22): design brief answered, `design/brief.md` written
- [x] Step 5 (2026-10-22): direction chosen (`design/decisions.md`): A, Spotlight, after one round of A variants
- [x] Step 6 (2026-10-22): design guide and preview approved and frozen as v1.0
- [x] Step 7 (2026-10-22): implementation plan approved v1.0 (owner skipped the separate review); `autorun check` finds task 0.1 (Haiku 5.5 Max)
- [ ] Step 8: GitHub linked and both branches pushed; Neon `production` and `test` connected; Vercel linked with env vars and `staging` deployments off; first release live
- [ ] Step 9: Phase 0 done; `/styleguide` signed off against the preview
- [ ] Steps 9–10: every phase built, reviewed and signed off
- [ ] Step 11: release checks passed; Waiting for the owner list empty; `CLAUDE.md` describes the app as built

## Waiting for the owner

| What | Since | Blocks |
|---|---|---|
| Check `/styleguide` against `design-preview.html` in a local preview and sign it off | 2026-10-22 | Phase 0 done |
| Set `CRON_SECRET` in Vercel Production, then release, so the daily score cron runs | 2026-10-22 | daily scores live |
| Phase 1 owner check: mark the films seen for 2024–2026, check a handful of Oscar years against memory, sign off | 2026-10-22 | Phase 1 done |
| Phase 2 owner check: spot-check three awards' pages against memory, the accuracy page and the 2025 grid, sign off | 2026-10-23 | Phase 2 done |
| Two Phase 2 choices to confirm or change: the awards index's bordered Oscars link (2.7, not in guide §5), and the year summary counting Oscar-shortlisted films as "with a nomination", as the grid does (2.10) | 2026-10-23 | nothing (easy to change) |
| Phase 3 owner check: compare the 2026 chances and past favourites with instinct, check the race on a real phone, sign off; release before the Oscar nominations (21 Jan 2027) | 2026-10-23 | Phase 3 done |
| Phase 3 choices to confirm or change (3.R): no film above 97% after the nominations (was uncapped); a live-season edition not out yet shows gold on `/data`; the α list stays as §5.3 has it | 2026-10-23 | nothing (easy to change) |
| Phase 4 owner check: spot-check two critics groups' pages against memory, the accuracy page's critics rows and the open grid, sign off | 2026-10-23 | Phase 4 done |
| Phase 4 choices to confirm or change (4.R): critics groups with no data in any year are left out of the accuracy rows (counted in a footnote) and the open grid; a nominees figure only from editions that name nominees; Boston Society and NYFCC stay winners only | 2026-10-23 | nothing (easy to change) |
| Phase 5 owner check: Cannes 2025's lineup against memory, a film's screenings on its page, the lineups on a real phone, sign off | 2026-10-23 | Phase 5 done |
| Phase 5 choices to confirm or change (5.3, 5.R): the lineup's sort (Title or Average score) and mark chips; "Selected" in the Nominated look, as AFI's top ten; possible follow-up: links that jump to a lineup's sections | 2026-10-23 | nothing (easy to change) |
| Phase 6 owner check: spot-check two critics groups' IMDb-filled pages against memory, `/accuracy/documentary` and the 2024 Documentary grid with critics open, sign off | 2026-10-24 | Phase 6 done |
| Phase 6 choices to confirm or change (6.R): Cinema Eye's Unforgettables counts as a list (no winner figures, a nominee figure) rather than as wins; winners-only groups keep IMDb's winners only, though Kansas City's own site announces nominees (flip its `winnersOnly` and rerun `imdb.ts` to keep them); a list's sub line still says "Festival prize" | 2026-10-24 | nothing (easy to change) |
| Optional production settings from the launch checks: a Vercel Firewall rate limit on `/api/search` (S2), a read-only database role for pages (S4) | 2026-10-23 | nothing |

## Upkeep log

| Date | Result |
|---|---|

---

# Appendix: templates

## A. Project `CLAUDE.md` (Step 0)

```markdown
# <App name>

<One line: what the app is.> Read these before doing any work:

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

1. Once the app is scaffolded, run `npm run typecheck`, `npx eslint <changed files>` and the unit tests related to the change (`npx vitest related <changed files> --run`). Run `npx playwright test tests/e2e/smoke.spec.ts` too when the change touches pages or the database, plus the specs the change adds or edits and the spec of the page it's mainly about. Once per task, before its last commit, run the full `npm test` and `npm run build`. If a check fails because of the change, fix it first. Never commit or push a change that breaks a check.
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
4. Fast-forward `main` to `staging` and push it: `git switch main && git pull --ff-only origin main && git merge --ff-only staging && git push origin main && git switch staging`. If the fast-forward fails, `main` has commits `staging` doesn't; stop and tell the owner. Never merge the other way round or force anything.
5. Check that Vercel's production deployment succeeded (`vercel ls`, or the dashboard) and that the live URL loads. Tell the owner the URL, the commit that's now live, and what changed for users.

## Previews (no Vercel needed)
- `npm run dev`: live-reloading app at http://localhost:3000 on this Mac. Best while building.
- `npm run preview`: the production build at http://localhost:3000, the way the live app will behave. On a phone on the **same Wi-Fi**, open `http://<Mac's address>:3000` (get the address with `ipconfig getifaddr en0`). Stop `npm run dev` first; they share the build folder and port.
- `npm run preview:share`, while `npm run preview` is running: a temporary public `https://…trycloudflare.com` link, for a phone on mobile data or for showing someone. It needs `cloudflared` once (`brew install cloudflared`). Anyone with the link can open the app while it runs, so stop it when done. The link changes every time, and a sign-in provider may need its address added before login works there.
- When the owner says "preview", "show me" or "share a link", start `npm run preview` (and `preview:share` if asked) in the background, wait until it answers, and give the addresses. Stop them when the owner is done.
- Previews use the database in `.env.local`. If that is the `production` branch, anything changed in a preview changes real data, and code that needs an unreleased migration won't work there.
```

## B. `PRODUCT_PLAN.md` skeleton (Step 2)

```markdown
# <App name>: Product Plan

**Status:** Draft v0.1 (<date>). <What changed in this version.>

## 1. Overview
One paragraph: what it is and for whom. The main parts. **Basic principles**: users, login, how data gets in.

## 2. Users and jobs
Who uses it, on what, how often. The jobs as a table: Job | How often (daily / weekly / rare) | Notes. The daily jobs drive the design hierarchy.

## 3. Features
### 3.x <Feature>
**Purpose:** one line. **Requirements:** bullets, plain language, no code. **UX notes:** states (nothing yet, loading, failure, no results), edge cases, what's fastest.

## 4. Key flows
The top 3 jobs, step by step, with the step count.

## 5. Shared data model (draft)
The things stored and how they relate, in plain words. **Starting data:** how the first real data gets in, and in which phase.

## 6. Out of scope (for now)
Suggested and declined, so they aren't suggested again.

## 7. Technical approach
A web app on the default stack (Next.js, Neon, Vercel; details in `IMPLEMENTATION_PLAN.md`). Access and privacy. **Feasibility notes** from Step 3, and any extra services with their cost.

## 8. Build plan
Phase | What gets built | Done when. Phase 0 is the foundation, ending with the app live on Vercel. Each phase is usable by itself. **Suggested checkpoints** with real data.

## 9. Decisions so far
Dated, one line each.

## 10. Open questions
Each with a default if unanswered.
```

## C. `DESIGN_GUIDE.md` skeleton (Step 6)

```markdown
# <App name>: Design Guide

**Status:** v1.0 (<date>). **Visual reference:** `design-preview.html`. **Companions:** `PRODUCT_PLAN.md` (what), `IMPLEMENTATION_PLAN.md` (how).

> For whoever implements this (human or model): this guide is binding for every page. When a page needs something not covered here, build it from the existing pieces and the tokens. Don't introduce a new look. Run §15 before a phase is marked done.

1. **Personality**: the one-line idea, 3 qualities, and the 2–3 signature elements that make it look like this app.
2. **Semantic colour map**: every colour has one job (actions, status, categories), with the "on" colour for text over it.
3. **Design tokens**: the full CSS block, light and dark. Copied exactly into `src/styles/tokens.css`.
4. **Typography**: families, scale, weights, where each is used.
5. **Layout and spacing**: grid, widths, breakpoints, spacing scale.
6. **Signature elements**: `AppShell`, `PageHeader`, and each signature element, exactly.
7. **Components**: every component, with all variants and states (default, hover, focus, active, disabled, loading, error, selected, empty).
8. **Page templates**: one per kind of page (list, detail, form, settings, empty, 404, error), on phone and desktop.
9. **Icons and imagery**: icon set, size and stroke, where icons are used, illustration or photo rules.
10. **App identity**: the name as written, wordmark, favicon, app icon, page title pattern, link-preview image.
11. **Copy and tone**: voice, labels, button wording, empty-state and error-message wording, with examples.
12. **Motion**: durations, easing, what moves, reduced-motion behaviour.
13. **Accessibility**: contrast, focus, keyboard, touch targets, labels.
14. **Implementation mapping**: `tokens.css`, the Tailwind theme mapping, the shadcn variable mapping, the theme switch, and the shared layout components every page uses.
15. **Rules and design review checklist.** Do and don't, then the checklist run at the end of every phase, for each new or changed page:
    - [ ] Renders inside `AppShell` and starts with `PageHeader`
    - [ ] Matches its template in §8 and its screen in `design-preview.html`
    - [ ] No raw hex values or one-off styles in the diff (a grep for hex values in `src/components` and `src/app` returns only the tokens file)
    - [ ] Colours follow the semantic map in §2
    - [ ] Wording follows §11
    - [ ] Works at 390px (no sideways scroll, actions wrap) and 1280px
    - [ ] Works in light and dark
    - [ ] Keyboard: Tab reaches everything, focus is visible, Esc closes popovers and dialogs
    - [ ] Empty, loading and error states are designed, not left as defaults
    - [ ] Holds up with stress data (long names, huge counts, empty fields)
    - [ ] Screenshots (light and dark, 390 and 1280) taken and checked against the preview
```

## D. `IMPLEMENTATION_PLAN.md` skeleton (Step 7)

```markdown
# <App name>: Implementation Plan

**Status:** Draft v0.1 (<date>). **Companion to:** `PRODUCT_PLAN.md` (source of truth for what). **Look and feel:** `DESIGN_GUIDE.md` and `design-preview.html` are binding for every page.

**AI Build Log project:** <App name>

> **How to build from this plan (for every implementer, human or model):** one task at a time, in order.
> 1. Check your model and effort against the task's pick. If they differ, say so and suggest switching before you start.
> 2. Do that one task, and only that task.
> 3. Run the checks in `CLAUDE.md`.
> 4. Tick the task here, with a one-line note if anything turned out different from the plan, in the same commit as the work.
> 5. Commit and push, as `CLAUDE.md` says.
> 6. Stop and report what was done, the commit, and the next task with its model and effort. Wait for the owner.
>
> Do several tasks in one go only when the owner says so (for example "do tasks 3 to 5" or "carry on while the model stays the same"), still ticking, committing and pushing after each. Stop anyway when the next task's model is different, at the end of a phase, or at anything that needs the owner.
>
> When the owner leaves it to `autorun`, each session does one task and ends, and the runner starts the next on that task's model (`docs/build-plan.md` §7.4). This plan is written so `autorun all` can run it from the first task to the last: every task line carries its pick, each phase ends with its end-to-end task and review row, and lines with no pick (marked *owner*) are left for the owner.

## 1. Stack
The default stack (from `docs/build-plan.md`), plus: Concern | Choice | Why for each project-specific library and extra service. Versions pinned to the latest stable at setup, checked against current docs.

## 2. Environments and secrets
Environment | Neon branch | Env vars live in (local, tests, Vercel Preview, Vercel Production). Pooled for the app, direct for migrations. Migrations: `test` first, production with approval.

## 3. Data
Tables, columns, constraints, delete rules, indexes, ordering, search. Seed data for `test`. The import for the owner's existing data, if any.

## 4. Pages and routes
Route | Purpose | Design-guide template.

## 5. Key components and tricky parts
How each hard piece works.

## 6. Phase task checklists
Every phase ends with its checks passing, the design review (guide §15) for every page touched, the end-of-phase review, and a demo for the owner.

### Phase 0: Foundation
Every task's model is chosen for this app from §7, so none are filled in here.
- [ ] Connect GitHub, Neon (`production` and `test`) and Vercel (playbook Step 8) · <Model effort>: <why, for this app>
- [ ] Scaffold with the npm scripts `CLAUDE.md` relies on · <Model effort>: <why>
- [ ] Schema and first migration, `test` then `production` with approval · <Model effort>: <why>
- [ ] Seed data for `test` · <Model effort>: <why>
- [ ] `tokens.css`, component library, `AppShell`, `PageHeader`, `/styleguide`, 404 and error pages · <Model effort>: <why>
- [ ] Favicon, app icon, page titles, link-preview image, search-engine setting · <Model effort>: <why>
- [ ] Running the live app setup (§10) · <Model effort>: <why>
- [ ] Smoke test: home page loads and reads from the database · <Model effort>: <why>
- [ ] Phase 0 review: end-of-phase review and its fixes (`docs/build-plan.md` Step 10) · <Model effort>: <why>
- *Owner:* `/styleguide` checked against the preview (no pick, so `autorun` leaves it; it goes on the Waiting for the owner list)
- **Done when:** the app is live on Vercel, it reads and writes the Neon database, the smoke test passes locally and live, and the owner has signed off `/styleguide` against the preview.

### Phase 1: <name>
- [ ] <task> (<files>) · <Model effort>: <why>
- [ ] End-to-end test of the Done-when scenario · <Model effort>: <why>
- [ ] Design check: screenshots at 390 and 1280, light and dark, against guide §15 · <Model effort>: <why>
- [ ] Phase 1 review: end-of-phase review and its fixes (`docs/build-plan.md` Step 10) · <Model effort>: <why>
- *Owner:* demo with real data and sign-off
- **Done when:** <copied from the product plan>

## 7. Who builds it, and how
- **7.1 Project profile:** what can do real damage, what's visually demanding, what's new or unusual, what's routine, in this app.
- **7.2 Tier list for this app:** each kind of work here → a row of the model table, with the reason from the profile. Where the first task of a kind is a tier higher than its repeats, say so.
- **7.3 Per-task picks:** on every task line above, with a reason in this app's terms.
- **7.4 One task at a time:** the rule at the top of this plan, by hand or with `autorun`.
- **7.5 Calibration trial:** which middle-tier task gets built twice, and the result.
- **7.6 Escalation log:** tasks moved up a row, and why.

## 8. Testing and verification
Level | Tool | What it covers: unit, database (against `test`), end-to-end (each phase's Done when), visual (screenshots at 390 and 1280, light and dark), manual (the owner, with real data).

## 9. Project structure
The folder tree.

## 10. Running the live app
Backups (Neon restore window, in-app export if any), error alerts, spending limits (Vercel, Neon), rollback (Vercel instant rollback; migrations backward compatible for one release), search-engine setting.

## 11. Not decided yet
Item | Blocks | Default if unanswered.

## 12. Things I need to do myself
When | Action | Why. Always includes: send the GitHub repo URL, the Neon project and connection strings, and the Vercel project; `! neon login` and `! vercel login`; approve each production migration; real-data checks at each phase's end. The Phase 0 connection task needs the owner there (logins and secrets), so it's done by hand before the first `autorun all`.
```
