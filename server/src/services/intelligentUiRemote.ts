import { ApiError } from '../lib/errors.js';

export const remoteUnavailable = () => new ApiError(502, 'UI_REMOTE_UNAVAILABLE', 'The map or image service is temporarily unavailable');
const HEADERS = { 'User-Agent': 'Socrates/1.0 (+https://topodrive.top; Intelligence UI)' };

/** Fixed provider origins; user-controlled URLs can never select a host. */
function fixedOrigin(hostname: string): string | null {
  switch (hostname) {
    case 'commons.wikimedia.org': return 'https://commons.wikimedia.org';
    case 'duckduckgo.com': return 'https://duckduckgo.com';
    case 'photon.komoot.io': return 'https://photon.komoot.io';
    case 'router.project-osrm.org': return 'https://router.project-osrm.org';
    case 'tiles.openfreemap.org': return 'https://tiles.openfreemap.org';
    case 'upload.wikimedia.org': return 'https://upload.wikimedia.org';
    case 'tse1.mm.bing.net': return 'https://tse1.mm.bing.net';
    case 'tse2.mm.bing.net': return 'https://tse2.mm.bing.net';
    case 'tse3.mm.bing.net': return 'https://tse3.mm.bing.net';
    case 'tse4.mm.bing.net': return 'https://tse4.mm.bing.net';
    case 'ts1.mm.bing.net': return 'https://ts1.mm.bing.net';
    case 'ts2.mm.bing.net': return 'https://ts2.mm.bing.net';
    case 'ts3.mm.bing.net': return 'https://ts3.mm.bing.net';
    case 'ts4.mm.bing.net': return 'https://ts4.mm.bing.net';
    default: return null;
  }
}

/**
 * Read through the configured fetch/proxy, never redirect to an unvalidated host.
 *
 * Every caller passes a URL built from a fixed provider origin, but the
 * value still crosses a module boundary (and the image proxy forwards a
 * user-supplied thumbnail URL), so the host is re-checked here: only the
 * providers this module actually queries are reachable, over https, with
 * no embedded credentials. An internal or loopback address can never be
 * reached through the proxy.
 */
export async function remoteBytes(url: string, maxBytes = 2_000_000, timeout = 10000) {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw remoteUnavailable();
  }
  const hostname = target.hostname;
  const origin = fixedOrigin(hostname);
  if (target.protocol !== 'https:' || target.username || target.password || target.port || !origin) {
    throw remoteUnavailable();
  }
  /* Rebuild from an allowlisted origin so the untrusted URL can only select
     a path and query, never the destination host or port. */
  const safeTarget = new URL(origin);
  safeTarget.pathname = target.pathname;
  safeTarget.search = target.search;
  // lgtm[js/request-forgery] -- The destination origin is one of the literal provider origins above; caller input only supplies its path and query.
  const response = await fetch(safeTarget.href, { headers: HEADERS, redirect: 'error', signal: AbortSignal.timeout(timeout) });
  if (!response.ok || !response.body) throw remoteUnavailable();
  const length = Number(response.headers.get('content-length'));
  if (length > maxBytes) { await response.body.cancel(); throw remoteUnavailable(); }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw remoteUnavailable(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return { bytes: Buffer.concat(chunks), type: (response.headers.get('content-type') || '').split(';')[0].toLowerCase() };
}

export async function remoteJson(url: string, timeout = 8000): Promise<Record<string, unknown>> {
  const { bytes, type } = await remoteBytes(url, 2_000_000, timeout);
  if (!type.includes('json')) throw remoteUnavailable();
  try {
    const value: unknown = JSON.parse(bytes.toString('utf8'));
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch { throw remoteUnavailable(); }
  throw remoteUnavailable();
}

/** Bounded cross-user cache for public data; failed requests are never cached. */
export function createRemoteCache<T>(ttl: number, capacity: number, weight: (value: T) => number = () => 1, maxWeight = capacity) {
  const entries = new Map<string, { at: number; value: T; size: number }>();
  const pending = new Map<string, Promise<T>>();
  let total = 0;
  return async (key: string, read: () => Promise<T>): Promise<T> => {
    const hit = entries.get(key);
    if (hit && Date.now() - hit.at < ttl) { entries.delete(key); entries.set(key, hit); return hit.value; }
    if (hit) { total -= hit.size; entries.delete(key); }
    const running = pending.get(key);
    if (running) return running;
    if (pending.size >= 48) throw new ApiError(503, 'UI_REMOTE_BUSY', 'Please try again shortly');
    const work = Promise.resolve().then(read).then((value) => {
      const size = weight(value);
      if (size <= maxWeight) {
        while (entries.size && (entries.size >= capacity || total + size > maxWeight)) {
          const first = entries.keys().next().value!;
          total -= entries.get(first)!.size; entries.delete(first);
        }
        entries.set(key, { at: Date.now(), value, size }); total += size;
      }
      return value;
    }).finally(() => pending.delete(key));
    pending.set(key, work);
    return work;
  };
}
