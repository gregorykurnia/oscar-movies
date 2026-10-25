# Oscar Movies: Product Plan

**Status:** Approved v1.5 (2026-10-25): adds the Snub risk flag, full shortlists on the Oscars year page and a patterns panel on the movie page (§3.16). v1.4 (2026-10-25) dropped Cinema for Peace, whose gala comes after the Oscar nominations, and adds the snub rule to the nomination patterns (§3.16). v1.3 (2026-10-25) added Phase 8, nomination patterns for Documentary and International (§3.16), and the shortlist rule for their accuracy figures (§3.6). v1.2 (2026-10-25) added an award's all-years page (§3.5) to Phase 7. v1.1 (2026-10-25) added Phase 7, the owner's requests of 25 October (one flag, the grid's default order, strong signals, the Watch list's add box, order, release dates and platforms). v1.0 was approved 2026-10-22 after the feasibility check (v0.3 content).

## 1. Overview

A personal web app for following the film awards season and the Oscars. For each **film year** (films of 2025 = the 98th Oscars in March 2026), it shows the nominees and winners of the Oscars and of every award and festival the owner follows, in four Oscar categories: **Best Picture, Documentary Feature, International Feature and Animated Feature**. It measures how well each award has predicted the Oscars since 2012, and uses that history to give each contender in the current race a **% chance to win**. Every movie, wherever it appears, shows its **country flag**, its **IMDb, Rotten Tomatoes, Metacritic and TMDB** scores and their average, and whether the owner has **watched** it or **wants to watch** it.

**Main parts:** the Oscar race (home), award and festival pages per year, the year grid, accuracy figures, International Feature submissions, festival lineups, movie pages, watch lists, search.

**Basic principles**
- **Users:** the owner only. **No sign-in** (owner's choice). The live app is kept out of search engines.
- **Years:** 2012–2025 as finished seasons, plus the **2026 season tracked live** as awards are announced.
- **How data gets in:** Claude researches and loads all awards, nominees, winners and lineups from public sources; scores are fetched automatically from free services and refreshed about once a week. The app has no editing forms for award or movie data: corrections and season updates go through Claude (see 3.12). The only things typed in the app are the owner's own watch-list notes (order, release date, platform; 3.13).

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
- **Festivals (6), major prizes:** Cannes (Palme d'Or, Grand Prix, Jury Prize), Venice (Golden Lion, Grand Jury Prize), Berlin (Golden Bear, Silver Bear Grand Jury Prize), Sundance (Grand Jury and Audience awards: US and World Cinema, Dramatic and Documentary), Toronto (People's Choice: Film, Documentary, International, and runners-up), DOC NYC (Short List: Features from 2012 and Winner's Circle from 2019, both selections like AFI's; no lineup).
- **Critics groups (62, "minor"):** African American, Alliance of Women, Atlanta, Austin, Black, Boston Online, Boston Society, British Independent, Central Florida, Chicago FCA, Chicago IC, Columbus, Critics Choice (including the Critics Choice Documentary Awards, with their Director and Political categories), Dallas Fort Worth, Florida, Georgia, Gotham, Greater Western New York, Hawaii, Hollywood, Houston, Indiana, International Cinephile Society, International Documentary Association (including its Director category), Iowa, Kansas City, Las Vegas, Latino Entertainment, London, Los Angeles, Michigan, Minnesota, Music City, National Society, NBR, New Jersey, New York Circle, New York Online, North Carolina, North Dakota, North Texas, Oklahoma, Online FCS, Online Female, Online FTV, Peabody, Philadelphia, Phoenix CC, Phoenix FCS, Pittsburgh, Portland, Puerto Rico, San Diego, San Francisco Bay Area, Seattle, Society of LGBTQ, Southeastern, St. Louis, Toronto, Utah, Vancouver, Washington DC.
- Each award's own categories are **mapped to one of the four Oscar categories** (e.g. BAFTA "Film Not in the English Language" → International; both Golden Globe best-film categories → Picture; Actor Awards "Outstanding Cast" → Picture; Critics Choice "Best Political Documentary" → Documentary). An award only appears in the categories it actually gives. A category can map to an Oscar category more loosely (a director prize, a cast prize); the mapping is visible on the award page.
- **Cinema Eye Honors** counts its Nonfiction Feature, Direction, Production, Audience Choice and Unforgettables categories, all mapped to Documentary.
- **AFI Top 10** is a selection, not a prize: being on the list counts as a nomination, and it has no winner.
- A year an award didn't run, or whose results couldn't be found, is shown as **"no data"**, never as "no winner", and is left out of its accuracy figures.

**UX notes:** major awards always come before critics groups; festivals have their own section. Within a section, the order is the season's calendar order.

### 3.2 Movies: scores, average, flags

**Purpose:** every movie shows the same key facts everywhere.

**Requirements**
- Every movie row, anywhere in the app, shows: title (original title on the detail page), **country flag(s)**, **IMDb, Rotten Tomatoes (Tomatometer), Metacritic, TMDB user score**, the **average**, and the watched / want-to-watch marks.
- **Average:** each score converted to 0–100 (IMDb × 10, TMDB × 10, Tomatometer and Metacritic as they are), averaged over the scores that exist. It shows how many sources it's based on (e.g. "84 · 3 of 4") so a missing score is visible.
- **Flags:** every movie shows **one flag**, its **primary country**: for a film ever submitted for International Feature, the country that submitted it, on every page (not only the International lists); otherwise the first country Wikipedia lists for it. The movie page names all its countries in text. (Until 2026-10-25: up to three flags plus "+N".)
- A missing score shows as "–", never as 0. Rotten Tomatoes comes through OMDb and can be missing or late for new and foreign films; there is no paid or scraped fallback.
- Letterboxd isn't shown: it has no legal free source (its API isn't granted to personal projects and its terms forbid scraping).
- Scores are refreshed in a **small daily batch**, so each current-season film is updated about once a week and older films about monthly (they barely change). Each score shows when it was last updated on the movie page.

