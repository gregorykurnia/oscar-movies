import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccuracyPage } from "@/components/accuracy/AccuracyPage";
import { RACE_CATEGORIES } from "@/lib/race";

type Props = {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Every category's header is known at build; the table is read per request (AccuracyPage).
export function generateStaticParams() {
  return RACE_CATEGORIES.map((c) => ({ category: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  const found = RACE_CATEGORIES.find((c) => c.slug === category);
  return { title: found ? `Accuracy: ${found.oscar}` : "Page not found" };
}

// How well each award foretells one Oscar category (guide §8.5). The sort is read from the address.
export default async function Page({ params, searchParams }: Props) {
  const { category } = await params;
  const found = RACE_CATEGORIES.find((c) => c.slug === category);
  if (!found) notFound();
  return <AccuracyPage category={found.slug} query={searchParams} />;
}
