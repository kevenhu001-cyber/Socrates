import assert from 'node:assert/strict';
import test from 'node:test';
import { sameSessionRow, sessionRowFields } from '../src/session/sessionRowModel.ts';

test('session row mapping normalizes legacy and current server fields', () => {
  assert.deepEqual(sessionRowFields({
    id: 'session-1',
    title: null,
    projectId: 12,
    project_id: 'project-1',
    topic: 'Fractions',
    updated_at: '2026-10-28T10:00:00Z',
    createdAt: '2026-10-27T10:00:00Z',
    total_q: 0,
    totalQ: 4,
    mode: 'chat',
    phase: 'done',
    kind: 'chat',
    pinned: 1,
    tags: ['math'],
    archivedAt: 'invalid',
    branchedFrom: { sessionId: 'parent', messageId: 'message-1', reExplain: true },
  }), {
    id: 'session-1', title: '', projectId: 'project-1', topic: 'Fractions',
    updatedAt: '2026-10-28T10:00:00Z', createdAt: '2026-10-27T10:00:00Z',
    totalQ: 4, mode: 'chat', phase: 'done', kind: 'chat', pinned: true,
    tags: ['math'], label: '', archivedAt: null,
    branchedFrom: { sessionId: 'parent', messageId: 'message-1', reExplain: true },
  });
});

test('session row equality compares branched source and tag contents', () => {
  const first = sessionRowFields({
    id: 'session-1', title: 'Math', tags: ['math', 'review'],
    branchedFrom: { sessionId: 'parent', messageId: 'message-1', reExplain: false },
  });
  const same = { ...first, tags: [...first.tags], branchedFrom: { ...first.branchedFrom } };

  assert.equal(sameSessionRow(first, same), true);
  assert.equal(sameSessionRow(first, { ...same, tags: ['review', 'math'] }), false);
  assert.equal(sameSessionRow(first, { ...same, branchedFrom: { ...same.branchedFrom, messageId: 'message-2' } }), false);
  assert.equal(sameSessionRow(first, { ...same, title: 'Different' }), false);
  assert.equal(sameSessionRow(undefined, same), false);
});
