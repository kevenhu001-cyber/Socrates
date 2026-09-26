// @ts-check
/**
 * Unit tests for sanitizeSessionPayload in src/routes/sessions.ts.
 *
 * The sanitizer is the pre-parse safety net in front of the Zod schema:
 * every field budget must be enforced BEFORE validation or the whole
 * session save 400s (sticky failure — every later save re-sends the same
 * oversize state). Production hit exactly this on 2026-09-25: a search
 * toolCall whose results[7].snippet exceeded 5 000 chars rejected the
 * save, because nested item fields were clipped by array length only.
 *
 * Run with: node --experimental-strip-types --test test/sessionSanitizer.test.js
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizeSessionPayload, SessionPayloadSchema } from '../src/routes/sessions.ts';

function payloadWithToolCall(toolCall) {
  return {
    messages: [{ role: 'assistant', rawText: 'ok', toolCalls: [toolCall] }],
  };
}

test('oversized results[].snippet is clipped to the schema bound', () => {
  const toolCall = {
    id: 'c1',
    name: 'web_search',
    results: Array.from({ length: 3 }, (_, i) => ({
      title: `t${i}`,
      url: 'https://example.com/' + 'u'.repeat(4000),
      snippet: 's'.repeat(20_000),
      matchedQuery: 'q'.repeat(2000),
    })),
  };
  const out = sanitizeSessionPayload(payloadWithToolCall(toolCall));
  const results = out.messages[0].toolCalls[0].results;
  assert.equal(results.length, 3);
  for (const r of results) {
    assert.ok(r.snippet.length <= 5000, 'snippet within schema bound');
    assert.ok(r.url.length <= 3000, 'url within schema bound');
    assert.ok(r.matchedQuery.length <= 1000, 'matchedQuery within schema bound');
  }
});

test('artifact item fields are clipped and non-objects normalized', () => {
  const toolCall = {
    id: 'c1',
    name: 'code_interpreter',
    artifacts: [
      { id: 'a'.repeat(500), mimeType: 'm'.repeat(500), name: 'n'.repeat(2000) },
      'not-an-object',
    ],
  };
  const out = sanitizeSessionPayload(payloadWithToolCall(toolCall));
  const artifacts = out.messages[0].toolCalls[0].artifacts;
  assert.equal(artifacts[0].id.length <= 100, true);
  assert.equal(artifacts[0].mimeType.length <= 200, true);
  assert.equal(artifacts[0].name.length <= 500, true);
  assert.deepEqual(artifacts[1], { id: '' });
});

test('structured detail is stringified instead of failing z.string()', () => {
  const toolCall = {
    id: 'c1', name: 'create_plan',
    detail: [{ path: 'steps', message: 'required' }],
  };
  const out = sanitizeSessionPayload(payloadWithToolCall(toolCall));
  const detail = out.messages[0].toolCalls[0].detail;
  assert.equal(typeof detail, 'string');
  assert.ok(detail.includes('required'));
});

test('boolean flags coerce and numeric bounds clamp', () => {
  const toolCall = {
    id: 'c1', name: 'web_search',
    isError: 1, retryable: 'true',
    durationMs: 999_999_999,
    textOffset: 12.7,
    status: 's'.repeat(200),
    runId: 'r'.repeat(500),
  };
  const out = sanitizeSessionPayload(payloadWithToolCall(toolCall));
  const x = out.messages[0].toolCalls[0];
  assert.equal(x.isError, true);
  assert.equal(x.retryable, true);
  assert.equal(x.durationMs, 86_400_000);
  assert.equal(x.textOffset, 12);
  assert.equal(x.status.length, 60);
  assert.equal(x.runId.length, 200);
});

test('non-number durationMs/textOffset normalize to null rather than 400', () => {
  const toolCall = { id: 'c1', name: 'x', durationMs: 'fast', textOffset: 'here' };
  const out = sanitizeSessionPayload(payloadWithToolCall(toolCall));
  const x = out.messages[0].toolCalls[0];
  assert.equal(x.durationMs, null);
  assert.equal(x.textOffset, null);
});

test('sanitized payloads always satisfy the Zod schema (the production 400 regression)', () => {
  /* Mirror the saved shape that rejected POST /api/sessions: a search
     toolCall with a >5 000-char snippet plus structured detail and
     loose-typed flags. */
  const dirty = payloadWithToolCall({
    id: 'call_7', name: 'web_search',
    results: [{ title: 't', url: 'https://x', snippet: 'x'.repeat(12_000) }],
    artifacts: [{ id: 'a'.repeat(300) }],
    detail: { issues: [{ path: 'q', message: 'missing' }] },
    isError: 'yes', retryable: 1,
    durationMs: -5, textOffset: 3.9,
  });
  const sanitized = sanitizeSessionPayload(dirty);
  const parsed = SessionPayloadSchema.safeParse(sanitized);
  assert.equal(parsed.success, true,
    'sanitized payload must pass schema: ' + JSON.stringify(parsed.error?.issues?.slice(0, 5) || []));
});
