import { Router } from 'express';
import { eq, and, ne, count, isNotNull, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { apiKeys } from '../db/schema/index.js';
import { requireAuth } from '../middleware/auth.js';
import { NotFound, BadRequest, Forbidden } from '../lib/errors.js';
import { audit } from '../middleware/audit.js';
import { encrypt, encryptionKey } from '../lib/crypto.js';
import { getApiKeyLimit } from '../lib/tiers.js';
import { isUuid } from '../lib/validate.js';
import { invalidateApiKeyCache } from '../services/core/apiKey.js';
import { summarizeModelCapabilities, isInstantEncoding, type ProviderCapabilitySummary } from '../lib/modelCapabilities.js';

/* P_model-capability-registry — a client cannot tell whether the selected
 * model can switch thinking off or has effort levels at all: the built-in
 * provider's model name is deliberately hidden (P_privacy-leak), and a
 * user-configured model is an arbitrary string. The registry decides, so the
 * summary travels with the provider row instead of the client guessing from
 * a model name. */
function withCapabilities<T extends { model?: string | null }>(row: T): T & { capabilities: ProviderCapabilitySummary } {
  return { ...row, capabilities: summarizeModelCapabilities(row.model || '') };
}

/* The built-in provider is a system row (no userId), so it is not part of
 * the caller's provider list. Its capabilities are published next to the
 * list because the SPA needs them for the same effort picker. */
function summarizeBuiltInCapabilities(model: string): ProviderCapabilitySummary {
  /* BEAGLE_IS_REASONING is the operator's escape hatch for an upstream that
   * is not a reasoning model at all. It overrides the registry rather than
   * the other way round: the operator knows what they pointed at. */
  if (process.env.BEAGLE_IS_REASONING === 'false') {
    return { isReasoning: false, supportsInstant: true, supportsEffort: false };
  }
  return summarizeModelCapabilities(model);
}

/* P_apikey-ciphertext-leak — projection shared by every response that
 * returns an apiKeys row. The encrypted AES-GCM payload is stored
 * exclusively for server-side decrypt during chat proxying; it is
 * never useful to the SPA and shipping it down the wire leaks the
 * ciphertext (and any future plaintext-rotation metadata). The
 * frontend only needs hasKey as a derived boolean. */
const SAFE_PROJECTION = {
  id: apiKeys.id,
  label: apiKeys.label,
  url: apiKeys.url,
  model: apiKeys.model,
  keyHint: apiKeys.keyHint,
  isActive: apiKeys.isActive,
  isBuiltIn: apiKeys.isBuiltIn,
  isMultimodal: apiKeys.isMultimodal,
  /* P_provider-capability-override — the operator's own statement about
   * how their endpoint encodes "no thinking". NULL means "use the
   * capability registry's answer". */
  instantEncoding: apiKeys.instantEncoding,
  createdAt: apiKeys.createdAt,
  /* For insert/update responses the row always has a ciphertext set
   * (we just inserted/rotated it), so a constant TRUE is correct. The
   * GET / list endpoint needs to derive hasKey per-row from a SQL
   * expression and uses its own projection instead. */
  hasKey: sql`TRUE`,
};

/* P_apiKey-ssrf — H4 audit fix. Provider URLs are forwarded verbatim
 * to the upstream LLM call. Reject any URL that resolves to an
 * internal/private/link-local destination so the user's API key
 * cannot be redirected at the internal network (e.g. to exfiltrate
 * AWS metadata at 169.254.169.254, or to call internal admin services).
 *
 * Allowed: https only, public IPv4 / IPv6, no localhost-equivalent names. */
import { isAllowedProviderUrl } from '../lib/providerUrl.js';

const router = Router();

/* P_provider-capability-override — read the per-provider instant encoding
 * from a request body.
 *
 * The value must be one of the encodings the registry knows how to send
 * (`reasoning_effort_none`, `thinking_disabled`, `enable_thinking_false`,
 * `chat_template_kwargs`). `null` / '' / undefined means "no override — use
 * the registry's answer". Anything else is a 400: an unknown encoding would
 * otherwise be stored and silently produce a request body the provider
 * rejects. */
function readInstantEncoding(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (!isInstantEncoding(value)) {
    throw new BadRequest(
      'Unsupported instant encoding. Use one of: reasoning_effort_none, thinking_disabled, enable_thinking_false, chat_template_kwargs.',
    );
  }
  return value;
}

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
      /* P_provider-capability-override — per-provider instant encoding. */
      instantEncoding: apiKeys.instantEncoding,
      hasKey: sql`(${apiKeys.keyCiphertext} IS NOT NULL)`,
      createdAt: apiKeys.createdAt,
    }).from(apiKeys).where(eq(apiKeys.userId, req.userId!));
    /* Drizzle returns the boolean expression as a JS boolean already, but
       normalise to be defensive against future driver changes. */
    const keys = rows.map((r) => withCapabilities({ ...r, hasKey: r.hasKey === true }));
    /* The built-in provider row carries no userId, so it never appears in
       the caller's list — but the SPA still offers it as a model choice and
       needs the same capability summary for it. */
    const [builtInRow] = await db.select({ model: apiKeys.model })
      .from(apiKeys)
      .where(and(eq(apiKeys.isBuiltIn, true), isNotNull(apiKeys.keyCiphertext)))
      .limit(1);
    return res.json({
      providers: keys,
      builtInCapabilities: builtInRow ? summarizeBuiltInCapabilities(builtInRow.model) : null,
    });
  } catch (err) { next(err); }
});

