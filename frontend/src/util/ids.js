/* util/ids.js — extracted from main.js.
 * UUIDv4-compatible ID generation for client-side message/session IDs.
 * Zero-behavior-change lift.
 */
export function generateId() {
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
  } catch (_) {}
  /* Fallback: produce a UUIDv4-compatible string so the server
     recognises it. Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
     where x is random hex and y is 8, 9, a, or b. */
  function h() { return Math.floor(Math.random() * 65536).toString(16).padStart(4, '0'); }
  return h() + h() + '-' + h() + '-4' + h().slice(1) + '-' + (8 + Math.floor(Math.random() * 4)).toString(16) + h().slice(1) + '-' + h() + h() + h();
}
