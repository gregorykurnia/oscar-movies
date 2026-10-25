import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AwardHistoryPage } from "@/components/awards/AwardHistoryPage";
import { findAward } from "@/lib/awards";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export const metadata: Metadata = { title: "Oscars, all years" };

// The Oscars' nominees and winners in every film year (guide §8.2, all years). A folder of its own,
// because `oscars/[year]` would otherwise catch "all".
export default async function Page({ searchParams }: Props) {
  const award = findAward("oscars");
  if (!award) notFound();
  return <AwardHistoryPage award={award} query={searchParams} />;
}
