-- Idempotent: columns/tables already exist on prod (partial prior
-- apply). Guard each statement so re-running is a no-op.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sessions' AND column_name = 'streaming_text'
  ) THEN
    ALTER TABLE "sessions" ADD COLUMN "streaming_text" text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sessions' AND column_name = 'streaming_reasoning'
  ) THEN
    ALTER TABLE "sessions" ADD COLUMN "streaming_reasoning" text;
  END IF;
END $$;
