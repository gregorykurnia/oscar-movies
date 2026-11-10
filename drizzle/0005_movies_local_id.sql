ALTER TABLE "movies" DROP CONSTRAINT "movies_has_id";--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "local_id" uuid;--> statement-breakpoint
ALTER TABLE "movies" ADD CONSTRAINT "movies_local_id_unique" UNIQUE("local_id");--> statement-breakpoint
ALTER TABLE "movies" ADD CONSTRAINT "movies_tmdb_id_positive" CHECK ("movies"."tmdb_id" > 0);--> statement-breakpoint
ALTER TABLE "movies" ADD CONSTRAINT "movies_has_id" CHECK ("movies"."imdb_id" is not null or "movies"."wikidata_id" is not null or "movies"."tmdb_id" is not null or "movies"."local_id" is not null);