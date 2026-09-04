-- P_session-chunks — durable per-message chunk index so the chat
-- surface can BM25-retrieve across a session's own history. This is
-- the M3 deferred item that the existing pure rag.ts (chunkText +
-- buildRagIndex + searchRagIndex) was waiting on.
--
-- Storage model: one row per chunk. The (message_id, ordinal) pair
-- is the natural key and a re-index upserts under it, so chunking
-- is idempotent. The session_id is denormalized off messages so a
-- session-scoped retrieval can scan the index on session_id alone
-- and skip the join. Both FKs use ON DELETE CASCADE so deleting a
-- message or a session automatically drops the chunks.
--
-- Idempotent: each CREATE is guarded so re-running on a DB that
-- already has the table (e.g. after a partial prior apply) is a
-- no-op instead of failing with "already exists".

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'session_chunks'
  ) THEN
    CREATE TABLE "session_chunks" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
      "session_id" uuid NOT NULL REFERENCES "sessions"("id") ON DELETE CASCADE,
      "ordinal" integer NOT NULL,
      "text" text NOT NULL,
      "start_offset" integer NOT NULL,
      "end_offset" integer NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'session_chunks_message_ordinal_idx'
  ) THEN
    CREATE UNIQUE INDEX "session_chunks_message_ordinal_idx"
      ON "session_chunks" USING btree ("message_id", "ordinal");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'session_chunks_session_id_idx'
  ) THEN
    CREATE INDEX "session_chunks_session_id_idx"
      ON "session_chunks" USING btree ("session_id");
  END IF;
END $$;
