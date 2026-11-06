import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TAIL_PAGE_SIZE,
  canLoadOlderHistory,
  getHistoryPagingSnapshot,
  normalizeDetailPage,
  olderRowCount,
  patchHistoryPaging,
  registerBeforeOlderRows,
  registerOlderHistoryLoader,
  requestAllOlderHistory,
  resetHistoryPaging,
  runBeforeOlderRows,
  sessionDetailPath,
  subscribeHistoryPaging,
} from '../src/session/historyPagingState.ts';
import { resolveMountedRows, INITIAL_ROWS } from '../src/react/message-list/progressiveMount.ts';
import { foldSave, lookup, store, _reset } from '../src/session/detailCache.ts';

const rows = (count, prefix = 'm') => Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}`, rawText: `row ${index}` }));
const cursor = { createdAt: '2026-01-01T00:00:00.123456Z', id: '11111111-1111-4111-8111-111111111111' };

test('the detail URL asks for one tail page', () => {
  assert.equal(sessionDetailPath('a b'), `/api/sessions/a%20b?tail=${TAIL_PAGE_SIZE}`);
});

test('normalizeDetailPage derives the older-row count and treats a missing page as complete', () => {
  const paged = normalizeDetailPage({ messages: rows(3), messagesPage: { hasMore: true, cursor, total: 10 } });
  assert.deepEqual(paged.messagesPage, { hasMore: true, cursor, total: 10, older: 7 });
  assert.equal(olderRowCount(paged), 7);

  // Saves fold rows into a cached copy later; the derived count must not move.
  paged.messages.push({ id: 'new' });
  assert.equal(olderRowCount(paged), 7);

  const legacy = normalizeDetailPage({ messages: rows(5) });
  assert.equal('messagesPage' in legacy, false);
  assert.equal(olderRowCount(legacy), 0);

  const broken = normalizeDetailPage({ messages: rows(2), messagesPage: { hasMore: true, cursor: { id: 'x' }, total: 9 } });
  assert.equal(broken.messagesPage.hasMore, false);
  assert.equal(broken.messagesPage.cursor, null);
  assert.equal(olderRowCount(broken), 0);
  assert.equal(normalizeDetailPage(null), null);
});

test('paging state notifies only on real changes and gates loading', async () => {
  registerOlderHistoryLoader(null);
  resetHistoryPaging('s1', true);
  let calls = 0;
  const off = subscribeHistoryPaging(() => { calls++; });
  patchHistoryPaging({ hasMore: true });
  assert.equal(calls, 0);
  patchHistoryPaging({ loading: true });
  assert.equal(calls, 1);
  assert.equal(getHistoryPagingSnapshot().loading, true);
  assert.equal(canLoadOlderHistory(), false, 'no loader registered, and a page is in flight');
  patchHistoryPaging({ loading: false });
  off();

  let pages = 3;
  registerOlderHistoryLoader(async ({ limit }) => {
    assert.equal(limit, 200);
    pages -= 1;
    patchHistoryPaging({ hasMore: pages > 0, pagedBack: true });
    return 50;
  });
  assert.equal(canLoadOlderHistory(), true);
  assert.equal(await requestAllOlderHistory(), 150);
  assert.equal(getHistoryPagingSnapshot().hasMore, false);
  assert.equal(getHistoryPagingSnapshot().pagedBack, true);

  resetHistoryPaging('s2', true);
  registerOlderHistoryLoader(async () => { patchHistoryPaging({ failed: true }); return 0; });
  assert.equal(await requestAllOlderHistory(), 0, 'a failed page stops the walk');
  registerOlderHistoryLoader(null);
  resetHistoryPaging(null, false);
});

test('the before-prepend hook is single-owner and unregisters cleanly', () => {
  const seen = [];
  const offA = registerBeforeOlderRows(() => seen.push('a'));
  const offB = registerBeforeOlderRows(() => seen.push('b'));
  runBeforeOlderRows();
  offA();
  runBeforeOlderRows();
  offB();
  runBeforeOlderRows();
  assert.deepEqual(seen, ['b', 'b']);
});

test('a prepend under a window pinned to its first row mounts nothing new', () => {
  const tail = rows(INITIAL_ROWS, 'tail');
  const first = resolveMountedRows(tail, { items: [], floor: null, ceiling: null, full: false });
  assert.equal(first.mounted.length, INITIAL_ROWS);
  assert.equal(first.floor, null);
  const older = rows(100, 'older');
  const next = older.concat(tail);
  // What the before-prepend hook does: pin the floor to the current first row.
  const pinned = resolveMountedRows(next, { items: tail, floor: tail[0].id, ceiling: null, full: false });
  assert.equal(pinned.replaced, false);
  assert.equal(pinned.start, 100);
  assert.deepEqual(pinned.mounted.map((row) => row.id), tail.map((row) => row.id));
});

test('folding a save into a cached tail page keeps its paging metadata', () => {
  _reset();
  const response = normalizeDetailPage({ id: 'S', kind: 'chat', messages: rows(2), messagesPage: { hasMore: true, cursor, total: 40 } });
  store('S', response);
  foldSave('S', { id: 'S', title: 'saved' }, [{ clientId: 'c-new', rawText: 'new' }]);
  const cached = lookup('S').response;
  assert.equal(cached.messages.length, 3);
  assert.equal(cached.title, 'saved');
  assert.deepEqual(cached.messagesPage, { hasMore: true, cursor, total: 40, older: 38 });
  assert.equal(olderRowCount(cached), 38);
  _reset();
});
