-- files.session_id → sessions(id) ON DELETE SET NULL.
--
-- Previously files.session_id was a bare uuid with no foreign key, so
-- deleting a session left file rows pointing at nothing and the orphaned
-- bytes kept counting against the user's storage quota. New uploads are
-- unaffected (sessionId is nullable); this migration only repairs history
-- and adds the constraint for the future.
--
-- Idempotent: a partial apply re-runs as a no-op (orphan cleanup is a
-- plain UPDATE; the FK add is guarded by a pg_constraint probe).

-- 1. Repair history: detach files whose session is already gone. Must run
-- before the FK is created, otherwise the ADD CONSTRAINT would fail on
-- the very orphans it is meant to prevent.
UPDATE "files"
SET "session_id" = NULL
WHERE "session_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "sessions" WHERE "sessions"."id" = "files"."session_id"
  );

-- 2. Add the foreign key (SET NULL so deleting a session keeps the file
-- row for the library while freeing the session link).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "pg_constraint"
    WHERE "conname" = 'files_session_id_sessions_id_fk'
  ) THEN
    ALTER TABLE "files"
      ADD CONSTRAINT "files_session_id_sessions_id_fk"
      FOREIGN KEY ("session_id") REFERENCES "sessions"("id")
      ON DELETE SET NULL;
  END IF;
END $$;
