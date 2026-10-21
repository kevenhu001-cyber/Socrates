import test from 'node:test';
import assert from 'node:assert/strict';
import { afterSessionPaint } from '../src/session/afterSessionPaint.ts';

test('maintenance waits for paint and is cancelled by newer loads or invalid ownership', async () => {
  const originalRaf = globalThis.requestAnimationFrame, originalCancel = globalThis.cancelAnimationFrame;
  const frames = new Map();
  let next = 0, calls = 0;
  globalThis.requestAnimationFrame = (callback) => { frames.set(++next, callback); return next; };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  const flush = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback()); };
  try {
    const cancelled = new AbortController();
    afterSessionPaint(cancelled.signal, () => true, () => { calls++; });
    flush();
    cancelled.abort();
    flush();
    const alive = new AbortController();
    afterSessionPaint(alive.signal, () => false, () => { calls++; });
    afterSessionPaint(alive.signal, () => true, () => { calls++; });
    assert.equal(calls, 0);
    flush(); flush();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(calls, 1);
  } finally { globalThis.requestAnimationFrame = originalRaf; globalThis.cancelAnimationFrame = originalCancel; }
});

test('switching sessions cancels an idle mirror before it can retain or overwrite history', async () => {
  const { whenSessionIdle } = await import('../src/session/afterSessionPaint.ts');
  const originalIdle = globalThis.requestIdleCallback, originalCancel = globalThis.cancelIdleCallback;
  const jobs = new Map();
  let next = 0, calls = 0;
  globalThis.requestIdleCallback = (callback) => { jobs.set(++next, callback); return next; };
  globalThis.cancelIdleCallback = (id) => jobs.delete(id);
  try {
    const stale = new AbortController();
    whenSessionIdle(() => { calls++; }, 2000, stale.signal);
    assert.equal(jobs.size, 1);
    stale.abort();
    assert.equal(jobs.size, 0);
    const current = new AbortController();
    whenSessionIdle(() => { calls++; }, 2000, current.signal);
    const callbacks = [...jobs.values()]; jobs.clear(); callbacks.forEach((callback) => callback());
    current.abort();
    assert.equal(calls, 1);
    assert.equal(jobs.size, 0);
  } finally { globalThis.requestIdleCallback = originalIdle; globalThis.cancelIdleCallback = originalCancel; }
});
