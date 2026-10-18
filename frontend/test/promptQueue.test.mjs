import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.CustomEvent = dom.window.CustomEvent;

const {
  enqueuePrompt,
  dequeuePrompt,
  removeQueuedPrompt,
  clearPromptQueue,
  getQueuedPrompts,
  subscribePromptQueue,
} = await import('../src/chat/promptQueue.ts');

test('promptQueue: basic enqueue, dequeue, remove, clear lifecycle', () => {
  clearPromptQueue();
  assert.equal(getQueuedPrompts().length, 0);

  const p1 = enqueuePrompt({ text: 'Hello 1', sessionId: 's1' });
  const p2 = enqueuePrompt({ text: 'Hello 2', sessionId: 's1' });
  const p3 = enqueuePrompt({ text: 'Hello 3', sessionId: 's2' });

  assert.equal(getQueuedPrompts().length, 3);
  assert.equal(p1.text, 'Hello 1');

  // Dequeue for s2 should return p3
  const dequeuedS2 = dequeuePrompt('s2');
  assert.ok(dequeuedS2);
  assert.equal(dequeuedS2.id, p3.id);
  assert.equal(getQueuedPrompts().length, 2);

  // Remove p1 explicitly
  removeQueuedPrompt(p1.id);
  assert.equal(getQueuedPrompts().length, 1);
  assert.equal(getQueuedPrompts()[0].id, p2.id);

  // Clear all
  clearPromptQueue();
  assert.equal(getQueuedPrompts().length, 0);
  assert.equal(dequeuePrompt('s1'), undefined);
});

test('promptQueue: subscription receives updates', () => {
  clearPromptQueue();
  const history = [];
  const unsubscribe = subscribePromptQueue((q) => {
    history.push(q.length);
  });

  enqueuePrompt({ text: 'Test A' });
  enqueuePrompt({ text: 'Test B' });
  dequeuePrompt();
  clearPromptQueue();

  unsubscribe();
  enqueuePrompt({ text: 'After unsub' });

  // History should reflect initial (0), add (1), add (2), dequeue (1), clear (0)
  assert.deepEqual(history, [0, 1, 2, 1, 0]);
  clearPromptQueue();
});

test('submitChatMessage enqueues when streaming is active', async () => {
  const { turnState } = await import('../src/chat/turnState.ts');
  const { submitChatMessage } = await import('../src/chat/sendPipeline.ts');

  clearPromptQueue();
  turnState.chatStreaming = true;

  await submitChatMessage('Queued question while streaming');
  const queued = getQueuedPrompts();
  assert.equal(queued.length, 1);
  assert.equal(queued[0].text, 'Queued question while streaming');

  turnState.chatStreaming = false;
  clearPromptQueue();
});

