import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getThinkingPanelSnapshot,
  installThinkingPanelBridge,
} from '../src/react/thinking-panel/thinkingPanelStore.ts';

/* The store targets the browser, but every window access happens inside
   functions (install / throttled publish), so pointing window at the Node
   global keeps the module testable without a DOM. */
globalThis.window = globalThis;

const tick = () => new Promise((resolve) => setTimeout(resolve, 130));

test('ThinkingPanel bridge installs once and starts closed', () => {
  const first = installThinkingPanelBridge();
  const second = installThinkingPanelBridge();
  assert.strictEqual(first, second, 'install must be idempotent');
  assert.equal(window.__socratesThinkingPanelBridge, first);
  assert.deepEqual(
    {
      open: first.getSnapshot().open,
      messageId: first.getSnapshot().messageId,
      text: first.getSnapshot().text,
      streaming: first.getSnapshot().streaming,
    },
    { open: false, messageId: null, text: '', streaming: false },
  );
});

test('ThinkingPanel publishes throttled reasoning deltas to the snapshot', async () => {
  const bridge = installThinkingPanelBridge();
  bridge.publish({ type: 'thinking-start', messageId: 'msg-1' });
  bridge.publish({ type: 'panel-open', messageId: 'msg-1' });

  bridge.publishThinkingDelta('msg-1', 'first draft');
  bridge.publishThinkingDelta('msg-1', 'first draft + second pass');
  assert.equal(bridge.getSnapshot().text, '', 'delta must be throttled');

  await tick();
  const snapshot = bridge.getSnapshot();
  assert.equal(snapshot.open, true);
  assert.equal(snapshot.messageId, 'msg-1');
  assert.equal(snapshot.text, 'first draft + second pass', 'latest delta wins');
  assert.equal(snapshot.streaming, true);
});

test('ThinkingPanel keeps final text after thinking-end', () => {
  const bridge = installThinkingPanelBridge();
  bridge.publish({ type: 'thinking-start', messageId: 'msg-2' });
  bridge.publish({ type: 'panel-open', messageId: 'msg-2' });
  bridge.publishThinkingDelta('msg-2', 'final reasoning');
  bridge.publish({ type: 'thinking-end', messageId: 'msg-2' });

  const snapshot = bridge.getSnapshot();
  assert.equal(snapshot.streaming, false);
  assert.equal(snapshot.text, 'final reasoning');
  assert.equal(snapshot.open, true, 'open panel stays readable after stream end');
});

test('ThinkingPanel turn-start closes and resets the snapshot', () => {
  const bridge = installThinkingPanelBridge();
  bridge.publish({ type: 'thinking-start', messageId: 'msg-3' });
  bridge.publish({ type: 'panel-open', messageId: 'msg-3' });
  bridge.publishThinkingDelta('msg-3', 'old turn reasoning');
  bridge.publish({ type: 'turn-start' });

  const snapshot = bridge.getSnapshot();
  assert.equal(snapshot.open, false);
  assert.equal(snapshot.messageId, null);
  assert.equal(snapshot.text, '');
  assert.equal(snapshot.streaming, false);
});

test('ThinkingPanel panel-close keeps the buffered text for later turns', () => {
  const bridge = installThinkingPanelBridge();
  bridge.publish({ type: 'thinking-start', messageId: 'msg-4' });
  bridge.publishThinkingDelta('msg-4', 'buffered text');
  bridge.publish({ type: 'panel-close' });

  const closed = bridge.getSnapshot();
  assert.equal(closed.open, false);
  assert.equal(closed.text, 'buffered text');

  bridge.publish({ type: 'panel-open', messageId: 'msg-4' });
  assert.equal(bridge.getSnapshot().open, true);
  assert.equal(bridge.getSnapshot().text, 'buffered text');
});

test('ThinkingPanel merges reasoning + inline think text passed by the stream', () => {
  const bridge = installThinkingPanelBridge();
  bridge.publish({ type: 'thinking-start', messageId: 'msg-5' });
  bridge.publishThinkingDelta(
    'msg-5',
    'reasoning_content here\n\n—— 正文内思考 ——\n\ninline think content',
  );
  bridge.publish({ type: 'panel-open', messageId: 'msg-5' });

  const snapshot = bridge.getSnapshot();
  assert.match(snapshot.text, /reasoning_content here/);
  assert.match(snapshot.text, /inline think content/);
});

test('ThinkingPanel ignores stale deltas for a different message id', () => {
  const bridge = installThinkingPanelBridge();
  bridge.publish({ type: 'thinking-start', messageId: 'current' });
  bridge.publishThinkingDelta('current', 'current reasoning');
  bridge.publishThinkingDelta('stale', 'stale reasoning');
  bridge.publish({ type: 'thinking-end', messageId: 'current' });

  const snapshot = bridge.getSnapshot();
  assert.equal(snapshot.messageId, 'current');
  assert.equal(snapshot.text, 'current reasoning');
});
