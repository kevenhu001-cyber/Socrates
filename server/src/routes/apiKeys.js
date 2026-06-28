import { Router } from 'express';
import { eq, and, ne, count } from 'drizzle-orm';
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
    const keys = await db.select({
      id: apiKeys.id,
      label: apiKeys.label,
      url: apiKeys.url,
      model: apiKeys.model,
      keyHint: apiKeys.keyHint,
      isActive: apiKeys.isActive,
      isBuiltIn: apiKeys.isBuiltIn,
      hasKey: apiKeys.keyCiphertext,  /* boolean: true if key is stored */
      createdAt: apiKeys.createdAt,
    }).from(apiKeys).where(eq(apiKeys.userId, req.userId));
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
    const [result] = await db.insert(apiKeys).values({
      userId: req.userId,
      label: label || 'Default',
      url,
      model,
      keyCiphertext,
      keyHint: key.slice(0, 8),
      isActive: true,
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
