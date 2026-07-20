/**
 * Self-hosted status monitor.
 *
 * Probes each tracked component on an interval. On every state change
 * (ok ↔ warn ↔ down) it appends a transition row to
 * `status_monitor_events` (see db/schema.js). Historical uptime and
 * incident lists are derived from those rows by the /api/status route,
 * so the numbers reflect real observed downtime — not a synthetic
 * baseline — and survive restarts because they live in Postgres.
 *
 * Probe semantics mirror the old /api/status checks:
 *   - DB-backed components: a `SELECT 1` round-trip.
 *   - Realtime sync / notifications: pubsub connectivity.
 *   - AI inference: treated ok unless the process is otherwise down.
 *   - Static frontends (Web App, Billing): ok while the process serves.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { statusMonitorEvents, statusSubscribers } from '../db/schema.js';
import { getStatus as getPubsubStatus } from '../lib/pubsub.js';
import { sendEmail } from './email.js';

const PROBE_INTERVAL_MS = 30_000;
const STATUS_BASE_URL = process.env.STATUS_URL || 'https://status.topodrive.top';

// ─── Host (VM) reboot / downtime windows ──────────────────────────
// Derived from `journalctl --list-boots` + the first "Started
// socrates-api" after each boot. While the VM is down, every request
// fails at nginx (502) and every component is unreachable, so these
// windows count as downtime for uptime% and as failed-request
// equivalents for the success-rate metric. Regenerate with:
//   sudo journalctl --list-boots
//   sudo journalctl -u socrates-api -o json  (first "Started" per boot)
// Timestamps are epoch ms (UTC). `end` null = still recovering.
export const HOST_REBOOTS = [
  { start: Date.parse('2026-07-08T19:58:39+08:00'), end: Date.parse('2026-07-08T20:41:00+08:00') },
  { start: Date.parse('2026-07-09T09:02:54+08:00'), end: Date.parse('2026-07-09T09:03:03+08:00') },
  { start: Date.parse('2026-07-12T20:43:11+08:00'), end: Date.parse('2026-07-12T20:43:23+08:00') },
  { start: Date.parse('2026-07-13T16:37:16+08:00'), end: Date.parse('2026-07-13T16:37:29+08:00') },
  { start: Date.parse('2026-07-17T17:40:41+08:00'), end: Date.parse('2026-07-17T17:40:49+08:00') },
  { start: Date.parse('2026-07-17T17:51:59+08:00'), end: Date.parse('2026-07-17T17:52:09+08:00') },
  { start: Date.parse('2026-07-17T18:09:40+08:00'), end: Date.parse('2026-07-17T18:09:51+08:00') },
  { start: Date.parse('2026-07-19T12:41:45+08:00'), end: Date.parse('2026-07-19T12:41:54+08:00') },
];

// Overlap (in ms) between [aStart,aEnd] and [bStart,bEnd].
export function overlapMs(aStart, aEnd, bStart, bEnd) {
  const s = Math.max(aStart, bStart);
  const e = Math.min(aEnd, bEnd);
  return Math.max(0, e - s);
}
const COMPONENTS = [
  'API Gateway',
  'Authentication',
  'Database',
  'Realtime Sync',
  'AI Inference Engine',
  'Web Application',
  'Notification Service',
  'Document Storage',
  'Billing & Payments',
];

// In-memory latest known state per component (seeded from DB at boot).
const lastState = new Map();
let timer = null;

async function dbUp() {
  try {
    await getDb().execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

function pubsubUp() {
  try {
    const s = getPubsubStatus();
    return s?.connected !== false;
  } catch {
    return false;
  }
}

// Returns { state, detail } for a component. `detail` holds probe
// metadata (e.g. the failure reason) so it can be persisted on
// non-ok transitions for later debugging.
async function probe(component) {
  const db = await dbUp();
  switch (component) {
    case 'Database':
    case 'Authentication':
    case 'API Gateway':
    case 'Document Storage':
    case 'Billing & Payments':
      return db ? { state: 'ok' } : { state: 'down', detail: { reason: 'db_unreachable' } };
    case 'Realtime Sync':
    case 'Notification Service': {
      const up = pubsubUp();
      return up ? { state: 'ok' } : { state: 'warn', detail: { reason: 'pubsub_disconnected' } };
    }
    case 'AI Inference Engine':
      // Inference is proxied; assume ok unless the whole process is down.
      return db ? { state: 'ok' } : { state: 'down', detail: { reason: 'db_unreachable' } };
    case 'Web Application':
      return { state: 'ok' };
    default:
      return db ? { state: 'ok' } : { state: 'down', detail: { reason: 'db_unreachable' } };
  }
}

async function recordTransition(component, from, to, detail) {
  await getDb().insert(statusMonitorEvents).values({
    component,
    fromState: from ?? null,
    toState: to,
    detail: detail && typeof detail === 'object' ? detail : {},
  });
}

/* ─── Lightweight in-memory request metrics ───────────────────────
   Rolling window of recent API response timings used to power the
   real "Avg Response" / "Success Rate" metrics on the status page.
   Kept in memory (not persisted) — it's a live health signal, not
   history; the 90-day timeline already covers historical uptime. */
