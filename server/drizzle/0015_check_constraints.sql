-- P_check-constraints — close the gap where application-layer enum
-- validation is the only thing stopping bad values from landing in the
-- database. Each constraint below mirrors the documented enum values
-- in src/db/schema.js comments; adding a new enum value should now
-- require an explicit migration so the change is reviewable.
--
-- Idempotent: each ADD CONSTRAINT is guarded so re-running on a DB
-- that already has the constraint (e.g. after a partial prior apply)
-- is a no-op instead of failing with "already exists".

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sessions_kind_check'
  ) THEN
    ALTER TABLE "sessions"
      ADD CONSTRAINT "sessions_kind_check"
      CHECK ("kind" IN ('chat', 'tutor', 'exam'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_role_check'
  ) THEN
    ALTER TABLE "messages"
      ADD CONSTRAINT "messages_role_check"
      CHECK ("role" IN ('user', 'assistant', 'system', 'tool'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'executions_status_check'
  ) THEN
    ALTER TABLE "executions"
      ADD CONSTRAINT "executions_status_check"
      CHECK ("status" IN ('running', 'completed', 'failed', 'timeout', 'cancelled', 'skipped'));
  END IF;
END $$;
