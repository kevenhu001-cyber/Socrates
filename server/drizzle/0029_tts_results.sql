-- P_tts-persist — promote the ephemeral ttsCache LRU to a per-message
-- durable store so the first read-aloud of a reloaded session replays
-- the cached bytes for free, and a second read of the same
-- (message, voice, format, lang) tuple never re-bills the upstream
-- provider.
--
-- The route still keeps the process-wide TtsCache in front of this
-- table; the table is the durable tier that survives a process
-- restart. The FK uses ON DELETE CASCADE so deleting a message (or
-- the cascade that fires when regenerate=true replaces the assistant
-- row) automatically drops the persisted audio.
--
-- Idempotent: every CREATE is guarded so re-running on a DB that
-- already has the table (e.g. after a partial prior apply) is a
-- no-op instead of failing with "already exists".

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'tts_results'
  ) THEN
    CREATE TABLE "tts_results" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
      "voice" text NOT NULL,
      "format" text NOT NULL,
      "lang" text NOT NULL,
      "text_hash" text NOT NULL,
      "audio" bytea NOT NULL,
      "content_type" text NOT NULL,
      "byte_size" integer NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'tts_results_message_voice_format_lang_idx'
  ) THEN
    CREATE UNIQUE INDEX "tts_results_message_voice_format_lang_idx"
      ON "tts_results" USING btree ("message_id", "voice", "format", "lang");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'tts_results_message_id_idx'
  ) THEN
    CREATE INDEX "tts_results_message_id_idx"
      ON "tts_results" USING btree ("message_id");
  END IF;
END $$;
