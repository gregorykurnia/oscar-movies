import Image from "next/image";
import { SectionHeading } from "@/components/accuracy/SectionHeading";
import { TextLink } from "@/components/text-link/TextLink";

const CC_BY_SA = "https://creativecommons.org/licenses/by-sa/4.0/";

/**
 * Guide §8.9 Sources: a card per source with the credit its terms require. TMDB shows its official
 * logo file, unaltered (`public/tmdb-logo.svg`), and its required notice.
 */
export function Sources() {
  return (
    <section aria-labelledby="sources-h" className="mt-12 md:mt-16">
      <SectionHeading id="sources-h" title="Sources" />
      <div className="grid gap-3 md:grid-cols-2">
        <Card
          name="TMDB"
          mark={<Image src="/tmdb-logo.svg" alt="TMDB" width={139} height={18} unoptimized className="h-[18px] w-auto flex-none" />}
        >
          This product uses the TMDB API but is not endorsed or certified by TMDB. Film details and the TMDB user score.
        </Card>
        <Card name="Wikipedia">
          Award results, shortlists, submissions and lineups are based on Wikipedia articles, used under{" "}
          <TextLink href={CC_BY_SA} rel="noreferrer" className="text-ink">
            CC BY-SA 4.0
          </TextLink>
          .
        </Card>
        <Card name="IMDb">
          Information courtesy of IMDb (imdb.com). Used with permission. IMDb ratings from IMDb&apos;s non-commercial datasets.
          Award nominations and winners for many critics groups and for Cinema Eye come from IMDb&apos;s award records.
        </Card>
        <Card name="DOC NYC">
          Short List and Winner&apos;s Circle films from{" "}
          <TextLink href="https://www.docnyc.net" rel="noreferrer" className="text-ink">
            docnyc.net
          </TextLink>
          .
        </Card>
        <Card name="OMDb API">Rotten Tomatoes (Tomatometer) and Metacritic scores.</Card>
        <Card name="Wikidata">Links between Wikipedia, IMDb and TMDB, under CC0.</Card>
      </div>
    </section>
  );
}

function Card({ name, mark, children }: { name: string; mark?: React.ReactNode; children: React.ReactNode }) {
  return (
    <article className="rounded-md border border-line bg-surface px-5 py-[18px] text-small">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">{name}</h3>
        {mark}
      </div>
      <p className="mt-1.5 text-ink-muted">{children}</p>
    </article>
  );
}
