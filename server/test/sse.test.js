// @ts-check
/**
 * Unit tests for src/lib/sse.js — the SSE helpers shared by all
 * streaming endpoints (chat, execution, messages, MiniMax proxy).
 *
 * The most important contract is startSseKeepalive: a fire-and-forget
 * periodic `: keepalive` comment that must
 *   1. emit one comment IMMEDIATELY (so a slow first upstream chunk
 *      doesn't look like a hang to the reverse proxy),
 *   2. emit on the configured interval,
 *   3. self-clean when the response ends / the socket closes / an
 *      error fires (no leaked setInterval holding the event loop),
 *   4. never throw when the socket is already destroyed.
 *
 * Run with: npm test
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import {
  writeSseHeaders,
  writeSseEvent,
  writeSseData,
  writeSseComment,
  startSseKeepalive,
  trackSseConnection,
} from '../src/lib/sse.js';

/* ── Fake ServerResponse ──────────────────────────────────────── */

/**
 * Minimal stand-in for node:http.ServerResponse. Records every chunk
 * passed to .write() and exposes the same end / destroy signals so
 * the helpers can attach listeners. We deliberately do NOT subclass
 * — the real type has dozens of unused methods we'd have to stub.
 */
function fakeRes() {
  const chunks = [];
  const headers = {};
  let writableEnded = false;
  let destroyed = false;
  const ee = new EventEmitter();

  const res = {
    statusCode: 200,
    writableEnded: false,
    destroyed: false,
    locals: {},
    setHeader(name, value) { headers[name] = value; },
    getHeader(name) { return headers[name]; },
    flushHeaders() { /* noop */ },
    write(chunk) {
      if (writableEnded || destroyed) return false;
      chunks.push(String(chunk));
      return true;
    },
    end() {
      writableEnded = true;
      res.writableEnded = true;
      ee.emit('finish');
      ee.emit('close');
    },
    destroy() {
      destroyed = true;
      res.destroyed = true;
      ee.emit('close');
    },
    emit(name) { return ee.emit(name); },
    on(name, fn) { ee.on(name, fn); return res; },
    once(name, fn) { ee.once(name, fn); return res; },
    removeListener(name, fn) { ee.removeListener(name, fn); return res; },
    get chunks() { return chunks; },
    get headerMap() { return headers; },
  };
  return res;
}

/* ── writeSseHeaders ──────────────────────────────────────────── */

describe('writeSseHeaders', () => {
  test('sets the canonical SSE headers and flushes', () => {
    const res = fakeRes();
    const ok = writeSseHeaders(res);
    assert.equal(ok, true);
    assert.equal(res.statusCode, 200);
    assert.match(res.getHeader('Content-Type'), /^text\/event-stream/);
    assert.match(res.getHeader('Cache-Control'), /no-cache/);
    assert.equal(res.getHeader('Connection'), 'keep-alive');
    assert.equal(res.getHeader('X-Accel-Buffering'), 'no');
  });
});

/* ── writeSseEvent / writeSseData / writeSseComment ────────────── */

describe('writeSseEvent / writeSseData / writeSseComment', () => {
  test('writeSseEvent emits "event: <name>\\ndata: <json>\\n\\n"', () => {
    const res = fakeRes();
    writeSseEvent(res, 'progress', { phase: 'running' });
    assert.deepEqual(res.chunks, ['event: progress\ndata: {"phase":"running"}\n\n']);
  });

  test('writeSseEvent passes a string data field through verbatim', () => {
    const res = fakeRes();
    writeSseEvent(res, 'progress', 'already-serialized');
    assert.deepEqual(res.chunks, ['event: progress\ndata: already-serialized\n\n']);
  });

  test('writeSseData emits only the data frame (no event line)', () => {
    const res = fakeRes();
    writeSseData(res, { hello: 'world' });
    assert.deepEqual(res.chunks, ['data: {"hello":"world"}\n\n']);
  });

  test('writeSseComment emits ": text\\n\\n"', () => {
    const res = fakeRes();
    writeSseComment(res, 'keepalive');
    assert.deepEqual(res.chunks, [': keepalive\n\n']);
  });

  test('returns false (no throw) when the socket is already closed', () => {
    const res = fakeRes();
    res.end();
    assert.equal(writeSseEvent(res, 'x', {}), false);
    assert.equal(writeSseData(res, {}), false);
    assert.equal(writeSseComment(res, 'x'), false);
    // No chunks written.
    assert.deepEqual(res.chunks, []);
  });
});

