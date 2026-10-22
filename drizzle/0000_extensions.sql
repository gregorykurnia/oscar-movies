-- Hand-written: accent-free search (IMPLEMENTATION_PLAN.md §1, §3.1).
-- `unaccent` is only STABLE, so generated columns and indexes can't call it directly;
-- `f_unaccent` pins the dictionary and is IMMUTABLE.
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
