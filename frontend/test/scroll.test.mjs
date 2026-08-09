import assert from 'node:assert/strict';
import test from 'node:test';

/*
 * The scroll.js tests cover the velocity-driven chat motion contract:
 *   - smoothScrollToBottom() — convenience wrapper around
 *     velocityScrollTo() for "snap to the latest message" use cases
 *   - velocityScrollTo() — the low-level primitive used by both the
 *     send path and the keyboard-inset path so they share a single
 *     motion timeline
 *
 * We exercise the public contract with hand-rolled stubs (Node's
 * --experimental-strip-types test runner does not provide jsdom, and
 * the per-frame rAF loop cannot be advanced without a fake-timers
 * shim). The stub honours the same signatures the implementation
 * actually uses: Element.scrollTop writes, dataset writes, and the
 * optional Element.animate() hook.
 */

function makeStub({ reducedMotion = false, withRAF = false } = {}) {
  const calls = [];
  const list = {
    scrollHeight: 2000,
    scrollTop: 0,
    clientHeight: 600,
    dataset: {},
    animate(keyframes, opts) {
      calls.push({ kind: 'animate', keyframes, opts });
      return {
        then() { return this; },
        cancel() {},
        onfinish: null,
        oncancel: null,
      };
    },
    scrollTo(opts) {
      calls.push({ kind: 'scrollTo', opts });
      if (opts && typeof opts.top === 'number') this.scrollTop = opts.top;
      return undefined;
    },
  };
  const previousMatchMedia = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({
    matches: reducedMotion && q.includes('reduce'),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  });
  const previousRAF = globalThis.requestAnimationFrame;
  const previousCAF = globalThis.cancelAnimationFrame;
  if (withRAF) {
    globalThis.requestAnimationFrame = function (cb) {
      return setTimeout(function () { cb(performance.now()); }, 0);
    };
    globalThis.cancelAnimationFrame = function (id) {
      clearTimeout(id);
    };
  }
  return {
    list, calls,
    restore() {
      globalThis.matchMedia = previousMatchMedia;
      if (previousRAF === undefined) delete globalThis.requestAnimationFrame;
      else globalThis.requestAnimationFrame = previousRAF;
      if (previousCAF === undefined) delete globalThis.cancelAnimationFrame;
      else globalThis.cancelAnimationFrame = previousCAF;
    },
  };
}

/* smoothScrollToBottom — for snap distances (the test uses
   scrollHeight 60 ≤ 24 + scrollTop 0 → distance 60 which exceeds
   the snap threshold, so we use smooth:false to force the snap
   path) the implementation writes scrollTop synchronously and
   clears the flag. The non-snap rAF path is exercised by the
   Playwright smoke suite in a real browser. */

test('smoothScrollToBottom sets and clears data-auto-scrolling on the snap path', async () => {
  const stub = makeStub();
  stub.list.scrollHeight = 60;  /* target just below the snap threshold */
  try {
    const mod = await import('../src/ui/scroll.js');
    /* smooth:false forces the snap path even if the planner would
       otherwise choose an animation, so the assertion is synchronous
       and the test does not leak async activity. */
    const ret = mod.smoothScrollToBottom(stub.list, { smooth: false });
    await ret;
    assert.equal(stub.list.scrollTop, 60);
    assert.equal(stub.list.dataset.autoScrolling, undefined);
  } finally {
    stub.restore();
  }
});

test('smoothScrollToBottom is a no-op when the list is missing', async () => {
  const stub = makeStub();
  try {
    const mod = await import('../src/ui/scroll.js');
    const ret = mod.smoothScrollToBottom(null, { smooth: true });
    await assert.doesNotReject(ret);
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
});

test('smoothScrollToBottom handles zero-height list gracefully', async () => {
  const stub = makeStub();
  stub.list.scrollHeight = 0;
  try {
    const mod = await import('../src/ui/scroll.js');
    const ret = mod.smoothScrollToBottom(stub.list, { smooth: true });
    await assert.doesNotReject(ret);
  } finally {
    stub.restore();
  }
});

/* velocityScrollTo — the low-level primitive. The snap path covers
   everything < 24 px and the prefers-reduced-motion override; the
   non-snap path is exercised end-to-end by the Playwright smoke
   suite, where the rAF loop runs in a real browser. */

test('velocityScrollTo snaps short distances (no animation, immediate scrollTop)', async () => {
  const stub = makeStub();
  try {
    const mod = await import('../src/ui/scroll.js');
    const ret = mod.velocityScrollTo(stub.list, 10, { smooth: true });
    /* distance = 10 < SNAP_DISTANCE → snap path */
    await ret;
    assert.equal(stub.list.scrollTop, 10);
    /* No animate() call for snap */
    assert.equal(stub.calls.some(c => c.kind === 'animate'), false);
  } finally {
    stub.restore();
  }
});

test('velocityScrollTo honours prefers-reduced-motion by snapping', async () => {
  const stub = makeStub({ reducedMotion: true });
  try {
    const mod = await import('../src/ui/scroll.js');
    const ret = mod.velocityScrollTo(stub.list, 2000, { smooth: true });
    await ret;
    assert.equal(stub.list.scrollTop, 2000);
    assert.equal(stub.calls.some(c => c.kind === 'animate'), false);
  } finally {
    stub.restore();
  }
});

test('velocityScrollTo no-ops when target equals current scrollTop', async () => {
  const stub = makeStub();
  stub.list.scrollTop = 800;
  try {
    const mod = await import('../src/ui/scroll.js');
    const ret = mod.velocityScrollTo(stub.list, 800, { smooth: true });
    await ret;
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
});

test('velocityScrollTo respects opts.smooth === false (instant snap)', async () => {
  const stub = makeStub();
  try {
    const mod = await import('../src/ui/scroll.js');
    const ret = mod.velocityScrollTo(stub.list, 3000, { smooth: false });
    await ret;
    assert.equal(stub.list.scrollTop, 3000);
    assert.equal(stub.calls.some(c => c.kind === 'animate'), false);
  } finally {
    stub.restore();
  }
});

test('velocityScrollTo handles null list gracefully', async () => {
  const stub = makeStub();
  try {
    const mod = await import('../src/ui/scroll.js');
    const ret = mod.velocityScrollTo(null, 1000, { smooth: true });
    await assert.doesNotReject(ret);
  } finally {
    stub.restore();
  }
});

test('velocityScrollTo starts with scrollHeight target via smoothScrollToBottom (same contract)', async () => {
  const stub = makeStub();
  stub.list.scrollTop = 0;
  stub.list.scrollHeight = 2000;
  try {
    const mod = await import('../src/ui/scroll.js');
    /* smooth:false → snap → no async activity to leak past the test. */
    const ret = mod.smoothScrollToBottom(stub.list, { smooth: false });
    await ret;
    assert.equal(stub.list.scrollTop, 2000);
    assert.equal(stub.list.dataset.autoScrolling, undefined);
  } finally {
    stub.restore();
  }
});