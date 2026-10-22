-- Phase 1 review: TMDB answers vote_average 0.0 for a film with a vote or two but no rating
-- (Waterdrop, 2024). The client now reads that as no score, but the merge rule never writes null
-- over a stored score, so clear the stored zeros once. TMDB's lowest real rating is 0.5.
UPDATE "movies" SET "tmdb_score" = NULL, "tmdb_at" = NULL WHERE "tmdb_score" = 0;
