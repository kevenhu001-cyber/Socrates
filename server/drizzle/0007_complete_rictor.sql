-- P_exam-history — extend sessions to support exam-mode persistence.
-- Previously exam sessions lived only in browser memory; closing the
-- tab or refreshing discarded every question and answer. This migration
-- adds two columns:
--
--   kind      — 'chat' | 'tutor' | 'exam' (defaults to 'chat' so every
--               existing row stays the same).
--   exam_data — jsonb, nullable. Holds the rendered exam payload
--               (topic, difficulty, question list, user answers, lang,
--               creation time).
--
-- A btree index on kind speeds up "list only my exam sessions" queries
-- once the user accumulates many of them. A GIN index on exam_data
-- lets a future "search across my exams" filter stay cheap.
--
-- We intentionally do NOT add a CHECK constraint here — the front-end
-- validates the kind value before sending it, and adding a CHECK on a
-- column with a non-trivial DEFAULT rewrites the table on PostgreSQL
-- < 11, which would lock the sessions table for several seconds during
-- the deploy. The application layer is the single source of truth.

ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'chat';--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "exam_data" jsonb;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_kind_idx" ON "sessions" USING btree ("kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_exam_data_gin_idx" ON "sessions" USING GIN ("exam_data");
