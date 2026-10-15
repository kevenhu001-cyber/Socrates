# Embeddings & Retrieval Services

This domain implements the model edge services: document chunking, semantic vectorization, RAG (Retrieval-Augmented Generation), TTS result caching, and multimodal vision analysis.

## Key Modules

- `embedding.ts`: Embedding provider configuration and multi-text embedding dispatcher.
- `chunkIndex.ts`: Database-backed message chunking, hybrid search (BM25 + pgvector HSNW cosine distance).
- `rag.ts`: Pure lexical chunker and BM25 index generator.
- `sessionCompressor.ts`: Conversation context compaction and summarization.
- `attachmentReader.ts`: Structured document reader and extraction dispatcher.
- `contentExtractor.ts` & `contentExtractorWorker.ts`: Isolated jsdom + readability article extraction pool.
- `ttsCache.ts`: In-memory LRU TTS audio cache.
- `ttsStore.ts`: PostgreSQL `bytea` audio persistence for speech outputs.
- `vision.ts`: Multimodal vision integration for image understanding.
- `scoring.ts`: Web search relevance scoring heuristics.

## Invariants

- `server/src/services/<module>.ts` forwarding shims are preserved for backward compatibility.
- Pure retrieval modules (`rag.ts`, `scoring.ts`) maintain zero external network or database dependencies to support fast unit testing.
