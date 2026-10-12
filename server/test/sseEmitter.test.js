// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { SseEmitter } from '../src/routes/chat/pipeline/sseEmitter.js';

function fakeResponse() {
  const events = new EventEmitter();
  const writes = [];
  return {
    writes,
    writableEnded: false,
    destroyed: false,
    flushCount: 0,
    write(chunk) { writes.push(String(chunk)); return true; },
    flush() { this.flushCount += 1; },
    end() { this.writableEnded = true; events.emit('finish'); },
    on: events.on.bind(events),
  };
}

test('coalesces adjacent content frames into one socket write without changing SSE framing', async () => {
  const res = fakeResponse();
  const emitter = new SseEmitter(res, () => false);
  emitter.content('hel');
  emitter.content('lo');
  assert.deepEqual(res.writes, []);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(res.writes.length, 1);
  assert.equal(res.writes[0],
    'data: {"choices":[{"delta":{"content":"hel"}}]}\n\n'
    + 'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n');
  assert.equal(res.flushCount, 1);
});

test('flushes text before an immediate named tool event', () => {
  const res = fakeResponse();
  const emitter = new SseEmitter(res, () => false);
  emitter.content('before');
  emitter.event('tool_use', [{ id: 'c1' }]);
  assert.equal(res.writes.length, 2);
  assert.match(res.writes[0], /before/);
  assert.match(res.writes[1], /^event: tool_use/);
  assert.equal(res.flushCount, 2);
});

test('flushes only the visible answer text before streamed tool arguments and execution progress', () => {
  const res = fakeResponse();
  const emitter = new SseEmitter(res, () => false);
  emitter.content('I will check that for you.');
  emitter.toolCallDelta({
    id: 'call-1', index: 0, name: 'web_search', arguments: '{"query":"hidden tool input"}',
  });
  emitter.event('tool_use', [{ id: 'call-1', name: 'web_search', input: { query: 'hidden tool input' } }]);
  emitter.event('tool_progress', { id: 'call-1', phase: 'running', chunk: '' });

  assert.match(res.writes[0], /^data: /);
  assert.match(res.writes[0], /I will check that for you/);
  assert.doesNotMatch(res.writes[0], /hidden tool input/);
  assert.match(res.writes[1], /^event: tool_call_delta/);
  assert.match(res.writes[2], /^event: tool_use/);
  assert.match(res.writes[3], /^event: tool_progress/);
});

test('finish flushes the final short delta before [DONE] and ends once', () => {
  const res = fakeResponse();
  const emitter = new SseEmitter(res, () => false);
  emitter.content('tail');
  emitter.finish();
  assert.equal(res.writes.length, 2);
  assert.match(res.writes[0], /tail/);
  assert.equal(res.writes[1], 'data: [DONE]\n\n');
  assert.equal(res.writableEnded, true);
});

test('drops queued content if the response is already detached before the batch timer fires', async () => {
  const res = fakeResponse();
  let detached = false;
  const emitter = new SseEmitter(res, () => detached);
  emitter.content('not delivered');
  detached = true;
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.deepEqual(res.writes, []);
});
