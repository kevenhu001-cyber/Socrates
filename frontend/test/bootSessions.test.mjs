import test from 'node:test';
import assert from 'node:assert/strict';

import {
  takeBootSessionPrefetch,
  readBootSessions,
} from '../src/session/bootSessions.ts';

const ROWS = [
  { id: 'A', title: 'Alpha', updated_at: 20 },
  { id: 'B', title: 'Beta', updated_at: 10, archivedAt: 5 },
];

function hostWith(promise, startedAt = Date.now()) {
  return { __bootApi: { sessions: { startedAt, promise } } };
}

function ok(json, status = 200) {
  return Promise.resolve({ status, json });
}

/* ── one-shot handoff ────────────────────────────────────────────── */

test('takes the session prefetch exactly once', async () => {
  const host = hostWith(ok({ sessions: ROWS }));
  const first = takeBootSessionPrefetch(host);
  assert.ok(first, 'first call must receive the prefetch');
  assert.equal(host.__bootApi.sessions, undefined, 'handoff must be deleted');
  assert.equal(takeBootSessionPrefetch(host), null, 'second call must fall back');
  assert.deepEqual(await readBootSessions(host), null);
  assert.deepEqual(await first, { status: 200, json: { sessions: ROWS } });
});

test('returns null when no prefetch was installed', () => {
  assert.equal(takeBootSessionPrefetch(null), null);
  assert.equal(takeBootSessionPrefetch(undefined), null);
  assert.equal(takeBootSessionPrefetch({}), null);
  assert.equal(takeBootSessionPrefetch({ __bootApi: {} }), null);
});

/* ── freshness ───────────────────────────────────────────────────── */

test('rejects a prefetch older than the 30s window', async () => {
  const host = hostWith(ok({ sessions: ROWS }), Date.now() - 30_001);
  assert.equal(await readBootSessions(host), null);
  assert.equal(host.__bootApi.sessions, undefined, 'stale entry is still consumed');
});

test('accepts a prefetch that is still inside the window', async () => {
  const host = hostWith(ok({ sessions: ROWS }), Date.now() - 29_000);
  assert.deepEqual(await readBootSessions(host), ROWS);
});

test('rejects a clock-skewed future timestamp', async () => {
  const host = hostWith(ok({ sessions: ROWS }), Date.now() + 60_000);
  assert.equal(await readBootSessions(host), null);
});

test('rejects a non-numeric startedAt', async () => {
  const host = hostWith(ok({ sessions: ROWS }), Number.NaN);
  assert.equal(await readBootSessions(host), null);
});

/* ── response validation ─────────────────────────────────────────── */

test('falls back for a non-2xx response', async () => {
  assert.equal(await readBootSessions(hostWith(ok({ sessions: ROWS }, 500))), null);
  assert.equal(await readBootSessions(hostWith(ok({ sessions: ROWS }, 401))), null);
});

test('falls back for a network failure marker', async () => {
  const host = hostWith(Promise.resolve({ failed: true }));
  assert.equal(await readBootSessions(host), null);
});

test('falls back for a malformed body', async () => {
  assert.equal(await readBootSessions(hostWith(ok(null))), null);
  assert.equal(await readBootSessions(hostWith(ok({}))), null);
  assert.equal(await readBootSessions(hostWith(ok({ sessions: 'nope' }))), null);
});

test('an empty session list is a valid result, not a failure', async () => {
  const host = hostWith(ok({ sessions: [] }));
  assert.deepEqual(await readBootSessions(host), []);
});

test('falls back when the request promise rejects', async () => {
  const host = hostWith(Promise.reject(new Error('offline')));
  assert.equal(await readBootSessions(host), null);
});
