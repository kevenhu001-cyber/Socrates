import assert from 'node:assert/strict';
import test from 'node:test';
import { turnState, resetTurnState, shouldQueueChatSend } from '../src/chat/turnState.ts';

test('linked-page preparation can be preempted, while normal streaming stays queued', () => {
  resetTurnState();
  turnState.chatStreaming = true;
  assert.equal(shouldQueueChatSend(), true, 'a normal active stream queues a follow-up');

  let aborted = false;
  const preparationAbort = () => { aborted = true; };
  turnState.activePagePreparationAbort = preparationAbort;
  assert.equal(shouldQueueChatSend(), false, 'page preparation allows a new send to supersede it');

  // The preparation owner may clear its registration only while it is still
  // the registered owner; a newer preparation must not be erased by old cleanup.
  const newerPreparationAbort = () => {};
  turnState.activePagePreparationAbort = newerPreparationAbort;
  if (turnState.activePagePreparationAbort === preparationAbort) turnState.activePagePreparationAbort = null;
  assert.equal(turnState.activePagePreparationAbort, newerPreparationAbort);
  preparationAbort();
  assert.equal(aborted, true);
  assert.equal(shouldQueueChatSend(), false);

  turnState.activePagePreparationAbort = null;
  assert.equal(shouldQueueChatSend(), true, 'streaming remains queueable after preparation ends');
  resetTurnState();
});

test('resetting turn state clears active cancellation and first-turn controller handoffs', () => {
  const controller = { abort() {} };
  turnState.activeChatAbort = () => {};
  turnState.pendingFirstTurnController = controller;
  resetTurnState();
  assert.equal(turnState.activeChatAbort, null);
  assert.equal(turnState.pendingFirstTurnController, null);
});
