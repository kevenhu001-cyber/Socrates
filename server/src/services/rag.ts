/**
 * rag — retrieval-augmented grounding core (M3 of the LobeHub-alignment
 * plan).
 *
 * This module is the pure retrieval core: text chunking + BM25 lexical
 * scoring. It deliberately has no database, network, or LLM dependency so
 * it can be unit-tested in isolation and composed with any store:
 *
 *   - today, chat grounding happens through document attachments parsed
 *     in-request (`fileParsers/` + `buildUserContentParts`);
 *   - the chunker + scorer here are the foundation for a persisted
 *     chunk index (session-scoped `session_chunks` table + optional
 *     embedding re-ranking) without changing the wire protocol.
 *
 * Chunking follows the LobeHub semantic-chunking shape: split on
 * paragraph boundaries first, then hard-split oversized paragraphs with a
 * character overlap so sentence-boundary context survives truncation.
 */

export interface RagChunk {
  /** Stable ordinal inside one document. */
  index: number;
  text: string;
  /** Inclusive character range in the source document. */
  start: number;
  end: number;
}

export interface ChunkOptions {
  /** Target maximum characters per chunk (default 1200). */
  maxChars?: number;
  /** Character overlap between hard-split windows (default 120). */
  overlapChars?: number;
}

const PARAGRAPH_SPLIT = /\r?\n\r?\n/;

export function chunkText(text: string, options: ChunkOptions = {}): RagChunk[] {
  const source = String(text || '');
  if (!source.trim()) return [];
  const maxChars = Math.max(200, options.maxChars ?? 1200);
  const overlap = Math.min(Math.floor(maxChars / 2), Math.max(0, options.overlapChars ?? 120));

  const chunks: RagChunk[] = [];
  let cursor = 0;
  let ordinal = 0;

  const pushChunk = (chunkText: string, start: number, end: number): void => {
    const trimmedStart = start + (chunkText.length - chunkText.trimStart().length);
    const trimmedEnd = end - (chunkText.length - chunkText.trimEnd().length);
    const body = source.slice(trimmedStart, trimmedEnd);
    if (!body.trim()) return;
    chunks.push({ index: ordinal++, text: body, start: trimmedStart, end: trimmedEnd });
  };

  const paragraphs = source.split(PARAGRAPH_SPLIT);
  for (const paragraph of paragraphs) {
    const paragraphStart = cursor;
    cursor += paragraph.length + 2; // consume the separator
    if (paragraph.trim().length <= maxChars) {
      pushChunk(paragraph, paragraphStart, paragraphStart + paragraph.length);
      continue;
    }
    // Hard-split the oversized paragraph with an overlapping window.
    let offset = 0;
    while (offset < paragraph.length) {
      const windowEnd = Math.min(paragraph.length, offset + maxChars);
      pushChunk(paragraph.slice(offset, windowEnd), paragraphStart + offset, paragraphStart + windowEnd);
      if (windowEnd >= paragraph.length) break;
      offset = windowEnd - overlap;
      if (offset <= 0) offset = windowEnd;
    }
  }

  return chunks;
}

/* ── BM25 lexical scoring ──────────────────────────────────────────── */

const TOKEN_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}_-]*/gu;

export function tokenize(input: string): string[] {
  return (String(input || '').toLowerCase().match(TOKEN_PATTERN) || []);
}

export interface IndexedChunk<T> {
  chunk: T;
  /** Pre-tokenized term frequencies. */
  termFrequencies: Map<string, number>;
  length: number;
}

export interface RagIndexOptions {
  /** BM25 term-frequency saturation (default 1.5). */
  k1?: number;
  /** Length normalization (default 0.75). */
  b?: number;
}

/**
 * Build a BM25 index over pre-chunked records. Generic over the chunk
 * payload so callers can index `RagChunk`s or their own persisted rows.
 */
export function buildRagIndex<T>(
  records: T[],
  getText: (record: T) => string,
  options: RagIndexOptions = {},
): {
  k1: number;
  b: number;
  documentFrequency: Map<string, number>;
  averageLength: number;
  documents: Array<IndexedChunk<T>>;
} {
  const k1 = options.k1 ?? 1.5;
  const b = options.b ?? 0.75;
  const documents: Array<IndexedChunk<T>> = records.map((record) => {
    const tokens = tokenize(getText(record));
    const termFrequencies = new Map<string, number>();
    for (const token of tokens) {
      termFrequencies.set(token, (termFrequencies.get(token) || 0) + 1);
    }
    return { chunk: record, termFrequencies, length: tokens.length };
  });
  const documentFrequency = new Map<string, number>();
  for (const document of documents) {
    for (const term of document.termFrequencies.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    }
  }
  const totalLength = documents.reduce((sum, document) => sum + document.length, 0);
  const averageLength = documents.length > 0 ? totalLength / documents.length : 0;
  return { k1, b, documentFrequency, averageLength, documents };
}

export interface RagHit<T> {
  record: T;
  score: number;
}

/**
 * Score a query against the index and return the top hits with positive
 * BM25 scores. `minScore` filters near-zero matches (default 0.5).
 */
export function searchRagIndex<T>(
  index: ReturnType<typeof buildRagIndex<T>>,
  query: string,
  opts: { limit?: number; minScore?: number } = {},
): Array<RagHit<T>> {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0 || index.documents.length === 0) return [];
  const minScore = opts.minScore ?? 0.5;
  const documentCount = index.documents.length;
  const scores: Array<RagHit<T>> = [];

  for (const document of index.documents) {
    let score = 0;
    for (const term of new Set(queryTokens)) {
      const frequency = document.termFrequencies.get(term);
      if (!frequency) continue;
      const df = index.documentFrequency.get(term) || 0;
      const idf = Math.log(1 + (documentCount - df + 0.5) / (df + 0.5));
      const saturation = frequency / (index.k1 + frequency);
      const lengthNorm = 1 - index.b + index.b * (document.length / (index.averageLength || 1));
      score += idf * saturation / lengthNorm;
    }
    if (score > minScore) scores.push({ record: document.chunk, score });
  }

  scores.sort((a, b) => b.score - a.score);
  return opts.limit ? scores.slice(0, opts.limit) : scores;
}
