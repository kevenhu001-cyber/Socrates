import { Router } from 'express';
import { eq, and, ne, count, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { apiKeys } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { NotFound, BadRequest, Forbidden } from '../lib/errors.js';
import { audit } from '../middleware/audit.js';
import { encrypt, decrypt, deriveEncryptionKey } from '../lib/crypto.js';
import { getApiKeyLimit } from '../lib/tiers.js';
import { isUuid } from '../lib/validate.js';

const ENCRYPTION_KEY = deriveEncryptionKey(process.env.SESSION_SECRET || 'dev-secret');
const router = Router();

// Reject malformed ids before they reach the DB. The `apiKeys.id` column is a UUID, so anything else would otherwise trigger a Postgres "invalid input syntax for type uuid" error, which the error middleware surfaces as a generic 500. NotFound is the honest answer.
router.use(requireAuth);

/* ─── List API keys ─── */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    /* P_apikey-list-leak — select `keyCiphertext` under the alias `hasKey`
       and coerce it to a real boolean in SQL so the AES-GCM ciphertext is
       never returned to the browser. Previously this projection passed the
       raw TEXT column through, so every signed-in client received the
       encrypted-at-rest key material on every refresh. Frontend coerces
       with `!!p.hasKey`, so the shape change is transparent. */
    const rows = await db.select({
      id: apiKeys.id,
      label: apiKeys.label,
      url: apiKeys.url,
      model: apiKeys.model,
      keyHint: apiKeys.keyHint,
      isActive: apiKeys.isActive,
      isBuiltIn: apiKeys.isBuiltIn,
      /* P_attachments-multimodal — user-controlled vision flag. */
      isMultimodal: apiKeys.isMultimodal,
      hasKey: sql`(${apiKeys.keyCiphertext} IS NOT NULL)`,
      createdAt: apiKeys.createdAt,
    }).from(apiKeys).where(eq(apiKeys.userId, req.userId));
    /* Drizzle returns the boolean expression as a JS boolean already, but
       normalise to be defensive against future driver changes. */
    const keys = rows.map((r) => ({ ...r, hasKey: r.hasKey === true }));
    return res.json({ providers: keys });
  } catch (err) { next(err); }
});

/* ─── Create API key ─── */
router.post('/', audit('create_api_key', (req) => ({ label: req.body?.label, url: req.body?.url, model: req.body?.model })), async (req, res, next) => {
  try {
    const { label, url, model, key } = req.body;
    if (!url || !model || !key) throw new BadRequest('url, model, and key are required');

    /* Enforce tier-based API key limit. */
    const tier = req.user?.tier || 'diophantus';
    const maxKeys = getApiKeyLimit(tier);
    const db = getDb();
    const [keyCount] = await db.select({ value: count() })
      .from(apiKeys)
      .where(eq(apiKeys.userId, req.userId));
    if ((keyCount?.value || 0) >= maxKeys) {
      throw new Forbidden('FORBIDDEN', `API key limit reached for ${tier} plan (${maxKeys} keys). Upgrade your plan to add more.`);
    }

    const keyCiphertext = encrypt(key, ENCRYPTION_KEY);

    /* Deactivate all existing providers so the new one is the only
       active provider. Without this, creating a new provider leaves
       stale isActive=true rows and getActiveApiKey() returns the
       wrong one. */
    await db.update(apiKeys)
      .set({ isActive: false })
      .where(and(eq(apiKeys.userId, req.userId), eq(apiKeys.isActive, true)));
    /* P_attachments-multimodal — accept the user-controlled flag.
     * Coerce to strict boolean so a forged payload can't smuggle a
     * truthy non-boolean that survives JSON.parse in the client. */
    const isMultimodal = req.body.isMultimodal === true;
    const [result] = await db.insert(apiKeys).values({
      userId: req.userId,
      label: label || 'Default',
      url,
      model,
      keyCiphertext,
      keyHint: key.slice(0, 8),
      isActive: true,
      isMultimodal,
    }).returning();

    return res.status(201).json(result);
  } catch (err) { next(err); }
});

/* ─── Update API key ─── */
router.patch('/:id', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) throw new NotFound('API key not found');
    const db = getDb();
    const [existing] = await db.select().from(apiKeys)
      .where(and(eq(apiKeys.id, req.params.id), eq(apiKeys.userId, req.userId)))
      .limit(1);
    if (!existing) throw new NotFound('API key not found');

    const patch = {};
    if (req.body.label !== undefined) patch.label = req.body.label;
    if (req.body.url !== undefined) patch.url = req.body.url;
    if (req.body.model !== undefined) patch.model = req.body.model;
    if (req.body.key !== undefined) {
      patch.keyCiphertext = encrypt(req.body.key, ENCRYPTION_KEY);
      patch.keyHint = req.body.key.slice(0, 8);
    }
    /* P_attachments-multimodal — accept the user-controlled flag.
     * Built-in rows (Beagle) are read-only with respect to
     * isMultimodal: a forged PATCH that tries to clear the flag on
     * a built-in row is silently dropped, preserving the server-
     * enforced "Beagle is multimodal" invariant. */
    if (req.body.isMultimodal !== undefined) {
      if (!existing.isBuiltIn) {
        patch.isMultimodal = req.body.isMultimodal === true;
      }
    }
    if (req.body.isActive !== undefined) {
      patch.isActive = req.body.isActive;
      /* When activating a provider, deactivate every other provider
         for the same user so getActiveApiKey() always returns the
         right one. Without this, switching models leaves stale
         isActive=true rows, and the LIMIT-1 lookup returns whichever
         PostgreSQL picks first. */
      if (req.body.isActive === true) {
        await db.update(apiKeys)
          .set({ isActive: false })
          .where(and(eq(apiKeys.userId, req.userId), ne(apiKeys.id, req.params.id)));
      }
    }

    await db.update(apiKeys).set(patch).where(eq(apiKeys.id, req.params.id));
    const [updated] = await db.select().from(apiKeys).where(eq(apiKeys.id, req.params.id)).limit(1);
    return res.json(updated);
  } catch (err) { next(err); }
});

/* ─── Delete API key ─── */
router.delete('/:id', audit('delete_api_key'), async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) throw new NotFound('API key not found');
    const db = getDb();
    const [existing] = await db.select().from(apiKeys)
      .where(and(eq(apiKeys.id, req.params.id), eq(apiKeys.userId, req.userId)))
      .limit(1);
    if (!existing) throw new NotFound('API key not found');
    await db.delete(apiKeys).where(eq(apiKeys.id, req.params.id));
    return res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
