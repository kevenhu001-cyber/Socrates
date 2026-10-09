import test from 'node:test';
import assert from 'node:assert/strict';
import { createMessageOwnership } from '../src/chat/turn/messageOwnership.js';

function createHarness() {
  let currentSessionId = 'session-a';
  const messages = [{ clientId: 'message-a' }];
  const actions = [];
  const store = {
    read(key) {
      if (key === 'currentSessionId') return currentSessionId;
      if (key === 'messages') return messages;
      throw new Error('Unexpected store key: ' + key);
    },
    dispatch(action) {
      actions.push(action);
      return action;
    },
  };
  const state = {
    clientId: 'message-a',
    msgIdx: 0,
    _disposed: false,
    finished: false,
  };
  const ownership = createMessageOwnership(state, currentSessionId, store);
  return {
    actions,
    messages,
    ownership,
    setCurrentSessionId(value) { currentSessionId = value; },
    state,
  };
}

test('owned message patches are scoped to the original session and message slot', () => {
  const harness = createHarness();
  const { ownership, actions, messages } = harness;

  assert.equal(ownership.ownsMessageSlot(), true);
  assert.equal(ownership.stillOwnsSlot(), true);
  assert.deepEqual(ownership.patchOwnedMessage({ rawText: 'delta' }, true), {
    type: 'session/update-message',
    index: 0,
    clientId: 'message-a',
    patch: { rawText: 'delta' },
    deferNotify: true,
  });
  assert.equal(actions.length, 1);

  harness.setCurrentSessionId('session-b');
  assert.equal(ownership.ownsMessageSlot(), false);
  assert.equal(ownership.patchOwnedMessage({ rawText: 'stale' }), null);

  harness.setCurrentSessionId('session-a');
  messages[0] = { clientId: 'message-b' };
  assert.equal(ownership.ownsMessageSlot(), false);
  assert.equal(ownership.patchOwnedMessage({ rawText: 'stale' }), null);
  assert.equal(actions.length, 1);
});

test('disposed or finished turns cannot be treated as active slot owners', () => {
  const harness = createHarness();
  assert.equal(harness.ownership.stillOwnsSlot(), true);

  harness.state._disposed = true;
  assert.equal(harness.ownership.stillOwnsSlot(), false);

  harness.state._disposed = false;
  harness.state.finished = true;
  assert.equal(harness.ownership.stillOwnsSlot(), false);
});
