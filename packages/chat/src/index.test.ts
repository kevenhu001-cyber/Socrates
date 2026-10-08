import assert from 'node:assert/strict';
import test from 'node:test';
import { useChatStore, visibleSessions, runChatTurn } from './index.ts';
import type { Session } from '@socrates/contracts';
const row = (id: string, projectId: string | null = null): Session => ({ id, projectId, topic: '', mode: 'chat', messages: [] });
function prepare() { const s = useChatStore.getState(); s.reset(); s.setSessions([row('session-a', 'p'), row('b', 'q')]); s.selectSession('session-a'); }

test('stream stays with its saved UUID after switching conversations and separates reasoning/tools', async () => {
  prepare(); const saved: Session[] = []; let streamId = '';
  await runChatTurn({ sessionId: 'session-a', turnId: 't', text: 'Question', signal: new AbortController().signal, isCurrent: () => true,
    save: async (s) => { saved.push(structuredClone(s)); return { ...row('11111111-1111-4111-8111-111111111111', s.projectId), title: 'Saved' }; },
    stream: async (input) => {
      streamId = input.sessionId;
      useChatStore.getState().selectSession('b'); input.handlers.onReasoning?.('thinking'); input.handlers.onDelta?.('answer');
      input.handlers.onToolUse?.([{ id: 'call', name: 'search', input: { query: 'x' } }]); input.handlers.onToolResult?.({ id: 'call', ok: true, output: 'result', results: [{ url: 'https://example.com' }] });
    },
  });
  assert.equal(streamId, '11111111-1111-4111-8111-111111111111'); assert.equal(saved.length, 2);
  const message = saved[1].messages![1]; assert.equal(message.rawText, 'answer'); assert.equal(message.reasoningContent, 'thinking'); assert.equal(message.toolCalls?.length, 1); assert.equal(message.toolCalls?.[0].output, 'result');
  assert.equal(useChatStore.getState().sessions.find((s) => s.id === 'b')!.messages!.length, 0); assert.equal(useChatStore.getState().status, 'idle');
});
test('session creation failure does not call stream and keeps unsaved messages with an error', async () => {
  prepare(); let streamed = false;
  await runChatTurn({ sessionId: 'session-a', turnId: 't', text: 'Question', signal: new AbortController().signal, isCurrent: () => true, save: async () => { throw new Error('Offline'); }, stream: async () => { streamed = true; } });
  assert.equal(streamed, false); assert.equal(useChatStore.getState().error, 'Offline'); assert.equal(useChatStore.getState().sessions[0].messages![0].rawText, 'Question');
});
test('assistant-only Tutor turn sends a private prompt and keeps it out of the transcript', async () => {
  prepare();
  useChatStore.getState().patchSession('session-a', { mode: 'tutor' });
  useChatStore.getState().setDraft('keep my draft');
  const saved: Session[] = [];
  await runChatTurn({
    sessionId: 'session-a', turnId: 'assistant-turn', text: '', assistantPrompt: 'Continue the lesson from where we left off.',
    signal: new AbortController().signal, isCurrent: () => true,
    save: async (session) => { saved.push(structuredClone(session)); return { ...session, id: 'server' }; },
    stream: async ({ messages, handlers }) => {
      assert.deepEqual(messages.map((message) => [message.role, message.rawText]), [['user', 'Continue the lesson from where we left off.']]);
      handlers.onDelta?.('Next question');
    },
  });
  const transcript = useChatStore.getState().sessions[0].messages!;
  assert.deepEqual(transcript.map((message) => [message.role, message.rawText]), [['assistant', 'Next question']]);
  assert.equal(useChatStore.getState().draft, 'keep my draft');
  assert.equal(saved[0].messages?.length, 1);
  assert.equal(saved[1].messages?.length, 1);
});
test('stopped turn saves partial answer before becoming idle', async () => {
  prepare(); const controller = new AbortController(); const saved: Session[] = [];
  await runChatTurn({ sessionId: 'session-a', turnId: 't', text: 'Question', signal: controller.signal, isCurrent: () => true, save: async (s) => { saved.push(structuredClone(s)); return { ...s, id: 'server' }; }, stream: async ({ handlers }) => { handlers.onDelta?.('partial'); controller.abort(); controller.signal.throwIfAborted(); } });
  assert.equal(saved[1].messages![1].rawText, 'partial'); assert.equal(useChatStore.getState().status, 'idle');
});
test('account reset invalidates old turn callbacks and prevents further save', async () => {
  prepare(); let saves = 0; let current = true;
  await runChatTurn({ sessionId: 'session-a', turnId: 't', text: 'Question', signal: new AbortController().signal, isCurrent: () => current, save: async (s) => { saves++; return { ...s, id: 'server' }; }, stream: async ({ handlers }) => { current = false; useChatStore.getState().reset(); handlers.onDelta?.('old account'); } });
  assert.equal(saves, 1); assert.deepEqual(useChatStore.getState().sessions, []);
});
test('project removal deletes its conversations; archive/filter chooses visible session or null', () => {
  prepare(); const s = useChatStore.getState(); s.archiveSession('session-a', 'p'); assert.equal(useChatStore.getState().activeSessionId, null);
  s.removeProject('p'); assert.deepEqual(useChatStore.getState().sessions.map((s) => s.id), ['b']); assert.equal(s.selectProject('empty'), null);
});
test('session purge hides the departing active row for one transition boundary, then drops it', () => {
  prepare(); const s = useChatStore.getState();
  s.deleteSession('session-a', 'p');
  assert.deepEqual(visibleSessions(useChatStore.getState().sessions).map((session) => session.id), ['b']);
  assert.ok(useChatStore.getState().sessions.find((session) => session.id === 'session-a')?.archivedAt);
  assert.equal(useChatStore.getState().activeSessionId, null);
  // Explicit navigation cleans the hidden transition row.
  s.selectSession('b');
  assert.deepEqual(useChatStore.getState().sessions.map((session) => session.id), ['b']);
  s.deleteSession('b', null);
  assert.deepEqual(visibleSessions(useChatStore.getState().sessions), []);
  assert.ok(useChatStore.getState().sessions.find((session) => session.id === 'b')?.archivedAt);
  assert.equal(useChatStore.getState().activeSessionId, null);
  s.selectSession(null);
  assert.deepEqual(useChatStore.getState().sessions, []);
});
test('destructive reconciliation retains the old active id, while real adoption removes it', () => {
  const s = useChatStore.getState(); s.reset();
  s.setSessions([row('server-a'), row('server-b')]); s.selectSession('server-a');
  s.reconcileSessions([row('server-b')]);
  assert.equal(useChatStore.getState().activeSessionId, 'server-b');
  assert.ok(useChatStore.getState().sessions.some((session) => session.id === 'server-a'));
  assert.deepEqual(visibleSessions(useChatStore.getState().sessions).map((session) => session.id), ['server-b']);
  s.selectSession('server-b');
  assert.equal(useChatStore.getState().sessions.some((session) => session.id === 'server-a'), false);

  s.setSessions([row('session-local'), row('server-b')]); s.selectSession('session-local');
  s.adoptSessionId('session-local', row('11111111-1111-4111-8111-111111111111'));
  assert.equal(useChatStore.getState().activeSessionId, '11111111-1111-4111-8111-111111111111');
  assert.equal(useChatStore.getState().sessions.some((session) => session.id === 'session-local'), false);
});
test('unarchive clears the flag on known rows and inserts fetched archived rows', () => {
  prepare(); const s = useChatStore.getState();
  s.archiveSession('session-a', null);
  assert.ok(useChatStore.getState().sessions.find((x) => x.id === 'session-a')?.archivedAt);
  s.unarchiveSession('session-a');
  assert.equal(useChatStore.getState().sessions.find((x) => x.id === 'session-a')?.archivedAt, null);
  s.unarchiveSession('archived-server', { ...row('archived-server'), title: 'Old', archivedAt: '2026-01-01' });
  const inserted = useChatStore.getState().sessions.find((x) => x.id === 'archived-server');
  assert.equal(inserted?.title, 'Old');
  assert.equal(inserted?.archivedAt, null);
});
test('metadata reconciliation preserves loaded messages, removes vanished server rows and sorts pinned first', () => {
  prepare(); const s = useChatStore.getState(); s.patchSession('b', { messages: [{ role: 'assistant', rawText: 'loaded' }] });
  s.reconcileSessions([{ ...row('b'), title: 'Renamed', pinned: true }, { ...row('c'), updatedAt: '2026-10-07' }]);
  assert.equal(useChatStore.getState().sessions[0].id, 'b'); assert.equal(useChatStore.getState().sessions[0].messages![0].rawText, 'loaded'); assert.equal(useChatStore.getState().sessions[0].title, 'Renamed');
  assert.equal(visibleSessions(useChatStore.getState().sessions, 'empty').length, 0);
});
test('metadata reconciliation merges a remote welcome row with its local seed', () => {
  const s = useChatStore.getState(); s.reset();
  s.setSessions([{ ...row('welcome'), title: 'Welcome to Socrates', messages: [{ role: 'assistant', rawText: 'How can I help?' }] }]);
  s.selectSession('welcome');
  s.reconcileSessions([{ ...row('welcome'), title: 'Welcome to Socrates', updatedAt: '2026-10-08' }]);
  const welcomes = useChatStore.getState().sessions.filter((session) => session.id === 'welcome');
  assert.equal(welcomes.length, 1);
  assert.equal(welcomes[0].messages?.[0].rawText, 'How can I help?');
  assert.equal(useChatStore.getState().activeSessionId, 'welcome');
});

