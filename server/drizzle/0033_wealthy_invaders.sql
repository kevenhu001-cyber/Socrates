-- M1 chat turns — detached async chat execution.
--
-- New tables only. (drizzle-kit generate also diffed embedding_config /
-- session_chunks / tts_results because those relations were created by
-- hand-written idempotent migrations; they already exist in migrated
-- databases, so they are intentionally excluded here.)
--
-- Idempotent guards mirror the hand-written style so a partial apply
-- re-runs as a no-op instead of failing with "already exists".

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'chat_turns'
  ) THEN
    CREATE TABLE "chat_turns" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL,
      "session_id" uuid,
      "client_turn_id" text NOT NULL,
      "status" text DEFAULT 'queued' NOT NULL,
      "model" text,
      "generation" integer DEFAULT 1 NOT NULL,
      "input_snapshot" jsonb,
      "full_text" text,
      "full_reasoning" text,
      "tool_calls" jsonb DEFAULT '[]'::jsonb,
      "usage" jsonb DEFAULT '{}'::jsonb,
      "error" text,
      "started_at" timestamp with time zone DEFAULT now() NOT NULL,
      "completed_at" timestamp with time zone,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'chat_turn_events'
  ) THEN
    CREATE TABLE "chat_turn_events" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "turn_id" uuid NOT NULL,
      "sequence" integer NOT NULL,
      "event" text NOT NULL,
      "payload" jsonb DEFAULT '{}'::jsonb,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_turns_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_turns_session_id_sessions_id_fk'
  ) THEN
    ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_turn_events_turn_id_chat_turns_id_fk'
  ) THEN
    ALTER TABLE "chat_turn_events" ADD CONSTRAINT "chat_turn_events_turn_id_chat_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."chat_turns"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'chat_turns_user_client_turn_idx'
  ) THEN
    CREATE UNIQUE INDEX "chat_turns_user_client_turn_idx" ON "chat_turns" USING btree ("user_id","client_turn_id");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'chat_turns_user_id_idx'
  ) THEN
    CREATE INDEX "chat_turns_user_id_idx" ON "chat_turns" USING btree ("user_id");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'chat_turns_session_id_idx'
  ) THEN
    CREATE INDEX "chat_turns_session_id_idx" ON "chat_turns" USING btree ("session_id");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'chat_turns_status_idx'
  ) THEN
    CREATE INDEX "chat_turns_status_idx" ON "chat_turns" USING btree ("status");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'chat_turn_events_turn_sequence_idx'
  ) THEN
    CREATE UNIQUE INDEX "chat_turn_events_turn_sequence_idx" ON "chat_turn_events" USING btree ("turn_id","sequence");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'chat_turn_events_turn_id_idx'
  ) THEN
    CREATE INDEX "chat_turn_events_turn_id_idx" ON "chat_turn_events" USING btree ("turn_id");
  END IF;
END $$;
