import assert from 'node:assert/strict';
import test from 'node:test';

/*
 * smoothScrollToBottom() lives in browser-only code, but its contract is
 * testable with a hand-rolled scrollable stub. The stub honours the same
 * options-object signature as Element.scrollTo (Element.scrollTo is not
 * implemented in jsdom) and records every call so the tests can assert
 * the exact behaviour the send / keyboard-open paths depend on.
 */

function makeStub({ reducedMotion = false } = {}) {
  const calls = [];
  const list = {
    scrollHeight: 2000,
    scrollTop: 0,
    clientHeight: 600,
    dataset: {},
    scrollTo(opts) {
      calls.push({ kind: 'options', value: opts });
      this.scrollTop = opts.top;
      if (opts.behavior === 'smooth') {
        /* Mirror the platform contract: scrollTo({behavior:'smooth'})
           returns a Promise that resolves once the smooth-scroll
           animation completes. Defer resolution to a microtask so the
           caller can observe the data-auto-scrolling flag while the
           animation is "in flight". */
        return new Promise((resolve) => {
          queueMicrotask(() => resolve());
        });
      }
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
  return { list, calls, restore() { globalThis.matchMedia = previousMatchMedia; } };
}

test('smoothScrollToBottom writes scrollHeight via options-object scrollTo', async () => {
  const stub = makeStub();
  try {
    const mod = await import('../src/ui/scroll.js');
    /* Capture the dataset while the (stub-synchronous) smooth scroll is
       in flight, then verify it clears once the promise settles. */
    let observed;
    const ret = (function () {
      const out = mod.smoothScrollToBottom(stub.list, { smooth: true });
      observed = stub.list.dataset.autoScrolling;
      return out;
    })();
    /* The flag was set during the call even though the stub resolves
       immediately. After awaiting the returned promise, the settle
       handler runs and clears it. */
    if (ret && typeof ret.then === 'function') await ret;
    assert.equal(stub.calls.length, 1);
    assert.equal(stub.calls[0].kind, 'options');
    assert.equal(stub.calls[0].value.top, 2000);
    assert.equal(stub.calls[0].value.behavior, 'smooth');
    assert.equal(stub.list.scrollTop, 2000);
    assert.equal(observed, 'true', 'flag must be set during the smooth scroll');
    assert.equal(stub.list.dataset.autoScrolling, undefined, 'flag must clear after settle');
  } finally {
    stub.restore();
  }
});

test('smoothScrollToBottom degrades to auto under prefers-reduced-motion', async () => {
  const stub = makeStub({ reducedMotion: true });
  try {
    const mod = await import('../src/ui/scroll.js');
    mod.smoothScrollToBottom(stub.list, { smooth: true });
    assert.equal(stub.calls[0].value.behavior, 'auto');
  } finally {
    stub.restore();
  }
});

test('smoothScrollToBottom honours explicit smooth:false (streaming path)', async () => {
  const stub = makeStub();
  try {
    const mod = await import('../src/ui/scroll.js');
    mod.smoothScrollToBottom(stub.list, { smooth: false });
    assert.equal(stub.calls[0].value.behavior, 'auto');
  } finally {
    stub.restore();
  }
});

test('smoothScrollToBottom is a no-op when the list is missing', async () => {
  const stub = makeStub();
  try {
    const mod = await import('../src/ui/scroll.js');
    assert.doesNotThrow(() => mod.smoothScrollToBottom(null));
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
});

test('smoothScrollToBottom sets and clears data-auto-scrolling', async () => {
  const stub = makeStub();
  try {
    const mod = await import('../src/ui/scroll.js');
    const ret = mod.smoothScrollToBottom(stub.list, { smooth: true });
    /* Flag must be set during the smooth scroll. */
    assert.equal(stub.list.dataset.autoScrolling, 'true');
    /* After the returned promise settles, the flag must clear. */
    if (ret && typeof ret.then === 'function') await ret;
    assert.equal(stub.list.dataset.autoScrolling, undefined);
  } finally {
    stub.restore();
  }
});

test('smoothScrollToBottom preserves previous data-auto-scrolling on settle', async () => {
  const stub = makeStub();
  stub.list.dataset.autoScrolling = 'true';  /* pre-existing flag */
  try {
    const mod = await import('../src/ui/scroll.js');
    const ret = mod.smoothScrollToBottom(stub.list, { smooth: true });
    if (ret && typeof ret.then === 'function') await ret;
    /* A pre-existing flag must be left intact — settling our flag must
       not clobber an outer caller's claim. */
    assert.equal(stub.list.dataset.autoScrolling, 'true');
  } finally {
    stub.restore();
  }
});