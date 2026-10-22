import { getSeasonFilms } from "@/data/watch-list";

// The live-marks pages (task 1.7) mark real films on the database the app reads: the first
// films of a finished season, by title. The race and the movie page take over in 1.8 and 1.13.
export const LIVE_MARKS_YEAR = 2024;
const COUNT = 8;

export async function liveMarksFilms() {
  return (await getSeasonFilms(LIVE_MARKS_YEAR)).slice(0, COUNT);
}
