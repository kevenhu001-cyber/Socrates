-- Immutable per-session system context. Server-only: never part of a session
-- PUT/GET/share payload. Old sessions initialize lazily on their next chat.
CREATE TABLE IF NOT EXISTS "session_prompt_snapshots" (
  "session_id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL,
  "system_prompt" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.session_prompt_snapshots'::regclass AND conname = 'session_prompt_snapshots_session_id_sessions_id_fk') THEN
    ALTER TABLE "session_prompt_snapshots" ADD CONSTRAINT "session_prompt_snapshots_session_id_sessions_id_fk"
      FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.session_prompt_snapshots'::regclass AND conname = 'session_prompt_snapshots_user_id_users_id_fk') THEN
    ALTER TABLE "session_prompt_snapshots" ADD CONSTRAINT "session_prompt_snapshots_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
  END IF;
END $$;
