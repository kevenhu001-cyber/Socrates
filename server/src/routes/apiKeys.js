import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { apiKeys } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { NotFound, BadRequest } from '../lib/errors.js';
import { encrypt, decrypt, deriveEncryptionKey } from '../lib/crypto.js';

const ENCRYPTION_KEY = deriveEncryptionKey(process.env.SESSION_SECRET || 'dev-secret');
const router = Router();

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
      createdAt: apiKeys.createdAt,
    }).from(apiKeys).where(eq(apiKeys.userId, req.userId));
    return res.json({ providers: keys });
  } catch (err) { next(err); }
});

/* ─── Create API key ─── */
router.post('/', async (req, res, next) => {
  try {
    const { label, url, model, key } = req.body;
    if (!url || !model || !key) throw new BadRequest('url, model, and key are required');

    const keyCiphertext = encrypt(key, ENCRYPTION_KEY);
    const db = getDb();

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
    if (req.body.isActive !== undefined) patch.isActive = req.body.isActive;

    await db.update(apiKeys).set(patch).where(eq(apiKeys.id, req.params.id));
    const [updated] = await db.select().from(apiKeys).where(eq(apiKeys.id, req.params.id)).limit(1);
    return res.json(updated);
  } catch (err) { next(err); }
});

/* ─── Delete API key ─── */
router.delete('/:id', async (req, res, next) => {
  try {
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
