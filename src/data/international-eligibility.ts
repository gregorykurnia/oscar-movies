import { sql } from "drizzle-orm";
import { movies } from "@/db/schema";
import { ENGLISH_LANGUAGE_TAG } from "@/lib/international-eligibility";

/** SQL form of the race's language rule for queries that already join movies. */
export function internationalRaceEligibility(category: string) {
  if (category !== "international") return undefined;
  return sql`(
    not coalesce(${movies.language} ~* ${ENGLISH_LANGUAGE_TAG.source}, false)
    or exists (
      select 1 from results eligibility_result
      join award_categories eligibility_category on eligibility_category.id = eligibility_result.category_id
      join awards eligibility_award on eligibility_award.id = eligibility_category.award_id
      where eligibility_result.movie_id = ${movies.id}
        and eligibility_category.oscar_category = 'international'
        and eligibility_award.kind = 'oscars'
        and eligibility_result.outcome <> 'submitted'
    )
  )`;
}
