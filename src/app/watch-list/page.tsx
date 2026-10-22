import type { Metadata } from "next";
import { WatchListPage } from "@/components/watch-list/WatchListPage";

export const metadata: Metadata = { title: "Watch list" };

// The Watch list (guide §8.3): the sort is read from the address, the lists per request (WatchListPage).
export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <WatchListPage query={searchParams} />;
}
