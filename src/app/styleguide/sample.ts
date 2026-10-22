import type { Scores } from "@/components/score-line/ScoreLine";

// The styleguide's sample data. The stress switch swaps in the awkward values of the preview's
// "Stress data" button: very long titles with no spaces, huge counts, missing scores (guide §15).

const LONG_WORD = "Rindfleischetikettierungsüberwachungsaufgabenübertragungsgesetz";
const LONG_TITLE =
  "Night of the Day of the Dawn of the Son of the Bride of the Return of the Revenge of the Terror of the Attack of the Evil, Mutant, Alien, Flesh Eating, Hellbound, Zombified Living Dead Part 2";

export type SampleFilm = {
  title: string;
  href: string;
  lang?: string;
  flags: string[];
  firstFlagLabel?: string;
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
      flags: ["US"],
      meta: "2025 · Picture",
      scores: stress ? NONE : ALL_FOUR,
    },
    {
      title: stress ? LONG_TITLE : "Hamnet",
      href: "#",
      flags: ["GB", "US"],
      meta: "2025 · Picture",
      scores: stress ? { ...THREE, imdb: null, mc: null, average: 83, count: 1 } : { imdb: 8, rt: 87, mc: 84, tmdb: 7.9, average: 83, count: 4 },
    },
    {
      title: stress ? "Birdman or (The Unexpected Virtue of Ignorance)" : "Sentimental Value",
      href: "#",
      lang: "no",
      flags: ["NO", "FR", "DK", "SE", "DE"],
      meta: "2025 · International",
      scores: stress ? NONE : THREE,
    },
  ];
  return {
    stress,
    films,
    longWord: LONG_WORD,
    coProduction: stress ? ["NO", "FR", "DK", "GB", "DE", "IT", "ES", "PL", "SE", "FI", "BE", "NL", "AT", "CH"] : ["NO", "FR", "DK", "GB", "DE"],
    scoreRows: stress ? [NONE, NONE, NONE] : [ALL_FOUR, THREE, NONE],
    nominations: stress ? "1,204" : "7",
    watchCount: stress ? "1,204 films" : "4 films",
    showAll: stress ? "Show all 1,284 contenders" : "Show all 38 contenders",
    awardName: stress ? "Society of LGBTQ Entertainment Critics (Dorian Awards), Film of the Year" : "Actor Awards",
  };
}

export type Sample = ReturnType<typeof sample>;
