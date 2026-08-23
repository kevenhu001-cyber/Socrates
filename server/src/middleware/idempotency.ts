import type { Request, Response, NextFunction } from 'express';

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

  const scope = req.userId || req.ip || 'anonymous';
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
    if (!captured && typeof res.statusCode === 'number' && res.statusCode < 500) {
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
