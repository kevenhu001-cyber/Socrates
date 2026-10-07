import assert from 'node:assert/strict';
import test from 'node:test';
import { toolArtifacts, toolDurationLabel, toolFailureText, toolInputPreview, toolInputText, toolLabel, toolOutputText, toolSearchResults, toolState } from './toolModel.ts';

test('tool labels use the known map and prettify unknown names', () => {
  assert.equal(toolLabel('web_search'), 'Search');
  assert.equal(toolLabel('code_interpreter'), 'Code');
  assert.equal(toolLabel('some_new_tool'), 'Some New Tool');
  assert.equal(toolLabel(''), 'Tool');
});

test('input previews stay single-line and tool-aware', () => {
  assert.equal(toolInputPreview('web_search', { query: 'linear algebra' }), 'linear algebra');
  assert.equal(toolInputPreview('code_interpreter', { language: 'python', code: 'import numpy\nprint(1)' }), 'python · import numpy');
  assert.equal(toolInputPreview('render_visualization', { template: 'bar', title: 'Sales' }), 'bar · Sales');
  assert.equal(toolInputPreview('web_search', null), '');
});

test('tool state tracks running, completed and failed phases', () => {
  assert.equal(toolState({ id: '1', name: 'web_search' }), 'running');
  assert.equal(toolState({ id: '1', name: 'web_search', progressPhase: 'queued' }), 'running');
  assert.equal(toolState({ id: '1', name: 'web_search', progressPhase: 'completed' }), 'completed');
  assert.equal(toolState({ id: '1', name: 'web_search', output: 'ok' }), 'completed');
  assert.equal(toolState({ id: '1', name: 'web_search', isError: true }), 'failed');
  assert.equal(toolState({ id: '1', name: 'code_interpreter', progressPhase: 'timeout' }), 'failed');
});

test('duration labels are compact', () => {
  assert.equal(toolDurationLabel(undefined), '');
  assert.equal(toolDurationLabel(0), '');
  assert.equal(toolDurationLabel(350), '350 ms');
  assert.equal(toolDurationLabel(1234), '1.2 s');
  assert.equal(toolDurationLabel(75_000), '1:15');
});

test('search results dedupe and drop unsafe urls to text rows', () => {
  const rows = toolSearchResults({
    id: 's', name: 'web_search',
    results: [
      { title: 'A', url: 'https://example.com/a', snippet: 'first', source: 'engine' },
      { title: 'A', url: 'https://example.com/a', snippet: 'dup' },
      { title: 'B', url: 'javascript:alert(1)' },
      { title: '', url: 'https://sub.example.org/b', date: '2026' },
    ],
  });
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { title: 'A', rawUrl: 'https://example.com/a', url: 'https://example.com/a', host: 'example.com', snippet: 'first', date: '', source: 'engine' });
  assert.equal(rows[1].url, null);
  assert.equal(rows[1].host, '');
  assert.equal(rows[2].host, 'sub.example.org');
  assert.equal(rows[2].date, '2026');
  assert.deepEqual(toolSearchResults({ id: 's', name: 'read_attachment' }), []);
});

test('artifacts normalize live string ids and persisted rows', () => {
  const live = toolArtifacts({ id: 't', name: 'code_interpreter', artifacts: ['file-1'] });
  assert.deepEqual(live, [{ id: 'file-1', mimeType: '', name: 'file-1', kind: 'file' }]);
  const persisted = toolArtifacts({
    id: 't', name: 'code_interpreter',
    artifacts: [
      { id: 'img', mimeType: 'image/png', name: 'plot.png' },
      { id: 'page', mimeType: 'text/html', name: 'report.html' },
      { id: 'doc', mimeType: 'application/pdf', name: 'paper.pdf' },
      { id: '', mimeType: 'image/png' },
    ],
  });
  assert.deepEqual(persisted.map((a) => a.kind), ['image', 'html', 'file']);
  assert.equal(persisted[0].name, 'plot.png');
});

test('output, failure and input text pick the right fields', () => {
  assert.equal(toolOutputText({ id: 't', name: 'code_interpreter', output: 'out', stderr: 'warn' }), 'out\nwarn');
  assert.equal(toolOutputText({ id: 't', name: 'code_interpreter', output: 'same', stderr: 'same' }), 'same');
  assert.equal(toolFailureText({ id: 't', name: 'x', userMessage: '可重试', errorText: 'boom' }), '可重试');
  assert.equal(toolFailureText({ id: 't', name: 'x', errorText: 'boom' }), 'boom');
  assert.equal(toolInputText({ id: 't', name: 'x', argumentsText: '{"a":1}' }), '{"a":1}');
  assert.match(toolInputText({ id: 't', name: 'x', input: { a: 1 } }), /"a": 1/);
});
