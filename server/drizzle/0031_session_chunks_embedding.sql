-- P_session-chunks-embedding — optional pgvector re-ranking layer
-- on top of the session_chunks BM25 index. This is the vector half
-- of the hybrid retrieval path: BM25 recalls the lexical candidates,
-- and the cosine distance over the embedding re-ranks (or, when
-- BM25 has no hits because the wording does not overlap, recalls
-- semantically-similar chunks the lexical pass would have missed).
--
-- The column is nullable: a chunk that has not been embedded yet
-- (the embedding call failed, the provider is not configured, the
-- text was too long, or the caller asked for BM25-only) is still a
-- perfectly good BM25 hit. The vector is best-effort enrichment,
-- never a blocking dependency on the write path.
--
-- The pgvector extension must be installed before the column type
-- exists. We create it if missing, guarded so an operator who has
-- not installed the .so yet is not surprised by a hard failure —
-- but in that case the column creation must also be skipped, hence
-- the nested DO block.
--
-- Idempotent: every statement is guarded so re-running on a DB
-- where the column already exists is a no-op.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'vector'
  ) THEN
    CREATE EXTENSION IF NOT EXISTS vector;
  END IF;
END $$;

DO $$ BEGIN
  -- Only add the column when the extension is actually available;
  -- otherwise Postgres would reject the vector type.
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'vector'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'session_chunks' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE "session_chunks"
      ADD COLUMN "embedding" vector(1536);
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'vector'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'session_chunks_embedding_hnsw_idx'
  ) THEN
    -- HNSW over cosine distance. m=16 / ef_construction=64 are the
    -- pgvector defaults and fine for the per-session sizes we expect
    -- (thousands of chunks per session, not millions).
    CREATE INDEX "session_chunks_embedding_hnsw_idx"
      ON "session_chunks" USING hnsw ("embedding" vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);
  END IF;
END $$;
