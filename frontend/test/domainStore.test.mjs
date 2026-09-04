import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.window = {};

const { createDomainStore } = await import('../src/store/createDomainStore.ts');
const { sessionBridge, sessionStore } = await import('../src/state/bridges.ts');
const { stateStore } = await import('../src/state/store.js');

test('createDomainStore reproduces the bridge contract: revision, batching, reset', async () => {
  const initial = { value: 0, tags: [], revision: 0 };
  const store = createDomainStore({
    initial,
    reducer: (state, action) => {
      switch (action.type) {
        case 'set':
          return { ...state, value: action.value };
        case 'noop':
          return state;
        default:
          return state;
      }
    },
  });

  const seen = [];
  const dispose = store.bridge.subscribe(() => seen.push(store.bridge.getSnapshot().revision));
  store.bridge.dispatch({ type: 'set', value: 1 });
  store.bridge.flush();
  assert.equal(store.bridge.getSnapshot().value, 1);
  assert.equal(store.bridge.getSnapshot().revision, 1);

  // A reducer that returns the same snapshot must not bump the revision
  // or notify subscribers.
  store.bridge.dispatch({ type: 'noop' });
  store.bridge.flush();
  assert.equal(store.bridge.getSnapshot().revision, 1);

  // The zustand store mirrors the committed snapshot.
  assert.equal(store.store.getState().value, 1);
  assert.equal(store.store.getState().revision, 1);
  dispose();
  assert.deepEqual(seen, [1]);

  // Reset restores the initial snapshot (and notifies remaining
  // subscribers, like the bridge it replaces).
  store.bridge.__resetForTests();
  assert.equal(store.bridge.getSnapshot().value, 0);
  assert.equal(store.bridge.getSnapshot().revision, 0);
});

test('the six domain namespaces ride the zustand stores without facade changes', () => {
  const before = sessionBridge.getSnapshot();
  stateStore.dispatch({ type: 'session/append-message', payload: { clientId: 'z-1', role: 'user', rawText: 'hi' } });
  const after = sessionBridge.getSnapshot();
  assert.equal(after.messages.length, 1);
  assert.equal(after.revision, before.revision + 1);
  // The zustand vanilla store mirrors the committed snapshot object.
  assert.strictEqual(sessionStore.getState(), after);
});
