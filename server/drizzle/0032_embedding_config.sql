-- P_embedding-config — admin-managed embedding provider table.
--
-- The embedding service (services/embedding.ts) reads the active row
-- to reach an OpenAI-compatible /embeddings endpoint; the admin
-- console (routes/embeddingConfig.ts, behind requireAdminSession)
-- upserts rows and flips exactly one to is_active. The table was
-- previously only declared in db/schema.ts with no migration, so a
-- migrated database had no embedding_config relation and every
-- provider lookup threw (caught downstream, but the admin UI could
-- never persist a provider).
--
-- Idempotent: every CREATE is guarded so re-running on a DB that
-- already has the table (e.g. after a partial prior apply) is a
-- no-op instead of failing with "already exists".

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'embedding_config'
  ) THEN
    CREATE TABLE "embedding_config" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "label" text NOT NULL,
      "url" text NOT NULL,
      "model" text NOT NULL,
      "key_ciphertext" text,
      "key_hint" text,
      "dimensions" integer DEFAULT 1536 NOT NULL,
      "is_active" boolean DEFAULT false NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'embedding_config_active_idx'
  ) THEN
    CREATE INDEX "embedding_config_active_idx"
      ON "embedding_config" USING btree ("is_active");
  END IF;
END $$;
