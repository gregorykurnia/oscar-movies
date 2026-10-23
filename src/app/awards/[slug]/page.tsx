import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AwardsIndexPage } from "@/components/awards/AwardsIndex";
import { LIVE_YEAR, OLDEST_YEAR, parseFilmYear, yearRange } from "@/lib/years";

type Props = { params: Promise<{ slug: string }> };

// Next.js wants one name for this segment: a film year here, an award's slug in `[slug]/[year]`.
// Every film year's index is known at build; the lists are read per request (AwardsIndexPage).
export function generateStaticParams() {
  return yearRange(LIVE_YEAR, OLDEST_YEAR).map((year) => ({ slug: String(year) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const year = parseFilmYear((await params).slug);
  return { title: year ? `Awards ${year}` : "Page not found" };
}

// The awards index for one film year (guide §8.7).
export default async function Page({ params }: Props) {
  const year = parseFilmYear((await params).slug);
  if (year === null) notFound();
  return <AwardsIndexPage year={year} />;
}