/* ── startSseKeepalive ────────────────────────────────────────── */

describe('startSseKeepalive', () => {
  test('emits one comment immediately so a slow upstream is not mistaken for a hang', () => {
    const res = fakeRes();
    const { intervalMs } = startSseKeepalive(res, { intervalMs: 60_000 });
    assert.equal(intervalMs, 60_000);
    assert.equal(res.chunks.length, 1);
    assert.equal(res.chunks[0], ': keepalive\n\n');
  });

  test('emits subsequent comments on the configured interval', async () => {
    const res = fakeRes();
    startSseKeepalive(res, { intervalMs: 300 });
    // After the immediate emit, wait ~1 s to observe 2-3 periodic
    // ticks. The helper's interval is unref'd so this test's own
    // setTimeout is what keeps the event loop alive — generous
    // margin avoids CI flake.
    await new Promise((r) => setTimeout(r, 1000));
    res.destroy(); // tear down so the timer ref doesn't keep us alive
    assert.ok(res.chunks.length >= 2, `expected ≥2 keepalive frames, got ${res.chunks.length}`);
    for (const c of res.chunks) {
      assert.match(c, /^: keepalive\n\n$/);
    }
  });

  test('stops emitting after res.end()', async () => {
    const res = fakeRes();
    startSseKeepalive(res, { intervalMs: 20 });
    const beforeEnd = res.chunks.length;
    res.end();
    await new Promise((r) => setTimeout(r, 80));
    // No new chunks after end().
    assert.equal(res.chunks.length, beforeEnd);
  });

  test('stops emitting after res.destroy()', async () => {
    const res = fakeRes();
    startSseKeepalive(res, { intervalMs: 20 });
    const beforeDestroy = res.chunks.length;
    res.destroy();
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(res.chunks.length, beforeDestroy);
  });

  test('safe to call on an already-destroyed socket (initial emit is swallowed)', () => {
    const res = fakeRes();
    res.destroy();
    // Should not throw; the try/catch inside startSseKeepalive handles
    // the case where writeSseComment sees a destroyed socket.
    const { stop } = startSseKeepalive(res, { intervalMs: 50 });
    assert.equal(typeof stop, 'function');
    stop();
  });

  test('explicit stop() halts further emissions', async () => {
    const res = fakeRes();
    const { stop } = startSseKeepalive(res, { intervalMs: 20 });
    const beforeStop = res.chunks.length;
    stop();
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(res.chunks.length, beforeStop);
  });

  test('rejects intervals below 250 ms by clamping (timer safety)', () => {
    const res = fakeRes();
    const { intervalMs } = startSseKeepalive(res, { intervalMs: 50 });
    assert.equal(intervalMs, 250, 'clamped to 250 ms minimum');
    res.end();
  });
});

/* ── trackSseConnection ───────────────────────────────────────── */

describe('trackSseConnection', () => {
  test('increments and decrements the counter on app.locals.sseCount', () => {
    const app = { locals: {} };
    trackSseConnection(app, +1);
    trackSseConnection(app, +1);
    assert.equal(app.locals.sseCount, 2);
    trackSseConnection(app, -1);
    assert.equal(app.locals.sseCount, 1);
  });

  test('floors at 0 (cannot go negative)', () => {
    const app = { locals: {} };
    trackSseConnection(app, -5);
    assert.equal(app.locals.sseCount, 0);
  });

  test('no-ops when app.locals is missing', () => {
    // No throw, no side-effect.
    trackSseConnection(null, +1);
    trackSseConnection(undefined, +1);
  });
});