import type { Request, Response, NextFunction } from 'express';
import { createHash } from 'node:crypto';

/* In-memory replay cache for Idempotency-Key on API writes.
 *
 * Agents retry on network failures; without this a retried POST can
 * duplicate a record. When a mutating request carries Idempotency-Key we
 * capture the JSON response and replay it byte-identically (plus an
 * Idempotency-Replayed marker header) for any repeat within the TTL window.
 *
 * Scope of the cache key is (credential, method, path, key) so two different
 * callers sharing a key never collide, and the same key against different
 * endpoints stays independent. Only res.json() responses are captured —
 * SSE/streaming handlers never call res.json(), so they pass through
 * untouched. */
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 5000;

type CapturedResponse = { status: number; contentType: string; body: string; expiresAt: number };

const store = new Map<string, CapturedResponse>();

function prune(now: number): void {
  if (store.size < MAX_ENTRIES) return;
  for (const [k, v] of store) {
    if (v.expiresAt <= now) store.delete(k);
    if (store.size < MAX_ENTRIES * 0.9) break;
  }
}

/* This middleware is mounted globally (app.ts) BEFORE per-route auth,
 * so req.userId is not yet populated here — scoping purely on it would
 * collapse every caller behind one NAT egress to a single scope. Mix in
 * a hash of the presented credential (Authorization header / sid cookie)
 * so two different callers sharing an IP and an Idempotency-Key string
 * never collide. Only the 32-hex-char digest enters the cache key, never
 * the raw secret. */
function credentialScope(req: Request): string {
  if (req.userId) return `uid:${req.userId}`;
  const auth = req.headers.authorization;
  const sid = (req.cookies as Record<string, string> | undefined)?.sid;
  if (typeof auth === 'string' && auth.length > 0) {
    return `cred:${createHash('sha256').update(auth).digest('hex').slice(0, 32)}`;
  }
  if (typeof sid === 'string' && sid.length > 0) {
    return `cred:${createHash('sha256').update(sid).digest('hex').slice(0, 32)}`;
  }
  return `ip:${req.ip || 'anonymous'}`;
}

export function idempotencyMiddleware(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();

  const raw = req.headers['idempotency-key'];
  const key = Array.isArray(raw) ? raw[0] : raw;
  // Absent key → nothing to do. Oversized keys are ignored rather than
  // stored so a hostile caller cannot bloat the map with junk values.
  if (typeof key !== 'string' || key.length === 0 || key.length > 200 || !/^[\x21-\x7E]+$/.test(key)) {
    return next();
  }

  const scope = credentialScope(req);
  const cacheKey = `${scope}|${method}|${req.baseUrl}${req.url}|${key}`;
  const now = Date.now();

  const hit = store.get(cacheKey);
  if (hit && hit.expiresAt > now) {
    res.set('Idempotency-Replayed', 'true');
    res.set('Idempotency-Key', key);
    res.status(hit.status).type(hit.contentType).send(hit.body);
    return;
  }

  const originalJson = res.json.bind(res);
  let captured = false;
  res.json = ((body: unknown) => {
    /* Only cache successful (2xx) responses. Caching 4xx replays
     * authentication/validation/rate-limit failures for 24 h: a retry
     * after login, after fixing the payload, or after the rate window
     * resets would keep receiving the stale rejection without ever
     * reaching the handler (and would extend a 429 penalty to a day). */
    if (!captured && typeof res.statusCode === 'number' && res.statusCode >= 200 && res.statusCode < 300) {
      captured = true;
      prune(now);
      store.set(cacheKey, {
        status: res.statusCode,
        contentType: 'application/json',
        body: JSON.stringify(body),
        expiresAt: Date.now() + TTL_MS,
      });
    }
    return originalJson(body);
  }) as typeof res.json;

  next();
}

/* Test hook — clears the cache between cases. */
export function resetIdempotencyStore(): void {
  store.clear();
}

/* Exported for tests: verify a response was actually recorded. */
export function idempotencyEntryCount(): number {
  return store.size;
}
