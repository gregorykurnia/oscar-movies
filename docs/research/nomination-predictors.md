# What predicts an Oscar nomination: Documentary and International

The planning check behind Phase 8 (product plan §3.16, implementation plan Phase 8), run read-only on the `test` database on 2026-10-25 and recounted the same day without Cinema for Peace (removed from the app: its gala is at the Berlinale in February, after the Oscar nominations). International is filled in by task 8.3.

**How it was counted:** shortlisted films only (`shortlisted` or better), 2012–2025. A precursor result counts only if it was announced before that year's Oscar nominations (`nominations_on`, else `winners_on`; no date counts as announced); a win announced later counts as a nomination. "US-only" means the film's countries are exactly `["US"]`. Two figures per predictor:
- **Got in:** of the shortlisted films that had it, the share nominated.
- **Caught:** of the 70 Oscar nominees, the share that had it.

The figures below cover all 14 seasons together: they describe the past. The backtest further down is the real test (each year from earlier seasons only).

## Documentary (209 shortlisted films, 70 nominees; 33% of the shortlist gets in)

### Near-certain, but few films a year
| Predictor | Got in | Caught |
|---|---|---|
| IDA Best Feature win | 12 of 12 (100%) | 17% |
| European Film Awards documentary win | 7 of 7 (100%) | 10% |
| 3+ strong awards, not US-only | 20 of 21 (95%) | 29% |
| National Society of Film Critics win | 12 of 13 (92%) | 17% |
| Cinema Eye Best Feature win | 11 of 13 (85%) | 16% |
| New York Film Critics Circle nominee | 12 of 15 (80%) | 17% |

### Best all-round
| Predictor | Got in | Caught |
|---|---|---|
| Spirit Awards documentary nominee | 35 of 49 (71%) | **50%** |
| Los Angeles critics nominee | 19 of 27 (70%) | 27% |
| Toronto critics nominee | 22 of 32 (69%) | 31% |
| National Society of Film Critics nominee | 21 of 31 (68%) | 30% |

### Wide nets (most nominees are in them, many misses too)
| Predictor | Got in | Caught |
|---|---|---|
| DOC NYC short list | 58 of 131 (44%) | **83%** |
| IDA Best Feature nominee | 40 of 71 (56%) | 57% |
| Cinema Eye Best Feature nominee | 39 of 69 (57%) | 56% |
| DGA documentary nominee | 38 of 65 (58%) | 54% |

### Warning signs
| Predictor | Got in |
|---|---|
| Among the five most-nominated, no Spirit and no IDA Best Feature nomination | 5 of 26 (19%): see "Busy films that got snubbed" |
| US-only and none of the strong awards | 12 of 82 (15%): Apollo 11, Won't You Be My Neighbor?, Will & Harper, Daughters, Cover-Up |
| Critics Choice Documentary win | 3 of 9 (33%), no better than the shortlist |
| Cinema Eye Audience Choice win | 4 of 11 (36%) |
| US-only (any) | 30 of 124 (24%), against 40 of 85 (47%) for the rest |

**Strong awards** (Phase 8 rule: nominees among shortlisted films number 6 or more, smoothed rate at least 60%; as learned from 2012–2024): New York, Los Angeles and National Society critics, Spirit Awards, European Film Awards, IDA Best Director, Toronto critics, TIFF People's Choice Documentary, Sundance World Cinema Documentary Jury, Black Film Critics.

### Patterns (strong awards × country, 2012–2024)
| Pattern | Nominated |
|---|---|
| 3+, not US-only | 20 of 21 (95%) |
| 3+, US-only | 9 of 12 (75%) |
| 2, not US-only | 5 of 8 (62%) |
| 2, US-only | 1 of 6 (17%) |
| 1 | 13 of 38 (34%) |
| 0, not US-only | 6 of 30 (20%) |
| 0, US-only | 11 of 79 (14%) |

**Underdogs** (nominees with 0–1 strong awards) are about half of each year's nominees (33 of 70): the first two or three picks are reliable, the rest close to a guess.

### Busy films that got snubbed
"Busy" means the five shortlisted films with the most precursor nominations that year (ties at fifth included). A high count is a poor guide on its own: they got in 39 of 72 times (54%). Most of the count is regional US critics groups, which tend to nominate the same popular American films. Of the 72:

| Sign | Got in |
|---|---|
| No Spirit Awards nomination and no IDA Best Feature nomination | 5 of 26 (19%); 3 of 13 in 2012–18, 2 of 13 in 2019–25 |
| 0 strong awards | 5 of 22 (23%) |
| Critics Choice Documentary win | 3 of 9 (33%) |
| Hollywood Critics nominee | 8 of 19 (42%) |
| US-only | 19 of 44 (43%) |
| Spirit and IDA Best Feature nominations | 21 of 24 (88%) |
| 3+ strong awards | 25 of 28 (89%) |

The typical snub is a US film with many critics-group nominations and crowd wins but none of the documentary groups' own awards: Life Itself, Going Clear, Three Identical Strangers, Boys State, Moonage Daydream, Still, Will & Harper, Cover-Up. The five that got in anyway: Cartel Land, Abacus: Small Enough to Jail, RBG, 20 Days in Mariupol, The Alabama Solution. Every film in a year's top two by count with no strong award was snubbed (The Imposter, Weiner, Still, Will & Harper, Cover-Up). Celebrity and music portraits among the busy films, labelled by hand: about 10 snubbed, 4 in (Searching for Sugar Man, 20 Feet from Stardom, Amy, Summer of Soul); 1 of 6 since 2019.

