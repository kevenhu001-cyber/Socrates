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

test('public domain stores cannot bypass actions and split the bridge snapshot', () => {
  const domain = createDomainStore({
    initial: { value: 0, revision: 0 },
    reducer: (state, value) => ({ ...state, value }),
  });
  assert.equal(domain.store.setState, undefined);
  assert.ok(Object.isFrozen(domain.store));
  assert.throws(() => { domain.store.setState = () => {}; }, TypeError);
  const seen = [];
  const dispose = domain.store.subscribe((state) => seen.push(state));
  domain.bridge.dispatch(42);
  domain.bridge.flush();
  assert.strictEqual(domain.store.getState(), domain.bridge.getSnapshot());
  assert.strictEqual(seen[0], domain.bridge.getSnapshot());
  assert.equal(domain.store.getInitialState().value, 0);
  dispose();
});

test('new stores reject nested writes and preserve old snapshots across actions', () => {
  const domain = createDomainStore({
    initial: { items: [{ text: 'before' }], revision: 0 },
    reducer: (state, text) => ({ ...state, items: [{ text }] }),
  });
  const before = domain.store.getState();
  assert.throws(() => before.items.push({ text: 'bypass' }), TypeError);
  assert.throws(() => { before.items[0].text = 'bypass'; }, TypeError);
  domain.bridge.dispatch('after');
  domain.bridge.flush();
  assert.equal(before.items[0].text, 'before');
  assert.equal(domain.store.getState().items[0].text, 'after');
  assert.equal(domain.store.getState().revision, 1);
  assert.ok(Object.isFrozen(domain.store.getState().items));
});

test('a reducer that attempts an in-place write cannot corrupt a frozen snapshot', () => {
  const domain = createDomainStore({
    initial: { items: ['original'], revision: 0 },
    reducer: (state) => { state.items.push('bad'); return state; },
  });
  const before = domain.store.getState();
  let notifications = 0;
  domain.store.subscribe(() => { notifications += 1; });
  const originalError = console.error;
  const originalWarn = console.warn;
  try {
    console.error = () => {};
    console.warn = () => {};
    domain.bridge.dispatch('mutate');
    domain.bridge.flush();
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
  assert.strictEqual(domain.store.getState(), before);
  assert.deepEqual(before.items, ['original']);
  assert.equal(notifications, 0);
});
