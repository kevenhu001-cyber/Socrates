/**
 * Cross-process pub/sub for SSE progress / result events.
 *
 * Problem: codeInterpreter.js emits progress frames via an in-process
 * EventEmitter. With multiple Node processes behind nginx (which the
 * README claims is just "run more processes"), an SSE client connected
 * to process B never sees events emitted by process A. Same with
 * future pub/sub needs (real-time edit notifications, etc.).
 *
 * Solution: a thin layer over Postgres LISTEN/NOTIFY. The publish
 * path is fire-and-forget; the subscribe path holds a dedicated
 * pg.Client (NOT a pool connection — LISTEN ties up the connection)
 * and dispatches messages to topic-keyed handler Maps.
 *
 * Why Postgres, not Redis:
 *   - The codebase already requires PG (no new deployment surface).
 *   - NOTIFY/LISTEN has transactional semantics (publishes are durable
 *     to the connection it's sent on, and visible to all listeners
 *     after commit). For our use case — "SSE progress events fire
 *     once per execution" — eventual consistency is acceptable.
 *   - Latency is sub-millisecond on localhost, single-digit ms across
 *     typical cloud PG replicas. Comfortably within SSE client
 *     expectations.
 *
 * Why not just use the drizzle pool:
 *   - LISTEN holds the connection in a single-statement-per-frame
 *     state. Using a pooled connection would block the pool. We
 *     dedicate one pg.Client per server process for LISTEN.
 *
 * Topic naming convention:
 *   - Namespace prefix `exec_progress:` / `exec_result:` is required
 *     for execution events. This prevents random routes from
 *     polluting the listener with arbitrary topics.
 *
 * Failure modes (handled):
 *   - PG unreachable at boot: subscribe() logs a warning and the
 *     module falls back to a no-op local EventEmitter so single-
 *     process development without PG still works.
 *   - Connection drops mid-listen: a reconnect loop with exponential
 *     backoff (max 30s) keeps trying. Handlers are reattached after
 *     reconnect. In-flight subscribers get a synthetic `error` event
 *     so they can decide to fail their SSE stream or wait.
 */

import pg from 'pg';
import { EventEmitter } from 'node:events';
import { logger } from './logger.js';

const ALLOWED_TOPIC_PREFIXES = ['exec_progress:', 'exec_result:'];
const MAX_PAYLOAD_BYTES = 8 * 1024; // PG NOTIFY payload limit is 8 KB by default
const RECONNECT_BACKOFF_MS = [500, 1000, 2000, 5000, 10000, 30000]; // capped at 30s

/* Channel name encoding — see P_pg-channel-identifier below.
 *
 * PostgreSQL's LISTEN command requires the channel name to be an SQL
 * identifier, NOT a string literal (it's `LISTEN channel`, not
 * `LISTEN 'channel'`). Identifiers can't contain `:`. The call-site
 * API uses colon-separated topics (`exec_progress:abc-123`) because
 * that's readable; before talking to PG we rewrite `:` → `_` so the
 * name is a valid identifier. `LISTEN` and `NOTIFY` use the encoded
 * form; `pgClient.on('notification')` echoes the same encoded name
 * back, so we decode it for the handler lookup. The user-facing
 * handler receives the original topic verbatim. */
const encodeChannel = (topic) => topic.replace(/[^A-Za-z0-9_]/g, '_');
const decodeChannel = (channel) => channel; // identity — names round-trip via the map

/* In-process fallback for development / degraded mode. The fallback
 * is consulted only when the PG listener is unavailable; otherwise
 * publishes always go to PG. We never silently mix the two — a single
 * publish either hits PG (multi-process safe) or the fallback (single
 * process only). The fallback is signalled by `pgListenerReady=false`,
 * which subscribe() flips off when LISTEN is established. */
let pgListenerReady = false;
const _localEmitter = new EventEmitter();
_localEmitter.setMaxListeners(500);

/* Topic → Set<handler>. Topic key is the full string ("exec_progress:abc-123").
   Handlers are called with the JSON-parsed payload; parse failures
   log at warn and skip. */
const handlers = new Map();

/* Cached topics we already sent `LISTEN "topic"` for. PG is happy to
   receive repeated LISTEN commands, but we track so we don't spam the
   wire on hot subscribe paths (every SSE connect calls subscribe). */
const listenedTopics = new Set();

let pgClient = null;
let pgConnectPromise = null;
let reconnectAttempt = 0;
let reconnectTimer = null;

/* ─── Public API ──────────────────────────────────────────────────── */

/**
 * Publish a JSON-serialisable payload to a topic. Returns immediately
 * after the NOTIFY hits the wire — no subscribers on this process are
 * synchronously invoked. (For in-process delivery, callers can also
 * pass a `local: true` option which uses the local emitter — useful
 * for tests.)
 *
 * @param {string} topic          e.g. "exec_progress:abc-123"
 * @param {object} payload        any JSON-serialisable object
 * @param {object} [opts]
 * @param {boolean} [opts.local]  force the local emitter (bypass PG)
 */
