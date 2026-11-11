import assert from 'node:assert/strict';
import test from 'node:test';
import { handleChatApiResult } from '../src/chat/format.ts';

test('a tool-only answer completes instead of aborting its rendered surface', () => {
  const actions = [];
  handleChatApiResult({ text: '', semanticActivity: true }, {
    finish() { actions.push('finish'); },
    abort() { actions.push('abort'); },
    replaceWithError() { actions.push('error'); },
  }, 'Draw a plot');
  assert.deepEqual(actions, ['finish']);
});

test('cancellation takes precedence over completed semantic activity', () => {
  const actions = [];
  handleChatApiResult({ cancelled: true, semanticActivity: true }, {
    finish() { actions.push('finish'); }, abort() { actions.push('abort'); }, replaceWithError() {},
  }, 'Draw a plot');
  assert.deepEqual(actions, ['abort']);
});
