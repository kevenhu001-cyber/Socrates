import assert from 'node:assert/strict';
import test from 'node:test';

const { reconcileMessageSnapshots, snapshotMessage } = await import(
  '../src/react/chatRuntimeSnapshot.ts'
);

test('a published message snapshot is isolated from later legacy mutations', () => {
  const source = {
    clientId: 'm-1',
    role: 'assistant',
    type: 'streaming',
    rawText: 'hello',
    attachments: [{ id: 'a-1', name: 'note.txt' }],
    toolCalls: [{
      id: 't-1',
      name: 'web_search',
      phase: 'running',
      _run: { phase: 'running', durationMs: 10 },
      results: [{ title: 'before' }],
      artifacts: [{ id: 'artifact-1', name: 'before.txt' }],
      visualization: { kind: 'bar' },
    }],
    _liveStatus: { phase: 'tool-running', label: 'Searching' },
  };

  const published = snapshotMessage(source);

  source.rawText = 'mutated later';
  source.attachments[0].name = 'changed.txt';
  source.toolCalls[0].phase = 'succeeded';
  source.toolCalls[0]._run.phase = 'done';
  source.toolCalls[0].results[0].title = 'after';
  source.toolCalls[0].artifacts[0].name = 'after.txt';
  source.toolCalls[0].visualization.kind = 'line';
  source._liveStatus.label = 'Done';

  assert.equal(published.rawText, 'hello');
  assert.equal(published.attachments[0].name, 'note.txt');
  assert.equal(published.toolCalls[0].phase, 'running');
  assert.equal(published.toolCalls[0]._run.phase, 'running');
  assert.equal(published.toolCalls[0].results[0].title, 'before');
  assert.equal(published.toolCalls[0].artifacts[0].name, 'before.txt');
  assert.equal(published.toolCalls[0].visualization.kind, 'bar');
  assert.equal(published._liveStatus.label, 'Searching');
  assert.ok(Object.isFrozen(published));
  assert.ok(Object.isFrozen(published.toolCalls));
  assert.ok(Object.isFrozen(published.toolCalls[0]));
});

test('reconciliation advances only changed message identities', () => {
  const firstSource = {
    clientId: 'm-1', role: 'assistant', type: 'streaming', rawText: 'one', toolCalls: [],
  };
  const secondSource = {
    clientId: 'm-2', role: 'assistant', type: 'assistant', rawText: 'two', toolCalls: [],
  };
  const thirdSource = {
    clientId: 'm-3', role: 'user', type: 'user', rawText: 'three', toolCalls: [],
  };

  const previous = reconcileMessageSnapshots(
    [],
    [firstSource, secondSource, thirdSource],
    null,
  );

  firstSource.rawText = 'one updated';
  secondSource.rawText = 'two updated';

  const next = reconcileMessageSnapshots(
    previous,
    [firstSource, secondSource, thirdSource],
    new Set(['m-1', 'm-2']),
  );

  assert.notEqual(next[0], previous[0]);
  assert.notEqual(next[1], previous[1]);
  assert.equal(next[2], previous[2]);
  assert.equal(next[0].rawText, 'one updated');
  assert.equal(next[1].rawText, 'two updated');
  assert.equal(next[2].rawText, 'three');
});

test('state sync snapshots every row even when ids are unchanged', () => {
  const source = { clientId: 'm-1', role: 'assistant', rawText: 'before' };
  const previous = reconcileMessageSnapshots([], [source], null);
  source.rawText = 'after';

  const next = reconcileMessageSnapshots(previous, [source], null);

  assert.notEqual(next[0], previous[0]);
  assert.equal(previous[0].rawText, 'before');
  assert.equal(next[0].rawText, 'after');
});
