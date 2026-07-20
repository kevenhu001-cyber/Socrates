-- Idempotent: login_failures table, sessions.mode default, streaming
-- columns, users.cancel_at_period_end and its index already exist on
-- prod (partial prior apply). Guard each statement so re-running is a
-- no-op.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'login_failures') THEN
    CREATE TABLE "login_failures" (
      "email" text PRIMARY KEY NOT NULL,
      "count" integer DEFAULT 0 NOT NULL,
      "first_at" timestamp with time zone DEFAULT now() NOT NULL,
      "locked_until" timestamp with time zone
    );
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sessions' AND column_name = 'mode'
      AND column_default IS NULL
  ) THEN
    ALTER TABLE "sessions" ALTER COLUMN "mode" SET DEFAULT 'chat';
  END IF;
END $$;

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

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'cancel_at_period_end'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'login_failures_locked_until_idx') THEN
    CREATE INDEX "login_failures_locked_until_idx" ON "login_failures" USING btree ("locked_until");
  END IF;
END $$;
