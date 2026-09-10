// @ts-check
/**
 * M1 chat-turns validation tests (no DB required).
 *
 * createChatTurn validates clientTurnId before touching the database,
 * and setChatTurnStatus rejects unknown statuses before any update.
 * DB-backed idempotency/replay is covered by integration suites that
 * run when DATABASE_URL is set.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHAT_TURN_STATUSES,
  createChatTurn,
  setChatTurnStatus,
} from '../src/services/chatTurns.js';

describe('chatTurns: input validation (no DB)', () => {
  test('createChatTurn rejects empty clientTurnId without a database', async () => {
    await assert.rejects(
      () => createChatTurn({ userId: '00000000-0000-0000-0000-000000000000', clientTurnId: '  ' }),
      (err) => err && err.status === 400 && /clientTurnId/.test(err.message),
    );
  });

  test('createChatTurn rejects overlong clientTurnId without a database', async () => {
    await assert.rejects(
      () =>
        createChatTurn({
          userId: '00000000-0000-0000-0000-000000000000',
          clientTurnId: 'x'.repeat(201),
        }),
      (err) => err && err.status === 400,
    );
  });

  test('setChatTurnStatus rejects unknown status without a database', async () => {
    await assert.rejects(() => setChatTurnStatus('turn-1', 'bogus'), (err) => err && err.status === 400);
  });

  test('status vocabulary covers the full turn lifecycle', () => {
    for (const expected of ['queued', 'running', 'awaiting_approval', 'completed', 'failed', 'interrupted']) {
      assert.ok(CHAT_TURN_STATUSES.includes(expected), `missing status ${expected}`);
    }
  });
});
