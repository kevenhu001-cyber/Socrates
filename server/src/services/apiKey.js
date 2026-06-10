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
  };
}

/**
 * Encrypt and store a new API key.
 */
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
