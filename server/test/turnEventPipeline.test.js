import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { runChatStreamPipeline } from '../src/routes/chat/pipeline/runChatStreamPipeline.js';
import { shutdownPubsub } from '../src/lib/pubsub.js';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
after(async () => {
  await shutdownPubsub();
  const { stopContentExtractorPool } = await import('../src/services/embeddings/contentExtractor.js');
  await stopContentExtractorPool();
});
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

test('native fetch → prose → citation and UI patch tools publish ordered runtime events', { timeout: 15000 }, async () => {
  const dns = await import('node:dns/promises');
  const lookup = dns.default.lookup;
  const frames = [];
  const req = new EventEmitter();
  req.app = { locals: {} }; req.body = {};
  const res = new EventEmitter();
  res.writeHead = () => res; res.flushHeaders = () => {};
  res.write = (text) => { frames.push(text); return true; };
  res.end = () => { res.writableEnded = true; res.emit('finish'); };
  const node = { id: 'panel', type: 'panel', title: 'Initial result', state: { count: 1 } };
  let providerRequests = 0;
  const call = (index, id, name, args) => ({ index, id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
  const response = (delta, reason = 'tool_calls') => new Response(frame({ choices: [{ delta }] }) + frame({ choices: [{ delta: {}, finish_reason: reason }] }) + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  dns.default.lookup = async () => [{ address: '8.8.8.8', family: 4 }];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('evidence.test')) return new Response('The official result is 42.', { headers: { 'Content-Type': 'text/plain' } });
    providerRequests++;
    const body = JSON.parse(init.body);
    if (providerRequests === 1) return response({ tool_calls: [call(0, 'fetch', 'web_fetch', { url: 'https://evidence.test/guide' }), call(1, 'ui', 'render_intelligent_ui', { version: 1, nodes: [node] })] });
    if (providerRequests === 2) {
      const fetched = body.messages.find((message) => message.role === 'tool' && message.tool_call_id === 'fetch');
      assert.match(fetched.content, /Source ID: source-1/);
      return response({ content: 'The official result is 42.\n\n', tool_calls: [
        call(0, 'cite', 'cite_sources', { claims: [{ quote: 'The official result is 42.', sourceIds: ['source-1'] }] }),
        call(1, 'patch', 'patch_intelligent_ui', { surfaceId: 'ui', revision: 0, operations: [{ op: 'patch', nodeId: 'panel', props: { title: 'Confirmed result' } }] }),
      ] });
    }
    const patched = body.messages.find((message) => message.role === 'tool' && message.tool_call_id === 'patch');
    assert.match(patched.content, /revision 1/);
    return response({ content: 'The source supports the result.' }, 'stop');
  };
  try {
    await runChatStreamPipeline({ req, res, prep: { payload: {
      messages: [{ role: 'system', content: 'Base' }, { role: 'user', content: 'Check the official result and update a visual.' }],
      provider: { url: 'https://provider.example/v1', keyPlaintext: 'test', model: 'test-model' }, mode: 'chat', maxTokens: 512,
    } }, sessionIdFromQuery: null, projectIdFromBody: null, turnId: null });
  } finally { dns.default.lookup = lookup; }
  const { reduceTurnEvent } = await import('../../packages/core/src/turnRuntime.js');
  const events = frames.filter((text) => text.startsWith('event: turn_event')).map((text) => JSON.parse(text.split('data: ')[1]));
  const runtime = events.reduce(reduceTurnEvent, null);
  assert.equal(providerRequests, 3);
  assert.equal(runtime.lifecycle, 'done');
  assert.equal(runtime.sources[0].url, 'https://evidence.test/guide');
  assert.equal(runtime.claims[0].quote, 'The official result is 42.');
  assert.equal(runtime.citations[0].sourceId, runtime.sources[0].id);
  assert.equal(runtime.uiSurfaces[0].revision, 1);
  assert.equal(runtime.uiSurfaces[0].nodes[0].title, 'Confirmed result');
  assert.equal(frames.some((frame) => frame.includes('"status":"failed"')), false);
  assert.deepEqual(events.map((event) => event.seq), events.map((_, index) => index + 1));
});
