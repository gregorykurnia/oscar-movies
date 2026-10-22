import type { Metadata } from "next";
import { RacePage } from "@/components/race/RacePage";
import { LIVE_YEAR } from "@/lib/years";

export const metadata: Metadata = { title: `The ${LIVE_YEAR} race` };

// The race for the live season (guide §8.1); `/race/[year]` is the same page for any year.
export default function Home() {
  return <RacePage year={LIVE_YEAR} />;
}
