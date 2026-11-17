-- The Watch queue (owner, 2026-11-17, PRODUCT_PLAN.md §3.13): adds a nullable column and its check only;
-- no existing mark changes and no film is queued.
ALTER TABLE "marks" ADD COLUMN "queue_rank" integer;--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_queue_rank" CHECK ("marks"."queue_rank" is null or ("marks"."want" and "marks"."queue_rank" > 0));