/**
 * Log redaction helpers.
 *
 * Request URLs that flow into logs / audit events can carry
 * sensitive material in the query string — password-reset tokens,
 * email-verification tokens, share tokens, OAuth state, and any
 * future `?token=...` parameter that the front-end might paste
 * into a URL. Logging those values gives anyone with log access a
 * long-lived credential they can replay.
 *
 * `safeUrl` strips every known token-like parameter, replacing it
 * with `[REDACTED]`. The path is left intact so operators can still
 * route by endpoint; only the values of the listed keys are
 * removed. Any parameter not in the list is also redacted because
 * it's not safe to assume a generic param is innocuous.
 */

/**
 * Sensitive query parameter names. If a URL has any of these keys
 * we replace their value with `[REDACTED]`. Names are matched
 * case-insensitively.
 *
 * Add to this list whenever the front-end or another route starts
 * passing a credential through a query parameter.
 */
const SENSITIVE_PARAMS = new Set([
  'token',         // password reset, email verify, share
  'access_token',
  'id_token',
  'refresh_token',
  'code',          // OAuth authz code
  'state',         // OAuth state
  'sid',           // session id (rarely seen in URL, but defensive)
  'reset_token',
  'verify_token',
  'share_token',
  'api_key',
  'apikey',
  'csrf',
]);

/**
 * Sanitise a URL for logging. Returns `'<invalid url>'` if the input
 * isn't parseable; returns the original string if it has no query.
 *
 * The path is preserved verbatim. Only the query string is
 * touched. We deliberately do NOT redact fragment (#...) values
 * because the fragment is never sent to the server; if it shows
 * up in a log it means someone is logging the wrong thing.
 */
export function safeUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return '';
  const qIdx = rawUrl.indexOf('?');
  if (qIdx < 0) return rawUrl; // no query string — safe
  const path = rawUrl.slice(0, qIdx);
  const query = rawUrl.slice(qIdx + 1);
  // Try to preserve exact structure (order of params). For each
  // `key=value` pair, if the key is in SENSITIVE_PARAMS replace
  // value with `[REDACTED]`; otherwise pass through.
  const pairs = query.split('&');
  const redacted = pairs.map((p) => {
    if (!p) return p;
    const eq = p.indexOf('=');
    const rawKey = eq >= 0 ? p.slice(0, eq) : p;
    let key;
    try { key = decodeURIComponent(rawKey); } catch { key = rawKey; }
    if (SENSITIVE_PARAMS.has(key.toLowerCase())) {
      return `${rawKey}=[REDACTED]`;
    }
    // Even non-sensitive params can carry arbitrary user input that
    // we don't want splattered into logs (e.g. prompts, search
    // queries). Redact the value too, keeping the key. Operators
    // who need full query fidelity can hit the request id and pull
    // the request log from the access log separately.
    return `${rawKey}=[RED]`;
  });
  return `${path}?${redacted.join('&')}`;
}

/**
 * Strip every query parameter from a URL — used when we don't even
 * want to leak the *names* of the parameters an endpoint accepts.
 */
export function stripQuery(rawUrl: unknown): string {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return '';
  const qIdx = rawUrl.indexOf('?');
  return qIdx < 0 ? rawUrl : rawUrl.slice(0, qIdx);
}

/**
 * Neutralise a value before it is interpolated into a log line.
 *
 * Request paths, headers, e-mail addresses and upstream error messages are
 * all shaped by the caller. With CR/LF intact they can terminate the real
 * line and forge a second one (log injection / CWE-117), which breaks
 * `grep`-based alerting and lets an attacker plant "audit passed" entries.
 * Every raw string that reaches `console.*` goes through here first.
 *
 * JSON string escaping keeps user-controlled content on one physical log
 * line while preserving readable ordinary text. The optional length cap
 * limits the encoded output, including when an input contains many controls.
 */
export function sanitizeLogValue(value: unknown, maxLength = 300): string {
  const limit = Number.isFinite(maxLength) ? Math.max(0, Math.floor(maxLength)) : 300;
  let escaped = '';
  for (const character of String(value ?? '')) {
    const codePoint = character.codePointAt(0)!;
    const encoded = codePoint === 0x85 || codePoint === 0x2028 || codePoint === 0x2029
      ? `\\u${codePoint.toString(16).padStart(4, '0')}`
      : JSON.stringify(character)!.slice(1, -1);
    if (escaped.length + encoded.length > limit) break;
    escaped += encoded;
  }
  return escaped;
}