### 3.3 The Oscar race (home)

**Purpose:** the current year's race at a glance; the most frequent job.

**Requirements**
- Opens on the **current season** (2026 now). A year switcher reaches any year from 2012 on.
- The four categories, each as its own section (tabs on phone): its contenders or nominees, each with its **Oscar stage**, its **% chance to be nominated** (live until the nominations are announced; after them, what each nominee had the day before), its **% chance to win**, its main precursor results (e.g. "Won: BAFTA, PGA · Nominated: Globes"), scores, flag and watched marks.
- Before the Oscar nominations, the contenders are every film with a nomination or win at any followed award or festival in that category (and the shortlist once it exists). After the nominations, only the nominees. After the ceremony, the winner is marked and the % chances freeze as "final prediction".
- Past years show the real Oscar nominees and winners, with the prediction the app would have made on the eve of the ceremony, so the method can be judged.
- Each film's % opens a short **"why"**: the past seasons and precursor results it is based on.

**UX notes:** the race is reachable from anywhere in one tap. Nothing yet (a category before any award is announced): "No contenders yet: the first precursor results arrive in <month>." Each category says what stage the season is at (e.g. "Shortlist out 16 Dec · Nominations 21 Jan").

### 3.4 Predictions: % chance to win

**Purpose:** a running prediction for each Oscar category, purely from past patterns: who gets nominated, and who wins.