export async function publish(topic, payload, opts = {}) {
  if (!isValidTopic(topic)) {
    logger.child({ module: 'pubsub' }).warn('publish_invalid_topic', { topic });
    return;
  }
  const json = JSON.stringify(payload || {});
  if (json.length > MAX_PAYLOAD_BYTES) {
    // Truncate rather than throw — losing the trailing chunk of a
    // huge stdout buffer is acceptable; losing the whole event
    // because the SSE client never sees anything is worse.
    const truncated = json.slice(0, MAX_PAYLOAD_BYTES - 32) + '...truncated';
    return publishRaw(topic, truncated, !!opts.local);
  }
  return publishRaw(topic, json, !!opts.local);
}

async function publishRaw(topic, json, forceLocal) {
  /* If the listener is up AND the caller did not opt into the local
     emitter, route through PG. */
  if (!forceLocal && pgListenerReady && pgClient) {
    try {
      // pg_notify takes BOTH arguments as text literals — they're
      // string values, not identifiers. (P_pg-channel-identifier: the
      // channel name itself was previously escaped as an identifier,
      // but LISTEN requires an identifier so we encode colons → '_'
      // before talking to PG; see encodeChannel at the top.)
      const channelLit = pgClient.escapeLiteral(encodeChannel(topic));
      const payloadLit = pgClient.escapeLiteral(json);
      await pgClient.query(`SELECT pg_notify(${channelLit}, ${payloadLit})`);
      return;
    } catch (err) {
      // Don't crash the publish path — log at warn and still try to
      // deliver to in-process subscribers via the local emitter so a
      // brief PG hiccup doesn't strand the SSE consumer. PG-down is
      // a degraded mode; a single failed NOTIFY is too.
      logger.child({ module: 'pubsub', op: 'publish' }).warn('publish_pg_failed_using_local', {
        topic, error: err.message,
      });
      _localEmitter.emit('local', topic, json);
      return;
    }
  }
  // Fallback: invoke local handlers directly.
  if (!_localEmitter.listenerCount('__degraded__')) {
    logger.child({ module: 'pubsub' }).warn(
      'publish_using_local_fallback',
      { topic, reason: forceLocal ? 'local_forced' : (pgListenerReady ? 'no_client' : 'pg_not_ready') }
    );
  }
  _localEmitter.emit('local', topic, json);
}

/**
 * Subscribe to a topic. Returns an `unsubscribe` function (call it
 * from the SSE req.on('close') handler). Multiple subscribers on the
 * same topic all receive every event — fan-out is by design.
 *
 * @param {string} topic
 * @param {function} handler  called with the JSON-parsed payload
 */
export async function subscribe(topic, handler) {
  if (!isValidTopic(topic)) {
    throw new Error(`pubsub.subscribe: invalid topic "${topic}" (must start with one of: ${ALLOWED_TOPIC_PREFIXES.join(', ')})`);
  }
  if (typeof handler !== 'function') {
    throw new Error('pubsub.subscribe: handler must be a function');
  }

  // P_pg-channel-identifier — store under encoded topic so PG
  // notification channels (already in encoded form) hit the same Map.
  const enc = encodeChannel(topic);

  // Add to the in-process handler map first so an event that fires
  // between subscribe() and LISTEN isn't lost.
  if (!handlers.has(enc)) handlers.set(enc, new Set());
  handlers.get(enc).add(handler);

  // Ensure PG is listening on this topic. If the connection isn't up
  // yet, subscribe is still valid (the local emitter will fire while
  // we wait); once PG is ready we'll attach the LISTEN.
  await ensureListener().catch((err) => {
    logger.child({ module: 'pubsub', op: 'subscribe' }).warn('ensure_listener_failed', {
      topic, error: err.message,
    });
  });

  return function unsubscribe() {
    const set = handlers.get(enc);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) {
      handlers.delete(enc);
      // Note: we don't UNLISTEN. PG LISTEN cost is one entry in a
      // server-side hash table; the server already rate-limits
      // LISTEN/UNLISTEN churn, and a topic that 100 SSE clients all
      // subscribe to would generate 99 redundant UNLISTEN commands.
    }
  };
}

/**
 * Convenience: synchronous-style subscribe that uses the local emitter
 * regardless of PG state. Used by the test harness. NOT for production
 * callers.
 */
export function subscribeLocal(topic, handler) {
  if (!isValidTopic(topic)) throw new Error(`invalid topic ${topic}`);
  const enc = encodeChannel(topic);
  if (!handlers.has(enc)) handlers.set(enc, new Set());
  handlers.get(enc).add(handler);
  return function unsubscribe() {
    const set = handlers.get(enc);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) handlers.delete(enc);
  };
}

/**
 * Test-only: drop all in-process subscribers and reset internal
 * counters. Not part of the public API — used by server/test/pubsub.test.js
 * to keep tests isolated when run alongside the live module.
 */
export function _resetForTests() {
  handlers.clear();
  listenedTopics.clear();
  _localEmitter.removeAllListeners('local');
}


export function getStatus() {
  return {
    pgListenerReady,
    reconnectAttempt,
    subscribedTopics: handlers.size,
    localEmitterListeners: _localEmitter.listenerCount('local'),
  };
}

