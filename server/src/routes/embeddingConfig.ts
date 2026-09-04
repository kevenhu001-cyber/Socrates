/**
 * /api/embedding-config — admin-managed embedding provider settings.
 *
 * Body contract (PUT /):
 *   {
 *     url:        OpenAI-compatible base, e.g. https://api.openai.com/v1
 *     model:      e.g. text-embedding-3-small
 *     dimensions: integer, default 1536, must match the model's output
 *     key?:       plaintext API key (optional on update — omit to keep
 *                 the existing ciphertext)
 *     keyHint?:   short display hint
 *     isActive?:  boolean — exactly one active row is enforced
 *   }
 *
 * Security posture:
 *   - Only admins (role == 'admin') can read or write this table.
 *     Non-admin callers get 403 with no row leaked.
 *   - keyCiphertext never leaves the server (same SAFE_PROJECTION
 *     shape apiKeys.ts uses — `hasKey` as a derived boolean).
 *   - Provider URLs run the same SSRF guard as apiKeys.ts (https
 *     only, no private / loopback / link-local).
 *   - Exactly one isActive=true row: the PUT clears the flag on
 *     every other row before activating the target, so a race
 *     between two admins cannot leave two active configs.
 *
 * This is the admin-facing half of the vector layer. The
 * server-side consumer is services/embedding.ts (read) and
 * services/chunkIndex.ts (write + hybrid search).
 */
import { Router } from 'express';
import { z } from 'zod';
import { eq, ne, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { embeddingConfig } from '../db/schema.js';
import { requireAdminSession } from '../middleware/adminAuth.js';
import { NotFound, BadRequest } from '../lib/errors.js';
import { encrypt, encryptionKey } from '../lib/crypto.js';
import { isAllowedEmbeddingUrl } from '../services/embedding.js';

const router = Router();

/* SAFE_PROJECTION mirror of the apiKeys.ts shape — never ship the
   ciphertext. hasKey is a derived boolean computed per-row in the
   list path and a constant TRUE in the write path (where the row
   was just written). */
const SAFE_PROJECTION = {
  id: embeddingConfig.id,
  label: embeddingConfig.label,
  url: embeddingConfig.url,
  model: embeddingConfig.model,
  keyHint: embeddingConfig.keyHint,
  dimensions: embeddingConfig.dimensions,
  isActive: embeddingConfig.isActive,
  createdAt: embeddingConfig.createdAt,
  updatedAt: embeddingConfig.updatedAt,
  hasKey: sql<boolean>`TRUE`,
};

const configSchema = z.object({
  label: z.string().min(1).max(200),
  url: z.string().min(1).max(2048),
  model: z.string().min(1).max(200),
  dimensions: z.number().int().min(64).max(4096),
  key: z.string().min(1).max(2000).optional(),
  keyHint: z.string().max(32).optional(),
  isActive: z.boolean().optional(),
});

/* PUT accepts an optional `id` — when present the route updates the
   existing row instead of creating a new one (multi-provider list
   semantics). */
const putSchema = configSchema.extend({
  id: z.string().max(64).optional(),
});

/* Operator console gate — the independent ADMIN_PASSWORD session
   (services/adminAuth.ts + middleware/adminAuth.ts). The user
   session cookie is deliberately NOT accepted. */
router.use(requireAdminSession);

/* GET / — list the configured providers (ciphertext never leaves). */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const rows = await db
      .select({
        ...SAFE_PROJECTION,
        hasKey: sql<boolean>`(${embeddingConfig.keyCiphertext} IS NOT NULL)`,
      })
      .from(embeddingConfig)
      .orderBy(embeddingConfig.createdAt);
    return res.json(rows);
  } catch (err) { next(err); }
});

/* PUT / — create a new provider row, or update an existing one when
   the body carries `id`. Multiple providers can be stored; exactly
   one is active at a time (the PUT clears the flag on every other
   row when the target row is active, so a race between two admins
   cannot leave two active configs). The embedding service reads the
   active row; the inactive ones are kept for audit / quick switch. */
router.put('/', async (req, res, next) => {
  try {
    const parsed = putSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequest('Invalid config: ' + (parsed.error.issues[0]?.message || 'validation failed'));
    }
    const { id, label, url, model, dimensions, key, keyHint, isActive } = parsed.data;
    if (!isAllowedEmbeddingUrl(url)) {
      throw new BadRequest('Provider URL must be a public https endpoint (no localhost / private / link-local).');
    }

    const db = getDb();
    const values: typeof embeddingConfig.$inferInsert = {
      label,
      url,
      model,
      dimensions,
      keyHint: keyHint || null,
      isActive: isActive !== false, // default true
      updatedAt: new Date(),
    };
    /* Only rotate the ciphertext when the caller sent a new key;
       omitting `key` keeps the existing ciphertext (a config-only
       update does not lose the secret). */
    if (typeof key === 'string' && key.length > 0) {
      values.keyCiphertext = encrypt(key, encryptionKey());
    }

    let saved;
    if (id && /^[0-9a-fA-F-]{8,64}$/.test(id)) {
      /* Update the existing row. A key-bearing update replaces the
         ciphertext; a key-less update keeps it. */
      const updateSet: typeof embeddingConfig.$inferInsert = { ...values };
      if (values.keyCiphertext === undefined) {
        delete (updateSet as Record<string, unknown>).keyCiphertext;
      }
      const [existing] = await db.select({ id: embeddingConfig.id })
        .from(embeddingConfig)
        .where(eq(embeddingConfig.id, id))
        .limit(1);
      if (!existing) throw new NotFound('Embedding config not found');
      [saved] = await db.update(embeddingConfig)
        .set(updateSet)
        .where(eq(embeddingConfig.id, id))
        .returning(SAFE_PROJECTION);
    } else {
      [saved] = await db.insert(embeddingConfig).values(values).returning(SAFE_PROJECTION);
    }
    /* Enforce exactly-one-active. When this row is active, clear
       every other row's flag. */
    if (saved.isActive) {
      await db.update(embeddingConfig)
        .set({ isActive: false })
        .where(ne(embeddingConfig.id, saved.id));
    }
    return res.json(saved);
  } catch (err) { next(err); }
});

/* DELETE /:id — remove a config row. The vector layer degrades to
   BM25-only once no row is active. */
router.delete('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    if (!/^[0-9a-fA-F-]{8,64}$/.test(String(req.params.id))) {
      throw new BadRequest('Invalid id');
    }
    const deleted = await db.delete(embeddingConfig)
      .where(eq(embeddingConfig.id, String(req.params.id)))
      .returning({ id: embeddingConfig.id });
    if (!deleted.length) throw new NotFound('Embedding config not found');
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
