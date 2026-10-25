import type { Scores } from "@/components/score-line/ScoreLine";
import type { SearchAward, SearchFilm } from "@/lib/search";

// The styleguide's sample data. The stress switch swaps in the awkward values of the preview's
// "Stress data" button: very long titles with no spaces, huge counts, missing scores (guide §15).

const LONG_WORD = "Rindfleischetikettierungsüberwachungsaufgabenübertragungsgesetz";
const LONG_TITLE =
  "Night of the Day of the Dawn of the Son of the Bride of the Return of the Revenge of the Terror of the Attack of the Evil, Mutant, Alien, Flesh Eating, Hellbound, Zombified Living Dead Part 2";

export type SampleFilm = {
  title: string;
  href: string;
  lang?: string;
  flag: string;
  meta: string;
  scores: Scores;
};

const ALL_FOUR: Scores = { imdb: 7.9, rt: 95, mc: 95, tmdb: 7.5, average: 86, count: 4 };
const THREE: Scores = { imdb: 8.1, rt: null, mc: 89, tmdb: 7.8, average: 83, count: 3 };
const NONE: Scores = { imdb: null, rt: null, mc: null, tmdb: null, average: null, count: 0 };

export function sample(stress: boolean) {
  const films: SampleFilm[] = [
    {
      title: stress ? LONG_WORD : "One Battle After Another",
      href: "#",
      flag: "US",
      meta: "2025 · Picture",
      scores: stress ? NONE : ALL_FOUR,
    },
    {
      title: stress ? LONG_TITLE : "Hamnet",
      href: "#",
      flag: "GB",
      meta: "2025 · Picture",
      scores: stress ? { ...THREE, imdb: null, mc: null, average: 83, count: 1 } : { imdb: 8, rt: 87, mc: 84, tmdb: 7.9, average: 83, count: 4 },
    },
    {
      title: stress ? "Birdman or (The Unexpected Virtue of Ignorance)" : "Sentimental Value",
      href: "#",
      lang: "no",
      flag: "NO",
      meta: "2025 · International",
      scores: stress ? NONE : THREE,
    },
  ];
  return {
    stress,
    films,
    longWord: LONG_WORD,
    scoreRows: stress ? [NONE, NONE, NONE] : [ALL_FOUR, THREE, NONE],
    nominations: stress ? "1,204" : "7",
    watchCount: stress ? "1,204 films" : "4 films",
    showAll: stress ? "Show all 1,284 contenders" : "Show all 38 contenders",
    tabLeads: stress
      ? { picture: LONG_WORD, documentary: LONG_TITLE, international: "Birdman or (The Unexpected Virtue of Ignorance)", animated: "1,204 nominees" }
      : { picture: "Anora", documentary: "No Other Land", international: "I'm Still Here", animated: "Flow" },
    search: searchSample(stress),
    awardName: stress ? "Society of LGBTQ Entertainment Critics (Dorian Awards), Film of the Year" : "Actor Awards",
  };
}

export type Sample = ReturnType<typeof sample>;

const annie: SearchAward = { slug: "annie", name: "Annie Awards", shortName: "Annie", kindLabel: "Major award", href: "#" };

/** Search results as the route returns them: what the popover and the sheet draw (guide §7). */
function searchSample(stress: boolean) {
  if (stress) {
    const film = (over: Partial<SearchFilm>): SearchFilm => ({
      slug: "x", title: "", originalTitle: null, originalLang: null, year: 2025, flag: null, categories: [], stage: null, href: "#", ...over,
    });
    return {
      query: "Rindfleisch",
      films: [
        film({ slug: "a", title: LONG_WORD, flag: "DE", categories: ["Best Picture", "Documentary", "International", "Animated"], stage: "nominated" }),
        film({ slug: "b", title: LONG_TITLE, originalTitle: LONG_WORD, originalLang: "de", categories: ["Documentary"] }),
      ],
      awards: [{ ...annie, name: "Society of LGBTQ Entertainment Critics (Dorian Awards), Film of the Year", shortName: "Rindfleisch", kindLabel: "Critics group" }],
      originalQuery: "ainda",
      originalFilms: [{ ...film({ slug: "c", title: LONG_TITLE, originalTitle: "Ainda " + LONG_WORD, originalLang: "pt-BR", flag: "BR", categories: ["International"], stage: "submitted" }) }],
      noMatch: LONG_WORD,
    };
  }
  return {
    query: "an",
    films: [
      { slug: "anora", title: "Anora", originalTitle: null, originalLang: null, year: 2024, flag: "US", categories: ["Best Picture"], stage: "won", href: "#" },
      { slug: "anatomy", title: "Anatomy of a Fall", originalTitle: "Anatomie d'une chute", originalLang: "fr", year: 2023, flag: "FR", categories: ["Best Picture"], stage: "nominated", href: "#" },
    ] satisfies SearchFilm[],
    awards: [annie],
    originalQuery: "ainda",
    originalFilms: [
      { slug: "im-still-here", title: "I'm Still Here", originalTitle: "Ainda Estou Aqui", originalLang: "pt-BR", year: 2024, flag: "BR", categories: ["Best Picture", "International"], stage: "nominated", href: "#" },
    ] satisfies SearchFilm[],
    noMatch: "zzzz",
  };
}
