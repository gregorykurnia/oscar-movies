import { SectionHeading } from "./SectionHeading";

/**
 * The method in plain words (guide §8.5, `#method`), worded after IMPLEMENTATION_PLAN.md §5.3:
 * weights, history, the two chances, the contenders, the eves, "Early". One page for every category.
 */
export function Method() {
  return (
    <section id="method" aria-labelledby="method-h" className="mt-12 scroll-mt-20 md:mt-16">
      <SectionHeading id="method-h" title="How the % chance works" note="The same method for every category" />
      <div className="max-w-[68ch] space-y-4 text-small leading-relaxed">
        <p>
          <b className="font-medium">Weights.</b> Every award result (won or nominated, at each award category) gets a weight from how
          often past contenders with that result went on to win, or to be nominated, at the Oscars. The share is smoothed towards the
          average among all contenders, so an award with few years can&apos;t dominate, and the weight, how much better than average
          the result did, is kept between −1 and 3.
        </p>
        <p>
          <b className="font-medium">History.</b> Every finished season except the one being predicted is history (one season left out
          at a time), so a past year&apos;s prediction never sees its own answer.
        </p>
        <p>
          <b className="font-medium">% to win.</b> A film&apos;s weights add up to a score, and the scores in a category become chances
          that add to 100%. Before the Oscar nominations, no film is shown above 90%, because the awards tend to agree with each other
          and the rest spread in proportion; after them, none above 97%.
        </p>
        <p>
          <b className="font-medium">% to be nominated.</b> Shown until the nominations: the same kind of weights, plus a film&apos;s
          place on the Oscar shortlist or eligible list, give each film a chance, scaled so the chances add up to the number of
          nominees: 10 for Best Picture from 2021, and before that as many as it had that year; 5 for the others. None is above 99%.
        </p>
        <p>
          <b className="font-medium">Contenders.</b> Before the nominations, every film with a nomination or win at a followed award or
          festival in the category that season, plus the Oscar shortlist or eligible list once it exists. After the nominations, the
          nominees only.
        </p>
        <p>
          <b className="font-medium">Final prediction.</b> A past season shows what the app would have said on the eve of its ceremony,
          using only the results announced before that day. The backtest above uses that, and the eve of the nominations for the
          nominees.
        </p>
        <p>
          <b className="font-medium">Early.</b> A category with fewer than 3 awards announced that season says &ldquo;Early: few results
          yet.&rdquo; With only a handful of seasons behind it, a few points either way is normal noise.
        </p>
      </div>
    </section>
  );
}
