import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionMessageSchema } from '../src/routes/sessions/payload.ts';

/**
 * The session-save contract is intentionally a subset of the persisted
 * contracts.Message: id/createdAt/feedback/citations are server-owned or
 * derived on read, so a client save may not set them.
 */
test('session save accepts the persisted Message fields it owns', () => {
  const parsed = SessionMessageSchema.parse({
    role: 'assistant',
    clientId: 'client-1',
    rawText: 'hello',
    content: '<p>hello</p>',
    html: '<p>hello</p>',
    type: 'assistant',
    sources: [{ title: 'source' }],
    reasoningContent: 'thinking',
    turnRuntime: { version: 1 },
    attachments: [{
      id: 'file-1', kind: 'pdf', name: 'paper.pdf', mime: 'application/pdf', size: 12, fileId: 'file-1',
    }],
    toolCalls: [{
      id: 'call-1', name: 'web_search', input: { query: 'q' }, output: 'result', isError: false,
    }],
  });

  assert.equal(parsed.role, 'assistant');
  assert.equal(parsed.clientId, 'client-1');
  assert.equal(parsed.rawText, 'hello');
  assert.equal(parsed.reasoningContent, 'thinking');
  assert.equal(parsed.attachments[0].fileId, 'file-1');
  assert.equal(parsed.toolCalls[0].name, 'web_search');
});

test('session save strips server-owned or derived Message fields', () => {
  const parsed = SessionMessageSchema.parse({
    role: 'user',
    rawText: 'hello',
    id: 'server-row-id',
    createdAt: '2026-01-01T00:00:00.000Z',
    feedback: 'up',
    citations: [{ id: 'c1', url: 'https://example.test' }],
  });

  assert.equal(parsed.id, undefined);
  assert.equal(parsed.createdAt, undefined);
  assert.equal(parsed.feedback, undefined);
  assert.equal(parsed.citations, undefined);
});
