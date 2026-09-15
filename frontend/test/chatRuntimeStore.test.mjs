/* test/chatRuntimeStore.test.mjs — the publish → snapshot contract the React
   message list depends on.
   P_tool-declarative-refresh added the part this guards: the legacy pipeline
   mutates message objects in place, so a commit must produce a NEW snapshot
   revision (and re-read state.messages) for a tool-row state change or a
   streamed character to be visible to React at all. */
import assert from 'node:assert/strict';
import test from 'node:test';

const frames = new Map();
let nextFrameId = 1;
function fakeWindow() {
  return {
    requestAnimationFrame(callback) {
      const id = nextFrameId++;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
  };
}

globalThis.window = fakeWindow();

const { stateStore } = await import('../src/state/store.js');
stateStore.dispatch({ type: 'state/batch', patch: { currentSessionId: 's-1', phase: 'chat' } });

const { installChatRuntimeBridge, getChatRuntimeSnapshot } = await import(
  '../src/react/chatRuntime.bridge.ts'
);

function runFrames() {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((frame) => frame && frame());
}

/** Drain whatever a previous test left scheduled, then hand back the bridge. */
function freshBridge() {
  runFrames();
  return installChatRuntimeBridge();
}

function message(clientId, rawText) {
  return { clientId, role: 'assistant', type: 'streaming', rawText, toolCalls: [] };
}

test('a tool-run publish re-reads the immutable message list', () => {
  const bridge = freshBridge();
  const messages = [message('m-1', 'he')];
  stateStore.dispatch({ type: 'session/replace-messages', payload: messages });
  bridge.publish({ type: 'stream-started', messageId: 'm-1' });

  const before = bridge.getSnapshot();
  stateStore.dispatch({
    type: 'session/update-message', index: 0, clientId: 'm-1',
    patch: { rawText: 'hello', toolCalls: [{ id: 'tc-1', name: 'web_search', phase: 'running' }] },
  });
  bridge.publish({ type: 'tool-run-updated', messageId: 'm-1' });
  runFrames();
  const after = bridge.getSnapshot();

  assert.ok(after.revision > before.revision, 'the commit bumps the revision');
  assert.equal(after.messages[0].rawText, 'hello', 'the snapshot re-read legacy state');
  assert.equal(after.lastEvent, 'tool-run-updated');
  /* A tool change is not a text-streaming change: the stream keeps its status. */
  assert.equal(after.stream.status, 'streaming');
  assert.equal(after.stream.messageId, 'm-1');
});

test('stream and tool-run publishes coalesce to one commit per frame', () => {
  const bridge = freshBridge();
  const messages = [message('m-2', '')];
  stateStore.dispatch({ type: 'session/replace-messages', payload: messages });
  const start = bridge.getSnapshot().revision;

  for (let i = 1; i <= 5; i++) {
    stateStore.dispatch({
      type: 'session/update-message', index: 0, clientId: 'm-2',
      patch: { rawText: 'x'.repeat(i) }, deferNotify: true,
    });
    bridge.publish({ type: 'stream-delta', messageId: 'm-2', textLength: i });
  }
  stateStore.dispatch({
    type: 'session/update-message', index: 0, clientId: 'm-2', patch: { _toolRunRev: 1 },
  });
  bridge.publish({ type: 'tool-run-updated', messageId: 'm-2' });
  bridge.publish({ type: 'tool-run-updated', messageId: 'm-2' });

  assert.equal(bridge.getSnapshot().revision, start, 'nothing commits before the frame');
  runFrames();
  /* One for the coalesced delta, one for the coalesced tool-run set. */
  assert.equal(bridge.getSnapshot().revision, start + 2);
  assert.equal(bridge.getSnapshot().stream.textLength, 5, 'the last delta wins');
});

test('stream-delta commits are paced by the adaptive render interval', async () => {
  const bridge = freshBridge();
  stateStore.dispatch({ type: 'session/replace-messages', payload: [message('m-pace', '')] });
  bridge.publish({ type: 'stream-started', messageId: 'm-pace' });
  bridge.publish({ type: 'stream-delta', messageId: 'm-pace', textLength: 3 });
  runFrames();
  const first = bridge.getSnapshot().revision;

  /* A delta inside the cadence window stays pending across frames — the
     paint path now honors getStreamRenderInterval, not just the state
     mirror. */
  bridge.publish({ type: 'stream-delta', messageId: 'm-pace', textLength: 6 });
  runFrames();
  assert.equal(bridge.getSnapshot().revision, first, 'a too-early delta does not commit');

  /* Once the 50ms first-screen interval elapses, the pacing timer hands the
     delta to the normal rAF seam and the next frame commits it. */
  await new Promise((resolve) => setTimeout(resolve, 60));
  runFrames();
  assert.equal(bridge.getSnapshot().stream.textLength, 6, 'the paced delta commits at its deadline');
});

test('a terminal event flushes pending work before it commits', () => {
  const bridge = freshBridge();
  const messages = [message('m-3', 'partial')];
  stateStore.dispatch({ type: 'session/replace-messages', payload: messages });

  bridge.publish({ type: 'stream-delta', messageId: 'm-3', textLength: 7 });
  bridge.publish({ type: 'tool-run-updated', messageId: 'm-3' });
  stateStore.dispatch({
    type: 'session/update-message', index: 0, clientId: 'm-3',
    patch: { rawText: 'complete answer', type: 'assistant' },
  });
  bridge.publish({ type: 'stream-finished', messageId: 'm-3', textLength: 15 });

  const snap = bridge.getSnapshot();
  assert.equal(snap.stream.status, 'completed');
  assert.equal(snap.stream.textLength, 15);
  assert.equal(snap.messages[0].rawText, 'complete answer');
  runFrames();
  assert.equal(bridge.getSnapshot().stream.status, 'completed', 'the frame commits nothing late');
});

test('the bridge is a singleton, so legacy and React share one commit queue', () => {
  const again = installChatRuntimeBridge();
  assert.equal(again, globalThis.window.__socratesReactChatBridge);
  assert.equal(getChatRuntimeSnapshot(), again.getSnapshot());
});
