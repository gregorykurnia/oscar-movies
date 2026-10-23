import { TextLink } from "@/components/text-link/TextLink";
import type { Why } from "@/lib/predict/types";
import { similarSeasons, whyItem, whySentence } from "@/lib/race-why";

/**
 * Guide §6.6 The "why": on the gold wash, indented to the title (37px). Left: "Why 41%" and how
 * many past contenders had a run like this one and how many won. Right: up to four results with
 * their record. Bottom, over a gold-soft rule: the similar seasons and the method link.
 */
export function WhyPanel({ pct, why, oscar, methodHref }: { pct: string; why: Why; oscar: string; methodHref: string }) {
  const seasons = similarSeasons(why);
  return (
    <div
      data-why
      className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 rounded-md bg-gold-wash p-[18px] md:mt-[22px] md:ml-[37px] md:grid-cols-[1.1fr_1fr] md:gap-7 md:px-[26px] md:py-[22px]"
    >
      <div>
        <h4 className="text-body font-semibold text-ink">Why {pct}%</h4>
        <p className="mt-1.5 max-w-[46ch] text-small text-ink-muted">{whySentence(why, oscar)}</p>
      </div>
      {why.top.length > 0 ? (
        <ul className="grid content-start gap-2.5">
          {why.top.map((r) => {
            const item = whyItem(r);
            return (
              <li key={`${r.category}|${r.result}`} className="grid grid-cols-[minmax(0,1fr)] text-small md:grid-cols-[minmax(0,1fr)_auto] md:gap-3">
                <span className="text-ink">{item.label}</span>
                <span className="text-caption text-ink-muted md:text-right md:text-small">{item.record}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="col-span-full flex flex-wrap gap-x-4 gap-y-1 border-t border-gold-soft pt-3.5 text-caption text-ink-muted">
        {seasons ? <span>{seasons}</span> : null}
        <TextLink tone="gold" href={methodHref}>
          How the % chance works
        </TextLink>
      </div>
    </div>
  );
}
