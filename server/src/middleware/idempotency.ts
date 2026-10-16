import type { Request, Response, NextFunction } from 'express';
import { createHash } from 'node:crypto';
import { usesDurableIdempotency } from '../lib/durableIdempotencyRoutes.js';

/* Fallback in-memory replay cache for Idempotency-Key on API writes.
 * Selected transactional handlers bypass this pre-auth cache entirely.
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
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;

type CapturedResponse = { status: number; contentType: string; body: string | null; bytes: number; expiresAt: number; fingerprint: string };

const store = new Map<string, CapturedResponse>();
const inFlight = new Map<string, { fingerprint: string; expiresAt: number }>();
let storedBytes = 0;

function remove(key: string): void {
  storedBytes -= store.get(key)?.bytes || 0;
  store.delete(key);
}

function prune(now: number, additionalBytes: number): void {
  for (const [k, v] of store) {
    if (v.expiresAt <= now) remove(k);
  }
  // Fresh entries must also be bounded; expiry-only pruning lets a busy
  // process grow without limit during the 24h TTL.
  while (store.size && (store.size >= MAX_ENTRIES || storedBytes + additionalBytes > MAX_TOTAL_BYTES)) {
    remove(store.keys().next().value!);
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
  if (usesDurableIdempotency(req.method, req.path || req.url?.split('?')[0] || '')) return next();
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
  const fingerprint = createHash('sha256').update(JSON.stringify(req.body ?? null)).digest('hex');

  const conflict = (message: string) => {
    res.status(409).json({ code: 'IDEMPOTENCY_CONFLICT', message });
  };

  const hit = store.get(cacheKey);
  if (hit && hit.expiresAt > now) {
    if (hit.fingerprint !== fingerprint) return conflict('Idempotency-Key was already used with a different request body');
    if (hit.body === null) {
      res.status(409).json({ code: 'IDEMPOTENCY_RESULT_UNAVAILABLE', message: 'Write completed; retrieve the resource instead of repeating it' });
      return;
    }
    res.set('Idempotency-Replayed', 'true');
    res.set('Idempotency-Key', key);
    res.status(hit.status).type(hit.contentType).send(hit.body);
    return;
  }
  const pending = inFlight.get(cacheKey);
  if (pending !== undefined && pending.expiresAt > now) {
    if (pending.fingerprint !== fingerprint) return conflict('Idempotency-Key is in use with a different request body');
    res.set('Retry-After', '1');
    res.status(409).json({ code: 'IDEMPOTENCY_IN_PROGRESS', message: 'Request is still running; retry with the same key' });
    return;
  }
  for (const [key, reservation] of inFlight) {
    if (reservation.expiresAt <= now) inFlight.delete(key);
  }
  if (inFlight.size >= MAX_ENTRIES) {
    res.set('Retry-After', '1');
    res.status(503).json({ code: 'IDEMPOTENCY_CAPACITY', message: 'Too many in-flight writes; retry later' });
    return;
  }
  const reservation = { fingerprint, expiresAt: now + TTL_MS };
  inFlight.set(cacheKey, reservation);
  const release = () => { if (inFlight.get(cacheKey) === reservation) inFlight.delete(cacheKey); };
  res.once('finish', release);
  // A disconnected socket does not imply the business write stopped. Keep
  // its reservation until the handler responds (or the TTL expires).

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
      const serialized = JSON.stringify(body) ?? '';
      const size = Buffer.byteLength(serialized);
      // Keep a tombstone for oversized responses: refusing replay is safer
      // than re-executing a successful write or retaining unlimited data.
      const bytes = size <= MAX_RESPONSE_BYTES ? size : 0;
      remove(cacheKey);
      prune(Date.now(), bytes);
      store.set(cacheKey, {
        status: res.statusCode,
        contentType: 'application/json',
        body: bytes === size ? serialized : null,
        bytes,
        expiresAt: Date.now() + TTL_MS,
        fingerprint,
      });
      storedBytes += bytes;
    }
    try { return originalJson(body); } finally { release(); }
  }) as typeof res.json;

  next();
}

/* Test hook — clears the cache between cases. */
export function resetIdempotencyStore(): void {
  store.clear();
  storedBytes = 0;
  inFlight.clear();
}

/* Exported for tests: verify a response was actually recorded. */
export function idempotencyEntryCount(): number {
  return store.size;
}
