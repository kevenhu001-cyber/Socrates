import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatTiming } from '../src/lib/chatTiming.ts';

test('chat timing includes preparation and separates first reasoning from content', () => {
  let now = 1000;
  const timing = createChatTiming(() => now);
  now = 1050; timing.mark('authenticated');
  now = 3000; timing.mark('prepared');
  now = 3100; timing.mark('upstream_started');
  now = 3200; timing.mark('first_reasoning');
  now = 5500; timing.mark('first_content');
  assert.equal(timing.mark('first_content'), false);
  assert.deepEqual(timing.snapshot(), {
    authenticated: 50, prepared: 2000, upstream_started: 2100,
    first_reasoning: 2200, first_content: 4500,
  });
});

test('timing snapshots cannot mutate recorded milestones', () => {
  const timing = createChatTiming(() => 5);
  assert.equal(timing.mark('prepared'), true);
  timing.snapshot().prepared = 900;
  assert.deepEqual(timing.snapshot(), { prepared: 0 });
});
