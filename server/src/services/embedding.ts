/**
 * embedding — OpenAI-compatible embedding client (vector layer of the
 * session_chunks hybrid retrieval).
 *
 * The provider config comes from the `embedding_config` table, which
 * the admin backend (a follow-up work item) manages. Until an admin
 * activates a row, the embedding service is a no-op: `embedTexts`
 * returns null and every caller treats that as "skip the vector
 * enrichment, BM25-only".
 *
 * Wire shape: POST {url}/embeddings with
 *   { model, input: string[], dimensions? }
 * OpenAI-compatible providers (OpenAI, MiniMax, many local gateways)
 * return `{ data: [{ embedding: number[] }], ... }`. The response is
 * validated defensively — a provider that returns fewer vectors than
 * requested, or vectors whose length does not match the configured
 * `dimensions`, yields a hard failure so the caller can skip the
 * enrichment instead of persisting garbage into the HNSW index.
 */
import { and, eq, desc } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { embeddingConfig } from '../db/schema.js';
import { decrypt, encryptionKey } from '../lib/crypto.js';

export interface EmbeddingProviderConfig {
  url: string;
  model: string;
  keyPlaintext: string | null;
  dimensions: number;
}

/* Read the active embedding config. Returns null when no row is
   active or the stored key cannot be decrypted — both cases the
   caller treats as "vector layer disabled". */
export async function getActiveEmbeddingConfig(): Promise<EmbeddingProviderConfig | null> {
  try {
    const db = getDb();
    const [row] = await db.select().from(embeddingConfig)
      .where(eq(embeddingConfig.isActive, true))
      .orderBy(desc(embeddingConfig.updatedAt))
      .limit(1);
    if (!row) return null;
    let keyPlaintext: string | null = null;
    if (row.keyCiphertext) {
      try {
        keyPlaintext = decrypt(row.keyCiphertext, encryptionKey());
      } catch (err) {
        console.error('[embedding] decrypt failed:', (err as Error).message);
        return null;
      }
    }
    return {
      url: row.url,
      model: row.model,
      keyPlaintext,
      dimensions: row.dimensions,
    };
  } catch (err) {
    console.warn('[embedding] config lookup failed:', (err as Error).message);
    return null;
  }
}

/* Validate that a URL is a well-formed https endpoint. Mirrors the
   apiKeys SSRF posture: https-only, no userinfo, no fragment, no
   private/loopback/link-local hosts. Kept local rather than
   importing from routes/apiKeys.ts (which owns the user-supplied
   shape) so the embedding config's own write path can share the
   same posture without introducing a cross-route import. */
export function isAllowedEmbeddingUrl(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.length > 2048) return false;
  let u;
  try { u = new URL(raw); } catch (_) { return false; }
  if (u.protocol !== 'https:') return false;
  if (u.username || u.password || u.hash) return false;
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
  const isIPv4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
  if (isIPv4) {
    const parts = host.split('.').map(Number);
    if (parts.some(p => !Number.isFinite(p) || p < 0 || p > 255)) return false;
    const [a, b] = parts;
    if (a === 10) return false;                                 // RFC1918
    if (a === 127) return false;                                // loopback
    if (a === 0) return false;                                  // 0.0.0.0/8
    if (a === 169 && b === 254) return false;                   // link-local
    if (a === 172 && b >= 16 && b <= 31) return false;         // RFC1918
    if (a === 192 && b === 168) return false;                  // RFC1918
    if (a === 100 && b >= 64 && b <= 127) return false;        // carrier-grade NAT
    if (a >= 224) return false;                                 // multicast / reserved
  }
  if (host.includes(':')) {
    /* WHATWG URL keeps the IPv6 literal's brackets in .hostname
       (e.g. "[::1]"), so strip them before comparing. */
    const h = host.replace(/^\[/, '').replace(/\]$/, '').split('%')[0];
    if (h === '::1' || h === '::') return false;
    if (h.startsWith('fe8') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb')) return false;
    if (h.startsWith('fc') || h.startsWith('fd')) return false;
    if (h.startsWith('::ffff:')) {
      const v4 = h.slice(7);
      if (!isAllowedEmbeddingUrl('https://' + v4 + '/')) return false;
    }
    return true;
  }
  return true;
}

/* Embed a batch of texts. Returns null when the vector layer is not
   usable (no config, no key, bad URL, upstream failure, dimension
   mismatch) so callers treat it as "skip the enrichment" rather
   than a hard error. Timeout is generous because a batch of 16-64
   chunks can take a few seconds; the embedding call is on the
   background write path, not the request path. */
const EMBED_TIMEOUT_MS = 30_000;
const MAX_BATCH = 64;
const MAX_CHARS_PER_TEXT = 8_000;

export async function embedTexts(
  texts: string[],
): Promise<number[][] | null> {
  const config = await getActiveEmbeddingConfig();
  if (!config) return null;
  if (!config.keyPlaintext) return null;
  if (!isAllowedEmbeddingUrl(config.url)) return null;
  if (!texts.length) return [];
  if (texts.length > MAX_BATCH) {
    throw new Error(`embedTexts: batch of ${texts.length} exceeds MAX_BATCH ${MAX_BATCH}`);
  }
  const baseUrl = (config.url || '').replace(/\/+$/, '');
  const body: Record<string, unknown> = {
    model: config.model,
    input: texts.map((t) => String(t || '').slice(0, MAX_CHARS_PER_TEXT)),
  };
  /* Some providers (OpenAI text-embedding-3-*) accept an explicit
     dimensions hint; others reject it. We only send it when it
     matches what the admin configured, so a provider that ignores
     the hint still gets a sane default. */
  if (config.dimensions && config.dimensions > 0) {
    body.dimensions = config.dimensions;
  }
  try {
    const upstream = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.keyPlaintext}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
    });
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      console.warn(`[embedding] upstream ${upstream.status}: ${detail.slice(0, 200)}`);
      return null;
    }
    const payload = await upstream.json() as { data?: Array<{ embedding?: number[] }> };
    const vectors: number[][] = (payload?.data || []).map((d) => d?.embedding || []);
    if (vectors.length !== texts.length) {
      console.warn(`[embedding] returned ${vectors.length} vectors for ${texts.length} inputs`);
      return null;
    }
    for (const vec of vectors) {
      if (!Array.isArray(vec) || vec.length !== config.dimensions) {
        console.warn(`[embedding] vector length ${vec?.length} does not match dimensions ${config.dimensions}`);
        return null;
      }
    }
    return vectors;
  } catch (err) {
    console.warn('[embedding] failed:', (err as Error).message);
    return null;
  }
}