test('tool call argument snapshots replace rather than repeat cumulative text', async () => {
  prepare();
  await runChatTurn({ sessionId: 'session-a', turnId: 't', text: 'Question', signal: new AbortController().signal, isCurrent: () => true, save: async (s) => ({ ...s, id: 'server' }), stream: async ({ handlers }) => {
    handlers.onToolCallDelta?.({ index: 0, id: 'call', name: 'search', arguments: '{"q":' });
    handlers.onToolCallDelta?.({ index: 0, id: null, name: null, arguments: '{"q":"x"}', final: true });
  } });
  assert.equal(useChatStore.getState().sessions[0].messages?.[1].toolCalls?.[0].argumentsText, '{"q":"x"}');
});
test('turn attachments ride on the user message and persist with the turn', async () => {
  prepare(); const saved: Session[] = [];
  await runChatTurn({ sessionId: 'session-a', turnId: 't', text: 'Read this', attachments: [{ id: 'f1', kind: 'text', name: 'notes.txt', mime: 'text/plain', size: 3, text: 'abc' }], signal: new AbortController().signal, isCurrent: () => true,
    save: async (s) => { saved.push(structuredClone(s)); return { ...s, id: 'server' }; },
    stream: async ({ messages, handlers }) => {
      const user = messages.find((m) => m.clientId === 't-user');
      assert.equal(user?.attachments?.[0].text, 'abc');
      handlers.onDelta?.('done');
    },
  });
  assert.equal(saved[1].messages![0].attachments?.[0].name, 'notes.txt');
});
test('persistAttachments enriches the user message before streaming', async () => {
  prepare(); const streamed: Array<string | undefined> = []; let serverId = '';
  await runChatTurn({
    sessionId: 'session-a', turnId: 't', text: 'Read this',
    attachments: [{ id: 'f1', kind: 'document', name: 'report.pdf', mime: 'application/pdf', size: 3 }],
    signal: new AbortController().signal, isCurrent: () => true,
    save: async (s) => ({ ...s, id: 'server' }),
    persistAttachments: async (sessionId) => {
      serverId = sessionId;
      return [{ id: 'f1', kind: 'document', name: 'report.pdf', mime: 'application/pdf', size: 3, fileId: 'file-1' }];
    },
    stream: async ({ messages }) => {
      streamed.push(messages.find((m) => m.clientId === 't-user')?.attachments?.[0].fileId);
    },
  });
  assert.equal(serverId, 'server');
  assert.deepEqual(streamed, ['file-1']);
});
test('rewindSession edits a user turn locally and returns the dropped tail', () => {
  prepare();
  const s = useChatStore.getState();
  s.appendMessage({ clientId: 'u1', role: 'user', rawText: 'first' }, 'session-a');
  s.appendMessage({ clientId: 'a1', role: 'assistant', rawText: 'reply one' }, 'session-a');
  s.appendMessage({ clientId: 'u2', role: 'user', rawText: 'second' }, 'session-a');
  s.appendMessage({ clientId: 'a2', role: 'assistant', rawText: 'reply two' }, 'session-a');
  const dropped = useChatStore.getState().rewindSession('session-a', 'u1', 'first, revised');
  assert.deepEqual(dropped?.map((m) => m.clientId), ['a1', 'u2', 'a2']);
  const kept = useChatStore.getState().sessions[0].messages!;
  assert.deepEqual(kept.map((m) => m.clientId), ['u1']);
  assert.equal(kept[0].rawText, 'first, revised');
});

test('rewindSession without text only drops the tail; unknown anchors return null', () => {
  prepare();
  const s = useChatStore.getState();
  s.appendMessage({ clientId: 'u1', role: 'user', rawText: 'first' }, 'session-a');
  s.appendMessage({ clientId: 'a1', role: 'assistant', rawText: 'reply' }, 'session-a');
  const dropped = useChatStore.getState().rewindSession('session-a', 'u1');
  assert.deepEqual(dropped?.map((m) => m.clientId), ['a1']);
  assert.equal(useChatStore.getState().rewindSession('session-a', 'missing'), null);
  assert.equal(useChatStore.getState().rewindSession('nope', 'u1'), null);
});
test('a failed attachment upload leaves the turn intact', async () => {
  prepare(); let streamed = false;
  await runChatTurn({
    sessionId: 'session-a', turnId: 't', text: 'Read this', signal: new AbortController().signal, isCurrent: () => true,
    save: async (s) => ({ ...s, id: 'server' }),
    persistAttachments: async () => { throw new Error('upload down'); },
    stream: async () => { streamed = true; },
  });
  assert.equal(streamed, true);
  assert.equal(useChatStore.getState().status, 'idle');
});
