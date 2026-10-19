import assert from 'node:assert/strict';
import test from 'node:test';

function makeHarness({ away = false, turnHold = false, turnSettling = false, retry = false } = {}) {
  const frames = [];
  const observers = [];
  const scrollListeners = new Set();
  const previous = {
    ResizeObserver: globalThis.ResizeObserver,
    MutationObserver: globalThis.MutationObserver,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    window: globalThis.window,
    document: globalThis.document,
  };
  class FakeResizeObserver {
    constructor(callback) { this.callback = callback; this.targets = []; observers.push(this); }
    observe(target) { this.targets.push(target); }
    disconnect() {}
    deliver(entries = []) { this.callback(entries, this); }
  }
  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; }
    observe() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = FakeResizeObserver;
  globalThis.MutationObserver = FakeMutationObserver;
  globalThis.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
  globalThis.cancelAnimationFrame = () => {};

  const message = {
    offsetHeight: 100,
    getAttribute(name) { return name === 'data-viewport-anchor' && retry ? 'retry' : null; },
  };
  const list = {
    scrollHeight: 1000, scrollTop: 400, clientHeight: 600, dataset: {},
    addEventListener(type, listener) { if (type === 'scroll') scrollListeners.add(listener); },
    removeEventListener(type, listener) { if (type === 'scroll') scrollListeners.delete(listener); },
    querySelectorAll(selector) { return selector === ':scope > .msg' ? [message] : []; },
    querySelector(selector) { return selector === '.turn-viewport-anchor' && (turnHold || turnSettling) ? {} : null; },
  };
  if (turnHold) list.dataset.turnAnchorHold = 'true';
  if (turnSettling) list.dataset.turnAnchorSettling = 'true';
  const chatView = { addEventListener() {}, removeEventListener() {} };
  globalThis.document = {
    documentElement: { dataset: {}, style: { getPropertyValue() { return ''; } } },
    querySelector(selector) { return selector === '#chatView, .chat-view' ? chatView : null; },
    getElementById() { return list; },
  };
  globalThis.window = { stateStore: { read(key) { return key === '_userScrolledAway' && away; } } };

  function restore() {
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) delete globalThis[key];
      else globalThis[key] = previous[key];
    }
  }
  function flushFrames() { while (frames.length) frames.shift()(0); }
  function fireGrowth({ grow = true, scrollBeforeResize = false, amount = 20, flush = true } = {}) {
    const messageObserver = observers.find(observer => observer.targets.includes(message));
    assert.ok(messageObserver, 'the newest message is observed');
    if (grow) {
      message.offsetHeight += amount;
      list.scrollHeight += amount;
    }
    if (scrollBeforeResize) for (const listener of scrollListeners) listener();
    /* Use the platform ResizeObserver callback contract: entries array, then observer. */
    messageObserver.deliver([{ target: message, contentRect: { height: message.offsetHeight } }]);
    assert.ok(frames.length, 'observer delivery schedules content-follow evaluation');
    if (flush) flushFrames();
  }
  return { list, restore, fireGrowth, flushFrames, frames };
}

test('ResizeObserver follows a pinned reader when the newest message grows without a mutation', async () => {
  const h = makeHarness();
  try {
    const { initChatComposerReserve } = await import('../src/ui/scroll.js');
    const dispose = initChatComposerReserve({ list: h.list });
    try {
      h.fireGrowth();
      assert.equal(h.list.scrollTop, 420, 'pure resize follows the new bottom');
    } finally { dispose(); }
  } finally { h.restore(); }
});

test('a queued scroll event cannot consume growth before ResizeObserver sees it', async () => {
  const h = makeHarness();
  try {
    const { initChatComposerReserve } = await import('../src/ui/scroll.js');
    const dispose = initChatComposerReserve({ list: h.list });
    try {
      h.fireGrowth({ grow: false });
      h.fireGrowth({ scrollBeforeResize: true });
      assert.equal(h.list.scrollTop, 420, 'the new height must still trigger content-follow');
    } finally { dispose(); }
  } finally { h.restore(); }
});

test('coalesced resize notifications follow the final height using one content frame', async () => {
  const h = makeHarness();
  try {
    const { initChatComposerReserve } = await import('../src/ui/scroll.js');
    const dispose = initChatComposerReserve({ list: h.list });
    try {
      h.fireGrowth({ grow: false });
      h.fireGrowth({ grow: false, flush: false });
      h.fireGrowth({ amount: 20, flush: false });
      assert.equal(h.frames.length, 1, 'notifications coalesce without a polling loop');
      h.flushFrames();
      assert.equal(h.list.scrollTop, 420, 'the frame sees growth after the first notification');
    } finally { dispose(); }
  } finally { h.restore(); }
});

test('ResizeObserver content growth does not follow when user intent or an anchor owns the viewport', async (t) => {
  for (const [name, options] of [
    ['reader scrolled away', { away: true }],
    ['turn anchor hold', { turnHold: true }],
    ['turn anchor settling', { turnSettling: true }],
    ['retry viewport anchor', { retry: true }],
  ]) {
    await t.test(name, async () => {
      const h = makeHarness(options);
      try {
        const { initChatComposerReserve } = await import('../src/ui/scroll.js');
        const dispose = initChatComposerReserve({ list: h.list });
        try {
          h.fireGrowth();
          assert.equal(h.list.scrollTop, 400, 'the existing viewport position is preserved');
          assert.notEqual(h.list.dataset.autoScrolling, 'true');
        } finally { dispose(); }
      } finally { h.restore(); }
    });
  }
});

test('ResizeObserver does not follow when the newest message did not grow', async () => {
  const h = makeHarness();
  try {
    const { initChatComposerReserve } = await import('../src/ui/scroll.js');
    const dispose = initChatComposerReserve({ list: h.list });
    try {
      h.fireGrowth({ grow: false });
      assert.equal(h.list.scrollTop, 400);
      assert.notEqual(h.list.dataset.autoScrolling, 'true');
    } finally { dispose(); }
  } finally { h.restore(); }
});
