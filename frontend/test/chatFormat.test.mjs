import assert from 'node:assert/strict';
import test from 'node:test';

import { parseToolCall } from '../src/chat/format.ts';

test('tool-call parser accepts JSON, fenced JSON, and tool envelopes', () => {
  const expected = { tool: 'web_search', query: 'cats' };
  assert.deepEqual(parseToolCall('{"tool":"web_search","query":" cats "}'), expected);
  assert.deepEqual(parseToolCall('```json\n{"tool":"web_search","query":"cats"}\n```'), expected);
  assert.deepEqual(parseToolCall('before [TOOL_CALL]{"tool":"web_search","query":"cats"}[/TOOL_CALL] after'), expected);
});

test('tool-call parser retains its loose text fallback and query cap', () => {
  assert.deepEqual(parseToolCall("{'tool':'web_search','query':'cats'}"), {
    tool: 'web_search', query: 'cats',
  });
  assert.deepEqual(parseToolCall('{tool:web_search,query:weather today}'), {
    tool: 'web_search', query: 'weather today',
  });
  assert.equal(parseToolCall(JSON.stringify({ tool: 'web_search', query: 'x'.repeat(250) })).query.length, 200);
});

test('tool-call parser rejects invalid and unrelated payloads', () => {
  assert.equal(parseToolCall(''), null);
  assert.equal(parseToolCall('not a tool call'), null);
  assert.equal(parseToolCall('{"tool":"web_fetch","query":"cats"}'), null);
  /* The loose text fallback deliberately preserves its captured query text. */
  assert.deepEqual(parseToolCall('{"tool":"web_search","query":"  "}'), {
    tool: 'web_search', query: '  ',
  });
});
