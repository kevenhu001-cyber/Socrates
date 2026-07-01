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
export function safeUrl(rawUrl) {
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
    const rawVal = eq >= 0 ? p.slice(eq + 1) : '';
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
export function stripQuery(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return '';
  const qIdx = rawUrl.indexOf('?');
  return qIdx < 0 ? rawUrl : rawUrl.slice(0, qIdx);
}