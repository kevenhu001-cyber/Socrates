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
/* ── dynamic target + injected plan (send glide) ──────────────────
   A deterministic fake rAF: frames are advanced by hand at 16ms steps so
   the per-frame writes can be sampled. */
function makeFrameStub({ scrollHeight = 50000, clientHeight = 800, scrollTop = 0 } = {}) {
  const queue = [];
  let now = 0;
  const listeners = new Set();
  const list = {
    scrollHeight, clientHeight, dataset: {},
    _top: scrollTop,
    get scrollTop() { return this._top; },
    set scrollTop(v) {
      const max = Math.max(0, this.scrollHeight - this.clientHeight);
      this._top = Math.max(0, Math.min(max, v));
      /* Browsers dispatch scroll asynchronously, after the write returns. */
      queueMicrotask(() => { for (const fn of listeners) fn(); });
    },
    addEventListener(type, fn) { if (type === 'scroll') listeners.add(fn); },
    removeEventListener(type, fn) { if (type === 'scroll') listeners.delete(fn); },
  };
  const prev = { raf: globalThis.requestAnimationFrame, caf: globalThis.cancelAnimationFrame, mm: globalThis.matchMedia };
  globalThis.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
  globalThis.cancelAnimationFrame = (id) => { if (queue[id - 1]) queue[id - 1] = null; };
  globalThis.matchMedia = (q) => ({ matches: false, media: q });
  return {
    list,
    frame() {
      now += 16;
      const pending = queue.splice(0);
      /* Keep ids stable for cancel: the queue is rebuilt each frame. */
      for (const cb of pending) if (cb) cb(now);
    },
    run(maxFrames = 200) { const tops = []; for (let i = 0; i < maxFrames && queue.some(Boolean); i += 1) { this.frame(); tops.push(list.scrollTop); } return tops; },
    restore() {
      globalThis.requestAnimationFrame = prev.raf;
      globalThis.cancelAnimationFrame = prev.caf;
      if (prev.mm === undefined) delete globalThis.matchMedia; else globalThis.matchMedia = prev.mm;
    },
  };
}

test('velocityScrollTo with a live target follows a retarget without moving backwards', async () => {
  const stub = makeFrameStub();
  try {
    const mod = await import('../src/ui/scroll.js');
    const motion = await import('../src/ui/motion.js');
    let target = 20000;
    const plan = motion.planSendGlide(20000, 800);
    const done = mod.velocityScrollTo(stub.list, target, { target: () => target, plan });
    const tops = [];
    for (let i = 0; i < 10; i += 1) { stub.frame(); tops.push(stub.list.scrollTop); }
    target = 21000; /* the reserve painted: destination moved further */
    tops.push(...stub.run());
    await done;
    for (let i = 1; i < tops.length; i += 1) {
      assert.ok(tops[i] >= tops[i - 1] - 0.5, `frame ${i} moved backwards: ${tops[i - 1]} → ${tops[i]}`);
    }
    assert.equal(stub.list.scrollTop, 21000, 'lands exactly on the live target');
    assert.ok(tops.length >= 8, `glide spans multiple frames (${tops.length})`);
    assert.equal(stub.list.dataset.autoScrolling, undefined);
  } finally {
    stub.restore();
  }
});

test('velocityScrollTo clamps a live target to the reachable range', async () => {
  const stub = makeFrameStub({ scrollHeight: 3000, clientHeight: 800 });
  try {
    const mod = await import('../src/ui/scroll.js');
    const done = mod.velocityScrollTo(stub.list, null, { target: () => 99999, plan: { duration: 200 } });
    stub.run();
    await done;
    assert.equal(stub.list.scrollTop, 2200);
  } finally {
    stub.restore();
  }
});

