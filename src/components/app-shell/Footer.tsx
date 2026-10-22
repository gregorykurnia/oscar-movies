import Link from "next/link";

/** Guide §6.1 Footer: a line on top, caption in ink-muted, the link to data coverage and sources. */
export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[var(--content-max)] flex-col flex-wrap gap-x-5 gap-y-1.5 px-4 pt-5 pb-6 text-caption text-ink-muted md:flex-row md:px-8 md:pt-6 md:pb-8">
        <span>Oscar Movies, a personal project</span>
        <span>Scores from IMDb, Rotten Tomatoes, Metacritic and TMDB</span>
        <Link
          href="/data"
          className="self-start rounded-xs underline decoration-line-strong decoration-1 underline-offset-[3px] outline-none hover:text-ink hover:decoration-current focus-visible:shadow-focus"
        >
          Data coverage and sources
        </Link>
      </div>
    </footer>
  );
}
