import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AwardYearPage } from "@/components/awards/AwardYearPage";
import { AWARDS, findAward } from "@/lib/awards";
import { LIVE_YEAR, OLDEST_YEAR, parseFilmYear, yearRange } from "@/lib/years";

type Props = { params: Promise<{ award: string; year: string }> };

// Every award and film year's header is known at build; the results are read per request
// (AwardYearPage). The Oscars have their own page (`/awards/oscars/[year]`), which wins the route.
export function generateStaticParams() {
  return AWARDS.filter((a) => a.kind !== "oscars").flatMap((a) =>
    yearRange(LIVE_YEAR, OLDEST_YEAR).map((year) => ({ award: a.slug, year: String(year) })),
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { award: slug, year: y } = await params;
  const award = findAward(slug);
  const year = parseFilmYear(y);
  return { title: award && year ? `${award.shortName} ${year}` : "Page not found" };
}

// One award or festival prize in one film year (guide §8.2).
export default async function Page({ params }: Props) {
  const { award: slug, year: y } = await params;
  const award = findAward(slug);
  const year = parseFilmYear(y);
  if (!award || award.kind === "oscars" || year === null) notFound();
  return <AwardYearPage award={award} year={year} />;
}
