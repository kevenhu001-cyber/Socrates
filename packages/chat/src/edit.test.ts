import assert from 'node:assert/strict';
import test from 'node:test';
import { applyEdit, applyRegenerate, buildBranchSession, findRegenerateTarget, rollbackAfter } from './edit.ts';
import type { Message, Session } from '@socrates/contracts';

const user = (clientId: string, rawText: string): Message => ({ clientId, role: 'user', rawText });
const assistant = (clientId: string, rawText: string): Message => ({ clientId, role: 'assistant', rawText });
const thread = (): Message[] => [user('u1', 'first'), assistant('a1', 'reply one'), user('u2', 'second'), assistant('a2', 'reply two')];

test('rollbackAfter keeps the anchor and reports the dropped tail', () => {
  const rolled = rollbackAfter(thread(), 'u1')!;
  assert.deepEqual(rolled.kept.map((m) => m.clientId), ['u1']);
  assert.deepEqual(rolled.dropped.map((m) => m.clientId), ['a1', 'u2', 'a2']);
});

test('rollbackAfter returns null for an unknown anchor', () => {
  assert.equal(rollbackAfter(thread(), 'missing'), null);
});

test('applyEdit rewrites the user turn and drops everything after it', () => {
  const result = applyEdit(thread(), 'u1', 'first, revised')!;
  assert.equal(result.edited.rawText, 'first, revised');
  assert.deepEqual(result.kept.map((m) => m.clientId), ['u1']);
  assert.deepEqual(result.dropped.map((m) => m.clientId), ['a1', 'u2', 'a2']);
});

test('applyEdit rejects assistant anchors, blank text and no-ops', () => {
  assert.equal(applyEdit(thread(), 'a1', 'changed'), null);
  assert.equal(applyEdit(thread(), 'u1', '   '), null);
  assert.equal(applyEdit(thread(), 'u1', 'first'), null);
  assert.equal(applyEdit(thread(), 'missing', 'changed'), null);
});

test('regenerate targets the user turn behind the assistant reply', () => {
  assert.equal(findRegenerateTarget(thread(), 'a2')?.clientId, 'u2');
  // A mid-thread regenerate walks back past later turns to the nearest user.
  assert.equal(findRegenerateTarget(thread(), 'a1')?.clientId, 'u1');
  assert.equal(findRegenerateTarget(thread(), 'missing'), null);
});

test('applyRegenerate rewinds to the user turn and drops the stale tail', () => {
  const result = applyRegenerate(thread(), 'a2')!;
  assert.equal(result.target.clientId, 'u2');
  assert.deepEqual(result.kept.map((m) => m.clientId), ['u1', 'a1', 'u2']);
  assert.deepEqual(result.dropped.map((m) => m.clientId), ['a2']);
});

test('applyRegenerate needs a preceding user turn with text', () => {
  assert.equal(applyRegenerate([assistant('a1', 'orphan')], 'a1'), null);
});

test('branching forks the transcript up to the anchor without live fields', () => {
  const source: Session = {
    id: 'source', topic: 'Algebra', title: 'Algebra help', mode: 'chat',
    archivedAt: '2026-01-01', streamingText: 'partial', messages: thread(),
  };
  const forked = buildBranchSession(source, 'a1', { id: 'branch-1' })!;
  assert.equal(forked.id, 'branch-1');
  assert.equal(forked.title, 'Algebra help (branch)');
  assert.deepEqual(forked.messages?.map((m) => m.clientId), ['u1', 'a1']);
  assert.equal(forked.archivedAt, null);
  assert.equal(forked.streamingText, null);
  assert.deepEqual(forked.branchedFrom, { sessionId: 'source', messageId: 'a1' });
  // The source transcript is untouched.
  assert.equal(source.messages?.length, 4);
});

test('branching rejects unknown anchors and empty ids', () => {
  const source: Session = { id: 'source', topic: '', mode: 'chat', messages: thread() };
  assert.equal(buildBranchSession(source, 'missing', { id: 'b' }), null);
  assert.equal(buildBranchSession(source, 'u1', { id: '' }), null);
});
