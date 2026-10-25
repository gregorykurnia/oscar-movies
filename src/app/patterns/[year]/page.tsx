import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PatternsPage } from "@/components/patterns/PatternsPage";
import { parsePatternYear, PATTERN_YEARS } from "@/lib/patterns/page";

type Props = {
  params: Promise<{ year: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Every year's header is known at build; the patterns are read per request (PatternsPage).
export function generateStaticParams() {
  return PATTERN_YEARS.map((year) => ({ year: String(year) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const year = parsePatternYear((await params).year);
  return { title: year ? `${year} nomination patterns` : "Page not found" };
}

// Nomination patterns for a film year (guide §8.14). The category is read from the address.
export default async function Page({ params, searchParams }: Props) {
  const year = parsePatternYear((await params).year);
  if (year === null) notFound();
  return <PatternsPage year={year} query={searchParams} />;
}
