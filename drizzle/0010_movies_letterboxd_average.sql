-- PostgreSQL 18 updates the stored values in place and retains movies_avg_score_idx.
ALTER TABLE "movies"
  ALTER COLUMN "avg_score" SET EXPRESSION AS (
    round(
      (coalesce(imdb_rating * 10, 0) + coalesce(tmdb_score * 10, 0)
        + coalesce(rt_score, 0) + coalesce(mc_score, 0) + coalesce(lb_rating * 20, 0))
      / nullif(
        (imdb_rating is not null)::int + (tmdb_score is not null)::int
        + (rt_score is not null)::int + (mc_score is not null)::int + (lb_rating is not null)::int,
        0
      ),
      1
    )
  ),
  ALTER COLUMN "score_count" SET EXPRESSION AS (
    (
      (imdb_rating is not null)::int + (tmdb_score is not null)::int
      + (rt_score is not null)::int + (mc_score is not null)::int + (lb_rating is not null)::int
    )::smallint
  );
