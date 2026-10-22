import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SubmissionsPage } from "@/components/submissions/SubmissionsPage";
import { LIVE_YEAR, OLDEST_YEAR, parseFilmYear, yearRange } from "@/lib/years";

type Props = {
  params: Promise<{ year: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Every film year's header is known at build; the list is read per request (SubmissionsPage).
export function generateStaticParams() {
  return yearRange(LIVE_YEAR, OLDEST_YEAR).map((year) => ({ year: String(year) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const year = parseFilmYear((await params).year);
  return { title: year ? `${year} submissions` : "Page not found" };
}

// International Feature submissions for a film year (guide §8.3). The sort and the chips are read
// from the address.
export default async function Page({ params, searchParams }: Props) {
  const year = parseFilmYear((await params).year);
  if (year === null) notFound();
  return <SubmissionsPage year={year} query={searchParams} />;
}
