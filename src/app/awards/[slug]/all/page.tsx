import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AwardHistoryPage } from "@/components/awards/AwardHistoryPage";
import { AWARDS, findAward } from "@/lib/awards";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Every award's header is known at build; the results are read per request (AwardHistoryPage).
// The Oscars have their own page (`/awards/oscars/all`), which wins the route.
export function generateStaticParams() {
  return AWARDS.filter((a) => a.kind !== "oscars").map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const award = findAward((await params).slug);
  return { title: award ? `${award.shortName}, all years` : "Page not found" };
}

// One award or festival prize in every film year (guide §8.2, all years). The tab is read from the address.
export default async function Page({ params, searchParams }: Props) {
  const award = findAward((await params).slug);
  if (!award || award.kind === "oscars") notFound();
  return <AwardHistoryPage award={award} query={searchParams} />;
}
