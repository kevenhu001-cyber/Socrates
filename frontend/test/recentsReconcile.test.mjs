import test from 'node:test';
import assert from 'node:assert/strict';

import {
  patchSessionRow,
  createReconciler,
  RECONCILE_MIN_INTERVAL_MS,
} from '../src/session/recentsReconcile.js';

/* ── patchSessionRow ─────────────────────────────────────────────── */

test('patches an existing row with the save response scalars', () => {
  const sessions = [{ id: 'A', title: 'old', topic: 't', total_q: 1, tags: ['x'] }];
  const next = patchSessionRow(sessions, {
    id: 'A', title: 'new', totalQ: 9, mode: 'chat', kind: 'chat', updatedAt: 1700,
  }, null);
  assert.equal(next[0].title, 'new');
  assert.equal(next[0].total_q, 9);
  assert.equal(next[0].mode, 'chat');
  /* The response carries no tags — the row must keep the ones the last real
     fetch gave it, or the user's tags would silently vanish on every save. */
  assert.deepEqual(next[0].tags, ['x']);
});

test('never mutates the input list or its rows', () => {
  const row = { id: 'A', title: 'old' };
  const sessions = [row];
  const next = patchSessionRow(sessions, { id: 'A', title: 'new' }, null);
  assert.equal(sessions[0], row);
  assert.equal(row.title, 'old');
  assert.notEqual(next[0], row);
});

test('updatedAt lands on updated_at so the recency sort stays correct', () => {
  /* getVisibleSessions() (session/store.js) sorts on updated_at first. If the
     patch only set updatedAt, the patched row would sort to the bottom until
     the next real fetch. */
  const next = patchSessionRow([{ id: 'A', updated_at: 1 }], { id: 'A', updatedAt: 5000 }, null);
  assert.equal(next[0].updated_at, 5000);
});

test('a real 0 lands, but a null archivedAt means "unchanged"', () => {
  const next = patchSessionRow(
    [{ id: 'A', total_q: 7, archivedAt: 123 }],
    { id: 'A', totalQ: 0, archivedAt: null },
    null,
  );
  assert.equal(next[0].total_q, 0);
  assert.equal(next[0].archivedAt, 123, 'null archivedAt must not archive the row');
});

test('inserts a row for a session the server just created', () => {
  const saved = {
    id: 'NEW', topic: 'photosynthesis', title: 'Photosynthesis', mode: 'chat',
    kind: 'chat', projectId: 'P1', pinned: false, totalQ: 0,
    createdAt: 10, updatedAt: 20,
  };
  const payload = { topic: 'photosynthesis', title: 'Photosynthesis', domain: 'bio', mode: 'chat', projectId: 'P1' };
  const next = patchSessionRow([{ id: 'OLD' }], saved, payload);
  assert.equal(next.length, 2);
  assert.equal(next[0].id, 'NEW');
  assert.equal(next[0].title, 'Photosynthesis');
  /* `domain` is only in the payload — without it Cmd-K and the row tooltip
     would read undefined. */
  assert.equal(next[0].domain, 'bio');
  assert.equal(next[0].updated_at, 20);
  assert.deepEqual(next.map((r) => r.id), ['NEW', 'OLD']);
});

test('declines to invent a row when there is no payload to build it from', () => {
  const sessions = [{ id: 'OLD' }];
  const next = patchSessionRow(sessions, { id: 'NEW', title: 'x' }, null);
  assert.equal(next, sessions, 'the reconcile will pick it up instead');
});

test('re-files a client-drafted row under the server-minted UUID', () => {
  const sessions = [{ id: 'draft-1', title: 'hello', tags: ['keep'] }];
  const next = patchSessionRow(sessions, { id: 'real-uuid', title: 'hello', totalQ: 3 }, null, 'draft-1');
  assert.equal(next.length, 1);
  assert.equal(next[0].id, 'real-uuid');
  assert.equal(next[0].total_q, 3);
  assert.deepEqual(next[0].tags, ['keep']);
});

test('rekeying does not duplicate a row when the real id is already listed', () => {
  const sessions = [{ id: 'draft-1', title: 'stale' }, { id: 'real-uuid', title: 'fresh' }];
  const next = patchSessionRow(sessions, { id: 'real-uuid', title: 'fresh' }, null, 'draft-1');
  assert.equal(next.filter((r) => r.id === 'real-uuid').length, 1);
  /* The draft row is renamed onto the real id, so two rows now share it —
     the patch then collapses them to one. Length must not grow. */
  assert.ok(next.length <= sessions.length);
});

test('a response with no id is ignored entirely', () => {
  const sessions = [{ id: 'A' }];
  assert.equal(patchSessionRow(sessions, {}, null), sessions);
  assert.equal(patchSessionRow(sessions, null, null), sessions);
});

