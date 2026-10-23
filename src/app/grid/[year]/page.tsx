import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { YearGridPage } from "@/components/year-grid/YearGridPage";
import { LIVE_YEAR, OLDEST_YEAR, parseFilmYear, yearRange } from "@/lib/years";

type Props = {
  params: Promise<{ year: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Every film year's header is known at build; the grid is read per request (YearGridPage).
export function generateStaticParams() {
  return yearRange(LIVE_YEAR, OLDEST_YEAR).map((year) => ({ year: String(year) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const year = parseFilmYear((await params).year);
  return { title: year ? `${year} year grid` : "Page not found" };
}

// The year grid for a film year (guide §8.4). Category, sort, filter and folding are read from the
// address.
export default async function Page({ params, searchParams }: Props) {
  const year = parseFilmYear((await params).year);
  if (year === null) notFound();
  return <YearGridPage year={year} query={searchParams} />;
}
