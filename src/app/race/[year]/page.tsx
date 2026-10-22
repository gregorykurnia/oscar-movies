import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RacePage } from "@/components/race/RacePage";
import { LIVE_YEAR, OLDEST_YEAR, parseFilmYear, yearRange } from "@/lib/years";

type Props = { params: Promise<{ year: string }> };

// Every film year's header is known at build; the race itself is read per request (RacePage).
export function generateStaticParams() {
  return yearRange(LIVE_YEAR, OLDEST_YEAR).map((year) => ({ year: String(year) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const year = parseFilmYear((await params).year);
  return { title: year ? `The ${year} race` : "Not found" };
}

// The race for any film year (guide §8.1). The live season's is also at `/`.
export default async function Page({ params }: Props) {
  const year = parseFilmYear((await params).year);
  if (year === null) notFound();
  return <RacePage year={year} />;
}
