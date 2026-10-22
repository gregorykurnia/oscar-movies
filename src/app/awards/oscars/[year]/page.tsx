import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OscarYearPage } from "@/components/awards/OscarYearPage";
import { LIVE_YEAR, OLDEST_YEAR, parseFilmYear, yearRange } from "@/lib/years";

type Props = { params: Promise<{ year: string }> };

// Every film year's header is known at build; the lists are read per request (OscarYearPage).
export function generateStaticParams() {
  return yearRange(LIVE_YEAR, OLDEST_YEAR).map((year) => ({ year: String(year) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const year = parseFilmYear((await params).year);
  return { title: year ? `Oscars ${year}` : "Page not found" };
}

// The Oscars' own year page (guide §8.2, on the award-page template).
export default async function Page({ params }: Props) {
  const year = parseFilmYear((await params).year);
  if (year === null) notFound();
  return <OscarYearPage year={year} />;
}
