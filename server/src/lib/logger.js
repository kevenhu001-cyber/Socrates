/**
 * Structured JSON logger.
 *
 * Output format (one line per call, parseable by Loki / Vector / journald):
 *
 *   {"t":"2026-07-13T00:00:00.123Z","level":"info","msg":"chat_stream_open",
 *    "rid":"7aa94806-...","uid":"5c9c18...","module":"chat",
 *    "extra":{"model":"gpt-4o","sessionId":"..."}}
 *
 * Design choices:
 *   - JSON-line output is universally greppable AND parseable, so the
 *     same stream works for `grep rid=foo /var/log/socrates.log` and
 *     for shipping into a real aggregator. We deliberately don't pull
 *     in winston/pino — the extra dep isn't worth the lines we'd save.
 *   - `req.log` is a thin facade over a child() that pins rid + uid +
 *     path. Calling `req.log.info(msg, extra)` on a route handler is
 *     cheaper than reading req.id manually.
 *   - PII / credential guard: `extra` is JSON-serialised verbatim, so
 *     callers are responsible for not stuffing passwords / API keys in
 *     there. We strip the most obvious offenders (`Authorization`,
 *     `Cookie`, `apiKey`, `keyCiphertext`) on the way out as a backstop
 *     because the cost of an accidental leak from a logger is huge
 *     compared to the cost of one redacted key.
 *   - Levels: debug / info / warn / error. `debug` is suppressed in
 *     production unless `LOG_LEVEL=debug` is set; `error` is never
 *     suppressed. The thresholds are computed once at module load so
 *     there's no per-call parse cost.
 */

/* Sentinel keys that should never appear in `extra`. If a caller
 * accidentally passes a request header or DB row, we'll drop the
 * sensitive keys before serialising rather than risk leaking them
 * into the operator's log stream. Matches case-insensitively. */
const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'sid',          // session cookie value (rare in extra, defensive)
  'csrf',         // csrf token
  'password',
  'passwordhash',
  'password_hash',
  'key',
  'apikey',
  'api_key',
  'keyciphertext',
  'key_plaintext',
  'keyplaintext',
  'sessiontoken', // also covers `sessionToken` after lowercasing
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'idtoken',
  'id_token',
  'email',        // PII — callers should mask before passing
  'phone',
  'phonenumber',
]);

function redactExtra(extra) {
  if (!extra || typeof extra !== 'object') return extra;
  const out = {};
  for (const [k, v] of Object.entries(extra)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      out[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = redactExtra(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

const envLevel = (process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')).toLowerCase();
const threshold = LEVELS[envLevel] || LEVELS.info;

/* Pick the underlying stream method — console.log writes to stdout
 * and is line-buffered in production; console.error goes to stderr,
 * which we want for warn/error so operators can split the streams. */
function emit(level, payload) {
  const line = JSON.stringify(payload);
  if (level === 'error' || level === 'warn') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

/**
 * Module-level (background-task) logger. Used by services that run
 * outside any HTTP request — startup, scheduled refresh, the Pyodide
 * pool warm-up. Pin a `module` label via `child({ module: 'chat' })`
 * so logs are filterable by source.
 *
 *   import { logger } from '../lib/logger.js';
 *   logger.info('pool_ready', { poolSize: 2 });
 */
function makeLogger(bindings = {}) {
  function log(level, msg, extra) {
    if (LEVELS[level] < threshold) return;
    const payload = {
      t: new Date().toISOString(),
      level,
      msg: typeof msg === 'string' ? msg : JSON.stringify(msg),
      ...bindings,
    };
    if (extra !== undefined) {
      payload.extra = redactExtra(extra);
    }
    try {
      emit(level, payload);
    } catch (e) {
      /* Serialisation can fail on circular refs / BigInt. Fall back to
       * a plain text line so we never lose the log entirely. */
      process.stderr.write(`[logger-fallback] ${level} ${payload.msg}: ${e.message}\n`);
    }
  }
  return {
    debug: (msg, extra) => log('debug', msg, extra),
    info:  (msg, extra) => log('info',  msg, extra),
    warn:  (msg, extra) => log('warn',  msg, extra),
    error: (msg, extra) => log('error', msg, extra),
    child(extraBindings) {
      return makeLogger({ ...bindings, ...extraBindings });
    },
  };
}

export const logger = makeLogger();

/**
 * Build a request-scoped logger. Pass it to route handlers as
 * `req.log` so every log line carries rid + uid + path automatically.
 *
 *   app.use((req, _res, next) => { req.log = createReqLogger(req); next(); });
 *
 *   router.post('/foo', (req, res) => {
 *     req.log.info('foo_start', { bar: 1 });
 *     ...
 *   });
 */
export function createReqLogger(req) {
  const bindings = {
    rid: req.id || 'no-id',
    method: req.method,
    path: req.path,
  };
  if (req.userId) bindings.uid = req.userId;
  return makeLogger(bindings);
}

/**
 * Convenience: get-or-create `req.log`. Some middleware runs before
 * the request-id middleware (e.g. helmet) and won't have a logger
 * pre-attached. This helper ensures we never crash on `req.log.info`.
 */
export function reqLog(req) {
  if (req && req.log) return req.log;
  return createReqLogger(req || {});
}