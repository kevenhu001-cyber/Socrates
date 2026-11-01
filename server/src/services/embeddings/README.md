# Embeddings & Retrieval Services

This domain implements the model edge services: document chunking, semantic vectorization, RAG (Retrieval-Augmented Generation), TTS result caching, and multimodal vision analysis.

## Key Modules

- `embedding.ts`: Embedding provider configuration and multi-text embedding dispatcher.
- `chunkIndex.ts`: Database-backed message chunking, hybrid search (BM25 + pgvector HSNW cosine distance).
- `hybridRetrieval.ts`: Runs the lexical and vector legs under one time budget and fuses them with reciprocal rank fusion.
- `rag.ts`: Pure lexical chunker and BM25 index generator.
- `sessionCompressor.ts`: Conversation context compaction and summarization.
- `attachmentReader.ts`: Structured document reader and extraction dispatcher.
- `contentExtractor.ts` & `contentExtractorWorker.ts`: Isolated jsdom + readability article extraction pool.
- `ttsCache.ts`: In-memory LRU TTS audio cache.
- `ttsStore.ts`: PostgreSQL `bytea` audio persistence for speech outputs.
- `vision.ts`: Multimodal vision integration for image understanding.
- `scoring.ts`: Web search relevance scoring heuristics.

## Invariants

- The flat `server/src/services/<module>.ts` forwarding layer has been retired.
  The canonical file inside `services/embeddings/` is the only import path, and
  the repo-wide shell count is held at zero by `scripts/check-forwarding-shims.mjs`.
- Pure retrieval modules (`rag.ts`, `scoring.ts`) maintain zero external network or database dependencies to support fast unit testing.
- A slow optional vector lookup must never discard lexical recall: `hybridRetrieval.ts` keeps whichever leg completed before the deadline.
