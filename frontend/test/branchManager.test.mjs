import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;

const { stateStore } = await import('../src/state/store.ts');
const {
  prepareUserEditBranch,
  prepareAssistantRegenerateBranch,
  switchMessageBranch,
} = await import('../src/chat/branchManager.ts');

test('prepareUserEditBranch creates initial variants and preserves following messages', () => {
  stateStore.dispatch({
    type: 'session/replace-messages',
    payload: [
      { clientId: 'u1', role: 'user', rawText: 'Prompt 1', html: '<p>Prompt 1</p>' },
      { clientId: 'a1', role: 'assistant', rawText: 'Answer 1', html: '<p>Answer 1</p>' },
      { clientId: 'u2', role: 'user', rawText: 'Follow up', html: '<p>Follow up</p>' },
    ],
  });

  const res = prepareUserEditBranch('u1', 'Edited Prompt 1');
  assert.ok(res);
  assert.equal(res.branchInfo.currentIndex, 1);
  assert.equal(res.branchInfo.variants.length, 2);

  // Variant 0 is the original prompt with its following messages (a1, u2)
  assert.equal(res.branchInfo.variants[0].rawText, 'Prompt 1');
  assert.equal(res.branchInfo.variants[0].followingMessages.length, 2);
  assert.equal(res.branchInfo.variants[0].followingMessages[0].clientId, 'a1');

  // Variant 1 is the new edited prompt
  assert.equal(res.branchInfo.variants[1].rawText, 'Edited Prompt 1');
  assert.equal(res.branchInfo.variants[1].followingMessages.length, 0);
});

test('prepareAssistantRegenerateBranch captures assistant state and prepares next variant', () => {
  stateStore.dispatch({
    type: 'session/replace-messages',
    payload: [
      { clientId: 'u1', role: 'user', rawText: 'Question' },
      { clientId: 'a1', role: 'assistant', rawText: 'Answer 1', html: '<p>Answer 1</p>' },
    ],
  });

  const res = prepareAssistantRegenerateBranch('a1');
  assert.ok(res);
  assert.equal(res.userEntry.clientId, 'u1');
  assert.equal(res.branchInfo.currentIndex, 1);
  assert.equal(res.branchInfo.variants.length, 2);
  assert.equal(res.branchInfo.variants[0].rawText, 'Answer 1');
});

test('switchMessageBranch switches between versions and restores corresponding subtree', () => {
  // Set up conversation with a branched user message
  const initialMessages = [
    {
      clientId: 'u1-v2',
      role: 'user',
      rawText: 'Prompt V2',
      html: '<p>Prompt V2</p>',
      branchInfo: {
        currentIndex: 1,
        variants: [
          {
            clientId: 'u1-v1',
            role: 'user',
            rawText: 'Prompt V1',
            html: '<p>Prompt V1</p>',
            followingMessages: [
              { clientId: 'a1-v1', role: 'assistant', rawText: 'Answer for V1' },
              { clientId: 'u2-v1', role: 'user', rawText: 'Follow-up for V1' },
            ],
          },
          {
            clientId: 'u1-v2',
            role: 'user',
            rawText: 'Prompt V2',
            html: '<p>Prompt V2</p>',
            followingMessages: [
              { clientId: 'a1-v2', role: 'assistant', rawText: 'Answer for V2' },
            ],
          },
        ],
      },
    },
    { clientId: 'a1-v2', role: 'assistant', rawText: 'Answer for V2' },
  ];

  stateStore.dispatch({ type: 'session/replace-messages', payload: initialMessages });

  // Switch back to version 1 (index 0)
  const switched = switchMessageBranch('u1-v2', 0);
  assert.ok(switched);

  const msgs = stateStore.read('messages');
  assert.equal(msgs.length, 3); // u1-v1, a1-v1, u2-v1
  assert.equal(msgs[0].rawText, 'Prompt V1');
  assert.equal(msgs[0].branchInfo.currentIndex, 0);
  assert.equal(msgs[1].clientId, 'a1-v1');
  assert.equal(msgs[2].clientId, 'u2-v1');

  // Now switch forward to version 2 (index 1)
  const switchedBack = switchMessageBranch('u1-v1', 1);
  assert.ok(switchedBack);

  const msgsV2 = stateStore.read('messages');
  assert.equal(msgsV2.length, 2); // u1-v2, a1-v2
  assert.equal(msgsV2[0].rawText, 'Prompt V2');
  assert.equal(msgsV2[0].branchInfo.currentIndex, 1);
  assert.equal(msgsV2[1].clientId, 'a1-v2');
});
