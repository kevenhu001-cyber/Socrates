import { withTimeBudget } from '../../lib/timeBudget.js';
import type { IndexedChunk, RagSearchHit } from './chunkIndex.js';

export interface HybridRetrievalOptions {
  limit?: number;
  timeoutMs?: number;
  vectorTimeoutMs?: number;
  signal?: AbortSignal;
}

/** Keep either completed leg on deadline; a slow optional vector lookup must
 * not discard lexical recall. Without budgets the search API retains its
 * original wait-for-both behavior. */
export async function collectHybridRetrieval(
  lexical: (signal: AbortSignal) => Promise<RagSearchHit[]>,
  vector: (signal: AbortSignal) => Promise<IndexedChunk[] | null>,
  options: HybridRetrievalOptions = {},
): Promise<RagSearchHit[]> {
  const limit = Math.max(1, Math.min(50, options.limit ?? 8));
  let lexicalHits: RagSearchHit[] = [];
  let vectorHits: IndexedChunk[] | null = null;
  const result = () => {
    if (!vectorHits?.length) return lexicalHits;
    const fused = new Map<string, { chunk: IndexedChunk; score: number }>();
    for (const hits of [lexicalHits, vectorHits]) {
      hits.forEach((chunk, index) => {
        const key = `${chunk.messageId}:${chunk.ordinal}`;
        const entry = fused.get(key) ?? { chunk, score: 0 };
        entry.score += 1 / (60 + index + 1);
        fused.set(key, entry);
      });
    }
    return [...fused.values()].sort((a, b) => b.score - a.score).slice(0, limit)
      .map(({ chunk, score }) => ({
        id: chunk.id, messageId: chunk.messageId, ordinal: chunk.ordinal, text: chunk.text, score,
      }));
  };
  return withTimeBudget(async (signal) => {
    await Promise.all([
      lexical(signal).then((hits) => { if (!signal.aborted) lexicalHits = hits; }),
      withTimeBudget(vector, { signal, timeoutMs: options.vectorTimeoutMs }, () => null)
        .then((hits) => { if (!signal.aborted) vectorHits = hits; }),
    ]);
    return result();
  }, options, result);
}
