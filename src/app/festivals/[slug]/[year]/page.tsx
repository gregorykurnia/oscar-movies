import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LineupPage } from "@/components/festivals/LineupPage";
import { AWARDS, findAward } from "@/lib/awards";
import { LIVE_YEAR, OLDEST_YEAR, parseFilmYear, yearRange } from "@/lib/years";

// Next.js wants one name for this segment: a festival's slug here, a film year on the festivals
// index (`[slug]/page.tsx`).
type Props = {
  params: Promise<{ slug: string; year: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Every festival's year header is known at build; the lineups are read per request (LineupPage).
export function generateStaticParams() {
  return AWARDS.filter((a) => a.kind === "festival").flatMap((a) =>
    yearRange(LIVE_YEAR, OLDEST_YEAR).map((year) => ({ slug: a.slug, year: String(year) })),
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, year: y } = await params;
  const festival = findAward(slug);
  const year = parseFilmYear(y);
  return { title: festival && year ? `${festival.shortName} ${year} lineup` : "Page not found" };
}

// One festival's lineup in one film year (guide §8.3). The sort and the mark chip are read from the address.
export default async function Page({ params, searchParams }: Props) {
  const { slug, year: y } = await params;
  const festival = findAward(slug);
  const year = parseFilmYear(y);
  if (!festival || festival.kind !== "festival" || year === null) notFound();
  return <LineupPage festival={festival} year={year} query={searchParams} />;
}
