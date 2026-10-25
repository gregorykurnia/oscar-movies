import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SignalsPage } from "@/components/signals/SignalsPage";
import { LIVE_YEAR, OLDEST_YEAR, parseFilmYear, yearRange } from "@/lib/years";

type Props = {
  params: Promise<{ year: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Every film year's header is known at build; the awards and films are read per request (SignalsPage).
export function generateStaticParams() {
  return yearRange(LIVE_YEAR, OLDEST_YEAR).map((year) => ({ year: String(year) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const year = parseFilmYear((await params).year);
  return { title: year ? `${year} strong signals` : "Page not found" };
}

// Strong signals for a film year (guide §8.13). Category and view are read from the address.
export default async function Page({ params, searchParams }: Props) {
  const year = parseFilmYear((await params).year);
  if (year === null) notFound();
  return <SignalsPage year={year} query={searchParams} />;
}
