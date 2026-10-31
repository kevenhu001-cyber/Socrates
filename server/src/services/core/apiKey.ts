import { eq, and, isNotNull, ne } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { apiKeys } from '../../db/schema/index.js';
import { encrypt, decrypt, encryptionKey } from '../../lib/crypto.js';

type ApiKeyRow = typeof apiKeys.$inferSelect;

/* P_ttfb-apikey-cache — every chat turn runs `getActiveApiKey` once
   during the request prelude (helpers.prepareChatRequest → provider
   lookup + decrypt). The DB read is ~3–8ms and the AES-GCM decrypt
   is another ~1ms. Both are wasted on bursts (open → list → send →
   save) where the user's active key is unchanged across requests.
   The cache is keyed by userId (with a single shared "global" slot
   for the anonymous built-in key path) and explicitly invalidated at
   every mutation site: createApiKey, the apiKeys routes' PATCH /
   POST / DELETE, the built-in seed, and validateApiKeys when it
   clears a corrupted ciphertext. The TTL is intentionally short — a
   missed invalidation cannot outlive it. */
const _apiKeyCache = new Map<string, { result: ReturnType<typeof decryptProvider> | null; cachedAt: number }>();
const API_KEY_CACHE_TTL_MS = 30_000;
const API_KEY_CACHE_MAX_ENTRIES = 2_000;

function cacheKey(userId: string | null): string {
  return userId ? `u:${userId}` : 'global';
}

/* `cacheGet` returns one of:
   - { hit: true, result } — the cache has a fresh entry, return it
     (the `result` field is the resolved provider OR null when the
     user genuinely has no active key).
   - { hit: false } — the cache is empty or stale; the caller must
     hit the DB. */
function cacheGet(userId: string | null, now: number):
  | { hit: true; result: ReturnType<typeof decryptProvider> | null }
  | { hit: false } {
  const key = cacheKey(userId);
  const entry = _apiKeyCache.get(key);
  if (!entry) return { hit: false };
  if (now - entry.cachedAt > API_KEY_CACHE_TTL_MS) {
    _apiKeyCache.delete(key);
    return { hit: false };
  }
  return { hit: true, result: entry.result };
}

function cacheSet(userId: string | null, result: ReturnType<typeof decryptProvider> | null, now: number) {
  if (_apiKeyCache.size >= API_KEY_CACHE_MAX_ENTRIES) {
    const oldest = _apiKeyCache.keys().next();
    if (!oldest.done) _apiKeyCache.delete(oldest.value);
  }
  _apiKeyCache.set(cacheKey(userId), { result, cachedAt: now });
}

/* Drop one cached resolution (the caller knows the exact user that
   changed). `null` clears the whole cache — used by the built-in
   seed path which mutates a global key for everyone. */
export function invalidateApiKeyCache(userId?: string | null): void {
  if (userId == null) _apiKeyCache.clear();
  else _apiKeyCache.delete(cacheKey(userId));
}

/* Masked preview — suffix only. The previous prefix hint (first 8
   chars) exposed the most identifying part of the secret
   (e.g. `sk-ant-…`) to anyone reading the DB or logs. */
function keyHintFor(key: string): string {
  return '...' + key.slice(-4);
}

/**
 * Get the active API key/provider for a user.
 * Returns { url, model, keyPlaintext, keyHint } or null.
 */
export async function getActiveApiKey(userId: string | null) {
  const now = Date.now();
  /* P_ttfb-apikey-cache — short-circuit before the DB round-trip when
     the per-user cache is warm. The anonymous / global key shares a
     single cache slot because it is the same row for every anonymous
     request. */
  const cached = cacheGet(userId, now);
  if (cached.hit) return cached.result;

  let result: ReturnType<typeof decryptProvider> | null = null;
  if (!userId) {
    // Anonymous users: check for built-in Beagle provider (global)
    const db = getDb();
    const [globalKey] = await db.select().from(apiKeys)
      .where(and(eq(apiKeys.isActive, true), eq(apiKeys.isBuiltIn, true), isNotNull(apiKeys.keyCiphertext)))
      .limit(1);
    if (globalKey) result = decryptProvider(globalKey);
  } else {
    const db = getDb();
    // First try user's active key (must have a ciphertext — a row without
    // one can't produce a usable provider and would otherwise short-circuit
    // the built-in fallback, causing a 503 KEY_DECRYPT_FAILED).
    let [key] = await db.select().from(apiKeys)
      .where(and(eq(apiKeys.userId, userId), eq(apiKeys.isActive, true), isNotNull(apiKeys.keyCiphertext)))
      .limit(1);

    if (!key) {
      // Fall back to built-in (must also have a ciphertext).
      // Order by createdAt so the original seeded row is always preferred
      // over any duplicates that may have been created by previous seed runs.
      [key] = await db.select().from(apiKeys)
        .where(and(eq(apiKeys.isActive, true), eq(apiKeys.isBuiltIn, true), isNotNull(apiKeys.keyCiphertext)))
        .orderBy(apiKeys.createdAt)
        .limit(1);
    }

    if (key) result = decryptProvider(key);
  }
  cacheSet(userId, result, now);
  return result;
}

