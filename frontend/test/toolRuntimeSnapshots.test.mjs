import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolRuntime } from '../src/chat/toolRuntime.ts';
globalThis.window = {};
globalThis.document = {cookie: ''};
const {stateStore} = await import('../src/state/store.js');
const {sessionBridge, kbBridge, examBridge} = await import('../src/state/bridges.ts');

function harness() {
  stateStore.dispatch({type: 'state/set', key: 'messages', value: [{clientId: 'owned', toolCalls: []}]});
  let owns = true;
  let frame;
  const runtime = createToolRuntime({
    getMessage: () => stateStore.read('messages')[0],
    stillOwnsSlot: () => owns,
    updateMessage: patch => stateStore.dispatch({type: 'session/update-message', index: 0, clientId: 'owned', patch}),
    requestAnimationFrame: fn => { frame = fn; return 1; },
    cancelAnimationFrame() {}, EventSource: null,
  });
  return {runtime, loseOwnership() { owns = false; }, flush() { frame?.(); }, read: () => stateStore.read('messages')[0]};
}

test('tool lifecycle preserves frozen historical snapshots and excludes runtime queues', () => {
  const h = harness();
  h.runtime.recordToolProgress({id: 'tool', phase: 'stdout', chunk: 'early'});
  const initial = h.read();
  const input = {nested: {code: 'first'}};
  h.runtime.recordToolUse({id: 'tool', name: 'code_interpreter', input});
  const started = h.read();
  assert.equal(initial.toolCalls.length, 0);
  assert.equal(started.toolCalls[0]._liveOutput, 'early');
  assert.ok(Object.isFrozen(started.toolCalls[0]));
  assert.ok(Object.isFrozen(started.toolCalls[0]._run));
  input.nested.code = 'outside';
  assert.equal(started.toolCalls[0].input.nested.code, 'first');
  h.runtime.recordToolProgress({id: 'tool', phase: 'stdout', chunk: ' later'});
  assert.equal(started.toolCalls[0]._liveOutput, 'early');
  h.runtime.recordToolResult({id: 'tool', ok: true, output: 'complete'});
  const finished = h.read();
  assert.equal(finished.toolCalls[0]._run.phase, 'succeeded');
  assert.equal(finished.toolCalls[0]._toolResultApplied, true);
  assert.equal(started.toolCalls[0].output, null);
  for (const key of ['_orphanProgress', '_orphanDeltas', '_orphanApprovals', '_orphanAgentFrames']) assert.equal(finished[key], undefined);
  for (const key of ['_liveBuffer', '_pendingDeltas', '_pendingProgress']) assert.equal(finished.toolCalls[0][key], undefined);
  assert.equal(JSON.parse(JSON.stringify(finished)).toolCalls[0]._run, undefined);
  h.runtime.dispose();
});

test('late frames cannot change a replacement message or a lost slot', () => {
  const h = harness();
  h.runtime.recordToolUse({id: 'tool', name: 'web_search', input: {query: 'q'}});
  const before = h.read();
  h.loseOwnership();
  h.runtime.recordToolResult({id: 'tool', ok: true, output: 'late'});
  assert.strictEqual(h.read(), before);
  stateStore.dispatch({type: 'state/set', key: 'messages', value: [{clientId: 'replacement', toolCalls: []}]});
  h.runtime.cancel();
  assert.equal(h.read().toolCalls.length, 0);
});

