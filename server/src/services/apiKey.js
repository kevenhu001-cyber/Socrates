import { eq, and } from 'drizzle-orm';
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
      .where(and(eq(apiKeys.isActive, true), eq(apiKeys.isBuiltIn, true)))
      .limit(1);
    if (globalKey) return decryptProvider(globalKey);
    return null;
  }

  const db = getDb();
  // First try user's active key
  let [key] = await db.select().from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.isActive, true)))
    .limit(1);

  if (!key) {
    // Fall back to built-in
    [key] = await db.select().from(apiKeys)
      .where(and(eq(apiKeys.isActive, true), eq(apiKeys.isBuiltIn, true)))
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
    const model = process.env.MINIMAX_MODEL || 'MiniMax-M2.7';
    const url = (process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1').replace(/\/+$/, '');
    const keyCiphertext = encrypt(apiKey, ENCRYPTION_KEY);

    const [existing] = await db.select()
      .from(apiKeys)
      .where(and(eq(apiKeys.isBuiltIn, true), eq(apiKeys.label, 'Beagle A')))
      .limit(1);

    if (existing) {
      await db.update(apiKeys)
        .set({ keyCiphertext, keyHint: apiKey.slice(0, 8), url, model })
        .where(eq(apiKeys.id, existing.id));
      console.log('[seed] Updated built-in Beagle A provider');
    } else {
      await db.insert(apiKeys).values({
        label: 'Beagle A',
        url,
        model,
        keyCiphertext,
        keyHint: apiKey.slice(0, 8),
        isBuiltIn: true,
        isActive: true,
      });
      console.log('[seed] Created built-in Beagle A provider');
    }
  } catch (err) {
    console.error('[seed] Failed to seed built-in provider:', err.message);
  }
}

export async function createApiKey(userId, { label, url, model, key }) {
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
  }).returning();

  return result;
}
