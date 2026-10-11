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
      input: { query: 'before', filters: { kind: 'docs' } },
      phase: 'running',
      detail: { request: { attempt: 1 } },
      _run: { phase: 'running', durationMs: 10 },
      results: [{ title: 'before', metadata: { rank: 1 } }],
      artifacts: [{ id: 'artifact-1', name: 'before.txt' }],
      visualization: { kind: 'bar', axis: { label: 'before' } },
    }],
    _liveStatus: { phase: 'tool-running', label: 'Searching' },
  };

  const published = snapshotMessage(source);

  source.rawText = 'mutated later';
  source.attachments[0].name = 'changed.txt';
  source.toolCalls[0].input.filters.kind = 'web';
  source.toolCalls[0].phase = 'succeeded';
  source.toolCalls[0].detail.request.attempt = 2;
  source.toolCalls[0]._run.phase = 'done';
  source.toolCalls[0].results[0].title = 'after';
  source.toolCalls[0].results[0].metadata.rank = 2;
  source.toolCalls[0].artifacts[0].name = 'after.txt';
  source.toolCalls[0].visualization.kind = 'line';
  source.toolCalls[0].visualization.axis.label = 'after';
  source._liveStatus.label = 'Done';

  assert.equal(published.rawText, 'hello');
  assert.equal(published.attachments[0].name, 'note.txt');
  assert.equal(published.toolCalls[0].input.filters.kind, 'docs');
  assert.equal(published.toolCalls[0].phase, 'running');
  assert.equal(published.toolCalls[0].detail.request.attempt, 1);
  assert.equal(published.toolCalls[0]._run.phase, 'running');
  assert.equal(published.toolCalls[0].results[0].title, 'before');
  assert.equal(published.toolCalls[0].results[0].metadata.rank, 1);
  assert.equal(published.toolCalls[0].artifacts[0].name, 'before.txt');
  assert.equal(published.toolCalls[0].visualization.kind, 'bar');
  assert.equal(published.toolCalls[0].visualization.axis.label, 'before');
  assert.equal(published._liveStatus.label, 'Searching');
  assert.ok(Object.isFrozen(published));
  assert.ok(Object.isFrozen(published.toolCalls));
  assert.ok(Object.isFrozen(published.toolCalls[0]));
  assert.ok(Object.isFrozen(published.toolCalls[0].input));
  assert.ok(Object.isFrozen(published.toolCalls[0].input.filters));
  assert.ok(Object.isFrozen(published.toolCalls[0].detail.request));
  assert.ok(Object.isFrozen(published.toolCalls[0].results[0].metadata));
  assert.ok(Object.isFrozen(published.toolCalls[0].visualization.axis));
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

test('either clientId or persisted id invalidates the same message snapshot', () => {
  const source = {
    clientId: 'client-1', id: 'persisted-1', role: 'assistant', rawText: 'before',
  };
  const stableSource = {
    clientId: 'client-2', id: 'persisted-2', role: 'assistant', rawText: 'stable',
  };
  const previous = reconcileMessageSnapshots([], [source, stableSource], null);

  source.rawText = 'changed through persisted id';
  const byPersistedId = reconcileMessageSnapshots(
    previous,
    [source, stableSource],
    new Set(['persisted-1']),
  );
  assert.notEqual(byPersistedId[0], previous[0]);
  assert.equal(byPersistedId[0].rawText, 'changed through persisted id');
  assert.equal(byPersistedId[1], previous[1]);

  source.rawText = 'changed through client id';
  const byClientId = reconcileMessageSnapshots(
    byPersistedId,
    [source, stableSource],
    new Set(['client-1']),
  );
  assert.notEqual(byClientId[0], byPersistedId[0]);
  assert.equal(byClientId[0].rawText, 'changed through client id');
  assert.equal(byClientId[1], byPersistedId[1]);
});

test('messages without a stable id are never structurally reused by index', () => {
  const source = { role: 'assistant', rawText: 'before' };
  const previous = reconcileMessageSnapshots([], [source], null);
  source.rawText = 'after';

  const next = reconcileMessageSnapshots(previous, [source], new Set(['unrelated-id']));

  assert.notEqual(next[0], previous[0]);
  assert.equal(next[0].rawText, 'after');
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