/* ─── Create API key ─── */
router.post('/', audit('create_api_key', (req) => ({ label: req.body?.label, url: req.body?.url, model: req.body?.model })), async (req, res, next) => {
  try {
    const { label, url, model, key } = req.body;
    if (!url || !model || !key) throw new BadRequest('url, model, and key are required');
    if (!isAllowedProviderUrl(url)) {
      throw new BadRequest('Invalid provider URL. Must be https with a public hostname.');
    }

    /* Enforce tier-based API key limit. */
    const tier = req.user?.tier || 'diophantus';
    const maxKeys = getApiKeyLimit(tier);
    const db = getDb();
    const [keyCount] = await db.select({ value: count() })
      .from(apiKeys)
      .where(eq(apiKeys.userId, req.userId!));
    if ((keyCount?.value || 0) >= maxKeys) {
      throw new Forbidden('FORBIDDEN', `API key limit reached for ${tier} plan (${maxKeys} keys). Upgrade your plan to add more.`);
    }

    const keyCiphertext = encrypt(key, encryptionKey());

    /* Deactivate all existing providers so the new one is the only
       active provider. Without this, creating a new provider leaves
       stale isActive=true rows and getActiveApiKey() returns the
       wrong one. */
    await db.update(apiKeys)
      .set({ isActive: false })
      .where(and(eq(apiKeys.userId, req.userId!), eq(apiKeys.isActive, true)));
    /* P_attachments-multimodal — accept the user-controlled flag.
     * Coerce to strict boolean so a forged payload can't smuggle a
     * truthy non-boolean that survives JSON.parse in the client. */
    const isMultimodal = req.body.isMultimodal === true;
    /* P_provider-capability-override — accept the per-provider instant
     * encoding. Only the four encodings the registry knows how to send
     * are accepted; anything else is a 400 rather than a value that would
     * silently produce a malformed request body. */
    const instantEncoding = readInstantEncoding(req.body.instantEncoding);
    const [result] = await db.insert(apiKeys).values({
      userId: req.userId!,
      label: label || 'Default',
      url,
      model,
      keyCiphertext,
      keyHint: key.slice(0, 8),
      isActive: true,
      isMultimodal,
      instantEncoding,
    }).returning(SAFE_PROJECTION);

    /* P_ttfb-apikey-cache — a fresh row is the new active provider
       (the deactivation above plus the insert). Drop the cached
       entry for this user so the next /api/chat/stream re-resolves
       to the new key instead of serving the old one. */
    invalidateApiKeyCache(req.userId);

    return res.status(201).json(withCapabilities(result));
  } catch (err) { next(err); }
});

/* ─── Update API key ─── */
router.patch('/:id', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) throw new NotFound('API key not found');
    const db = getDb();
    const [existing] = await db.select().from(apiKeys)
      .where(and(eq(apiKeys.id, req.params.id), eq(apiKeys.userId, req.userId!)))
      .limit(1);
    if (!existing) throw new NotFound('API key not found');

    const patch: Record<string, unknown> = {};
    if (req.body.label !== undefined) patch.label = req.body.label;
    if (req.body.url !== undefined) {
      if (!isAllowedProviderUrl(req.body.url)) {
        throw new BadRequest('Invalid provider URL. Must be https with a public hostname.');
      }
      patch.url = req.body.url;
    }
    if (req.body.model !== undefined) patch.model = req.body.model;
    if (req.body.key !== undefined) {
      patch.keyCiphertext = encrypt(req.body.key, encryptionKey());
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
    /* P_provider-capability-override — the per-provider instant encoding.
     * `null` / '' clears the override, so the registry answers again. */
    if (req.body.instantEncoding !== undefined) {
      if (!existing.isBuiltIn) {
        patch.instantEncoding = readInstantEncoding(req.body.instantEncoding);
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
          .where(and(eq(apiKeys.userId, req.userId!), ne(apiKeys.id, req.params.id)));
      }
    }

    await db.update(apiKeys).set(patch).where(eq(apiKeys.id, req.params.id));
    const [updated] = await db.select(SAFE_PROJECTION).from(apiKeys).where(eq(apiKeys.id, req.params.id)).limit(1);
    /* P_ttfb-apikey-cache — a PATCH can flip isActive (selecting a
       different key), rotate the ciphertext, or change url/model.
       All three change the answer getActiveApiKey() should give, so
       drop the cached entry. */
    invalidateApiKeyCache(req.userId);
    return res.json(withCapabilities(updated));
  } catch (err) { next(err); }
});

/* ─── Delete API key ─── */
router.delete('/:id', audit('delete_api_key'), async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) throw new NotFound('API key not found');
    const db = getDb();
    const [existing] = await db.select().from(apiKeys)
      .where(and(eq(apiKeys.id, req.params.id), eq(apiKeys.userId, req.userId!)))
      .limit(1);
    if (!existing) throw new NotFound('API key not found');
    await db.delete(apiKeys).where(eq(apiKeys.id, req.params.id));
    /* P_ttfb-apikey-cache — the deleted key may have been the
       active row (and likely was, since users delete the key
       they were using). Drop the cached entry so the next
       /api/chat/stream re-resolves, falling through to either
       the user's other active key or the built-in default. */
    invalidateApiKeyCache(req.userId);
    return res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