/* ── createReconciler ────────────────────────────────────────────── */

function fakeClock() {
  let clock = 0;
  let seq = 0;
  let timers = [];
  return {
    now: () => clock,
    setTimer: (fn, ms) => {
      const id = ++seq;
      timers.push({ id, at: clock + ms, fn });
      return id;
    },
    clearTimer: (h) => { timers = timers.filter((t) => t.id !== h); },
    advance(ms) {
      clock += ms;
      const due = timers.filter((t) => t.at <= clock).sort((a, b) => a.at - b.at);
      timers = timers.filter((t) => t.at > clock);
      due.forEach((t) => t.fn());
    },
    pending: () => timers.length,
  };
}

/* createReconciler folds a request that lands while a fetch is still in flight
   into ONE queued follow-up rather than starting a concurrent fetch. That
   handover happens in a promise continuation, so a test that advances the
   clock without draining microtasks in between would see the fold, not a
   second fetch. */
function settle() {
  return new Promise((r) => setImmediate(r));
}

test('a save burst collapses into a single list fetch', async () => {
  const clock = fakeClock();
  let calls = 0;
  const rec = createReconciler({
    refresh: () => { calls += 1; return Promise.resolve([]); },
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
  });
  for (let i = 0; i < 5; i += 1) rec.schedule();
  assert.equal(clock.pending(), 1, 'five requests, one pending timer');
  clock.advance(RECONCILE_MIN_INTERVAL_MS);
  assert.equal(calls, 1);
});

test('the first save-triggered reconcile waits a full window', () => {
  /* This is the whole point: the old code fetched immediately on every save. */
  const clock = fakeClock();
  let calls = 0;
  const rec = createReconciler({
    refresh: () => { calls += 1; return Promise.resolve([]); },
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
  });
  rec.schedule();
  clock.advance(RECONCILE_MIN_INTERVAL_MS - 1);
  assert.equal(calls, 0);
  clock.advance(1);
  assert.equal(calls, 1);
});

test('back-to-back windows stay one fetch per window', async () => {
  const clock = fakeClock();
  let calls = 0;
  const rec = createReconciler({
    refresh: () => { calls += 1; return Promise.resolve([]); },
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
  });
  rec.schedule();
  clock.advance(RECONCILE_MIN_INTERVAL_MS);
  await settle();
  assert.equal(calls, 1);
  /* A save burst lands right after the previous reconcile ran. */
  rec.schedule();
  rec.schedule();
  clock.advance(RECONCILE_MIN_INTERVAL_MS);
  await settle();
  assert.equal(calls, 2, 'not 3 — the burst inside one window is folded');
});

test('flush runs now and drops the pending window', async () => {
  const clock = fakeClock();
  let calls = 0;
  const rec = createReconciler({
    refresh: () => { calls += 1; return Promise.resolve([]); },
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
  });
  rec.schedule();
  assert.equal(clock.pending(), 1);
  await rec.flush();
  assert.equal(calls, 1);
  assert.equal(clock.pending(), 0, 'the pending timer must not fire a second fetch');
  clock.advance(RECONCILE_MIN_INTERVAL_MS * 2);
  assert.equal(calls, 1);
});

test('a rejected refresh still renders and does not reject', async () => {
  const clock = fakeClock();
  let done = 0;
  const rec = createReconciler({
    refresh: () => Promise.reject(new Error('offline')),
    onDone: () => { done += 1; },
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
  });
  await rec.flush();
  assert.equal(done, 1, 'the list keeps its shape; fetchFailed drives the retry UI');
});

test('a synchronous throw from refresh is contained', async () => {
  const clock = fakeClock();
  let done = 0;
  const rec = createReconciler({
    refresh: () => { throw new Error('boom'); },
    onDone: () => { done += 1; },
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
  });
  await rec.flush();
  assert.equal(done, 1);
});

test('a flush during an in-flight refresh queues exactly one follow-up', async () => {
  const clock = fakeClock();
  let calls = 0;
  let release;
  const gate = new Promise((r) => { release = r; });
  const rec = createReconciler({
    refresh: () => { calls += 1; return calls === 1 ? gate : Promise.resolve([]); },
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
  });
  const first = rec.flush();
  /* Two more flushes arrive while the first fetch is still open. They must not
     start a second concurrent fetch over the same cache. */
  rec.flush();
  rec.flush();
  assert.equal(calls, 1);
  release();
  await first;
  await settle();
  /* Both stragglers collapsed into a single scheduled follow-up. */
  assert.equal(rec.isScheduled(), true);
  clock.advance(RECONCILE_MIN_INTERVAL_MS);
  await settle();
  assert.equal(calls, 2, 'exactly one follow-up, not one per request');
});