**Requirements**
- Each contender's chance comes from **how past contenders with a similar run of precursor results did** (2012 to the last finished season): which awards they won or were nominated at, weighted by how well those awards have predicted that category. The chances in a category add up to 100%.
- **% chance to be nominated**, live until the Oscar nominations are announced, then frozen at the day before them for each nominee (so past seasons show how well it called them): from how often past contenders with a similar run of precursor results (and shortlist status, where there is one) got the nomination. These don't add up to 100%; together they add up to roughly the number of nomination slots (10 for Picture, 5 for the others).
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
- **All years of one award** (owner's request, 2026-10-25): one page per award or festival (the Oscars too) listing its winners and nominees for every year in the app, newest first, one Oscar category at a time. Each film shows flag, scores, marks and its Oscar result that year; each year links to its own page. A year with no data says so; a year the award gave nothing in that category says so too. Reached by an "All years" link on each award's year page. The Oscars list nominees and winners only (submissions and shortlists stay on the year pages).

### 3.6 Accuracy figures ("running correlation")

**Purpose:** how well each award predicts the Oscars.

**Requirements**
- For each award category, over finished seasons since 2012:
  - **Winner → Oscar win:** how often its winner won the matching Oscar ("9 of 14 years, 64%").
  - **Winner → Oscar nomination:** how often its winner was nominated for it.
  - **Nominees → Oscar nominees:** of its nominees, the share that got the Oscar nomination. Awards that announce winners only (many critics groups) show "–" here, and the page says why.
  - **Oscar nominees it caught:** the other way round: of the Oscar nominees, the share the award had nominated (or picked as winner). A picky award with few nominees scores high on the figure above and low here; a broad one the reverse. "–" for winners-only awards, as above.
- **Shortlist rule (Documentary and International, from Phase 8):** a film that never reached the Oscar shortlist is left out of the first three figures, so an award isn't marked down for a winner that couldn't compete (not submitted, not eligible). A year whose winner is left out doesn't count for the winner figures. "Oscar nominees it caught" is unchanged.
- **Running:** they update automatically when an Oscar season finishes; the current season never counts until its ceremony is over.
- An **accuracy page** per Oscar category ranks every award and festival by these figures (major and critics groups in their own sections), sortable by each figure, with the number of years each is based on.

### 3.7 Year grid

**Purpose:** see the whole season at once.

**Requirements**
- For a year and an Oscar category: **rows are the movies** with at least one nomination, **columns are the awards** (Oscars first, then major awards, festivals, then critics groups). A cell is coloured for **nominated** or **won** (and shortlisted/submitted for the Oscars), blank otherwise.
- Each row shows the movie's flag, average score, watched mark, and its totals (nominations, wins).
- **Default order:** Oscar nominees first (the winner at the top), then Oscar-shortlisted films, then the rest; within each group, most nominations first. Sort by this Oscar order, wins, nominations, average score or title; filter to unwatched. The year, category, sort and filter are kept in the address.

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
- **During the season**, the owner asks Claude to "update the race"; it researches new results, shows the owner what it will add or change, then loads it. Scores refresh on their own.
- **Before every import, correction or race update**, the watched and want-to-watch marks are exported into the repo first. They are the only data that can't be researched again, and Neon's free plan can only undo the last 6 hours.
- A **Sources** section on the data coverage page credits TMDB (its required notice and logo), Wikipedia (CC BY-SA) and the other sources.
- **Corrections:** the owner tells Claude what's wrong; the same review-then-load step applies.
- A **data coverage page** shows, per award and year, whether results are loaded, partly loaded or missing, and when scores were last refreshed.

### 3.13 Watched and want to watch

**Purpose:** track what the owner has seen, everywhere.

**Requirements**
- Two marks per movie: **watched** and **want to watch** (marking watched clears want to watch). One tap each, on every row and on the movie page.
- The marks show wherever the movie appears, and every list can be filtered to watched, unwatched or want to watch.
- A **Watch list** page: want-to-watch films, then unwatched films of the current season, sortable by Oscar stage, % chance, nominations or average score.
- **Add a film by typing** (2026-10-25): an "Add a film" box at the top of the Watch list finds any film in the app by title (original titles too, accents ignored) and adds it to Want to watch in one step. A film the app doesn't have can't be added there (Claude adds it).
- **Your own order** (2026-10-25): Want to watch keeps the owner's order, changed by dragging (touch, mouse or keyboard). "My order" is the Watch list's default sort; a newly added film goes to the top.
- **Release date and platform** (2026-10-25): each want-to-watch film can carry a date and a platform the owner types in: the first date it can be watched from Indonesia (in cinemas or streaming, whichever comes first), "TBD" when there's no date, and where (Netflix, Cinema XXI…). Shown on its Watch list row.

**UX notes:** marking is instant and can be undone by tapping again; if saving fails, the mark flips back and a message says so.

### 3.14 Search

**Purpose:** jump to any movie, award or festival.

**Requirements**
- A search box on every page (also opened with `/` on a keyboard), matching movie titles (including original titles, ignoring accents) and award and festival names. Results show year, flag and the movie's Oscar stage.

**UX notes:** no results: "No movie or award matches '<text>'."

### 3.15 Strong signals

**Purpose:** for one Oscar category and year, which films the best-predicting awards picked (owner's request, 2026-10-25).

**Requirements**
- **Strong awards** come from the accuracy figures (3.6), as they stand, over at least 5 counted years:
  - **Catches Oscar nominees:** "Oscar nominees it caught" of 50% or more. Its films are the ones it nominated (or more) that year.
  - **Its winner gets nominated:** "Winner → Oscar nomination" of 80% or more. Its film is that year's winner.
- **By award:** each strong award with its figure in words ("Cinema Eye Audience Choice caught 57% of Oscar nominees", "BAFTA Documentary's winner was Oscar-nominated 86% of years"), then that year's films (nominated or won). An award that hasn't announced yet says so, with its date.
- **By film:** each film any strong award picked, with which ones and their figures ("Won BAFTA Documentary (86%) · Nominated Cinema Eye Audience Choice (57%)"); films picked by the most strong awards first.
- Opens on the current season with a year switcher; linked from the accuracy page and each race category.

### 3.16 Nomination patterns (Documentary and International)

**Purpose:** which mix of precursor results usually leads to an Oscar nomination, which well-awarded films missed and why, and the five the patterns pick for any year (owner's request, 2026-10-25).

**Requirements**
- **Strong awards:** the awards whose nominees, among shortlisted films, went on to the Oscar nomination clearly more often than the shortlist as a whole (Documentary, 2012–2024: New York, Los Angeles and National Society critics, Spirit Awards, European Film Awards, IDA Director, Toronto critics, TIFF and Sundance World Cinema documentary prizes, Black Film Critics).
- **Patterns:** how many strong awards nominated a film (0, 1, 2, 3 or more) and, for Documentary, whether it is US-only, with how often films with that pattern got nominated ("3+ strong awards, not US-only: 20 of 21 nominated").
- **The five it picks:** each shortlisted film ranked by its pattern. A film among the five most-nominated with no Spirit Awards or IDA Best Feature nomination is marked down to how such films did before (the snub rule: busy films like that got in 5 of 26 times). Past years show the five next to the real nominees, hits and misses marked, worked out only from the seasons before it, as it would have been live. The live year shows the five and the next three as outside chances; before the shortlist, the ranking without percentages.
- **Why they missed:** each shortlisted film that wasn't nominated, most-nominated first, with its pattern and how that pattern did before ("US-only, no strong awards: 11 of 79 got in; its 41 nominations came from awards whose nominees did no better than the shortlist"); and the most-awarded misses across all years.
- **Snub risk:** from the shortlist on, a flag on a shortlisted Documentary film that looks better on paper than it is: one of the five most-nominated with no Spirit Awards or IDA Best Feature nomination, or a sweep of the New York, Los Angeles and National Society critics with no DGA, Cinema Eye or IDA nomination. It says why, with how such films did before ("1 of 4 got in"). Shown on the patterns page, the race (shortlist stage), the Oscars year page and the movie page; past years show it as it stood, next to the result. International gets it only if a sign holds up there.
- **Full shortlists:** the Oscars year page always lists Documentary's and International's whole shortlist once it is out: the nominees, then "Shortlisted, not nominated", each with its nominations, strong awards, the patterns' pick and the Snub risk flag.
- **Movie page:** a shortlisted Documentary or International film shows its pattern, the patterns' pick, its outcome and any Snub risk flag with the reasons; its strong awards are tagged "Strong" in its awards list.
- **Underdogs:** nominees with at most one strong award, per year and how often that happens (about half of Documentary's nominees).
- **Best predictors:** each award's nomination and win, and the main patterns, with two figures: "got in" (of the shortlisted films that had it, the share nominated) and "caught" (of the nominees, the share that had it), grouped as near-certain, best all-round, wide nets and warning signs; and a short "How to pick the five" in plain words. The planning check's findings are in `docs/research/nomination-predictors.md`.
- **Backtest:** per year, how many nominees the patterns and the app's current method picked. The race's % to be nominated for the category uses whichever did better.

**UX notes:** linked from the race's Documentary and International tabs and the accuracy page. Small history: the page says the patterns are tendencies from 14 seasons.


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
- Editing award or movie data in the app (corrections go through Claude). The owner's watch-list notes are the one exception (3.13).
- Adding a film the app doesn't have from the Watch list (not in Phase 7; a possible follow-up: look it up on TMDB and add it). Looking up release dates and platforms automatically (declined 2026-10-25: the owner types them).

## 7. Technical approach

A web app on the default stack (Next.js, Neon, Vercel; details in `IMPLEMENTATION_PLAN.md`). No sign-in: anyone with the live address could see the app and change the watched marks (the owner accepted this, 2026-10-22), so it's kept out of search engines (`noindex`, `robots.txt`). Paid services: **none** (free tiers only).

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

**Requirement changes** (suggested by the check, decided by the owner 2026-10-22, applied above):
- Letterboxd → **TMDB user score** (§1, §3.2).
- Rotten Tomatoes may be missing or late: shown as "–", no fallback (§3.2).
- Weekly refresh → a **daily batch** (each current film about weekly, older ones monthly) (§3.2).
- Owner key for marking: **declined**; marks stay open to anyone with the link (§7).
- **Marks exported into the repo** before every data load (§3.12).
- Winners-only awards show "–" for the nominees figure, with the reason (§3.6).
- **Sources** section with the TMDB notice and Wikipedia credit (§3.12).

## 8. Build plan

**Deadline:** usable for the 2026 race before the Oscar nominations (January 2027): Phases 0–3.

| Phase | What gets built | Done when |
|---|---|---|
| 0. Foundation | The app shell, design system, database, live on Vercel, kept out of search engines | The live address loads the empty shell and reads from the database; the smoke test passes locally and live |
| 1. Oscars and movies | Oscars 2012–2026 (submissions, shortlists, nominees, winners), movies with flags and the four scores (daily refresh batch), Oscar year pages, International submissions, movie page, watched / want to watch, Watch list, search | The 2025 Oscars page shows all four categories with flags, scores and average; marking a film watched shows on every page it appears on; search finds a film by its original title |
| 2. Major awards and festival prizes | The 12 major awards and the 5 festivals' prizes, 2012–2026; award pages, awards index, accuracy figures and page, year grid, year summary, the movie page's award list | BAFTA 2025's page lists its nominees and winners with their Oscar results; the accuracy figures for a hand-checked award match; the 2025 grid shows every nominated movie with its awards coloured |
| 3. Predictions and the live race | % chance to be nominated and to win per contender, the "why", the backtest; the race as home; the "update the race" routine; data coverage page | Each 2026 category shows chances that add to 100%; past years show the eve-of-ceremony favourite; an update adds a new award result and the chances change |
| 4. Critics groups | The 62 critics groups, 2012–2026, in the grid, award pages, accuracy figures and predictions | Each critics group with data appears below the major awards in the grid and accuracy page, and "no data" years are marked |
| 5. Festival lineups | 2025 and 2026 lineups by section for the five festivals; festival screenings on the movie page | Cannes 2025's page lists every section's films with flags and scores |
| 8. Nomination patterns | The shortlist rule for Documentary and International accuracy figures; the nomination patterns page; the race's % to be nominated from whichever method backtests better | European Film Awards Documentary's winner figure counts only shortlisted winners; the 2024 Documentary patterns page shows the five it picked next to the real nominees, the well-awarded misses with their reasons, and the underdogs |
| 7. Owner's requests of 25 Oct | One flag per film; the grid's Oscar order; strong signals page; an award's all-years page; Watch list add box, drag order, release date and platform | Every row shows one flag; Critics Choice's all-years page lists every year's nominees and winners; the 2025 Picture grid opens with the nominees on top; the 2025 Documentary signals page lists each strong award with its figure and films; a film typed into the Watch list, dragged and given a date and platform keeps all three after a reload |

**Suggested checkpoints with real data:** after Phase 1, the owner marks the films they've seen for 2024–2026 and checks a handful of Oscar years against memory; after Phase 2, the owner spot-checks three awards; after Phase 3, the owner compares the predictions with their own instinct for the 2026 race.

## 9. Decisions so far

- 2026-10-22: One user (the owner), no sign-in; kept out of search engines.
- 2026-10-22: A year means the film year (2025 = 98th Oscars, March 2026).
- 2026-10-22: Four Oscar categories: Picture, Documentary, International, Animated.
- 2026-10-22: "Correlation" means hit rates: winner → Oscar win, winner → Oscar nomination, nominees → Oscar nominees.
- 2026-10-22: % chance to win comes from past seasons' patterns of precursor results.
- 2026-10-22: Claude researches and loads all data; no editing forms in the app.
- 2026-10-22: Scores refreshed about weekly (daily batch); free services only.
- 2026-10-22 (feasibility): TMDB user score replaces Letterboxd (no legal free source). Marks stay open to anyone with the link (owner's choice). Marks exported into the repo before every data load. Sources section added. Winners-only awards show "–" for the nominees figure.
- 2026-10-22: Years 2012–2025 finished, 2026 tracked live. Deadline: Oscar nominations, January 2027.
- 2026-10-22: Oscar shortlists tracked as a stage.
- 2026-10-22: Before the nominations, the race also shows a % chance to be nominated, from past seasons' patterns.
- 2026-10-22: Open-question defaults accepted by the owner (they stay in §10 until something changes them).
- 2026-10-22: Festival major prizes since 2012; full lineups from 2025.
- 2026-10-22: Major awards first, critics groups ("minor") in the next phase; critics groups get their own columns and sections, below the majors.
- 2026-10-22: Accepted: want-to-watch list, search. Declined: posters, prediction history chart.
- 2026-10-22: Watched is just watched or not.
- 2026-10-22: Plan approved as v1.0.
- 2026-10-22: Every movie shows its country flag, not only International entries.
- 2026-10-24: Gaps in critics groups (and Cinema Eye 2012–2020) are filled from IMDb's award records (credited on the sources page); Wikipedia stays where it has data. DOC NYC (Short List, Winner's Circle) and four more Cinema Eye categories added. DC Dox Fest left out.
- 2026-10-25: Fourth accuracy figure, "Oscar nominees it caught" (of the Oscar nominees, the share the award had nominated), on the accuracy page and award pages (owner's idea).
- 2026-10-25: Past seasons (and the live one after its nominations) show each nominee's % to be nominated from the day before the nominations. Counting "passed over" at an award (named its nominees, not this film) was tried in the model and not kept: over 2012–2025, left out one season at a time, it called no more nominees (247 vs 248 in the top slots) and won one more favourite while Best Picture got worse.

- 2026-10-25: Phase 7 (owner's requests): one flag per film (submitting country for any International submission, else Wikipedia's first country); the year grid opens on Oscar nominees, then shortlisted, then by nominations, other sorts kept; a strong signals page (awards with "Oscar nominees it caught" ≥ 50% or "Winner → Oscar nomination" ≥ 80% over at least 5 years, and the films they picked that year, by award and by film); the Watch list gets an add-by-typing box (films in the app only), the owner's own drag order, and a typed release date (first date watchable from Indonesia, or TBD) and platform. Defaults chosen by Claude and accepted: 5-year minimum, both views on one page, a new film goes to the top of the order.
- 2026-10-25: An all-years page per award (§3.5), added to Phase 7. Claude's defaults, accepted: newest year first, one Oscar category at a time, no accuracy figures on it (they stay on the year pages).
- 2026-10-25: Phase 8, nomination patterns for Documentary and International (owner's request), and the shortlist rule for their accuracy figures (owner's rule). Tested first on the `test` data, each year from earlier seasons only: the patterns picked 33 of 55 Documentary nominees over 2015–2025 (the current method 30, random about 18); 3 of 5 in 2023, 2024 and 2025. Documentary themes (labelled by hand from TMDB summaries) were tested and not kept: war films got in 58% of the time against 33% for the shortlist, but adding theme picked fewer nominees (30 of 55), because it mostly repeats what the country and strong awards already say.
- 2026-10-25: Cinema for Peace dropped everywhere (owner): its gala is at the Berlinale in February, after the Oscar nominations, so it echoed the Oscar list rather than predicting it. Recounted without it, the Documentary patterns still pick 33 of 55. Added the snub rule (owner's request, from Claude's recommendation): 35 of 55, better under every strong-award cut-off tested. Preferring films with a DGA, Cinema Eye or Spirit nomination for the last spots was tested too and picked fewer (30–33), so it is a reason on the page and in "How to pick the five", not part of the ranking.
- 2026-10-25: Snub risk flag, full shortlists on the Oscars year page and a patterns panel on the movie page (owner's requests). Two signs, from the 2025 misses and the research: busy but no Spirit or IDA nomination, and a big-critics sweep with no filmmakers' group (My Undesirable Friends). Flagged films 2015–2025: 7 of 27 got in. A third sign (busy with no strong award) flagged no extra film, so it was left out.

## 10. Open questions

| Question | Default if unanswered |
|---|---|
| Which group do the shorthand names mean: "Hollywood", "Black", "Toronto", "Peabody"? | Hollywood = Hollywood Critics Association (now Astra Film Awards); Black = Black Film Critics Circle; Toronto = Toronto Film Critics Association (the festival is separate); Peabody = its documentary winners |
| Critics Choice and Gotham are big precursors; major or minor? | Minor, as listed by the owner |
| Rotten Tomatoes: critics (Tomatometer) or audience score? | Tomatometer |
| Toronto's festival prizes: which runners-up count? | The first and second runners-up of each People's Choice award, counted as nominations |
| Where no source gives a score (e.g. Rotten Tomatoes for some new or foreign films) | Shown as "–" and left out of the average |
