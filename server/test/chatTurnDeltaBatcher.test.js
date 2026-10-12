// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatTurnDeltaBatcher } from '../src/services/chatTurnDeltaBatcher.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('coalesces adjacent content deltas into one exact durable event', async () => {
  const events = [];
  const batcher = createChatTurnDeltaBatcher((event, data) => events.push({ event, ...data }), 15);
  batcher.push('content', 'hel');
  batcher.push('content', 'lo');
  assert.deepEqual(events, []);
  await wait(40);
  assert.deepEqual(events, [{ event: 'content', delta: 'hello' }]);
  batcher.dispose();
});

test('flushes before switching between content and reasoning to preserve order', () => {
  const events = [];
  const batcher = createChatTurnDeltaBatcher((event, data) => events.push({ event, ...data }), 1000);
  batcher.push('content', 'answer');
  batcher.push('reasoning', 'thought');
  batcher.flush();
  assert.deepEqual(events, [
    { event: 'content', delta: 'answer' },
    { event: 'reasoning', delta: 'thought' },
  ]);
  batcher.dispose();
});

test('manual flush is idempotent and cancels the pending timer', async () => {
  const events = [];
  const batcher = createChatTurnDeltaBatcher((event, data) => events.push({ event, ...data }), 20);
  batcher.push('content', 'tail');
  batcher.flush();
  batcher.flush();
  await wait(35);
  assert.deepEqual(events, [{ event: 'content', delta: 'tail' }]);
  batcher.dispose();
});
