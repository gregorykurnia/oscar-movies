import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { readDbBranch } from "@/db/meta";
import { PageHeader } from "@/components/page-header/PageHeader";
import { ActionChecks } from "./ActionChecks";

export default function Page() {
  return <Suspense fallback={null}><GuardedChecks /></Suspense>;
}
async function GuardedChecks() {
  await connection();
  if (process.env.MOVIE_CATALOGUE_FIXTURES !== "1" || process.env.EXPECT_DB_BRANCH !== "test"
    || process.env.VERCEL_ENV === "production" || await readDbBranch(getDb()) !== "test") notFound();
  return <><PageHeader title="Film save checks" /><ActionChecks /></>;
}
