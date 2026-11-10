import assert from 'node:assert/strict';
import test from 'node:test';
import { stateStore, resetState } from '../src/state/store.ts';

function box(top = 0) { return { top, bottom: top + 500, height: 500 }; }
async function withViewport(run) {
  const old = { requestAnimationFrame: globalThis.requestAnimationFrame, window: globalThis.window };
  const frames = [];
  const listeners = new Map();
  const intentEvents = new Set(['wheel', 'touchstart', 'pointerdown', 'keydown']);
  globalThis.requestAnimationFrame = cb => (frames.push(cb), frames.length);
  globalThis.window = {
    addEventListener(name, cb) {
      if (intentEvents.has(name)) listeners.set(name, cb);
    },
    removeEventListener(name) { listeners.delete(name); },
  };
  resetState();
  stateStore.dispatch({ type: 'session/set', key: 'currentSessionId', value: 's1' });
  stateStore.dispatch({ type: 'session/append-message', payload: { clientId: 'assistant-old' } });
  const scroller = {
    scrollTop: 400, scrollHeight: 1200, clientHeight: 500,
    getBoundingClientRect: () => box(), querySelectorAll: () => [], querySelector: () => null,
  };
  const state = { reactLive: true, list: scroller, div: { isConnected: false }, clientId: 'assistant-old', msgIdx: 0 };
  try {
    const { createFinishViewport } = await import('../src/chat/turn/finishViewport.ts');
    const viewport = createFinishViewport(state);
    viewport.capture();
    viewport.settle();
    assert.equal(frames.length, 1);
    await run({ frames, listeners, scroller });
  } finally {
    resetState();
    if (old.requestAnimationFrame === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = old.requestAnimationFrame;
    if (old.window === undefined) delete globalThis.window; else globalThis.window = old.window;
  }
}

test('finish settle permanently stops when a newer message appears', async () => {
  await withViewport(({ frames, listeners, scroller }) => {
    // The queued prompt starts while the old finish still has frames pending.
    stateStore.dispatch({ type: 'session/append-message', payload: { clientId: 'user-new' } });
    scroller.scrollTop = 682;
    frames.shift()(0);
    assert.equal(scroller.scrollTop, 682, 'old finish must not restore its captured position');
    assert.equal(frames.length, 0, 'no successor settle frame is scheduled');
    assert.equal(listeners.size, 0, 'intent listeners are detached on permanent stop');
  });
});

test('finish settle stops across a session change even when the tail id is unchanged', async () => {
  await withViewport(({ frames, listeners, scroller }) => {
    stateStore.dispatch({ type: 'session/set', key: 'currentSessionId', value: 's2' });
    scroller.scrollTop = 682;
    frames.shift()(0);
    assert.equal(scroller.scrollTop, 682);
    assert.equal(frames.length, 0);
    assert.equal(listeners.size, 0);
  });
});

test('same-turn finish keeps restoring its capture for at most 30 frames', async () => {
  await withViewport(({ frames, listeners, scroller }) => {
    /* settle() no longer corrects synchronously — it defers the first
       correction to the next animation frame (P_stream-finish-paint, see
       chat/turn/finishViewport.ts), so every correction here comes from a
       queued frame. Count them and hold the documented 30-frame bound. */
    let corrections = 0;
    while (frames.length) {
      scroller.scrollTop = 450;
      frames.shift()(0);
      assert.equal(scroller.scrollTop, 400, 'same-turn layout still preserves the captured viewport');
      corrections += 1;
      assert.ok(corrections <= 30, 'finish remains bounded');
    }
    assert.equal(corrections, 30);
    assert.equal(listeners.size, 0);
  });
});

test('user intent permanently cancels the pending finish correction', async () => {
  await withViewport(({ frames, listeners, scroller }) => {
    listeners.get('wheel')();
    scroller.scrollTop = 200;
    frames.shift()(0);
    assert.equal(scroller.scrollTop, 200);
    assert.equal(frames.length, 0);
    assert.equal(listeners.size, 0);
  });
});