test('session, knowledge and exam snapshots reject nested writes', () => {
  stateStore.dispatch({type: 'state/batch', patch: {
    messages: [{clientId: 'frozen', toolCalls: [{input: {code: 'x'}}]}],
    kbNodes: [{name: 'topic', history: [{content: 'before'}]}],
    examQuestions: [{opts: ['a', 'b']}], examAnswers: {0: 'a'},
  }});
  const session = sessionBridge.getSnapshot();
  const kb = kbBridge.getSnapshot();
  const exam = examBridge.getSnapshot();
  assert.throws(() => {session.messages[0].toolCalls[0].input.code = 'bypass';}, TypeError);
  assert.throws(() => {kb.kbNodes[0].history[0].content = 'bypass';}, TypeError);
  assert.throws(() => exam.examQuestions[0].opts.push('bypass'), TypeError);
  stateStore.dispatch({type: 'state/set', key: 'examAnswers', value: {...exam.examAnswers, 0: 'b'}});
  assert.equal(exam.examAnswers[0], 'a');
  assert.equal(examBridge.getSnapshot().examAnswers[0], 'b');
});

test('pending approval remains actionable after a frozen message is finalized', async () => {
  const h = harness();
  h.runtime.recordToolUse({id: 'agent', name: 'workspace_agent', input: {}});
  h.runtime.recordToolApproval({id: 'agent', runId: 'run', approvalId: 'approval', status: 'pending'});
  const before = h.read();
  h.runtime.dispose();
  h.loseOwnership();
  stateStore.dispatch({type: 'session/update-message', index: 0, clientId: 'owned', patch: {rawText: 'finished', _streamSettled: true}});
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({url, options});
    return {ok: true, status: 200, text: async () => '{"ok":true}'};
  };
  try {
    await h.runtime.decideApproval('agent', 'decline');
    assert.equal(requests.length, 1);
    assert.equal(JSON.parse(requests[0].options.body).decision, 'decline');
    assert.equal(before.toolCalls[0].approval.status, 'pending');
    assert.equal(h.read().toolCalls[0].approval.status, 'decline');
    assert.equal(h.read().rawText, 'finished');
    stateStore.dispatch({type: 'state/set', key: 'messages', value: [{clientId: 'replacement', toolCalls: []}]});
    await h.runtime.decideApproval('agent', 'decline');
    assert.equal(requests.length, 1, 'a switched session cannot send decisions for the old row');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('diagnostic and teaching updates accept frozen knowledge snapshots', async () => {
  const {applyDiagnosticResults} = await import('../src/chat/diagnosticResults.js');
  const {buildTeachingPlanFromKB, syncCurrentNodeFromTeachingPlan} = await import('../src/chat/teachingPlan.js');
  stateStore.dispatch({type: 'state/batch', patch: {
    kbNodes: [{name: 'Fractions', status: 'blank', history: []}],
    diagQuestions: [{nodeIdx: 0, opts: [{level: 'fuzzy'}]}], diagAnswers: [0],
  }});
  const before = kbBridge.getSnapshot();
  const nodes = applyDiagnosticResults({...sessionBridge.getSnapshot(), ...before});
  stateStore.dispatch({type: 'state/set', key: 'kbNodes', value: nodes});
  const plan = buildTeachingPlanFromKB(kbBridge.getSnapshot());
  stateStore.dispatch({type: 'state/set', key: 'teachingPlan', value: plan});
  const updated = syncCurrentNodeFromTeachingPlan({...sessionBridge.getSnapshot(), ...kbBridge.getSnapshot()});
  stateStore.dispatch({type: 'state/batch', patch: updated});
  assert.equal(before.kbNodes[0].status, 'blank');
  assert.equal(before.kbNodes[0].history.length, 0);
  assert.equal(kbBridge.getSnapshot().kbNodes[0].status, 'fuzzy');
  assert.equal(sessionBridge.getSnapshot().teachingPlan.subtopics[0].status, 'fuzzy');
});

test('a late runtime commit preserves toolCalls another owner wrote', () => {
  const h = harness();
  h.runtime.recordToolUse({id: 'tool', name: 'code_interpreter', input: {code: 'x'}});
  const started = h.read();
  assert.equal(started.toolCalls[0].textOffset, undefined);

  /* finishRender is the real second writer: it stamps `textOffset` from
     inlineToolRows through `patchOwnedMessage`, which does NOT bump
     `_toolRunRev`. The runtime must not publish its own projection over it. */
  stateStore.dispatch({type: 'session/update-message', index: 0, clientId: 'owned', patch: {
    toolCalls: started.toolCalls.map(call => ({...call, textOffset: 42})),
  }});
  const offset = h.read();
  assert.equal(offset.toolCalls[0].textOffset, 42);

  /* A progress frame that lands after the write-back still commits (the live
     tail must keep updating) but must carry the split point through. */
  h.runtime.recordToolProgress({id: 'tool', phase: 'stdout', chunk: 'late'});
  h.flush();
  const late = h.read();
  assert.equal(late.toolCalls[0]._liveOutput, 'late');
  assert.equal(late.toolCalls[0].textOffset, 42, 'the split point survives a late tool commit');

  /* An external row the runtime has never seen is passed through untouched. */
  stateStore.dispatch({type: 'session/update-message', index: 0, clientId: 'owned', patch: {
    toolCalls: [...late.toolCalls, {id: 'external', name: 'web_search', input: null, output: 'kept', isError: false, artifacts: []}],
  }});
  h.runtime.recordToolResult({id: 'tool', ok: true, output: 'done'});
  const merged = h.read();
  assert.equal(merged.toolCalls.map(c => c.id).join(','), 'tool,external');
  assert.equal(merged.toolCalls[1].output, 'kept', 'an external row is never dropped by the merge');
  assert.ok(Object.isFrozen(merged.toolCalls[1]), 'the passed-through row is frozen too');
  h.runtime.dispose();
});


/* ---------------------------------------------------------------------------
 * P_tool-projection-budget — the commit used to deep-copy and deep-freeze every
 * call on every animation frame, so the frame cost scaled with the whole turn
 * (~1.6 ms for 12 calls with real payloads, measured). The projection cache
 * reuses untouched entries. These tests pin the reuse: the first is exact, the
 * second is machine-independent (cost tracks CHANGED calls, not total calls).
 * ------------------------------------------------------------------------ */

test('committing a streaming call reuses the other calls by identity', () => {
  stateStore.dispatch({type: 'state/set', key: 'messages', value: [{clientId: 'multi', toolCalls: []}]});
  let frame;
  const runtime = createToolRuntime({
    getMessage: () => stateStore.read('messages')[0],
    stillOwnsSlot: () => true,
    updateMessage: patch => stateStore.dispatch({type: 'session/update-message', index: 0, clientId: 'multi', patch}),
    requestAnimationFrame: fn => { frame = fn; return 1; },
    cancelAnimationFrame() {}, EventSource: null,
  });
  for (const id of ['a', 'b', 'c']) runtime.recordToolUse({id, name: 'code_interpreter', input: {code: id}});
  runtime.recordToolProgress({id: 'a', phase: 'stdout', chunk: 'one'});
  frame?.();
  const first = stateStore.read('messages')[0].toolCalls;
  const idleB = first[1];
  const idleC = first[2];
  assert.ok(Object.isFrozen(idleB) && Object.isFrozen(idleC));

  runtime.recordToolProgress({id: 'a', phase: 'stdout', chunk: ' two'});
  frame?.();
  const second = stateStore.read('messages')[0].toolCalls;
  assert.equal(second[0]._liveOutput, 'one two', 'the streaming call still updates');
  assert.notStrictEqual(second[0], first[0], 'the streaming call is rebuilt');
  assert.strictEqual(second[1], idleB, 'an untouched call is the same object, so the freeze memo skips it');
  assert.strictEqual(second[2], idleC, 'an untouched call is the same object, so the freeze memo skips it');

  /* A change on one idle call must replace only that call. */
  runtime.recordToolResult({id: 'b', ok: true, output: 'done'});
  const third = stateStore.read('messages')[0].toolCalls;
  assert.notStrictEqual(third[1], idleB);
  assert.strictEqual(third[2], idleC, 'only the changed call is rebuilt');
  assert.equal(third[1].output, 'done');
  runtime.dispose();
});
