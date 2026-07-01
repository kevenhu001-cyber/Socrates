import { eq, and, isNotNull, isNull } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { apiKeys } from '../db/schema.js';
import { encrypt, decrypt, deriveEncryptionKey } from '../lib/crypto.js';

const ENCRYPTION_KEY = deriveEncryptionKey(process.env.SESSION_SECRET || 'dev-secret');

/**
 * Get the active API key/provider for a user.
 * Returns { url, model, keyPlaintext, keyHint } or null.
 */
export async function getActiveApiKey(userId) {
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
    // Fall back to built-in (must also have a ciphertext)
    [key] = await db.select().from(apiKeys)
      .where(and(eq(apiKeys.isActive, true), eq(apiKeys.isBuiltIn, true), isNotNull(apiKeys.keyCiphertext)))
      .limit(1);
  }

  if (!key) return null;
  return decryptProvider(key);
}

function decryptProvider(key) {
  let keyPlaintext = null;
  if (key.keyCiphertext) {
    try {
      keyPlaintext = decrypt(key.keyCiphertext, ENCRYPTION_KEY);
    } catch (err) {
      console.error('[apiKey] decrypt failed:', err.message);
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
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    console.log('[seed] MINIMAX_API_KEY not set — skipping built-in Beagle provider');
    return;
  }

  try {
    const db = getDb();
    const model = process.env.MINIMAX_MODEL || 'MiniMax-M3';
    const url = (process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1').replace(/\/+$/, '');
    const keyCiphertext = encrypt(apiKey, ENCRYPTION_KEY);

    const [existing] = await db.select()
      .from(apiKeys)
      .where(and(eq(apiKeys.isBuiltIn, true), eq(apiKeys.label, 'Beagle A')))
      .limit(1);

    if (existing) {
      /* P_diag-seed — surface the resolved env values so a silent
       * regression (env not loaded, env file in wrong path, typo)
       * shows up in the boot log instead of getting masked by the
       * "Updated" line that fires unconditionally. */
      console.log('[seed] resolved env: model=' + JSON.stringify(model) + ' url=' + JSON.stringify(url));
      const upd = await db.update(apiKeys)
        .set({ keyCiphertext, keyHint: apiKey.slice(0, 8), url, model, isMultimodal: true })
        .where(eq(apiKeys.id, existing.id))
        .returning({ id: apiKeys.id, model: apiKeys.model, url: apiKeys.url });
      console.log('[seed] update returned: ' + JSON.stringify(upd));
      console.log('[seed] Updated built-in Beagle A provider');
    } else {
      const ins = await db.insert(apiKeys).values({
        label: 'Beagle A',
        url,
        model,
        keyCiphertext,
        keyHint: apiKey.slice(0, 8),
        isBuiltIn: true,
        isActive: true,
        /* P_attachments-multimodal — built-in Beagle is a vision
         * model (MiniMax-M3). Force the flag on insert so chat.js
         * forwards image_url parts without any user setup. */
        isMultimodal: true,
      }).returning({ id: apiKeys.id, model: apiKeys.model });
      console.log('[seed] inserted row: ' + JSON.stringify(ins));
      console.log('[seed] Created built-in Beagle A provider');
    }
  } catch (err) {
    console.error('[seed] Failed to seed built-in provider:', err.message);
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
        decrypt(key.keyCiphertext, ENCRYPTION_KEY);
      } catch (err) {
        console.warn('[validateApiKeys] Corrupted key detected:', {
          id: key.id,
          label: key.label,
          userId: key.userId,
          error: err.message,
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
    console.error('[validateApiKeys] Validation failed:', err.message);
  }
}

export async function createApiKey(userId, { label, url, model, key, isMultimodal }) {
  const keyCiphertext = key ? encrypt(key, ENCRYPTION_KEY) : null;
  const keyHint = key ? key.slice(0, 8) : null;

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
  }).returning();

  return result;
}
