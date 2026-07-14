-- P_check-constraints — close the gap where application-layer enum
-- validation is the only thing stopping bad values from landing in the
-- database. Each constraint below mirrors the documented enum values
-- in src/db/schema.js comments; adding a new enum value should now
-- require an explicit migration so the change is reviewable.
--
-- Strategy: NOT VALID + VALIDATE — the constraint is added without
-- scanning existing rows (no AccessExclusiveLock on writes), then we
-- VALIDATE it in a separate transaction so the scan runs in SHARE
-- UPDATE EXCLUSIVE (non-blocking for SELECT/INSERT/UPDATE/DELETE).
-- On a small prod table this is overkill but the cost is negligible
-- and the pattern is the right default for future larger tables.

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_kind_check"
  CHECK ("kind" IN ('chat', 'tutor', 'exam'))
  NOT VALID;
--> statement-breakpoint
ALTER TABLE "sessions" VALIDATE CONSTRAINT "sessions_kind_check";
--> statement-breakpoint

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_role_check"
  CHECK ("role" IN ('user', 'assistant', 'system', 'tool'))
  NOT VALID;
--> statement-breakpoint
ALTER TABLE "messages" VALIDATE CONSTRAINT "messages_role_check";
--> statement-breakpoint

ALTER TABLE "executions"
  ADD CONSTRAINT "executions_status_check"
  CHECK ("status" IN ('running', 'completed', 'failed', 'timeout', 'cancelled', 'skipped'))
  NOT VALID;
--> statement-breakpoint
ALTER TABLE "executions" VALIDATE CONSTRAINT "executions_status_check";