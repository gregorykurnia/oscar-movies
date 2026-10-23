import type { Metadata } from "next";
import { DataPage } from "@/components/data-page/DataPage";

export const metadata: Metadata = { title: "Data and sources" };

// What is loaded for each award and year, and the credits the sources require (guide §8.9).
export default function Page() {
  return <DataPage />;
}
