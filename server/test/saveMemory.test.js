// @ts-check
/**
 * save_memory executor tests.
 *
 * The auth/empty-text/project-scope guards run before any database
 * access, so they are tested without DATABASE_URL. Insert and dedupe
 * paths are DB-backed; when the db is not initialised the executor must
 * surface a retryable memory_write_failed rather than throwing.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { executeSaveMemory } from '../src/routes/chat/pipeline/executors/saveMemory.js';

const call = { id: 'call-1', name: 'save_memory', arguments: {} };

function ctx(overrides = {}) {
  return {
    emitter: { event() {} },
    req: {},
    projectIdFromBody: null,
    ...overrides,
  };
}

describe('save_memory executor: guards', () => {
  test('rejects unauthenticated writes', async () => {
    const { result } = await executeSaveMemory({ text: 'fact' }, call, ctx());
    assert.equal(result.status, 'failed');
    assert.equal(result.errorCode, 'auth_required');
    assert.equal(result.retryable, false);
  });

  test('rejects empty text', async () => {
    const { result } = await executeSaveMemory(
      { text: '   ' }, call, ctx({ req: { userId: 'u-1' } }),
    );
    assert.equal(result.status, 'failed');
    assert.equal(result.errorCode, 'missing_text');
    assert.equal(result.retryable, false);
  });

  test('rejects non-string text content', async () => {
    const { result } = await executeSaveMemory(
      { text: 0 }, call, ctx({ req: { userId: 'u-1' } }),
    );
    assert.equal(result.errorCode, 'missing_text');
  });

  test('project scope without an active project fails fast', async () => {
    const { result } = await executeSaveMemory(
      { text: 'project fact', scope: 'project' },
      call, ctx({ req: { userId: 'u-1' }, projectIdFromBody: null }),
    );
    assert.equal(result.errorCode, 'no_active_project');
    assert.equal(result.retryable, false);
  });

  test('failure emits a tool_result event for the UI', async () => {
    const events = [];
    const c = ctx({ req: { userId: 'u-1' } });
    c.emitter = { event: (name, payload) => events.push({ name, payload }) };
    await executeSaveMemory({ text: '' }, call, c);
    assert.equal(events.length, 1);
    assert.equal(events[0].name, 'tool_result');
    assert.equal(events[0].payload.id, 'call-1');
    assert.equal(events[0].payload.errorCode, 'missing_text');
  });
});

describe('save_memory executor: database boundary', () => {
  /* test-runner processes never call initDb(), so getDb() throws here.
     The executor must translate that into a retryable structured error. */
  test('db write failure is retryable, not a crash', async () => {
    const { result } = await executeSaveMemory(
      { text: 'fact' }, call, ctx({ req: { userId: 'u-1' } }),
    );
    assert.equal(result.status, 'failed');
    assert.equal(result.errorCode, 'memory_write_failed');
    assert.equal(result.retryable, true);
  });

  test('project ownership check failure is retryable', async () => {
    const { result } = await executeSaveMemory(
      { text: 'fact', scope: 'project' },
      call, ctx({ req: { userId: 'u-1' }, projectIdFromBody: '00000000-0000-0000-0000-000000000000' }),
    );
    assert.equal(result.errorCode, 'memory_write_failed');
    assert.equal(result.retryable, true);
  });
});
