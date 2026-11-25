import assert from 'node:assert/strict';
import test from 'node:test';
import { handleChatApiResult } from '../src/chat/format.ts';
import { dispatchCall } from '../src/store/index.ts';

test('a tool-only answer completes instead of aborting its rendered surface', () => {
  const actions = [];
  handleChatApiResult(
    { text: '', semanticActivity: true },
    {
      finish() {
        actions.push('finish');
      },
      abort() {
        actions.push('abort');
      },
      replaceWithError() {
        actions.push('error');
      },
    },
    'Draw a plot',
  );
  assert.deepEqual(actions, ['finish']);
});

test('cancellation takes precedence over completed semantic activity', () => {
  const actions = [];
  handleChatApiResult(
    { cancelled: true, semanticActivity: true },
    {
      finish() {
        actions.push('finish');
      },
      abort() {
        actions.push('abort');
      },
      replaceWithError() {},
    },
    'Draw a plot',
  );
  assert.deepEqual(actions, ['abort']);
});

test('a timeout described as cancelled still shows a retryable error', () => {
  const detail = 'The model stopped making progress and the turn was cancelled.';
  dispatchCall({ type: 'call/set', key: 'lastCallError', value: detail });
  try {
    handleChatApiResult(
      null,
      {
        finish: () => assert.fail('timeout must not complete'),
        abort: () => assert.fail('timeout must not be treated as Stop'),
        replaceWithError(message, retry) {
          assert.equal(message, detail);
          assert.equal(typeof retry, 'function');
        },
      },
      'Draw a plot',
    );
  } finally {
    dispatchCall({ type: 'call/set', key: 'lastCallError', value: null });
  }
});
