import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FestivalsIndexPage } from "@/components/awards/AwardsIndex";
import { LIVE_YEAR, OLDEST_YEAR, parseFilmYear, yearRange } from "@/lib/years";

type Props = { params: Promise<{ year: string }> };

// Every film year's index is known at build; the lists are read per request (FestivalsIndexPage).
export function generateStaticParams() {
  return yearRange(LIVE_YEAR, OLDEST_YEAR).map((year) => ({ year: String(year) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const year = parseFilmYear((await params).year);
  return { title: year ? `Festivals ${year}` : "Page not found" };
}

// The festivals index for one film year (guide §8.7).
export default async function Page({ params }: Props) {
  const year = parseFilmYear((await params).year);
  if (year === null) notFound();
  return <FestivalsIndexPage year={year} />;
}
