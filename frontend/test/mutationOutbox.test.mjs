import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

/* The outbox is the only thing standing between an offline edit and a
   silent data loss: POST /api/sessions upserts rows but never deletes
   them, so without a replay queue a failed discardFollowing leaves the
   old replies on the server and a hard reload resurrects them. These
   tests pin the three properties that actually matter:

     1. queued ops survive a reload (localStorage, not memory),
     2. a drain never re-asserts "delete everything after the anchor" —
        it names rows explicitly, so turns made after the reconnect
        survive,
     3. every op is idempotent, so an interrupted drain can resume. */

const STORAGE_KEY = 'socrates-msg-outbox-v1';

/* apiFetch reads the CSRF cookie off `document` before every mutating
   request, so a DOM is required — without it the call throws before it
   ever reaches fetch() and every drain would look like a silent no-op. */
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });

let calls = [];
let responses = [];
let previous = {};

function installMocks() {
  calls = [];
  responses = [];
  const store = new Map();
  previous = {
    localStorage: globalThis.localStorage,
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    fetch: globalThis.fetch,
  };

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  /* jsdom's navigator.onLine is read-only; defineProperty is the only
     way to make the module's connectivity check see a live network. */
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, method: (opts && opts.method) || 'GET', body: opts && opts.body });
    const next = responses.shift();
    if (!next) return { ok: true, status: 204, headers: new Map(), text: async () => '' };
    /* A transport failure surfaces from apiFetch as status 0; an HTTP
       error has to come back as a real non-ok Response, because that is
       the path that preserves the status code the outbox keys off. */
    if (next.status) {
      return {
        ok: false,
        status: next.status,
        statusText: 'Error',
        headers: new Map(),
        text: async () => JSON.stringify({ message: 'gone' }),
      };
    }
    throw new Error('network down');
  };
}

function teardown() {
  if (previous.localStorage !== undefined) globalThis.localStorage = previous.localStorage;
  if (previous.window !== undefined) globalThis.window = previous.window;
  if (previous.document !== undefined) globalThis.document = previous.document;
  if (previous.navigator !== undefined) {
    Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  }
  if (previous.fetch !== undefined) globalThis.fetch = previous.fetch;
}

installMocks();
const { queueMessageOp, drainMessageOutbox, pendingOpCount, readQueueForTest } =
  await import('../src/session/mutationOutbox.js');
teardown();

test('a failed edit is queued and survives a reload', () => {
  installMocks();
  try {
    queueMessageOp('11111111-1111-4111-8111-111111111111', 'msg-anchor', 'patch', 'edited text');
    queueMessageOp('11111111-1111-4111-8111-111111111111', 'msg-old-a', 'delete');
    queueMessageOp('11111111-1111-4111-8111-111111111111', 'msg-old-b', 'delete');

    assert.equal(pendingOpCount(), 3);
    /* Simulated reload: a fresh module instance must still see the queue.
       This is the whole point — the dominant failure is the user closing
       the tab while still offline. */
    const persisted = JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY));
    assert.equal(persisted.length, 3);
    assert.equal(persisted[0].type, 'patch');
    assert.equal(persisted[0].content, 'edited text');
  } finally {
    teardown();
  }
});

test('drain replays the edit as explicit ops, never as discardFollowing', async () => {
  installMocks();
  try {
    queueMessageOp(null, 'msg-anchor', 'patch', 'edited text');
    queueMessageOp(null, 'msg-old-a', 'delete');
    queueMessageOp(null, 'msg-old-b', 'delete');

    const done = await drainMessageOutbox();

    assert.equal(done, 3);
    assert.equal(calls.length, 3);
    assert.equal(pendingOpCount(), 0);

    /* The text is rewritten WITHOUT discardFollowing. Re-asserting the
       server's "delete every row after the anchor" rule here would delete
       the turns the user produced while the network was down — the exact
       data this queue exists to protect. */
    const patch = calls.find((c) => c.method === 'PATCH');
    assert.ok(patch, 'expected a PATCH for the edited turn');
    const body = JSON.parse(patch.body);
    assert.equal(body.content, 'edited text');
    assert.equal(body.discardFollowing, false);
    assert.equal(body.regenerate, false);

    /* Deletes are addressed one row at a time, never as a range. */
    const deletes = calls.filter((c) => c.method === 'DELETE');
    assert.equal(deletes.length, 2);
    assert.ok(deletes[0].url.includes('msg-old-a'));
    assert.ok(deletes[1].url.includes('msg-old-b'));
  } finally {
    teardown();
  }
});

test('a row that is already gone counts as success', async () => {
  installMocks();
  try {
    queueMessageOp(null, 'msg-gone', 'delete');
    responses = [{ status: 404 }];

    const done = await drainMessageOutbox();

    assert.equal(done, 1, 'a 404 delete is idempotent success');
    assert.equal(pendingOpCount(), 0);
  } finally {
    teardown();
  }
});

test('a real failure halts the drain and keeps the rest queued', async () => {
  installMocks();
  try {
    queueMessageOp(null, 'msg-1', 'delete');
    queueMessageOp(null, 'msg-2', 'delete');
    responses = [{ status: 500 }];

    const done = await drainMessageOutbox();

    /* Stop at the first genuine failure rather than hammering a network
       that just came back. Both ops stay queued for the next attempt. */
    assert.equal(done, 0);
    assert.equal(calls.length, 1);
    assert.equal(pendingOpCount(), 2);
  } finally {
    teardown();
  }
});

test('progress is persisted as the drain runs, so an interrupted pass resumes', async () => {
  installMocks();
  try {
    queueMessageOp(null, 'msg-1', 'delete');
    queueMessageOp(null, 'msg-2', 'delete');
    /* First op succeeds (null = default 204), second hits a real error. */
    responses = [null, { status: 500 }];

    const done = await drainMessageOutbox();

    assert.equal(done, 1);
    /* The accepted op is already gone from storage — a tab close here
       must not replay work the server already acknowledged. */
    const left = JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY));
    assert.equal(left.length, 1);
    assert.equal(left[0].id, 'msg-2');
  } finally {
    teardown();
  }
});

test('editing the same turn twice offline keeps the newest text', async () => {
  installMocks();
  try {
    queueMessageOp(null, 'msg-anchor', 'patch', 'first try');
    queueMessageOp(null, 'msg-anchor', 'patch', 'second try');

    await drainMessageOutbox();

    const patches = calls.filter((c) => c.method === 'PATCH');
    assert.equal(patches.length, 2);
    /* Applied in order, so the last write wins — which is the text the
       user last saw on screen. */
    assert.equal(JSON.parse(patches[0].body).content, 'first try');
    assert.equal(JSON.parse(patches[1].body).content, 'second try');
  } finally {
    teardown();
  }
});

test('a corrupt or absent storage never breaks queuing', () => {
  installMocks();
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, '{not json');
    assert.equal(pendingOpCount(), 0);
    /* Must not throw even with unusable storage. */
    queueMessageOp(null, 'msg-1', 'delete');
    assert.equal(pendingOpCount(), 1);
  } finally {
    teardown();
  }
});

test('bad queue entries are discarded on read', () => {
  installMocks();
  try {
    globalThis.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: 'ok', type: 'delete' }, { type: 'delete' }, { id: 'x', type: 'nope' }, null]),
    );
    const kept = readQueueForTest();
    assert.equal(kept.length, 1);
    assert.equal(kept[0].id, 'ok');
  } finally {
    teardown();
  }
});
