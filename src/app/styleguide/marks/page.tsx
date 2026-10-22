import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { FilmList, FilmRow } from "@/components/film-row/FilmRow";
import { FilmMarks } from "@/components/marks/MarksProvider";
import { PageHeader } from "@/components/page-header/PageHeader";
import { RaceRowsSkeleton } from "@/components/skeleton/Skeleton";
import { StagePill } from "@/components/stage-pill/StagePill";
import { outcomeStage } from "@/lib/stage";
import { styleguideOpen } from "../tokens";
import { LIVE_MARKS_YEAR, liveMarksFilms } from "./films";

export const metadata: Metadata = { title: "Live marks" };

// Dev and preview only, like the styleguide: real marks on real films, so a mark can be tried
// (and tested end to end) before the race and the movie page exist. Each title opens the
// film's own page, where the same marks show as labelled pills.
export default function Page() {
  if (!styleguideOpen()) notFound();
  return (
    <>
      <PageHeader
        title="Live marks"
        sub={`The first films of the ${LIVE_MARKS_YEAR} season. These marks save to the database.`}
        back={{ label: "Styleguide", href: "/styleguide" }}
      />
      <Suspense fallback={<RaceRowsSkeleton label="Loading films" />}>
        <Films />
      </Suspense>
    </>
  );
}

async function Films() {
  // Wait for the request, so `next build` never reads the database.
  await connection();
  const films = await liveMarksFilms();
  return (
    <FilmList head={["Oscar"]} columns={["minmax(0,1fr)", "132px", "84px"]} className="mt-8 md:mt-10">
      {films.map(({ film, stage, flags }) => (
        <FilmRow
          key={film.id}
          title={film.title}
          href={`/styleguide/marks/film?id=${film.id}`}
          flags={flags}
          meta={film.year}
          scores={film.scores}
          results={[{ label: "Oscar", value: stage ? <StagePill stage={outcomeStage(stage)} /> : "–" }]}
          marks={<FilmMarks movieId={film.id} title={film.title} />}
        />
      ))}
    </FilmList>
  );
}