const METRICS_WINDOW_MS = 15 * 60 * 1000; // 15-minute rolling window
let metricsSamples = []; // { t, ms, ok }

export function recordRequestSample(durationMs, ok) {
  const now = Date.now();
  metricsSamples.push({ t: now, ms: durationMs, ok: !!ok });
  const cutoff = now - METRICS_WINDOW_MS;
  // Trim in place; window is small so this is cheap.
  while (metricsSamples.length && metricsSamples[0].t < cutoff) metricsSamples.shift();
}

export function getRequestMetrics() {
  const now = Date.now();
  const windowStart = now - METRICS_WINDOW_MS;
  const cutoff = windowStart;
  const samples = metricsSamples.filter((s) => s.t >= cutoff);
  if (!samples.length) return { avgResponseMs: null, successRate: null };
  const totalMs = samples.reduce((s, x) => s + x.ms, 0);
  const avgMs = totalMs / samples.length;
  const okCount = samples.reduce((s, x) => s + (x.ok ? 1 : 0), 0);

  // During a host reboot, in-flight + new requests fail at nginx (502)
  // without ever reaching Express, so they aren't in `samples`. Fold
  // that downtime in as failed-request-equivalents (downtime / typical
  // request duration) so an outage actually lowers the success rate
  // instead of leaving it pinned at 100%.
  let rebootFailures = 0;
  for (const rb of HOST_REBOOTS) {
    const overlap = overlapMs(windowStart, now, rb.start, rb.end ?? now);
    if (overlap > 0 && avgMs > 0) rebootFailures += overlap / avgMs;
  }

  const total = okCount + (samples.length - okCount) + rebootFailures;
  const successRate = total > 0 ? (okCount / total) * 100 : 100;
  return {
    avgResponseMs: Math.round(avgMs),
    successRate,
  };
}

// Seed lastState from the most recent event per component so we don't
// flood the table with "already ok" transitions after a restart.
async function seedFromDb() {
  const db = getDb();
  for (const component of COMPONENTS) {
    const [row] = await db.select()
      .from(statusMonitorEvents)
      .where(sql`${statusMonitorEvents.component} = ${component}`)
      .orderBy(sql`${statusMonitorEvents.createdAt} DESC`)
      .limit(1);
    lastState.set(component, row ? row.toState : 'ok');
  }
}

async function tick() {
  for (const component of COMPONENTS) {
    let result;
    try {
      result = await probe(component);
    } catch (err) {
      result = { state: 'down', detail: { reason: String(err?.message || err) } };
    }
    const state = result.state;
    const prev = lastState.get(component) ?? 'ok';
    if (state !== prev) {
      try {
        await recordTransition(component, prev, state, result.detail);
        lastState.set(component, state);
        console.log(`[status-monitor] ${component}: ${prev} → ${state}`);
        /* Send notification to all confirmed subscribers on non-ok transitions */
        if (state !== 'ok') {
          notifySubscribers(component, prev, state).catch(function (err) {
            console.warn('[status-monitor] notify failed:', err.message);
          });
        }
      } catch (err) {
        console.warn(`[status-monitor] failed to record ${component}:`, err.message);
      }
    }
  }
}

async function notifySubscribers(component, from, to) {
  var db = getDb();
  var rows = await db.select().from(statusSubscribers)
    .where(sql`${statusSubscribers.confirmedAt} IS NOT NULL`);
  if (!rows.length) return;
  var subject = '[Topodrive Status] ' + component + ' is ' + (to === 'down' ? 'DOWN' : 'degraded');
  var text = 'Component: ' + component + '\nStatus: ' + to + ' (was ' + from + ')\nTime: ' + new Date().toISOString() + '\n\nView status page: ' + STATUS_BASE_URL + '/';
  var html = '<h2>' + component + '</h2><p>Status: <strong>' + to + '</strong> (was ' + from + ')</p><p>Time: ' + new Date().toISOString() + '</p><p><a href="' + STATUS_BASE_URL + '/">View status page</a></p>';
  for (var i = 0; i < rows.length; i++) {
    try {
      await sendEmail({ to: rows[i].email, subject: subject, text: text, html: html });
    } catch (_) { /* individual send failure is non-fatal */ }
  }
}

// Read the latest probed state for a component (used by /api/status).
export function getLiveState(component) {
  return lastState.get(component) ?? 'ok';
}

export async function startStatusMonitor() {
  try {
    await seedFromDb();
  } catch (err) {
    console.warn('[status-monitor] seed skipped:', err.message);
  }
  // Prime the table with current states on boot.
  await tick().catch(() => {});
  timer = setInterval(() => tick().catch(() => {}), PROBE_INTERVAL_MS);
  console.log(`[status-monitor] started (${COMPONENTS.length} components, every ${PROBE_INTERVAL_MS / 1000}s)`);
}

export function stopStatusMonitor() {
  if (timer) clearInterval(timer);
  timer = null;
}

export { COMPONENTS };
