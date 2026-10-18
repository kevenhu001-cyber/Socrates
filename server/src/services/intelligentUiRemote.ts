import { ApiError } from '../lib/errors.js';

export const remoteUnavailable = () => new ApiError(502, 'UI_REMOTE_UNAVAILABLE', 'The map or image service is temporarily unavailable');
const HEADERS = { 'User-Agent': 'Socrates/1.0 (+https://topodrive.top; Intelligence UI)' };

/** Read through the configured fetch/proxy, never redirect to an unvalidated host. */
export async function remoteBytes(url: string, maxBytes = 2_000_000, timeout = 10000) {
  const response = await fetch(url, { headers: HEADERS, redirect: 'error', signal: AbortSignal.timeout(timeout) });
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

export async function remoteJson(url: string, timeout = 8000): Promise<Record<string, any>> {
  const { bytes, type } = await remoteBytes(url, 2_000_000, timeout);
  if (!type.includes('json')) throw remoteUnavailable();
  try { return JSON.parse(bytes.toString('utf8')); } catch { throw remoteUnavailable(); }
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
