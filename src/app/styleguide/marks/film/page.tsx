import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FilmLabelledMarks } from "@/components/marks/MarksProvider";
import { PageHeader } from "@/components/page-header/PageHeader";
import { styleguideOpen } from "../../tokens";
import { liveMarksFilms } from "../films";

export const metadata: Metadata = { title: "Live marks" };

// The second live-marks page (task 1.7): one film (`?id=`) with the movie page's labelled marks.
// The id is in the query, not the path, so the page has no dynamic segment to prerender.
type SearchParams = Promise<{ id?: string | string[] }>;

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  if (!styleguideOpen()) notFound();
  return (
    <Suspense fallback={<PageHeader title="Live marks" />}>
      <Film searchParams={searchParams} />
    </Suspense>
  );
}

async function Film({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams;
  const entry = (await liveMarksFilms()).find((f) => String(f.film.id) === id);
  if (!entry) notFound();
  const { film } = entry;
  return (
    <>
      <PageHeader title={film.title} sub={film.year} back={{ label: "Live marks", href: "/styleguide/marks" }} />
      <FilmLabelledMarks movieId={film.id} title={film.title} className="mt-6 flex flex-wrap gap-2 md:mt-8" />
    </>
  );
}