This sign is part of the method (see "The snub rule" under the backtest).

### Underdogs: what lifts them
Every year has 1–3 nominees from outside the busy five. Of the 137 less-nominated shortlisted films (23% get in):

| Sign | Got in |
|---|---|
| No US country, plus a DGA, Cinema Eye Best Feature or Spirit nomination | 8 of 10 (80%) |
| 2+ strong awards | 7 of 11 (64%) |
| DGA nominee | 14 of 26 (54%) |
| Cinema Eye Best Feature nominee | 10 of 19 (53%) |
| Spirit nominee | 7 of 15 (47%) |
| No US country | 13 of 28 (46%) |
| None of DGA, Cinema Eye Best Feature or Spirit | 8 of 87 (9%) |
| US-only and none of those three | 2 of 56 (4%); 0 of 21 since 2019 |

A nomination from a group where filmmakers vote (DGA, Cinema Eye, Spirit) matters far more than the number of critics-group mentions. Non-US examples: Fire at Sea, My Octopus Teacher, The Mole Agent, A House Made of Splinters, The Eternal Memory, Soundtrack to a Coup d'Etat (Maiden and Midnight Family missed). Tested as a ranking rule (preferring these films for the last one or two spots, or as a tie-break) it picked 30–33 of 55 against 35, so it stays a reading guide and a reason on the page, not part of the ranking.

### How to pick the five
1. Work from the shortlist of 15.
2. Lock in films with 3+ strong awards, non-US first, and any IDA, European Film Awards or National Society winner.
3. Next, Spirit Awards nominees, non-US first.
4. Distrust a film among the five most-nominated with no Spirit or IDA Best Feature nomination, however many critics groups named it.
5. The last one or two spots are open: prefer a non-US film with a DGA, Cinema Eye or Spirit nomination over a US crowd-pleaser with many critics-group wins.

### Backtest (each year from earlier seasons only)
| Year | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | Total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Patterns with the snub rule | 2 | 4 | 3 | 3 | 4 | 3 | 3 | 4 | 3 | 4 | 2 | **35 of 55** |
| Patterns alone | 2 | 4 | 2 | 3 | 4 | 3 | 2 | 4 | 3 | 4 | 2 | 33 of 55 |
| App's current method | 3 | 3 | 2 | 3 | 3 | 3 | 2 | 4 | 2 | 2 | 3 | 30 of 55 |

Random picks from the shortlist average about 18 of 55. Other cut-offs for "strong" (50–65%, cap 2–4) gave 30–34 for patterns alone and 33–38 with the snub rule, which added 2–7 under every setting; 60% / 3+ is a middle setting, not the best one picked after the fact. The current method's eve figures are leave-one-season-out (they saw later seasons), so its real-time score would be no better. With Cinema for Peace still counted (before its removal), patterns alone also gave 33 and the current method 30.

**The snub rule:** a film among the five most-nominated (ties at fifth included) with no Spirit and no IDA Best Feature nomination gets the lower of its pattern's rate and the rate of such films in earlier seasons (smoothed the same way). It held at 34–35 whether "most-nominated" meant the top 3 or the top 7; Spirit alone or IDA alone did not help (33–34). It was found by looking at all seasons, so the backtest flatters it a little.

| Year | The five it picked (✓ nominated) | Missed nominees (its rank) |
|---|---|---|
| 2023 | Four Daughters ✓, The Eternal Memory ✓, Apolonia, Apolonia, Going to Mars: The Nikki Giovanni Project, 20 Days in Mariupol ✓ | Bobi Wine: The People's President (7), To Kill a Tiger (9) |
| 2024 | No Other Land ✓, Dahomey, Soundtrack to a Coup d'Etat ✓, Sugarcane ✓, Black Box Diaries ✓ | Porcelain War (8) |
| 2025 | The Perfect Neighbor ✓, My Undesirable Friends: Part I, Apocalypse in the Tropics, Cutting Through Rocks ✓, Seeds | Come See Me in the Good Light (6), Mr. Nobody Against Putin (7), The Alabama Solution (14) |

### Tested and not kept: themes
Each shortlisted documentary was labelled by hand with one theme from its TMDB summary. War and conflict got in 58% (70% when not US-only), crime and scandal 11%, US-only politics 1 of 21. Adding theme to the patterns picked fewer nominees (30 of 55; 2025: 2 of 5, as five war documentaries were shortlisted and one got in): it mostly repeats what country and strong awards already say.

### The shortlist rule (task 8.1)
199 of 946 documentary award wins in 2012–2025 went to films that never reached the Oscar shortlist, and so count against the award today (counted before Cinema for Peace's removal; it had 18 of those wins, 10 to films never shortlisted). Left out, European Film Awards' winner figure goes from 7 of 14 to 7 of 7, Sundance World Cinema documentary's from 7 of 14 to 7 of 7, Peabody's from 33% to 59%.

### Cautions
- 14 seasons and 70 nominees: tendencies, not rules. Many predictors pick the same films.
- An award with no announcement dates counts every result as announced in time. Cinema for Peace was one (22 of 34 got in) until it was removed for coming after the Oscar nominations; check the dates of any award that looks this good.
- Countries come from Wikipedia and can mislead: My Undesirable Friends (a Moscow story) is listed US-only. Task 7.2 fixed the first-listed country.

## International
To be filled in by task 8.3, in the same form (International has no US-only split; 273 of 716 award wins went to films never shortlisted, e.g. Los Angeles critics' winner figure goes from 7 of 16 to 7 of 8).
