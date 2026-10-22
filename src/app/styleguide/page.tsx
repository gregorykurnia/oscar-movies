import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header/PageHeader";
import { Styleguide } from "./Styleguide";
import { readTokens, styleguideOpen } from "./tokens";

export const metadata: Metadata = { title: "Styleguide" };

async function Content({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { stress, error } = await searchParams;
  // `?error=1` throws on purpose, so the screenshot spec can capture the real error page (task 0.12).
  if (error === "1") throw new Error("Deliberate error for the error page (task 0.12)");
  return <Styleguide stress={stress === "1"} tokens={await readTokens()} />;
}

// Dev and preview only: a 404 when VERCEL_ENV is production (plan §6).
export default function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  if (!styleguideOpen()) notFound();
  return (
    <Suspense fallback={<PageHeader title="Styleguide" />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}
