import assert from 'node:assert/strict';
import test from 'node:test';
import type { Session } from '@socrates/contracts';
import { runChatTurn, useChatStore } from './index.ts';

const session: Session = { id: 'session-stream-test', projectId: null, topic: '', mode: 'chat', messages: [] };

test('runChatTurn batches same-microtask text deltas without losing final content', async () => {
  const store = useChatStore;
  store.getState().reset();
  store.getState().setSessions([session]);
  store.getState().selectSession(session.id);
  let assistantTextUpdates = 0;
  const unsubscribe = store.subscribe((state, previous) => {
    const before = previous.sessions[0]?.messages?.find((m) => m.clientId === 'turn-stream-test');
    const after = state.sessions[0]?.messages?.find((m) => m.clientId === 'turn-stream-test');
    if (before && after && (before.rawText !== after.rawText || before.reasoningContent !== after.reasoningContent)) assistantTextUpdates += 1;
  });
  const controller = new AbortController();
  try {
    await runChatTurn({
      sessionId: session.id,
      turnId: 'turn-stream-test',
      text: 'hello',
      signal: controller.signal,
      isCurrent: () => true,
      save: async (value) => value,
      stream: async ({ handlers }) => {
        handlers.onDelta('a');
        handlers.onDelta('b');
        handlers.onDelta('c');
        handlers.onReasoning('x');
        handlers.onReasoning('y');
      },
    });
    const assistant = store.getState().sessions[0]?.messages?.find((m) => m.clientId === 'turn-stream-test');
    assert.equal(assistant?.rawText, 'abc');
    assert.equal(assistant?.reasoningContent, 'xy');
    assert.equal(assistantTextUpdates, 1);
    assert.equal(store.getState().turnId, null);
  } finally {
    unsubscribe();
    store.getState().reset();
  }
});

test('accepted buffered text survives cancellation but later deltas are ignored', async () => {
  const store = useChatStore;
  store.getState().reset();
  store.getState().setSessions([{ ...session, messages: [] }]);
  store.getState().selectSession(session.id);
  const controller = new AbortController();
  const saved: Session[] = [];
  try {
    await runChatTurn({
      sessionId: session.id, turnId: 'cancel-buffer', text: 'hello',
      signal: controller.signal, isCurrent: () => true,
      save: async (value) => { saved.push(value); return value; },
      stream: async ({ handlers }) => {
        handlers.onDelta('accepted');
        controller.abort();
        handlers.onDelta('must be ignored');
        throw new Error('aborted');
      },
    });
    assert.equal(saved.at(-1)?.messages.at(-1)?.rawText, 'accepted');
    assert.equal(store.getState().turnId, null);
    assert.equal(store.getState().error, null);
  } finally { store.getState().reset(); }
});

test('stream failure flushes its last delta before persisting the partial answer', async () => {
  const store = useChatStore;
  store.getState().reset();
  store.getState().setSessions([{ ...session, messages: [] }]);
  store.getState().selectSession(session.id);
  const saved: Session[] = [];
  try {
    await runChatTurn({
      sessionId: session.id, turnId: 'failure-buffer', text: 'hello',
      signal: new AbortController().signal, isCurrent: () => true,
      save: async (value) => { saved.push(value); return value; },
      stream: async ({ handlers }) => {
        handlers.onDelta('partial');
        throw new Error('connection lost');
      },
    });
    assert.equal(saved.at(-1)?.messages.at(-1)?.rawText, 'partial');
    assert.equal(store.getState().error, 'connection lost');
    assert.equal(store.getState().turnId, null);
  } finally { store.getState().reset(); }
});

test('a stale account cannot flush pending text into a replacement session', async () => {
  const store = useChatStore;
  store.getState().reset();
  store.getState().setSessions([{ ...session, messages: [] }]);
  store.getState().selectSession(session.id);
  let current = true;
  try {
    await runChatTurn({
      sessionId: session.id, turnId: 'stale-buffer', text: 'hello',
      signal: new AbortController().signal, isCurrent: () => current,
      save: async (value) => value,
      stream: async ({ handlers }) => {
        handlers.onDelta('private old account text');
        current = false;
        store.getState().reset();
        store.getState().setSessions([{ ...session, id: 'replacement', messages: [] }]);
      },
    });
    assert.deepEqual(store.getState().sessions[0].messages, []);
    assert.equal(store.getState().sessions[0].id, 'replacement');
  } finally { store.getState().reset(); }
});
