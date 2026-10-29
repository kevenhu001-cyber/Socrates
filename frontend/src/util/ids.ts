/* util/ids.ts — extracted from main.js.
 * UUIDv4-compatible ID generation for client-side message/session IDs.
 * Zero-behavior-change lift.
 */
export function generateId(): string {
  /* Use the standard UUIDv4 when the browser supports it — the
   * server's `sessions.id` column is typed as `uuid`, so anything
   * that isn't a real UUID is rejected and the save 500s. The
   * fallback below generates a string that MATCHES the UUID format
   * so the server's isUuid() check (and the upsert's onConflictDoUpdate)
   * operate correctly even in insecure contexts or old browsers. */
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch { /* empty-catch: intentional — insecure context; fall through to the manual generator */ }
  /* `getRandomValues` still works outside a secure context (only
     `randomUUID` and `crypto.subtle` are gated), so it covers the case
     the fast path misses without falling back to Math.random — a
     predictable session ID would let one client guess another's. */
  const bytes = new Uint8Array(16);
  let filled = false;
  try {
    crypto.getRandomValues(bytes);
    filled = true;
  } catch { /* empty-catch: intentional — no Web Crypto at all; see below */ }
  if (!filled) {
    /* Last resort. Uniqueness, not unpredictability, is what the column
       needs from here: a timestamp plus a monotonic counter cannot repeat
       within a page and keeps the UUID shape the server validates. */
    _fallbackSeq = (_fallbackSeq + 1) % 0x1000000;
    const seed = (Date.now().toString(16) + _fallbackSeq.toString(16)).padStart(32, '0').slice(-32);
    for (let i = 0; i < 16; i += 1) bytes[i] = parseInt(seed.slice(i * 2, i * 2 + 2), 16);
  }
  /* Stamp the version (4) and variant (10xx) nibbles the server expects. */
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16)
    + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}

let _fallbackSeq = 0;
