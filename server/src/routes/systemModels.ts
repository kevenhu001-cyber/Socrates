/**
 * /api/system-models — admin-managed system model catalog.
 *
 * The "system model" is the LLM the site owner picks for the
 * built-in (a.k.a. Beagle) path — the model anonymous visitors and
 * users without their own API key get. Today the seed hard-codes
 * Beagle to whatever BEAGLE_SYSTEM_KEY + MINIMAX_MODEL /
 * MINIMAX_BASE_URL say at boot; this route lets an admin override
 * that from a UI without touching env vars or restarting.
 *
 * Storage: the `api_keys` table, `is_built_in = true` rows. The
 * seed already creates exactly one such row; the admin PUT updates
 * it in place and re-encrypts the key. Non-built-in rows (the
 * users' own providers) are out of scope for this route — an admin
 * never sees or edits another user's key.
 *
 * Resolution order (unchanged, see services/apiKey.ts#getActiveApiKey):
 *   1. user's own active api_keys row (user-managed, not this route)
 *   2. built-in active row ← this route is the only writer
 *
 * Contract per admin request:
 *   {
 *     url:        OpenAI-compatible base, e.g. https://api.minimax.io/v1
 *     model:      model ID, e.g. MiniMax-M3
 *     label:      display name shown to users (default 'Beagle')
 *     key?:       plaintext API key (optional on update)
 *     keyHint?:   short display hint
 *     isMultimodal?: boolean — whether the model accepts image parts
 *   }
 *
 * Security posture (mirrors embeddingConfig.ts):
 *   - ADMIN_EMAILS allowlist gate, fail-closed when unset.
 *   - keyCiphertext never leaves the server.
 *   - Provider URLs run the same SSRF guard as apiKeys.ts.
 *   - Setting the key to an empty string deactivates the built-in
 *     provider (the fallback path in getActiveApiKey then returns
 *     null and the chat surface shows 'no provider configured').
 */
import { Router } from 'express';
import { z } from 'zod';
import { eq, and, ne } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { apiKeys } from '../db/schema.js';
import { requireAdminSession } from '../middleware/adminAuth.js';
import { NotFound, BadRequest } from '../lib/errors.js';
import { encrypt, encryptionKey } from '../lib/crypto.js';
import { isAllowedProviderUrl } from './apiKeys.js';

const router = Router();

const SAFE_PROJECTION = {
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

const configSchema = z.object({
  label: z.string().min(1).max(200),
  url: z.string().min(1).max(2048),
  model: z.string().min(1).max(200),
  key: z.string().max(2000).optional(),
  keyHint: z.string().max(32).optional(),
  isMultimodal: z.boolean().optional(),
});

/* Operator console gate — the independent ADMIN_PASSWORD session
   (services/adminAuth.ts + middleware/adminAuth.ts). */
router.use(requireAdminSession);

/* GET / — the built-in system model row (ciphertext never leaves). */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const [row] = await db
      .select({
        ...SAFE_PROJECTION,
        hasKey: apiKeys.keyCiphertext,
      })
      .from(apiKeys)
      .where(eq(apiKeys.isBuiltIn, true))
      .orderBy(apiKeys.createdAt)
      .limit(1);
    if (!row) {
      /* Not seeded — the BEAGLE_SYSTEM_KEY env var was unset at
         boot. Return the shape the admin UI expects with hasKey
         false so the form can render a fresh entry. */
      return res.json(null);
    }
    /* Coerce the hasKey projection to a boolean so the shape matches
       the embeddingConfig route. */
    return res.json({ ...row, hasKey: row.hasKey != null });
  } catch (err) { next(err); }
});

/* PUT / — update (or create) the built-in system model row. */
router.put('/', async (req, res, next) => {
  try {
    const parsed = configSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequest('Invalid config: ' + (parsed.error.issues[0]?.message || 'validation failed'));
    }
    const { label, url, model, key, keyHint, isMultimodal } = parsed.data;
    /* An empty string for `key` means "clear the key" (deactivate
       the built-in provider) — that is a valid admin action and the
       SSRF check does not apply. A non-empty url still goes through
       the SSRF guard. */
    const clearingKey = key === '';
    if (!clearingKey && typeof url === 'string' && !isAllowedProviderUrl(url)) {
      throw new BadRequest('Provider URL must be a public https endpoint (no localhost / private / link-local).');
    }

    const db = getDb();
    const values: typeof apiKeys.$inferInsert = {
      label,
      url,
      model,
      isMultimodal: isMultimodal !== false,
      keyHint: keyHint || null,
      isActive: !clearingKey,
      isBuiltIn: true,
    };
    if (clearingKey) {
      values.keyCiphertext = null;
      values.keyHint = null;
    } else if (typeof key === 'string' && key.length > 0) {
      values.keyCiphertext = encrypt(key, encryptionKey());
      values.keyHint = (keyHint || key.slice(0, 8));
    }

    const [existing] = await db.select({ id: apiKeys.id })
      .from(apiKeys)
      .where(eq(apiKeys.isBuiltIn, true))
      .orderBy(apiKeys.createdAt)
      .limit(1);
    let saved;
    if (existing) {
      [saved] = await db.update(apiKeys)
        .set(values)
        .where(eq(apiKeys.id, existing.id))
        .returning(SAFE_PROJECTION);
    } else {
      if (clearingKey) {
        throw new BadRequest('Cannot clear the key: the built-in provider is not configured yet.');
      }
      [saved] = await db.insert(apiKeys).values(values).returning(SAFE_PROJECTION);
    }
    /* Exactly-one-active invariant: this row is the only built-in
       active row. */
    await db.update(apiKeys)
      .set({ isActive: false })
      .where(and(eq(apiKeys.isBuiltIn, true), ne(apiKeys.id, saved.id)));
    return res.json(saved);
  } catch (err) { next(err); }
});

export default router;
