import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { MoviePage } from "@/components/movie/MoviePage";
import { getMovie } from "@/data/movie";

type Props = { params: Promise<{ slug: string }> };

// A film's address is any slug the database holds, which the build must not read. One sample address
// lets Next prerender the page's shell; every slug is then read per request (MoviePage), and one
// that isn't a film shows the 404 page.
export function generateStaticParams() {
  return [{ slug: "sample" }];
}

// The title reads "I'm Still Here (2024) · Oscar Movies" (guide §10).
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // Wait for the request, so `next build` never reads the database.
  await connection();
  const film = await getMovie((await params).slug);
  return { title: film ? `${film.title} (${film.year})` : "Page not found" };
}

// The film is read per request (MoviePage), so every slug the database holds works with no list to build.
export default function Page({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <Slug params={params} />
    </Suspense>
  );
}

async function Slug({ params }: Props) {
  return <MoviePage slug={(await params).slug} />;
}
