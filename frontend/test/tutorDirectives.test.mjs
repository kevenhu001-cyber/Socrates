import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fromBasicsDirective,
  stageInstruction,
  tutorTurnDirective,
} from '../src/chat/socraticDirectives.js';

test('Tutor stage instructions no longer force a full lesson on every turn', () => {
  assert.doesNotMatch(stageInstruction('define'), /1500|8-20|verbose/i);
  assert.match(stageInstruction('exercise'), /exactly one .*practice/i);
  assert.match(stageInstruction('check'), /exactly one short quiz/i);
});

test('Tutor follow-ups reference the foundation instead of restating it', () => {
  const continuation = fromBasicsDirective({ status: 'fuzzy' }, { continuation: true });
  assert.match(continuation, /already been introduced/i);
  assert.match(continuation, /do not restate/i);
  assert.doesNotMatch(continuation, /CRITICAL.*TWO PRINCIPLES/i);
});

test('Tutor turn scope keeps each teaching stage focused', () => {
  assert.match(tutorTurnDirective('illustrate', false), /two is enough/i);
  assert.match(tutorTurnDirective('exercise', false), /wait for the student's attempt/i);
  assert.match(tutorTurnDirective('check', false), /one short quiz/i);
  assert.match(tutorTurnDirective('motivate', true), /at most one closing question/i);
});
