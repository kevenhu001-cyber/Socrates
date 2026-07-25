-- AUDIT-R1 — persist the tutor teaching-state machine on sessions.
--
-- The front-end has been sending teachingStage / currentExampleIdx /
-- practiceAttempts / practicePhase / teachingPlan / boundariesHistory /
-- mistakeFilter / branchedFrom in every POST /api/sessions payload since
-- Task 2.4, and loadSession reads them back on reload. But the Zod schema
-- ended in .passthrough() and the route never wrote these fields to any
-- column, so they were silently dropped: "resume teaching where you left
-- off" never actually worked across a reload.
--
-- All columns are nullable; the client already falls back to
-- motivate / 0 / "foundation" / null for legacy rows.

ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "teaching_stage" text;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "current_example_idx" integer;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "practice_attempts" integer;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "practice_phase" text;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "teaching_plan" jsonb;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "boundaries_history" jsonb;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "mistake_filter" text;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "branched_from" jsonb;
