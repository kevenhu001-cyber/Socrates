import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldConfirmReset } from '../src/app/lifecycle/resetDecision.js';

const emptySession = {
  examWasOpen: false,
  examTopic: '',
  examQuestions: [],
  examSubmitted: false,
  topic: '',
  knowledgeNodes: [],
  messages: [],
  confirmActiveSession: true,
  chatStreaming: false,
};

test('a clean landing state resets without confirmation', () => {
  assert.equal(shouldConfirmReset(emptySession), false);
});

test('exam work always requires confirmation', () => {
  assert.equal(shouldConfirmReset({ ...emptySession, examWasOpen: true }), true);
  assert.equal(shouldConfirmReset({
    ...emptySession,
    examTopic: 'Algebra',
    examQuestions: [{ id: 'q1' }],
  }), true);
  assert.equal(shouldConfirmReset({ ...emptySession, examSubmitted: true }), true);
});

test('an active chat confirms by default but may skip after an explicit user confirmation', () => {
  const active = { ...emptySession, topic: 'Geometry' };
  assert.equal(shouldConfirmReset(active), true);
  assert.equal(shouldConfirmReset({ ...active, confirmActiveSession: false }), false);
  assert.equal(shouldConfirmReset({ ...active, confirmActiveSession: false, chatStreaming: true }), true);
});

test('knowledge and message state count as an active session', () => {
  assert.equal(shouldConfirmReset({ ...emptySession, knowledgeNodes: [{ id: 'node' }] }), true);
  assert.equal(shouldConfirmReset({ ...emptySession, messages: [{ role: 'user' }] }), true);
});
