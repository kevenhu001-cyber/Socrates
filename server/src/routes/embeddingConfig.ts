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
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, ne, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { embeddingConfig } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { NotFound, BadRequest, Forbidden } from '../lib/errors.js';
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

/* Single-flight admin gate. The users table has no role column — the
   operator list is an environment-controlled allowlist so an admin
   is provisioned by deployment config (ADMIN_EMAILS, comma-separated,
   case-insensitive) rather than by a runtime DB grant. A missing
   ADMIN_EMAILS closes the endpoint entirely: nothing is readable or
   writable by anyone, which is the safer default than "any user can
   reconfigure the embedding provider". */
function adminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS || '';
  return new Set(
    raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
}

async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    const allowlist = adminEmails();
    if (allowlist.size === 0) {
      throw new Forbidden('ADMIN_EMAILS is not configured — admin endpoints are closed');
    }
    const db = getDb();
    const { users } = await import('../db/schema.js');
    const [user] = await db.select({ email: users.email })
      .from(users)
      .where(eq(users.id, String(req.userId)))
      .limit(1);
    if (!user || !allowlist.has(user.email.toLowerCase())) {
      throw new Forbidden('Admin access required');
    }
    return next();
  } catch (err) { next(err); }
}

router.use(requireAuth, requireAdmin);

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

/* PUT / — create or update the active provider. Only one row is
   ever active: the PUT deactivates every other row first. */
router.put('/', async (req, res, next) => {
  try {
    const parsed = configSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequest('Invalid config: ' + (parsed.error.issues[0]?.message || 'validation failed'));
    }
    const { label, url, model, dimensions, key, keyHint, isActive } = parsed.data;
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

    /* Upsert on the singleton: the table is admin-managed and the
       most-recent updatedAt row wins. We do not bother with a
       stable id — the lookup helper orders by updatedAt DESC. */
    const [existing] = await db.select({ id: embeddingConfig.id })
      .from(embeddingConfig)
      .orderBy(embeddingConfig.createdAt)
      .limit(1);
    let saved;
    if (existing) {
      [saved] = await db.update(embeddingConfig)
        .set(values)
        .where(eq(embeddingConfig.id, existing.id))
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
