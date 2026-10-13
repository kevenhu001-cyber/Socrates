import test from 'node:test';
import assert from 'node:assert/strict';
import { createTurnActivityController } from '../src/services/turnActivity.js';

test('activity records real transitions, deduplicates deltas and freezes completion', () => {
  const events = [];
  const activity = createTurnActivityController((event) => events.push(event));
  activity.thinking(); activity.thinking();
  activity.tool('search', 'web_search'); activity.tool('search', 'web_search');
  activity.synthesizing(); activity.thinking(); activity.synthesizing();
  activity.done(1000); activity.thinking();
  assert.deepEqual(events.map((event) => event.type), ['thinking', 'tool', 'synthesizing', 'thinking', 'synthesizing', 'done']);
  assert.deepEqual(events[1], { type: 'tool', toolCallId: 'search', toolName: 'web_search' });
});