function decryptProvider(key: ApiKeyRow) {
  let keyPlaintext = null;
  if (key.keyCiphertext) {
    try {
      keyPlaintext = decrypt(key.keyCiphertext, encryptionKey());
    } catch (err) {
      console.error('[apiKey] decrypt failed:', (err as Error).message);
    }
  }
  return {
    url: key.url,
    model: key.model,
    keyPlaintext,
    keyHint: key.keyHint,
    id: key.id,
    label: key.label,
    isBuiltIn: key.isBuiltIn || false,
    /* P_attachments-multimodal — propagate the user-controlled
     * vision-capable flag so chat.js can decide whether to forward
     * image_url parts. Defaults to false for older rows that
     * pre-date the column. */
    isMultimodal: key.isMultimodal === true,
    /* P_provider-capability-override — the operator's own statement of
     * how their endpoint encodes "no thinking". NULL means "use the
     * capability registry's answer". */
    instantEncoding: key.instantEncoding ?? null,
  };
}

/**
 * Seed the built-in Beagle provider from environment variables.
 * Called once on server startup. Idempotent — updates the key if
 * the provider already exists, otherwise creates it.
 */
export async function seedBuiltInProvider() {
  const apiKey = process.env.BEAGLE_SYSTEM_KEY;
  if (!apiKey) {
    console.log('[seed] BEAGLE_SYSTEM_KEY not set — skipping built-in Beagle provider');
    return;
  }

  try {
    const db = getDb();
    const model = process.env.MINIMAX_MODEL || 'MiniMax-M3';
    const url = (process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1').replace(/\/+$/, '');
    const keyCiphertext = encrypt(apiKey, encryptionKey());

    const [existing] = await db.select()
      .from(apiKeys)
      .where(and(eq(apiKeys.isBuiltIn, true), eq(apiKeys.label, 'Beagle')))
      .limit(1);

    if (existing) {
      /* P_privacy-leak — do NOT log the resolved model/url here. The
       * built-in "Beagle" provider is an alias; surfacing the real
       * upstream model in the boot log reveals the operator's
       * LLM choice to anyone with access to the systemd journal.
       * The "Updated" line below is enough to confirm the seed ran. */
      const upd = await db.update(apiKeys)
        .set({ keyCiphertext, keyHint: keyHintFor(apiKey), url, model, isMultimodal: true })
        .where(eq(apiKeys.id, existing.id))
        .returning({ id: apiKeys.id });
      console.log('[seed] Updated built-in Beagle provider (id=' + (upd[0] && upd[0].id) + ')');
      /* Clean up any stale built-in rows (e.g. "Beagle A" from
         previous seed runs) that could confuse getActiveApiKey(). */
      const cleaned = await db.update(apiKeys)
        .set({ isActive: false })
        .where(and(eq(apiKeys.isBuiltIn, true), ne(apiKeys.id, existing.id), eq(apiKeys.isActive, true)));
      if ((cleaned.rowCount ?? 0) > 0) {
        console.log('[seed] Deactivated ' + cleaned.rowCount + ' stale built-in row(s)');
      }
    } else {
      const ins = await db.insert(apiKeys).values({
        label: 'Beagle',
        url,
        model,
        keyCiphertext,
        keyHint: keyHintFor(apiKey),
        isBuiltIn: true,
        isActive: true,
        /* P_attachments-multimodal — built-in Beagle is a vision
         * model (MiniMax-M3). Force the flag on insert so chat.js
         * forwards image_url parts without any user setup. */
        isMultimodal: true,
      }).returning({ id: apiKeys.id });
      console.log('[seed] Created built-in Beagle provider (id=' + (ins[0] && ins[0].id) + ')');
    }
    /* P_ttfb-apikey-cache — the built-in key is the global fallback
       for both authenticated and anonymous users. Any seed run
       (first boot, re-seed, or the legacy cleanup path above) must
       drop the cached entry so the next /api/chat/stream picks up
       the fresh ciphertext. */
    invalidateApiKeyCache(null);
  } catch (err) {
    console.error('[seed] Failed to seed built-in provider:', (err as Error).message);
  }
}

/**
 * Validate all API keys on startup. If any key fails to decrypt,
 * log a warning and clear the corrupted ciphertext so the user
 * sees a clear "re-enter your key" message instead of a confusing
 * 401 error from the upstream LLM API.
 */
export async function validateApiKeys() {
  try {
    const db = getDb();
    const allKeys = await db.select().from(apiKeys);
    let corruptedCount = 0;

    for (const key of allKeys) {
      if (!key.keyCiphertext) continue;

      try {
        decrypt(key.keyCiphertext, encryptionKey());
      } catch (err) {
        console.warn('[validateApiKeys] Corrupted key detected:', {
          id: key.id,
          label: key.label,
          userId: key.userId,
          error: (err as Error).message,
        });

        /* Clear the corrupted ciphertext so decryptProvider() returns
           keyPlaintext=null, which chat.js surfaces as a clear error. */
        await db.update(apiKeys)
          .set({ keyCiphertext: null, keyHint: null })
          .where(eq(apiKeys.id, key.id));

        corruptedCount++;
      }
    }

    if (corruptedCount > 0) {
      console.warn(`[validateApiKeys] Cleared ${corruptedCount} corrupted key(s). Users must re-enter their API keys.`);
      /* P_ttfb-apikey-cache — at least one row was mutated; drop
         the entire cache so the next read re-resolves. Cheaper than
         tracking which userId's row was touched. */
      invalidateApiKeyCache(null);
    } else {
      console.log('[validateApiKeys] All API keys validated successfully.');
    }
  } catch (err) {
    console.error('[validateApiKeys] Validation failed:', (err as Error).message);
  }
}

/* P_apikey-ciphertext-leak — defensive projection. This helper isn't
 * called by the current route handlers (apiKeys.js does the insert
 * inline with SAFE_PROJECTION), but it remains exported and could
 * easily be wired up later. Returning the raw row would leak the
 * AES-GCM ciphertext, so we explicitly omit keyCiphertext here too. */
const SAFE_CREATE_PROJECTION = {
  id: apiKeys.id,
  label: apiKeys.label,
  url: apiKeys.url,
  model: apiKeys.model,
  keyHint: apiKeys.keyHint,
  isActive: apiKeys.isActive,
  isBuiltIn: apiKeys.isBuiltIn,
  isMultimodal: apiKeys.isMultimodal,
  createdAt: apiKeys.createdAt,
};

export async function createApiKey(userId: string, { label, url, model, key, isMultimodal }: {
  label?: string;
  url?: string;
  model?: string;
  key?: string;
  isMultimodal?: boolean;
}) {
  const keyCiphertext = key ? encrypt(key, encryptionKey()) : null;
  const keyHint = key ? keyHintFor(key) : null;

  const db = getDb();
  const [result] = await db.insert(apiKeys).values({
    userId,
    label: label || 'Default',
    url: url || 'https://api.openai.com/v1',
    model: model || 'gpt-4o',
    keyCiphertext,
    keyHint,
    isActive: true,
    /* P_attachments-multimodal — user-controlled vision flag.
     * Coerced to a strict boolean so a malicious client can't
     * smuggle a non-boolean through zod's passthrough. */
    isMultimodal: isMultimodal === true,
  }).returning(SAFE_CREATE_PROJECTION);

  /* P_ttfb-apikey-cache — a new key creates a new active row (the
     insert is also the activation), so the per-user cache is now
     stale. Drop it so the next /api/chat/stream resolves to the
     new provider. */
  invalidateApiKeyCache(userId);

  return result;
}
