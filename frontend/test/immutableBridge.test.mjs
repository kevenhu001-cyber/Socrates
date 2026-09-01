import assert from 'node:assert/strict';
import test from 'node:test';

import { createImmutableBridge } from '../src/lib/bridge/createImmutableBridge.ts';

function createFrameHarness() {
  const frames = new Map();
  let nextId = 1;
  return {
    window: {
      requestAnimationFrame(callback) {
        const id = nextId++;
        frames.set(id, callback);
        return id;
      },
      cancelAnimationFrame(id) {
        frames.delete(id);
      },
    },
    runFrame() {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback());
    },
    pendingFrames() {
      return frames.size;
    },
  };
}

test('immutable bridge reduces every queued action and notifies once per frame', () => {
  const harness = createFrameHarness();
  globalThis.window = harness.window;
  const bridge = createImmutableBridge({
    initial: { count: 0, nested: { value: 'initial' }, revision: 0 },
    reducer: (state, action) => ({
      ...state,
      count: state.count + action.amount,
      nested: { value: action.label },
    }),
  });
  let notifications = 0;
  bridge.subscribe(() => { notifications += 1; });

  bridge.dispatch({ amount: 1, label: 'first' });
  bridge.dispatch({ amount: 2, label: 'second' });

  assert.equal(harness.pendingFrames(), 1, 'dispatches share one frame');
  assert.equal(bridge.getSnapshot().count, 0, 'commit waits for the frame');
  harness.runFrame();

  assert.equal(bridge.getSnapshot().count, 3, 'no queued action is lost');
  assert.equal(bridge.getSnapshot().nested.value, 'second');
  assert.equal(bridge.getSnapshot().revision, 1, 'the factory owns revision bumps');
  assert.equal(notifications, 1, 'React subscribers render once');
  assert.ok(Object.isFrozen(bridge.getSnapshot()));
  assert.ok(Object.isFrozen(bridge.getSnapshot().nested));
});

test('immutable bridge reset cancels pending work and restores the initial snapshot', () => {
  const harness = createFrameHarness();
  globalThis.window = harness.window;
  const initial = { count: 4, revision: 0 };
  const bridge = createImmutableBridge({
    initial,
    reducer: (state, amount) => ({ count: state.count + amount }),
  });

  bridge.dispatch(3);
  bridge.__resetForTests();
  harness.runFrame();

  assert.deepEqual(bridge.getSnapshot(), initial);
  assert.equal(harness.pendingFrames(), 0);
});

test('immutable bridge skips notifications and revision bumps for no-op reducers', () => {
  const harness = createFrameHarness();
  globalThis.window = harness.window;
  const initial = { value: 'stable', revision: 0 };
  const bridge = createImmutableBridge({
    initial,
    reducer: (state) => state,
  });
  let notifications = 0;
  bridge.subscribe(() => { notifications += 1; });

  bridge.dispatch(undefined);
  harness.runFrame();

  assert.strictEqual(bridge.getSnapshot(), initial);
  assert.equal(bridge.getSnapshot().revision, 0);
  assert.equal(notifications, 0);
});
