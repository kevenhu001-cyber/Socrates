import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { runChatStreamPipeline } from '../src/routes/chat/pipeline/runChatStreamPipeline.js';
import { shutdownPubsub } from '../src/lib/pubsub.js';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
after(shutdownPubsub);
const frame = (value) => `data: ${JSON.stringify(value)}\n\n`;

test('pipeline publishes the first validated node before upstream arguments finish, then commits and resumes prose', { timeout: 15000 }, async () => {
  const encoder = new TextEncoder();
  const root = { id: 'root', type: 'panel', title: 'Progressive result' };
  const child = { id: 'value', parent: 'root', type: 'metric', label: 'Count', value: 42 };
  const prefix = '{"version":1,"nodes":[' + JSON.stringify(root) + ',';
  const frames = [];
  let requests = 0, previewBeforeComplete = false, released = false, providerStream;
  const release = () => {
    if (released || !providerStream) return;
    released = true;
    providerStream.enqueue(encoder.encode(frame({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: JSON.stringify(child) + ']}' } }] } }] })));
    providerStream.enqueue(encoder.encode(frame({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }) + 'data: [DONE]\n\n'));
    providerStream.close();
  };
  const req = new EventEmitter();
  req.app = { locals: {} }; req.body = {};
  const res = new EventEmitter();
  res.writeHead = () => res; res.flushHeaders = () => {};
  res.write = (text) => {
    frames.push(text);
    if (text.startsWith('event: turn_event') && text.includes('"type":"ui.add"') && !released) {
      previewBeforeComplete = !frames.some((entry) => entry.startsWith('event: tool_use'));
      release();
    }
    return true;
  };
  res.end = () => { res.writableEnded = true; res.emit('finish'); };
  globalThis.fetch = async () => {
    requests++;
    if (requests > 1) return new Response(frame({ choices: [{ delta: { content: 'The completed result.' } }] }) + frame({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    return new Response(new ReadableStream({ start(controller) {
      providerStream = controller;
      controller.enqueue(encoder.encode(frame({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'ui-test', type: 'function', function: { name: 'render_intelligent_ui', arguments: prefix } }] } }] })));
    } }), { headers: { 'Content-Type': 'text/event-stream' } });
  };
  // Let a regression terminate cleanly so the assertion explains the missing preview.
  const fallback = setTimeout(release, 2000);
  try {
    await runChatStreamPipeline({ req, res, prep: { payload: {
      messages: [{ role: 'system', content: 'Base' }, { role: 'user', content: 'Build an estimate.' }],
      provider: { url: 'https://provider.example/v1', keyPlaintext: 'test', model: 'test-model' }, mode: 'chat', maxTokens: 256,
    } }, sessionIdFromQuery: null, projectIdFromBody: null, turnId: null });
  } finally { clearTimeout(fallback); }
  assert.equal(previewBeforeComplete, true);
  const events = frames.filter((text) => text.startsWith('event: turn_event')).map((text) => JSON.parse(text.split('data: ')[1]));
  assert.deepEqual(events.filter((event) => event.type === 'ui.add').map((event) => event.node.id), ['root', 'value']);
  assert.deepEqual(events.find((event) => event.type === 'ui.commit').nodes, [root, child]);
  assert.equal(events.at(-1).type, 'turn.done');
  assert.ok(frames.some((text) => text.includes('The completed result.')));
  assert.equal(requests, 2);
});
