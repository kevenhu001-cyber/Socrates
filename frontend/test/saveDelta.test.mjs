/* P_incremental-save — unit tests for the delta payload builder.
 *
 * Pure logic, no DOM globals: session/saveDelta.js was extracted from
 * persistence.js precisely so this is testable (same pattern as
 * session/beacon.js). The properties pinned here are the ones that
 * would silently corrupt a conversation if they broke:
 *   - an unchanged message is never re-sent
 *   - an edited message IS re-sent even at identical length
 *   - the watermark advances only when the caller says so
 *   - rows without a stable id are always sent
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeltaPayload,
  commitSynced,
  createFingerprintCache,
  messageDelta,
  messageFingerprint,
  seedSynced,
  stateFingerprint,
} from '../src/session/saveDelta.js';

function msg(clientId, rawText, extra) {
  return Object.assign({ clientId, role: 'user', rawText, html: null, type: null }, extra || {});
}

test('a freshly loaded session produces an empty delta', () => {
  const fp = createFingerprintCache();
  const synced = new Map();
  const loaded = [msg('a', 'first'), msg('b', 'second'), msg('c', 'third')];
  seedSynced(synced, loaded, fp);
  assert.deepEqual(messageDelta(synced, loaded, fp), []);
});

test('appending one message sends only that message', () => {
  const fp = createFingerprintCache();
  const synced = new Map();
  const before = [msg('a', 'first'), msg('b', 'second')];
  seedSynced(synced, before, fp);
  const after = before.concat([msg('c', 'third')]);
  const delta = messageDelta(synced, after, fp);
  assert.equal(delta.length, 1);
  assert.equal(delta[0].clientId, 'c');
});

test('an edited message is re-sent even when the new text is the same length', () => {
  /* The old whole-payload signature compared only string lengths, so a
     same-length edit could look unchanged and be dropped. The delta uses
     a real content hash precisely to close that hole. */
  const fp = createFingerprintCache();
  const synced = new Map();
  const before = [msg('a', 'hello world')];
  seedSynced(synced, before, fp);
  const after = [msg('a', 'HELLO WORLD')];
  assert.equal(before[0].rawText.length, after[0].rawText.length);
  const delta = messageDelta(synced, after, fp);
  assert.equal(delta.length, 1, 'same-length edit must still be transmitted');
});

test('a mid-conversation edit re-sends that row and nothing else', () => {
  const fp = createFingerprintCache();
  const synced = new Map();
  const before = [msg('a', 'one'), msg('b', 'two'), msg('c', 'three')];
  seedSynced(synced, before, fp);
  const after = [msg('a', 'one'), msg('b', 'TWO edited'), msg('c', 'three')];
  const delta = messageDelta(synced, after, fp);
  assert.equal(delta.length, 1);
  assert.equal(delta[0].clientId, 'b');
});

test('a row whose type changes is treated as dirty', () => {
  const fp = createFingerprintCache();
  const synced = new Map();
  seedSynced(synced, [msg('a', 'same text')], fp);
  const streamed = messageDelta(synced, [msg('a', 'same text', { type: 'assistant' })], fp);
  assert.equal(streamed.length, 1, 'streaming -> assistant transition must persist');
});

test('a row that gains its rendered html is treated as dirty', () => {
  /* Regression: the fingerprint memo used to compare rawText ONLY. The
     redraw path (restoreMessageBody / the post-finish render) sets html
     while rawText keeps the same string reference, so a rawText-only
     memo returned the stale fingerprint and the html was never sent. */
  const fp = createFingerprintCache();
  const synced = new Map();
  const bare = msg('a', 'rendered once');
  seedSynced(synced, [bare], fp);
  const redrawn = msg('a', 'rendered once', { html: '<p>rendered once</p>' });
  const delta = messageDelta(synced, [redrawn], fp);
  assert.equal(delta.length, 1, 'an html-only change must still be transmitted');
});

test('the watermark only advances when the caller commits', () => {
  const fp = createFingerprintCache();
  const synced = new Map();
  const batch = [msg('a', 'first'), msg('b', 'second')];
  /* Not committed yet — a retry must resend the same rows. */
  assert.equal(messageDelta(synced, batch, fp).length, 2);
  commitSynced(synced, batch, fp);
  assert.equal(messageDelta(synced, batch, fp).length, 0);
});

test('rows without a stable id are always sent', () => {
  const fp = createFingerprintCache();
  const synced = new Map();
  const anonymous = [{ role: 'user', rawText: 'no id', html: null }];
  commitSynced(synced, anonymous, fp);
  /* Nothing was recorded, so it must not be silently skipped. */
  assert.equal(messageDelta(synced, anonymous, fp).length, 1);
});

test('buildDeltaPayload keeps session scalars and replaces only messages', () => {
  const fp = createFingerprintCache();
  const synced = new Map();
  const before = [msg('a', 'first')];
  seedSynced(synced, before, fp);
  const payload = buildDeltaPayload(
    { id: 's1', title: 'Math', topic: 'math', kbNodes: [1, 2], messages: before.concat([msg('b', 'new')]) },
    synced,
    fp,
  );
  assert.equal(payload.id, 's1');
  assert.equal(payload.title, 'Math');
  assert.deepEqual(payload.kbNodes, [1, 2]);
  assert.equal(payload.messages.length, 1);
  assert.equal(payload.messages[0].clientId, 'b');
});

test('an empty delta still carries the session scalars', () => {
  /* The server must be able to persist a title/phase change on its own,
     with zero message rows to write. */
  const fp = createFingerprintCache();
  const synced = new Map();
  const before = [msg('a', 'first')];
  seedSynced(synced, before, fp);
  const payload = buildDeltaPayload({ id: 's1', title: 'Renamed', messages: before }, synced, fp);
  assert.deepEqual(payload.messages, []);
  assert.equal(payload.title, 'Renamed');
});

test('watermarks are per session, not global', () => {
  const fp = createFingerprintCache();
  const a = new Map();
  const b = new Map();
  const messages = [msg('a', 'first')];
  seedSynced(a, messages, fp);
  assert.equal(messageDelta(a, messages, fp).length, 0);
  assert.equal(messageDelta(b, messages, fp).length, 1, 'a different session has not sent these yet');
});

test('the fingerprint memo tracks content, not just identity', () => {
  const cache = createFingerprintCache();
  const first = msg('a', 'alpha');
  const fp1 = cache.of(first);
  /* Same object reference — memoised. */
  assert.equal(cache.of(first), fp1);
  /* New object, different text — different fingerprint. */
  const second = msg('a', 'beta');
  assert.notEqual(cache.of(second), fp1);
  /* And the memo must not hand back the stale value afterwards. */
  assert.equal(cache.of(second), messageFingerprint(second));
});

test('stateFingerprint separates distinct tutor state', () => {
  assert.notEqual(stateFingerprint({ node: 'a' }), stateFingerprint({ node: 'b' }));
  assert.equal(stateFingerprint({ node: 'a' }), stateFingerprint({ node: 'a' }));
  /* null and undefined both mean "no tutor state" and MUST collide —
     treating them as different would fire a pointless save every turn. */
  assert.equal(stateFingerprint(null), stateFingerprint(undefined));
});
