import { eq, and, isNotNull, ne } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { apiKeys } from '../db/schema.js';
import { encrypt, decrypt, encryptionKey } from '../lib/crypto.js';

type ApiKeyRow = typeof apiKeys.$inferSelect;

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
  if (!userId) {
    // Anonymous users: check for built-in Beagle provider (global)
    const db = getDb();
    const [globalKey] = await db.select().from(apiKeys)
      .where(and(eq(apiKeys.isActive, true), eq(apiKeys.isBuiltIn, true), isNotNull(apiKeys.keyCiphertext)))
      .limit(1);
    if (globalKey) return decryptProvider(globalKey);
    return null;
  }

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

  if (!key) return null;
  return decryptProvider(key);
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

  return result;
}
