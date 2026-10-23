import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { YearSummaryPage } from "@/components/year-summary/YearSummaryPage";
import { LIVE_YEAR, OLDEST_YEAR, parseFilmYear, yearRange } from "@/lib/years";

type Props = {
  params: Promise<{ year: string }>;
};

// Every film year's header is known at build; the summary is read per request (YearSummaryPage).
export function generateStaticParams() {
  return yearRange(LIVE_YEAR, OLDEST_YEAR).map((year) => ({ year: String(year) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const year = parseFilmYear((await params).year);
  return { title: year ? `${year} year summary` : "Page not found" };
}

// The year summary for a film year (guide §8.8): the season in numbers, each count a link to its list.
export default async function Page({ params }: Props) {
  const year = parseFilmYear((await params).year);
  if (year === null) notFound();
  return <YearSummaryPage year={year} />;
}
