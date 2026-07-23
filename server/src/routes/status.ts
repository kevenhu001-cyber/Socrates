import { Router } from 'express';
import { sql, gte, and, eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { statusMonitorEvents, statusSubscribers } from '../db/schema.js';
import { COMPONENTS, startStatusMonitor, getLiveState, getRequestMetrics, HOST_REBOOTS, overlapMs } from '../services/statusMonitor.js';
import { sendStatusSubscriptionEmail } from '../services/email.js';
import crypto from 'node:crypto';

const router = Router();

// Public base URL of the status site. Falls back to the status
// subdomain; override with STATUS_URL in the environment.
const STATUS_BASE_URL = process.env.STATUS_URL || 'https://status.topodrive.top';

// Cache the expensive derived feed (18+ DB queries) for a short window
// so the public, unauthenticated endpoint can't be used to hammer
// Postgres. The live component states still update every 30s via the
// monitor; this only caches the historical aggregation.
const FEED_CACHE_TTL_MS = 60 * 1000;
let feedCache: { at: number; promise: ReturnType<typeof buildStatusFeed> | null } = { at: 0, promise: null };

async function getStatusFeed() {
  const now = Date.now();
  let feed;
  if (feedCache.promise && now - feedCache.at < FEED_CACHE_TTL_MS) {
    feed = await feedCache.promise;
  } else {
    feed = await buildStatusFeed().finally(() => { feedCache.at = Date.now(); });
    feedCache.promise = Promise.resolve(feed);
  }
  // Metrics (avg response / availability) are computed fresh on every
  // request so they reflect real-time state instead of being frozen by
  // the 60s historical cache.
  feed = { ...feed, metrics: await buildMetrics() };
  return feed;
}

/* GET /api/status
 *
 * Public, unauthenticated system-status feed consumed by the
 * status.topodrive.top page. Component states come from the live
 * self-hosted monitor (src/services/statusMonitor.js); historical
 * uptime, the 90-day timeline heatmap, and incident history are
 * DERIVED FROM REAL RECORDED transitions in status_monitor_events,
 * not a synthetic baseline.
 *
 * No PII, no secrets. Safe to expose on the public edge.
 */

const WINDOW_MS = 90 * 24 * 3600 * 1000; // 90 days
const DAY_MS = 24 * 3600 * 1000;
// The timeline only shows the last N days so it fits without horizontal
// scrolling on typical screens; the 90-day uptime/incident windows are
// kept separate (see buildStatusFeed).
const TIMELINE_DAYS = 30;

// Compute uptime% for a component over [startMs, endMs] from real
// transition events. The monitor writes a row on every state change;
// a component is "down"/"degraded" for the span from entering that
// state until the next transition (or now, if still in it).
async function uptimeFor(component: string, startMs: number, endMs: number) {
  const db = getDb();
  const rows = await db.select({
    toState: statusMonitorEvents.toState,
    createdAt: statusMonitorEvents.createdAt,
  })
    .from(statusMonitorEvents)
    .where(and(
      sql`${statusMonitorEvents.component} = ${component}`,
      gte(statusMonitorEvents.createdAt, new Date(startMs - DAY_MS)),
    ))
    .orderBy(sql`${statusMonitorEvents.createdAt} ASC`);

  if (rows.length === 0) return 100;

  // Build (start,end,state) intervals. Assume 'ok' before first event.
  let downtimeMs = 0;
  let cursor = startMs;
  let openState = 'ok';
  for (const r of rows) {
    const t = r.createdAt.getTime();
    if (t > cursor) {
      if (openState !== 'ok') downtimeMs += (t - cursor);
      cursor = t;
    }
    openState = r.toState;
  }
  if (openState !== 'ok') downtimeMs += (endMs - cursor);

  // Host reboots take every component down for the reboot window.
  for (const rb of HOST_REBOOTS) {
    downtimeMs += overlapMs(startMs, endMs, rb.start, rb.end ?? endMs);
  }

  const availability = (1 - downtimeMs / (endMs - startMs)) * 100;
  return Math.max(0, Math.min(100, availability));
}

// Service-level availability over [sinceMs, nowMs]: the fraction of
// time during which the service was NOT fully operational. "Not fully
// operational" = at least one component was non-ok OR the host was
// rebooting. Derived from the same real `status_monitor_events`
// transitions + HOST_REBOOTS used everywhere else — i.e. downtime ÷
// total time, not an HTTP status-code ratio.
async function computeServiceAvailability(sinceMs: number, nowMs: number) {
  const db = getDb();
  const rows = await db.select({
    component: statusMonitorEvents.component,
    toState: statusMonitorEvents.toState,
    createdAt: statusMonitorEvents.createdAt,
  })
    .from(statusMonitorEvents)
    .where(gte(statusMonitorEvents.createdAt, new Date(sinceMs - DAY_MS)))
    .orderBy(sql`${statusMonitorEvents.createdAt} ASC`);

  // Collect non-ok intervals per component (assume 'ok' before first event).
  const byComp: Record<string, { t: number; state: string }[]> = {};
  for (const r of rows) {
    (byComp[r.component] ||= []).push({ t: r.createdAt.getTime(), state: r.toState });
  }
  const bad = [];
  for (const comp of Object.keys(byComp)) {
    const evs = byComp[comp];
    let cursor = sinceMs, open = 'ok';
    for (const e of evs) {
      if (e.t > cursor && open !== 'ok') bad.push([cursor, Math.min(e.t, nowMs)]);
      cursor = e.t; open = e.state;
    }
    if (open !== 'ok') bad.push([cursor, nowMs]);
  }
  // Host reboots take every component down for the whole reboot window.
  for (const rb of HOST_REBOOTS) bad.push([rb.start, rb.end ?? nowMs]);

  // Merge overlapping intervals and sum their lengths within the window.
  bad.sort((a, b) => a[0] - b[0]);
  let downtime = 0, lastEnd = -Infinity;
  for (const [s, e] of bad) {
    const ss = Math.max(s, sinceMs), ee = Math.min(e, nowMs);
    if (ee <= ss) continue;
    const ns = Math.max(ss, lastEnd);
    if (ee > ns) { downtime += ee - ns; lastEnd = ee; }
  }
  const availability = (1 - downtime / (nowMs - sinceMs)) * 100;
  return Math.max(0, Math.min(100, availability));
}

// Per-component daily uptime for the last 90 days, aligned to `days`.
// Returns { days: [...], componentDays: { name: [pct,...] } }.
async function buildTimeline(sinceMs: number, nowMs: number) {
  const db = getDb();
  const dayCount = Math.ceil((nowMs - sinceMs) / DAY_MS);
  const days = [];
  const dayStarts = [];
  for (let i = dayCount - 1; i >= 0; i--) {
    const start = new Date(Math.floor((nowMs - i * DAY_MS) / DAY_MS) * DAY_MS);
    days.push(start.toISOString().slice(0, 10));
    dayStarts.push(start.getTime());
  }

  const componentDays: Record<string, number[]> = {};
  for (const component of COMPONENTS) {
    const rows = await db.select({
      toState: statusMonitorEvents.toState,
      createdAt: statusMonitorEvents.createdAt,
    })
      .from(statusMonitorEvents)
      .where(and(
        sql`${statusMonitorEvents.component} = ${component}`,
        gte(statusMonitorEvents.createdAt, new Date(sinceMs - DAY_MS)),
      ))
      .orderBy(sql`${statusMonitorEvents.createdAt} ASC`);

    const series = dayStarts.map((ds, idx) => {
      const de = ds + DAY_MS;
      // window-scoped interval scan for this day
      let downtime = 0, cursor = ds, open = 'ok';
      for (const r of rows) {
        const t = r.createdAt.getTime();
        if (t >= de) break;
        if (t > cursor) { if (open !== 'ok') downtime += (t - cursor); cursor = t; }
        open = r.toState;
      }
      if (open !== 'ok') downtime += (de - cursor);
      for (const rb of HOST_REBOOTS) {
        downtime += overlapMs(ds, de, rb.start, rb.end ?? nowMs);
      }
      const pct = Math.max(0, Math.min(100, (1 - downtime / DAY_MS) * 100));
      return Math.round(pct * 100) / 100;
    });
    componentDays[component] = series;
  }
  return { days, componentDays };
}

// Real incident history: contiguous spans where a component was not ok.
interface Incident {
  component: string;
  severity: string;
  state: string;
  start: number;
  end: number | null;
  title: string;
  kind?: string;
  reboot?: boolean;
}

async function buildIncidents(sinceMs: number, nowMs: number) {
  const db = getDb();
  const rows = await db.select({
    id: statusMonitorEvents.id,
    component: statusMonitorEvents.component,
    toState: statusMonitorEvents.toState,
    createdAt: statusMonitorEvents.createdAt,
  })
    .from(statusMonitorEvents)
    .where(gte(statusMonitorEvents.createdAt, new Date(sinceMs)))
    .orderBy(sql`${statusMonitorEvents.createdAt} ASC`);

  const incidents: Incident[] = [];
  let cur: Incident | null = null;
  for (const r of rows) {
    if (r.toState === 'ok') {
      if (cur) { cur.end = r.createdAt.getTime(); incidents.push(cur); cur = null; }
      continue;
    }
    if (!cur || cur.component !== r.component) {
      if (cur) { cur.end = r.createdAt.getTime(); incidents.push(cur); }
      cur = {
        component: r.component,
        severity: r.toState,
        start: r.createdAt.getTime(),
        end: null,
        title: `${r.component} ${r.toState === 'down' ? 'outage' : 'degraded'}`,
        state: r.toState,
      };
    } else if (r.toState === 'down') {
      cur.severity = 'down'; cur.state = 'down';
    }
  }
  if (cur) { cur.end = nowMs; incidents.push(cur); }

  // Fold host reboots into the incident history as service-wide outages.
  for (const rb of HOST_REBOOTS) {
    if (rb.end != null && rb.end < sinceMs) continue; // outside window
    if (rb.start > nowMs) continue;
    const end = rb.end ?? nowMs;
    incidents.push({
      component: 'All services',
      severity: 'down',
      state: 'down',
      kind: 'reboot',
      start: rb.start,
      end,
      title: 'Server restart',
      reboot: true,
    });
  }

  return incidents
    .sort((a, b) => b.start - a.start)
    .slice(0, 30)
    .map((i) => ({
      kind: i.kind || 'component',
      component: i.component,
      severity: i.severity,
      state: i.state,
      title: i.title,
      time: i.start,
      end: i.end,
      body: i.reboot
        ? `<p>The server was restarted${i.end ? ` from ${new Date(i.start).toUTCString()} until ${new Date(i.end).toUTCString()}` : ''}. All services were briefly unavailable during the reboot.</p>`
        : `<p>${i.component} was ${i.severity === 'down' ? 'unavailable' : 'degraded'} from ${new Date(i.start).toUTCString()} until ${i.end ? new Date(i.end).toUTCString() : 'now'}.</p>`,
    }));
}

// Live metrics shown on the status page.
//  - avg_response: cheap in-memory rolling window (real latency).
//  - availability:  downtime ÷ total time over the 90-day window,
//    derived from real component outages + host reboots (NOT an HTTP
//    status-code ratio). Computed fresh each request (1 DB query).
async function buildMetrics() {
  const now = Date.now();
  const since = now - WINDOW_MS;
  const { avgResponseMs } = getRequestMetrics();
  const availability = await computeServiceAvailability(since, now).catch(() => null);
  return [
    { key: 'avg_response', v: avgResponseMs == null ? '—' : String(avgResponseMs), unit: 'ms' },
    { key: 'availability', v: availability == null ? '—' : availability.toFixed(2), unit: '%' },
  ];
}

async function buildStatusFeed() {
  const now = Date.now();
  const since = now - WINDOW_MS;

  const components = await Promise.all(COMPONENTS.map(async (name) => ({
    name,
    state: getLiveState(name),
    uptime: Math.round(await uptimeFor(name, since, now).catch(() => 100) * 100) / 100,
  })));

  const overall = components.some(c => c.state === 'down') ? 'down'
                : components.some(c => c.state === 'warn') ? 'warn' : 'ok';

  const [timeline, incidents] = await Promise.all([
    buildTimeline(now - TIMELINE_DAYS * DAY_MS, now).catch(() => ({ days: [], componentDays: {} })),
    buildIncidents(since, now).catch(() => []),
  ]);

  // Metrics are computed live in getStatusFeed() (buildMetrics) so they
  // stay real-time; buildStatusFeed itself doesn't need to set them.
  const metrics = await buildMetrics();

  return {
    updated: Date.now(),
    overall,
    components,
    metrics,
    timeline,
    incidents,
    source: 'backend',
  };
}

router.get('/', async (_req, res) => {
  try {
    const feed = await getStatusFeed();
    res.json(feed);
  } catch (err) {
    // Live states are cheap and always available; fall back to them so
    // the page never hard-fails even if the historical aggregation does.
    const components = COMPONENTS.map((name) => ({ name, state: getLiveState(name), uptime: 100 }));
    const overall = components.some(c => c.state === 'down') ? 'down'
                  : components.some(c => c.state === 'warn') ? 'warn' : 'ok';
    res.json({ updated: Date.now(), overall, components, metrics: [], timeline: { days: [], componentDays: {} }, incidents: [], source: 'backend-fallback' });
  }
});

/* POST /api/status/subscribe — subscribe an email to outage notifications */
router.post('/subscribe', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    const db = getDb();
    const [existing] = await db.select().from(statusSubscribers)
      .where(eq(statusSubscribers.email, email.toLowerCase())).limit(1);
    if (existing) {
      return res.json({ status: 'already_subscribed' });
    }
    const token = crypto.randomBytes(24).toString('hex');
    await db.insert(statusSubscribers).values({
      email: email.toLowerCase(),
      token,
    });
    /* Send confirmation email */
    const confirmUrl = `${STATUS_BASE_URL}/api/status/confirm?token=${token}`;
    try {
      await sendStatusSubscriptionEmail(email, confirmUrl);
    } catch (_) {
      /* email delivery failure is not fatal — the subscriber row exists */
    }
    return res.status(201).json({ status: 'subscribed' });
  } catch (err) { next(err); }
});

/* GET /api/status/confirm — confirm subscription via token */
router.get('/confirm', async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).send('Missing token');
    const db = getDb();
    const [sub] = await db.select().from(statusSubscribers)
      .where(and(eq(statusSubscribers.token, token as string), sql`${statusSubscribers.confirmedAt} IS NULL`))
      .limit(1);
    if (!sub) return res.status(404).send('Invalid or already confirmed token');
    await db.update(statusSubscribers).set({ confirmedAt: new Date() })
      .where(eq(statusSubscribers.id, sub.id));
    return res.redirect(`${STATUS_BASE_URL}/?confirmed=1`);
  } catch (err) { next(err); }
});

export { startStatusMonitor };
export default router;
