import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { marked } from 'marked';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.t = (key) => key;
let parses = 0;
globalThis.marked = { parse(...args) { parses++; return marked.parse(...args); } };
const { restoreSessionMessage } = await import('../src/session/historyRestore.ts');

test('restoring raw-only assistant history keeps canonical data without parsing offscreen prose', () => {
  parses = 0;
  const rawText = 'An **answer** with a <definition><term>term</term><body>definition</body></definition>.';
  const visualizations = [{ version: 1, template: 'bar', payload: { series: [{ data: [1] }] }, extension: { retained: true } }];
  const tool = { id: 'call-1', name: 'render_intelligent_ui', input: { query: 'term' }, output: 'found', textOffset: 10, visualizations };
  const source = { id: 'server-1', clientId: 'client-1', role: 'assistant', rawText,
    toolCalls: [tool], reasoning_content: 'reason', reasoning_duration_sec: 3 };
  const row = restoreSessionMessage(source);
  assert.equal(row.rawText, rawText);
  assert.equal(row.html, '');
  assert.equal(parses, 0);
  assert.equal(row.clientId, 'client-1');
  assert.equal(row.serverId, 'server-1');
  assert.equal(row.restoredFromHistory, true);
  assert.equal(row.reasoningContent, 'reason');
  assert.equal(row.reasoningDurationSec, 3);
  assert.equal(row.toolCalls[0].textOffset, 10);
  assert.deepEqual(row.toolCalls[0].input, tool.input);
  assert.deepEqual(row.toolCalls[0].visualizations, visualizations);
  assert.equal(source.html, undefined);
});

test('HTML snapshots remain compatible, including HTML-only legacy answers and think removal', () => {
  for (const rawText of ['', 'canonical source']) {
    const row = restoreSessionMessage({ id: 'old', role: 'assistant', rawText,
      html: '<details class="think-block">private</details><p>Legacy answer</p>' });
    assert.equal(row.html, '<p>Legacy answer</p>');
    assert.equal(row.rawText, rawText);
    assert.equal(row.clientId, 'old');
  }
  parses = 0;
  const user = restoreSessionMessage({ role: 'user', rawText: 'A **question**' });
  assert.equal(user.html, '');
  assert.equal(user.rawText, 'A **question**');
  assert.equal(parses, 0);
});
