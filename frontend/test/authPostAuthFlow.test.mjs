import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLegacyMigrationPayload, fetchWithAuthGraceRetry, restoreRoutedSession } from '../src/auth/postAuth/flow.js';
import { migrateLegacyStorage } from '../src/auth/postAuth/migration.js';

test('migration payload includes saved sessions and the active provider only', () => {
  const payload = buildLegacyMigrationPayload(
    JSON.stringify([{ id: 'session-1' }]),
    JSON.stringify({
      activeId: 'active',
      providers: [
        { id: 'other', label: 'Other', key: 'other-key' },
        { id: 'active', label: 'Active', url: 'https://api.example.test', model: 'model-a', key: 'active-key' },
      ],
    }),
  );

  assert.deepEqual(payload, {
    localSessions: [{ id: 'session-1' }],
    localApi: {
      label: 'Active', url: 'https://api.example.test', model: 'model-a', key: 'active-key',
    },
  });
});

test('invalid migration entries are reported and do not block valid entries', () => {
  const reports = [];
  const payload = buildLegacyMigrationPayload('invalid-json', '{', (...args) => reports.push(args));

  assert.equal(payload, null);
  assert.deepEqual(reports.map(([, context]) => context), [
    'auth/postAuth.migrate.parseSessions',
    'auth/postAuth.migrate.parseApi',
  ]);
});

test('legacy storage is cleared only after the server accepts the migration', async () => {
  const data = new Map([
    ['socrates-api', null],
    ['socrates-sessions-v2', JSON.stringify([{ id: 'session-2' }])],
  ]);
  const storage = {
    getItem: (key) => data.get(key),
    removeItem: (key) => data.set(key, null),
  };
  const requests = [];
  const migrated = await migrateLegacyStorage({
    storage,
    post: async (...args) => requests.push(args),
    report: () => {},
  });

  assert.equal(migrated, true);
  assert.deepEqual(requests, [['/api/migrate', { method: 'POST', body: { localSessions: [{ id: 'session-2' }] } }]]);
  assert.equal(data.get('socrates-sessions-v2'), null);

  data.set('socrates-sessions-v2', JSON.stringify([{ id: 'keep-on-failure' }]));
  const failed = await migrateLegacyStorage({
    storage,
    post: async () => { throw new Error('offline'); },
    report: () => {},
  });
  assert.equal(failed, false);
  assert.notEqual(data.get('socrates-sessions-v2'), null);
});

test('bootstrap fetch retries one 401 inside the auth grace window', async () => {
  let calls = 0;
  const delays = [];
  const result = await fetchWithAuthGraceRetry(async () => {
    calls += 1;
    if (calls === 1) throw Object.assign(new Error('cookie pending'), { status: 401 });
    return 'ready';
  }, {
    isInGraceWindow: () => true,
    wait: async (milliseconds) => delays.push(milliseconds),
  });

  assert.equal(result, 'ready');
  assert.equal(calls, 2);
  assert.deepEqual(delays, [500]);
});

test('bootstrap fetch does not retry outside grace or for non-401 failures', async () => {
  let calls = 0;
  const unauthorized = Object.assign(new Error('expired'), { status: 401 });
  await assert.rejects(fetchWithAuthGraceRetry(async () => {
    calls += 1;
    throw unauthorized;
  }, { isInGraceWindow: () => false }), unauthorized);
  assert.equal(calls, 1);

  const offline = Object.assign(new Error('offline'), { status: 0 });
  await assert.rejects(fetchWithAuthGraceRetry(async () => {
    calls += 1;
    throw offline;
  }, { isInGraceWindow: () => true }), offline);
  assert.equal(calls, 2);
  assert.equal(await fetchWithAuthGraceRetry(null), null);
});

test('a failed retry is returned to the auth-expired lifecycle', async () => {
  let calls = 0;
  const retryError = Object.assign(new Error('session expired'), { status: 401 });
  await assert.rejects(fetchWithAuthGraceRetry(async () => {
    calls += 1;
    throw retryError;
  }, {
    isInGraceWindow: () => true,
    wait: async () => {},
  }), retryError);
  assert.equal(calls, 2);
});

test('chat route wins over exam route and clears only the failed route', async () => {
  const calls = [];
  const restored = await restoreRoutedSession({
    chatId: 'chat-1',
    examId: 'exam-1',
    loadSession: async (id) => { calls.push(['load', id]); throw new Error('not found'); },
    onChatFailure: () => calls.push(['clear', 'chat']),
    onExamFailure: () => calls.push(['clear', 'exam']),
  });

  assert.equal(restored, false);
  assert.deepEqual(calls, [['load', 'chat-1'], ['clear', 'chat']]);
});

test('exam route restores when no chat route exists', async () => {
  const calls = [];
  const restored = await restoreRoutedSession({
    chatId: null,
    examId: 'exam-2',
    loadSession: async (id) => calls.push(id),
    onChatFailure: () => assert.fail('chat failure callback should not run'),
    onExamFailure: () => assert.fail('exam failure callback should not run'),
  });

  assert.equal(restored, true);
  assert.deepEqual(calls, ['exam-2']);
});
