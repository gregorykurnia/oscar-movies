# Oscar Movies: Product Plan

**Status:** Draft v0.2 (2026-10-22). Adds a % chance to be nominated before the Oscar nominations; open-question defaults accepted. Awaiting the feasibility check (Step 3), then approval.

## 1. Overview

A personal web app for following the film awards season and the Oscars. For each **film year** (films of 2025 = the 98th Oscars in March 2026), it shows the nominees and winners of the Oscars and of every award and festival the owner follows, in four Oscar categories: **Best Picture, Documentary Feature, International Feature and Animated Feature**. It measures how well each award has predicted the Oscars since 2012, and uses that history to give each contender in the current race a **% chance to win**. Every movie, wherever it appears, shows its **country flag**, its **IMDb, Rotten Tomatoes, Metacritic and Letterboxd** scores and their average, and whether the owner has **watched** it or **wants to watch** it.

**Main parts:** the Oscar race (home), award and festival pages per year, the year grid, accuracy figures, International Feature submissions, festival lineups, movie pages, watch lists, search.

**Basic principles**
- **Users:** the owner only. **No sign-in** (owner's choice). The live app is kept out of search engines.
- **Years:** 2012–2025 as finished seasons, plus the **2026 season tracked live** as awards are announced.
- **How data gets in:** Claude researches and loads all awards, nominees, winners and lineups from public sources; scores are fetched automatically from free services and refreshed weekly. The app has no editing forms: corrections and season updates go through Claude (see 3.12).

## 2. Users and jobs

One user (the owner), on **phone and laptop**, most days during awards season (November to March) and occasionally the rest of the year. The owner expects to use all of the jobs below; the race is the home screen.

| Job | How often | Notes |
|---|---|---|
| Check this year's Oscar race: contenders, stage and % chance per category | Daily in season | Home screen |
| Mark a film watched / want to watch | Daily in season | One tap, from any list |
| Look up one movie: its awards, scores, country | Several times a week | Search on every page |
| Browse a year's grid: which movies were nominated where | Weekly | |
| Pick what to watch next: unwatched contenders, by score or nominations | Weekly | |
| Compare awards: which ones predict the Oscars best | Occasionally | |
| Browse a past year, a festival lineup or the International submissions | Occasionally | |

## 3. Features

### 3.1 Awards followed

**Purpose:** the fixed set of awards the app covers.

**Requirements**
- **Oscars** (Academy Awards): the four categories, with their stages: **submitted** (International Feature only), **shortlisted** (Documentary, International, Animated; Animated uses the eligible list where there is no shortlist), **nominated**, **won**.
- **Major awards (12):** Academy Awards, Actor Awards (formerly SAG), AFI Top 10, Annie Awards, BAFTA, Cinema Eye Honors, DGA, European Film Awards, Golden Globes, Independent Spirit Awards, PGA, Satellite Awards.
- **Festivals (5), major prizes:** Cannes (Palme d'Or, Grand Prix, Jury Prize), Venice (Golden Lion, Grand Jury Prize), Berlin (Golden Bear, Silver Bear Grand Jury Prize), Sundance (Grand Jury and Audience awards: US and World Cinema, Dramatic and Documentary), Toronto (People's Choice: Film, Documentary, International, and runners-up).
- **Critics groups (63, "minor"):** African American, Alliance of Women, Atlanta, Austin, Black, Boston Online, Boston Society, British Independent, Central Florida, Chicago FCA, Chicago IC, Cinema for Peace, Columbus, Critics Choice (including the Critics Choice Documentary Awards, with their Director and Political categories), Dallas Fort Worth, Florida, Georgia, Gotham, Greater Western New York, Hawaii, Hollywood, Houston, Indiana, International Cinephile Society, International Documentary Association (including its Director category), Iowa, Kansas City, Las Vegas, Latino Entertainment, London, Los Angeles, Michigan, Minnesota, Music City, National Society, NBR, New Jersey, New York Circle, New York Online, North Carolina, North Dakota, North Texas, Oklahoma, Online FCS, Online Female, Online FTV, Peabody, Philadelphia, Phoenix CC, Phoenix FCS, Pittsburgh, Portland, Puerto Rico, San Diego, San Francisco Bay Area, Seattle, Society of LGBTQ, Southeastern, St. Louis, Toronto, Utah, Vancouver, Washington DC.
- Each award's own categories are **mapped to one of the four Oscar categories** (e.g. BAFTA "Film Not in the English Language" → International; both Golden Globe best-film categories → Picture; Actor Awards "Outstanding Cast" → Picture; Critics Choice "Best Political Documentary" → Documentary). An award only appears in the categories it actually gives. A category can map to an Oscar category more loosely (a director prize, a cast prize); the mapping is visible on the award page.
- **AFI Top 10** is a selection, not a prize: being on the list counts as a nomination, and it has no winner.
- A year an award didn't run, or whose results couldn't be found, is shown as **"no data"**, never as "no winner", and is left out of its accuracy figures.

**UX notes:** major awards always come before critics groups; festivals have their own section. Within a section, the order is the season's calendar order.

### 3.2 Movies: scores, average, flags

**Purpose:** every movie shows the same key facts everywhere.

**Requirements**
- Every movie row, anywhere in the app, shows: title (original title on the detail page), **country flag(s)**, **IMDb, Rotten Tomatoes (Tomatometer), Metacritic, Letterboxd**, the **average**, and the watched / want-to-watch marks.
- **Average:** each score converted to 0–100 (IMDb × 10, Letterboxd × 20, Tomatometer and Metacritic as they are), averaged over the scores that exist. It shows how many sources it's based on (e.g. "84 · 3 of 4") so a missing score is visible.
- **Flags:** every movie gets the flag(s) of its production countries, main country first; co-productions show up to three flags plus "+N". For International Feature submissions, the **submitting country's** flag comes first, since that's what the race is about.
- A missing score shows as "–", never as 0.
- Scores are refreshed **weekly**: every week for current-season films, rarely for older ones (they barely change). Each score shows when it was last updated on the movie page.

### 3.3 The Oscar race (home)

**Purpose:** the current year's race at a glance; the most frequent job.

**Requirements**
- Opens on the **current season** (2026 now). A year switcher reaches any year from 2012 on.
- The four categories, each as its own section (tabs on phone): its contenders or nominees, each with its **Oscar stage**, its **% chance to be nominated** (until the nominations are announced), its **% chance to win**, its main precursor results (e.g. "Won: BAFTA, PGA · Nominated: Globes"), scores, flag and watched marks.
- Before the Oscar nominations, the contenders are every film with a nomination or win at any followed award or festival in that category (and the shortlist once it exists). After the nominations, only the nominees. After the ceremony, the winner is marked and the % chances freeze as "final prediction".
- Past years show the real Oscar nominees and winners, with the prediction the app would have made on the eve of the ceremony, so the method can be judged.
- Each film's % opens a short **"why"**: the past seasons and precursor results it is based on.

**UX notes:** the race is reachable from anywhere in one tap. Nothing yet (a category before any award is announced): "No contenders yet: the first precursor results arrive in <month>." Each category says what stage the season is at (e.g. "Shortlist out 16 Dec · Nominations 21 Jan").

### 3.4 Predictions: % chance to win

**Purpose:** a running prediction for each Oscar category, purely from past patterns: who gets nominated, and who wins.

**Requirements**
- Each contender's chance comes from **how past contenders with a similar run of precursor results did** (2012 to the last finished season): which awards they won or were nominated at, weighted by how well those awards have predicted that category. The chances in a category add up to 100%.
- **% chance to be nominated**, shown until the Oscar nominations are announced: from how often past contenders with a similar run of precursor results (and shortlist status, where there is one) got the nomination. These don't add up to 100%; together they add up to roughly the number of nomination slots (10 for Picture, 5 for the others).
- Recalculated whenever new results are loaded, and when an Oscar ceremony's results make a season "finished" (so its history now counts).
- The method is explained in plain words on the accuracy page, with the backtest: for each past year, the app's eve-of-ceremony favourite and whether it won, and how many of the nominees it had in its top slots on the eve of the nominations.

**UX notes:** shown as a whole-number % with a bar. With little data early in the season, the category says "Early: few results yet".

### 3.5 Award and festival pages, per year

**Purpose:** one award's results for one year, in detail.

**Requirements**
- For each award and year: its categories (only the four mapped ones), with **nominees and winners**, each movie with flag, scores, marks and its Oscar result for that year (stage reached).
- The award's **accuracy figures** for each category (3.6) at the top.
- Festivals show their major prizes the same way; from 2025 on, the page also links to the year's **lineup** (3.9).
- An awards index for the year: Oscars first, then major awards, then festivals, then critics groups (below the majors, per the owner).

### 3.6 Accuracy figures ("running correlation")

**Purpose:** how well each award predicts the Oscars.

**Requirements**
- For each award category, over finished seasons since 2012:
  - **Winner → Oscar win:** how often its winner won the matching Oscar ("9 of 14 years, 64%").
  - **Winner → Oscar nomination:** how often its winner was nominated for it.
  - **Nominees → Oscar nominees:** of its nominees, the share that got the Oscar nomination (only for awards that announce nominees).
- **Running:** they update automatically when an Oscar season finishes; the current season never counts until its ceremony is over.
- An **accuracy page** per Oscar category ranks every award and festival by these figures (major and critics groups in their own sections), sortable by each figure, with the number of years each is based on.

### 3.7 Year grid

**Purpose:** see the whole season at once.

**Requirements**
- For a year and an Oscar category: **rows are the movies** with at least one nomination, **columns are the awards** (Oscars first, then major awards, festivals, then critics groups). A cell is coloured for **nominated** or **won** (and shortlisted/submitted for the Oscars), blank otherwise.
- Each row shows the movie's flag, average score, watched mark, and its totals (nominations, wins).
- Sort by wins, nominations, average score or title; filter to unwatched. The year, category, sort and filter are kept in the address.

**UX notes:** on phone, the movie column stays fixed while the award columns scroll sideways inside the grid (the page itself never scrolls sideways). Critics group columns can be folded into one "critics groups: N wins" column.

### 3.8 Year summary

**Purpose:** the season in numbers.

**Requirements**
- Per year: how many movies were nominated anywhere (per category and in total), the movies with the most nominations and wins (and at which awards), and **how many of them the owner has watched** ("23 of 61 watched").
- Each count opens the matching filtered list.

### 3.9 Festival lineups (2025 on)

**Purpose:** what screened at each festival.

**Requirements**
- For each festival and year from 2025: the films in each section (e.g. Cannes: In Competition, Un Certain Regard, Directors' Fortnight, Critics' Week, Out of Competition; the equivalent sections at Venice, Berlin, Sundance and Toronto), with flag, scores, marks, and any prize won there.
- Earlier years have no lineups (prizes only); the page says so.
- The movie page lists every festival and section it screened in.

### 3.10 International Feature submissions

**Purpose:** each year's full list of countries' Oscar submissions.

**Requirements**
- Per year: every submission, with the **submitting country's flag and name**, the film, scores, marks, and the stage it reached (submitted, shortlisted, nominated, won).
- Sort by country, stage or average score; filter to shortlisted or unwatched.

### 3.11 Movie page

**Purpose:** everything about one film.

**Requirements**
- Title and original title, year, flags and countries, language, the four scores and the average.
- Its **Oscar result** (stage reached, per category).
- **Every followed award, by section**: won, nominated, or **not nominated** (awards that gave that category that year but passed it over), so gaps are as visible as wins. Festivals it screened at, with section and prize.
- Watched and want-to-watch marks.

### 3.12 Data: research, updates and corrections

**Purpose:** getting the data in and keeping it right, with no editing forms in the app.

**Requirements**
- Claude researches and loads 2012–2026: Oscars (including submissions and shortlists), major awards and festival prizes first; critics groups next; festival lineups for 2025–2026 last (see the build plan).
- **During the season**, the owner asks Claude to "update the race"; it researches new results, shows the owner what it will add or change, then loads it. Scores refresh weekly on their own.
- **Corrections:** the owner tells Claude what's wrong; the same review-then-load step applies.
- A **data coverage page** shows, per award and year, whether results are loaded, partly loaded or missing, and when scores were last refreshed.

### 3.13 Watched and want to watch

**Purpose:** track what the owner has seen, everywhere.

**Requirements**
- Two marks per movie: **watched** and **want to watch** (marking watched clears want to watch). One tap each, on every row and on the movie page.
- The marks show wherever the movie appears, and every list can be filtered to watched, unwatched or want to watch.
- A **Watch list** page: want-to-watch films, then unwatched films of the current season, sortable by Oscar stage, % chance, nominations or average score.

**UX notes:** marking is instant and can be undone by tapping again; if saving fails, the mark flips back and a message says so.

### 3.14 Search

**Purpose:** jump to any movie, award or festival.

**Requirements**
- A search box on every page (also opened with `/` on a keyboard), matching movie titles (including original titles, ignoring accents) and award and festival names. Results show year, flag and the movie's Oscar stage.

**UX notes:** no results: "No movie or award matches '<text>'."

## 4. Key flows

1. **Check the race** (daily): open the app → the current race is the home screen. **1 step**. Another category: 1 tap on its tab.
2. **Mark a film watched** (daily): tap the watched mark on its row, on any page. **1 step**.
3. **Look up a movie** (several times a week): from any page, type in search → pick the movie. **2 steps** (plus typing).
4. **Pick what to watch next**: tap Watch list (in the main navigation) → sorted list. **1 step**.

## 5. Shared data model (draft)

- **Movie:** title, original title, year, countries (main first), language, external IDs (for scores), the four scores with their update dates, watched and want-to-watch marks.
- **Award:** name, type (Oscars, major, festival, critics group), calendar order, its categories, each mapped to an Oscar category.
- **Edition:** one award in one film year (date announced, data status: loaded, partly loaded, no data).
- **Result:** a movie in an edition's category: nominated, won, runner-up; for the Oscars also submitted and shortlisted (with the submitting country for International).
- **Festival screening:** a movie at a festival edition, in a section (2025 on).
- **Accuracy figures and predictions** are worked out from results; not typed in.

**Starting data:** loaded by Claude's research import: Oscars and movies first (Phase 1), then major awards and festival prizes (Phase 2), critics groups (Phase 4), lineups (Phase 5). Each import runs on the test database first, the owner reviews a summary, then it goes to production.

## 6. Out of scope (for now)

- Sign-in or other users (owner's choice: no sign-in).
- Posters (suggested, declined 2026-10-22).
- Prediction history chart through the season (suggested, declined 2026-10-22).
- Watched date or the owner's own rating (declined: just watched or not).
- Oscar categories beyond Picture, Documentary, International and Animated.
- Full festival lineups before 2025.
- Editing data in the app (corrections go through Claude).

## 7. Technical approach

A web app on the default stack (Next.js, Neon, Vercel; details in `IMPLEMENTATION_PLAN.md`). No sign-in: anyone with the live address could see the app and change the watched marks, so it's kept out of search engines (`noindex`, `robots.txt`). Paid services: **none** (free tiers only).

**Feasibility notes** (Step 3, 2026-10-22). **Verdict:** buildable on the default stack at no cost, and Phases 0–3 are realistic by January 2027, with **one score that can't be had legally (Letterboxd)** and a few smaller changes listed below.

- **Film count:** about 150–250 films per season across the four categories (International alone has ~90 submissions), so **~3,000–3,500 films for 2012–2026**, plus ~1,000 more from the 2025–26 festival lineups: **~4,500 films**, ~40,000 result rows. Tiny for Postgres (well under 100 MB).
- **IMDb:** [IMDb's non-commercial datasets](https://data.imdb.com/non-commercial-datasets/) (`title.ratings`, refreshed daily, free for personal non-commercial use) or OMDb. Fits easily.
- **Rotten Tomatoes and Metacritic:** no official free API for either. The only legitimate free route is **[OMDb](https://www.omdbapi.com/apikey.aspx)** (free key, **1,000 calls/day**, non-commercial), which returns IMDb, Tomatometer and Metascore in one call. Weekly refresh of the current season (~1,500 films incl. lineups) is ~215 calls/day; older films monthly. **Risks:** OMDb is a one-person service ("[Is OMDb abandoned?](https://github.com/omdbapi/OMDb-API/issues/336)", still answering in Dec 2025) and its RT figures come from a third party: expect gaps and lag for new and foreign films, shown as "–". Check the hit rate on 50 films in Phase 1 before building on it.
- **Letterboxd:** **no legal free route.** Its [API](https://letterboxd.com/api-beta/) is not granted to personal or data-analysis projects, and its [terms](https://letterboxd.com/legal/terms-of-use/) (6.8, 6.11) forbid scrapers and exporting content. See the requirement changes below.
- **Movie facts (countries, original title, language, IDs):** **[TMDB](https://www.themoviedb.org/api-terms-of-use)** (free for non-commercial use; needs a "uses TMDB but is not endorsed" notice and logo; cache ≤ 6 months) plus **Wikidata** (CC0), which links Wikipedia articles to IMDb (P345) and TMDB (P4947) IDs. **Every film is matched by IMDb ID**, never by title; Wikipedia film links → Wikidata → IMDb ID does this automatically, and unmatched films go into the import summary for review.
- **Award data:** **Wikipedia** per-award and per-year pages (text CC BY-SA 4.0: credit and link on a sources page) for the Oscars (incl. "List of submissions to the Nth Academy Awards" and shortlists), the 12 majors and festival prizes: complete and reliable for 2012–2026. **Critics groups are uneven:** larger ones have per-year pages, but several small ones (e.g. Greater Western New York, North Dakota, Music City, Puerto Rico) have no Wikipedia page and only their own sites or social posts; many announce **winners only**, so they have no "nominees → Oscar nominees" figure. Expect 10–20% "no data" or "partly loaded" editions there, which the coverage page already handles. **Lineups:** festival sites and Wikipedia film lists by section, 2025–26 only: fine.
- **Research effort:** ~270 editions for Phases 1–2 (18 awards × 15 years) are feasible with one import script per award reading Wikipedia tables, then review. The 63 critics groups (~950 editions) are the bulk of the work and rightly come after the deadline (Phase 4). The in-season "update the race" is a Claude session per new batch of results (~15–30 min, 2–3 a week in Dec–Jan); it must be a written routine with a check script.
- **Platform limits:** **Vercel Hobby** (personal, non-commercial: fits) allows [cron jobs only once a day](https://vercel.com/docs/cron-jobs/usage-and-pricing) with ±59 min timing, [functions up to 300 s](https://vercel.com/docs/functions/limitations): a daily cron refreshing ~1/7 of the week's films (~200 OMDb calls, done in batches) fits. **[Neon Free](https://neon.com/pricing)**: 1 GB storage, 100 CU-hours/month, 10 branches, sleeps after 5 min idle (first load ~0.5–1 s), **restore window only 6 hours**. Award data lives in the repo as import files, so it can be reloaded; **the watched marks are the only data that exists nowhere else** and need their own backup (an export into the repo with each update).
- **Prediction method:** 14 seasons give only 14 winners per category, too few for a fitted model with 80 awards. Recommended: for each award result (won / nominated) give a **weight from its past hit rate, smoothed towards the average** so an award with few years can't dominate; a contender's score is the sum of its weights; turn scores into **% to win with a softmax** (adds to 100%), its single "temperature" tuned by leaving one season out at a time. **% to be nominated:** the same weights through a logistic curve, scaled so the total matches the slots (Picture had 8–9 nominees before 2021, 10 since; shortlist sizes changed too). The "why" lists the top-weighted results. Risks: precursors move together (a sweep is counted many times, so the favourite looks too certain: cap the top % around 90 early in the season), and a tiny history makes ±15 points noise normal; the backtest shows this honestly.
- **Speed:** the biggest page is the year grid; Picture can have ~100 films × ~80 columns (8,000 cells, ~0.5–1 MB of HTML). Fine with critics groups folded by default on phone, one category per page, and award data cached until the next import (only marks are live). Search over ~5,000 titles + 80 awards: Postgres `unaccent` + trigram index, well under 100 ms.
- **No sign-in on a public URL:** anyone who finds the address can read it and flip the marks; the cron route needs a secret (`CRON_SECRET`); imports run only from Claude's scripts, never through a web route. See the requirement change below.

**Extra services** (all free):
- **OMDb API**: free key (owner requests it at omdbapi.com with an email, clicks the activation link, sends the key).
- **TMDB API**: free non-commercial key (owner creates a TMDB account, requests an API key as "personal", sends the read token).
- **IMDb datasets, Wikipedia, Wikidata**: no account or key.
- **Vercel cron**: part of Hobby, nothing to set up beyond the `CRON_SECRET` value Claude generates.

**Requirements that should change** (the owner decides):
- **§1, §3.2 Letterboxd score:** can't be fetched legally for free. Suggest: drop Letterboxd and average the other three ("84 · 2 of 3"), or replace it with the TMDB user score (free, legal, but a different crowd).
- **§3.2 Rotten Tomatoes:** OMDb's Tomatometer may be missing or lag for new and foreign films. Suggest: accept "–" (already the default) and state that RT comes via OMDb and may lag; no paid or scraped fallback.
- **§3.2 weekly refresh:** Hobby crons run daily, not on a chosen weekday. Suggest: "each current-season film refreshed about once a week" (a daily batch), older films monthly.
- **§1, §6 no sign-in:** strangers or bots who find the URL can change marks. Suggest: keep no sign-in for reading, but marking needs an **owner key** set once per device via a private link (stored in a long-lived cookie): no login screen, no account.
- **§3.12 / §5 backups:** Neon Free's 6-hour restore window can't undo a bad import found a day later. Suggest: each import and "update the race" first exports the marks into the repo, and imports are re-runnable from the repo's data files.
- **§3.6 / §3.4 critics groups that publish winners only:** they get only the two winner figures; their nominees figure shows "–" (the plan already allows this, worth stating on the accuracy page).
- **New small item, credits page:** TMDB requires its notice and logo, and Wikipedia data needs CC BY-SA credit. Suggest: a short "Sources" section on the data coverage page.

## 8. Build plan

**Deadline:** usable for the 2026 race before the Oscar nominations (January 2027): Phases 0–3.

| Phase | What gets built | Done when |
|---|---|---|
| 0. Foundation | The app shell, design system, database, live on Vercel, kept out of search engines | The live address loads the empty shell and reads from the database; the smoke test passes locally and live |
| 1. Oscars and movies | Oscars 2012–2026 (submissions, shortlists, nominees, winners), movies with flags and the four scores (weekly refresh), Oscar year pages, International submissions, movie page, watched / want to watch, Watch list, search | The 2025 Oscars page shows all four categories with flags, scores and average; marking a film watched shows on every page it appears on; search finds a film by its original title |
| 2. Major awards and festival prizes | The 12 major awards and the 5 festivals' prizes, 2012–2026; award pages, awards index, accuracy figures and page, year grid, year summary, the movie page's award list | BAFTA 2025's page lists its nominees and winners with their Oscar results; the accuracy figures for a hand-checked award match; the 2025 grid shows every nominated movie with its awards coloured |
| 3. Predictions and the live race | % chance to be nominated and to win per contender, the "why", the backtest; the race as home; the "update the race" routine; data coverage page | Each 2026 category shows chances that add to 100%; past years show the eve-of-ceremony favourite; an update adds a new award result and the chances change |
| 4. Critics groups | The 63 critics groups, 2012–2026, in the grid, award pages, accuracy figures and predictions | Each critics group with data appears below the major awards in the grid and accuracy page, and "no data" years are marked |
| 5. Festival lineups | 2025 and 2026 lineups by section for the five festivals; festival screenings on the movie page | Cannes 2025's page lists every section's films with flags and scores |

**Suggested checkpoints with real data:** after Phase 1, the owner marks the films they've seen for 2024–2026 and checks a handful of Oscar years against memory; after Phase 2, the owner spot-checks three awards; after Phase 3, the owner compares the predictions with their own instinct for the 2026 race.

## 9. Decisions so far

- 2026-10-22: One user (the owner), no sign-in; kept out of search engines.
- 2026-10-22: A year means the film year (2025 = 98th Oscars, March 2026).
- 2026-10-22: Four Oscar categories: Picture, Documentary, International, Animated.
- 2026-10-22: "Correlation" means hit rates: winner → Oscar win, winner → Oscar nomination, nominees → Oscar nominees.
- 2026-10-22: % chance to win comes from past seasons' patterns of precursor results.
- 2026-10-22: Claude researches and loads all data; no editing forms in the app.
- 2026-10-22: Scores refreshed weekly; free services only.
- 2026-10-22: Years 2012–2025 finished, 2026 tracked live. Deadline: Oscar nominations, January 2027.
- 2026-10-22: Oscar shortlists tracked as a stage.
- 2026-10-22: Before the nominations, the race also shows a % chance to be nominated, from past seasons' patterns.
- 2026-10-22: Open-question defaults accepted by the owner (they stay in §10 until something changes them).
- 2026-10-22: Festival major prizes since 2012; full lineups from 2025.
- 2026-10-22: Major awards first, critics groups ("minor") in the next phase; critics groups get their own columns and sections, below the majors.
- 2026-10-22: Accepted: want-to-watch list, search. Declined: posters, prediction history chart.
- 2026-10-22: Watched is just watched or not.
- 2026-10-22: Every movie shows its country flag, not only International entries.

## 10. Open questions

| Question | Default if unanswered |
|---|---|
| Which group do the shorthand names mean: "Hollywood", "Black", "Toronto", "Peabody"? | Hollywood = Hollywood Critics Association (now Astra Film Awards); Black = Black Film Critics Circle; Toronto = Toronto Film Critics Association (the festival is separate); Peabody = its documentary winners |
| Critics Choice and Gotham are big precursors; major or minor? | Minor, as listed by the owner |
| Rotten Tomatoes: critics (Tomatometer) or audience score? | Tomatometer |
| Toronto's festival prizes: which runners-up count? | The first and second runners-up of each People's Choice award, counted as nominations |
| Where no source gives a score (e.g. Letterboxd for some films) | Shown as "–" and left out of the average |
