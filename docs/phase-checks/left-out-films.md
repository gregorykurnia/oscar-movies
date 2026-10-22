# Films left out of the imports

Films an award list names that have no IMDb ID and no Wikidata item (IMPLEMENTATION_PLAN.md §11). Each is left out of its edition and added later by a correction once Wikidata has an item. The research scripts skip them through `leaveOut` in `scripts/research/sources/<award>.json`.

| Award | Year | Category | Film | Why |
|---|---|---|---|---|
| Oscars | 2013 | Documentary shortlist | Which Way Is the Front Line from Here? The Life and Time of Tim Hetherington | No Wikipedia article and no Wikidata item (shortlist has 14 of 15) |
| Oscars | 2018 | Animated eligible | The Laws of the Universe: Part I | Wikipedia links Part 0 (2015); Part I has no Wikidata item |
| Oscars | 2022 | Animated eligible | Run, Tiger Run! | No Wikidata item |
| Oscars | 2023 | Animated eligible | Warrior King | No Wikidata item |
| Oscars | 2024 | Animated eligible | Rocket Club: Across the Cosmos | No Wikidata item |
| Oscars | 2025 | Animated eligible | All Operators Are Currently Unavailable | No Wikidata item |
| Oscars | 2026 | International submission | Child (Luxembourg, Cyrus Neshvad) | No Wikidata item, and TMDB has no entry with an IMDb ID (searched 2026-10-22); announced only weeks ago, so look again before the shortlists |
