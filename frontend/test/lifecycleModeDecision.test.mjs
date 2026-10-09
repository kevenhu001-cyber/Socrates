import assert from 'node:assert/strict';
import test from 'node:test';

import { hasActiveModeSession, resolveNextAppMode } from '../src/app/lifecycle/modeDecision.js';

test('mode selection honors explicit destinations and keeps the legacy toggle behavior', () => {
  assert.equal(resolveNextAppMode('tutor', 'chat'), 'tutor');
  assert.equal(resolveNextAppMode('chat', 'tutor'), 'chat');
  assert.equal(resolveNextAppMode(undefined, 'chat'), 'tutor');
  assert.equal(resolveNextAppMode(undefined, 'tutor'), 'chat');
  assert.equal(resolveNextAppMode('unknown', 'chat'), 'tutor');
});

test('only active conversation state requires mode-switch confirmation', () => {
  assert.equal(hasActiveModeSession({}), false);
  assert.equal(hasActiveModeSession({ topic: 'Geometry' }), true);
  assert.equal(hasActiveModeSession({ knowledgeNodes: [{ id: 'node' }] }), true);
  assert.equal(hasActiveModeSession({ phase: 'chat' }), true);
  assert.equal(hasActiveModeSession({ hasRealMessages: true }), true);
  assert.equal(hasActiveModeSession({ phase: 'topic' }), false);
});