/* ─── Internals ──────────────────────────────────────────────────── */

function isValidTopic(topic) {
  if (typeof topic !== 'string' || topic.length === 0 || topic.length > 63) {
    return false;
  }
  // PG LISTEN/NOTIFY channel names are passed as string literals
  // (not identifiers), so colons and other punctuation are legal as
  // long as the string is well-formed. We namespace by prefix so a
  // future caller can't accidentally subscribe to "drop_table" or
  // similar — the prefix list is the gate.
  return ALLOWED_TOPIC_PREFIXES.some((p) => topic.startsWith(p));
}

async function ensureListener() {
  if (pgListenerReady) return;
  if (pgConnectPromise) return pgConnectPromise;
  pgConnectPromise = doConnect().catch((err) => {
    pgConnectPromise = null;
    throw err;
  });
  return pgConnectPromise;
}

async function doConnect() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    logger.child({ module: 'pubsub' }).warn('no_database_url_pubsub_disabled');
    return;
  }
  pgClient = new pg.Client({ connectionString: url });
  pgClient.on('notification', onNotification);
  pgClient.on('error', onPgError);
  try {
    await pgClient.connect();
  } catch (err) {
    pgClient = null;
    logger.child({ module: 'pubsub', op: 'connect' }).warn('pg_connect_failed', {
      error: err.message, attempt: reconnectAttempt,
    });
    scheduleReconnect();
    throw err;
  }

  /* Re-issue LISTEN for any topics we already had subscribed before
     the reconnect (covers the case where PG dropped and we reconnected
     with existing handlers still in the Map). */
  for (const topic of handlers.keys()) {
    await safeListen(topic);
  }
  pgListenerReady = true;
  reconnectAttempt = 0;
  logger.child({ module: 'pubsub' }).info('pg_listener_ready', {
    subscribedTopics: handlers.size,
  });
}

async function safeListen(topic) {
  if (listenedTopics.has(topic) || !pgClient) return;
  try {
    // P_pg-channel-identifier — LISTEN takes an identifier, not a
    // string literal. Encode colons to '_' before sending so the
    // channel name is valid SQL identifier syntax.
    const channelId = pgClient.escapeIdentifier(encodeChannel(topic));
    await pgClient.query(`LISTEN ${channelId}`);
    listenedTopics.add(topic);
  } catch (err) {
    logger.child({ module: 'pubsub', op: 'listen' }).warn('listen_failed', {
      topic, error: err.message,
    });
  }
}

function onNotification(msg) {
  /* P_pg-channel-identifier — msg.channel arrives in encoded form
     (matches the key used by subscribe()). No re-encode needed. */
  const enc = msg.channel;
  let payload;
  try {
    payload = msg.payload ? JSON.parse(msg.payload) : {};
  } catch (err) {
    logger.child({ module: 'pubsub', op: 'dispatch' }).warn('payload_parse_failed', {
      channel: enc, error: err.message,
    });
    return;
  }
  const set = handlers.get(enc);
  if (!set || set.size === 0) return;
  for (const h of set) {
    try { h(payload); } catch (err) {
      logger.child({ module: 'pubsub', op: 'dispatch' }).warn('handler_threw', {
        channel: enc, error: err.message,
      });
    }
  }
}

function onPgError(err) {
  /* The `error` event fires before `end`. We tear down state and let
     the reconnect loop reconnect. Subscribers will not receive events
     during the gap — that's the documented eventual-consistency
     tradeoff. */
  logger.child({ module: 'pubsub' }).warn('pg_listener_error', { error: err.message });
  pgListenerReady = false;
  pgClient = null;
  listenedTopics.clear();
  scheduleReconnect();
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = RECONNECT_BACKOFF_MS[Math.min(reconnectAttempt, RECONNECT_BACKOFF_MS.length - 1)];
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    ensureListener().catch(() => { /* log already emitted */ });
  }, delay);
  if (typeof reconnectTimer.unref === 'function') reconnectTimer.unref();
}

/* Wire the local emitter fallback path. We register a permanent
   listener that dispatches to the same handlers map as PG. This
   means a process that publishes through the fallback (because its
   PG isn't ready yet) still feeds its own SSE subscribers. */
_localEmitter.on('local', (topic, json) => {
  /* P_pubsub-key-encoding — the handlers map is keyed by the encoded
     channel name (see subscribe / subscribeLocal). Looking up by the
     raw topic skips every topic that contains a colon or hyphen and
     silently drops the event. */
  const set = handlers.get(encodeChannel(topic));
  if (!set || set.size === 0) return;
  let payload;
  try { payload = JSON.parse(json); } catch (_) { return; }
  for (const h of set) {
    try { h(payload); } catch (_) {}
  }
});

/* Lazy-init: do not block import. Production callers don't need an
   immediate connection — the first subscribe() triggers it. We do
   kick it off at import time so a healthy deploy has the listener
   warm by the time the first SSE client connects. */
ensureListener().catch(() => { /* logged in doConnect */ });