test('velocityScrollTo honours an injected plan duration and easing', async () => {
  const stub = makeFrameStub();
  try {
    const mod = await import('../src/ui/scroll.js');
    const linear = (t) => t;
    const done = mod.velocityScrollTo(stub.list, 1600, { plan: { duration: 160, ease: linear } });
    const tops = stub.run();
    await done;
    /* First frame seeds startedAt (t=0), so the linear curve advances by
       10% per 16ms frame afterwards. */
    assert.equal(tops[0], 0);
    assert.ok(Math.abs(tops[1] - 160) < 1, `linear second frame ≈160, got ${tops[1]}`);
    assert.equal(stub.list.scrollTop, 1600);
  } finally {
    stub.restore();
  }
});

test('velocityScrollTo snaps when an injected plan says snap', async () => {
  const stub = makeFrameStub();
  try {
    const mod = await import('../src/ui/scroll.js');
    await mod.velocityScrollTo(stub.list, null, { target: () => 5000, plan: { snap: true, duration: 0 } });
    assert.equal(stub.list.scrollTop, 5000);
  } finally {
    stub.restore();
  }
});

test('velocityScrollTo stops on a foreign scroll write mid-glide', async () => {
  const stub = makeFrameStub();
  try {
    const mod = await import('../src/ui/scroll.js');
    const done = mod.velocityScrollTo(stub.list, null, { target: () => 20000, plan: { duration: 800 } });
    for (let i = 0; i < 5; i += 1) stub.frame();
    stub.list.scrollTop = 100; /* user drag */
    await Promise.resolve(); /* its scroll event */
    stub.run();
    await done;
    assert.equal(stub.list.scrollTop, 100, 'the reader keeps the position they dragged to');
  } finally {
    stub.restore();
  }
});

test('cancelScrollAnimation stops an in-flight glide', async () => {
  const stub = makeFrameStub();
  try {
    const mod = await import('../src/ui/scroll.js');
    const done = mod.velocityScrollTo(stub.list, 10000, { plan: { duration: 800 } });
    for (let i = 0; i < 3; i += 1) stub.frame();
    const at = stub.list.scrollTop;
    mod.cancelScrollAnimation(stub.list);
    stub.run();
    await done;
    assert.equal(stub.list.scrollTop, at);
    assert.equal(stub.list.dataset.autoScrolling, undefined);
  } finally {
    stub.restore();
  }
});

test('smoothScrollToBottom retargets one active follow without restarting its glide', async () => {
  const stub = makeFrameStub({ scrollHeight: 10000, clientHeight: 800 });
  try {
    const mod = await import('../src/ui/scroll.js');
    const first = mod.smoothScrollToBottom(stub.list, { smooth: true, retarget: true });
    for (let i = 0; i < 5; i += 1) stub.frame();
    const beforeRetarget = stub.list.scrollTop;
    stub.list.scrollHeight = 15800;
    const second = mod.smoothScrollToBottom(stub.list, { smooth: true, retarget: true });
    assert.strictEqual(second, first, 'the existing follow owns one continuous animation');
    assert.equal(stub.list.dataset.autoScrolling, 'true');
    const tops = stub.run();
    await first;
    assert.ok(tops.every((top, index) => index === 0 || top >= tops[index - 1] - 0.5));
    assert.equal(stub.list.scrollTop, 15000);
    assert.ok(beforeRetarget > 0);
    assert.equal(stub.list.dataset.autoScrolling, undefined);
  } finally {
    stub.restore();
  }
});

test('a superseding scroll preserves the auto-scrolling marker after cancelling the previous glide', async () => {
  const stub = makeFrameStub();
  try {
    const mod = await import('../src/ui/scroll.js');
    const first = mod.velocityScrollTo(stub.list, 20000, { plan: { duration: 800 } });
    stub.frame();
    const second = mod.velocityScrollTo(stub.list, 30000, { plan: { duration: 800 } });
    assert.equal(stub.list.dataset.autoScrolling, 'true');
    mod.cancelScrollAnimation(stub.list);
    await Promise.all([first, second]);
    assert.equal(stub.list.dataset.autoScrolling, undefined);
  } finally {
    stub.restore();
  }
});
