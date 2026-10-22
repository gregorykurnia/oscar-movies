import type { Metadata } from "next";
import { RacePage } from "@/components/race/RacePage";
import { LIVE_YEAR } from "@/lib/years";

// The root layout's title template only reaches child segments, so the home page spells it out
// ("The 2026 race · Oscar Movies", guide §10).
export const metadata: Metadata = { title: { absolute: `The ${LIVE_YEAR} race · Oscar Movies` } };

// The race for the live season (guide §8.1); `/race/[year]` is the same page for any year.
export default function Home() {
  return <RacePage year={LIVE_YEAR} />;
}
