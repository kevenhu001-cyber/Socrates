/**
 * Unit tests for the ToolOutput protocol in react/tool-run/toolRunModel.ts.
 *
 * The protocol is the read boundary between the tool runtime's legacy fields
 * (`visualization`, `artifacts`, `output`, `stderr`) and every renderer: old
 * calls get the same list synthesized from those fields, new calls carry
 * `outputs[]` directly. These tests pin identity, order, validation and the
 * compat adapter so live, history and share cannot disagree about what a call
 * produced.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  attachmentOutputsOf,
  automaticAttachmentOutputsOf,
  pythonArtifactMap,
  splitArtifactDirectiveSegments,
  stripArtifactDirectives,
  toolOutputsOf,
  visualizationSpecOf,
} from '../src/react/tool-run/toolRunModel.ts';

const VIZ = {
  version: 1,
  template: 'function',
  title: 'y = x²',
  accessibilitySummary: 'A parabola.',
  payload: { functions: [{ expression: 'x^2' }] },
};

test('legacy calls synthesize the protocol in a fixed order with stable ids', () => {
  const outputs = toolOutputsOf({
    id: 'call-1',
    name: 'code_interpreter',
    input: { code: 'print(1)' },
    visualization: VIZ,
    artifacts: [
      { id: 'file-1', mimeType: 'image/png', name: 'plot.png' },
      { id: 'file-2' },
    ],
    output: '1',
    stderr: 'warning',
  });
  assert.deepEqual(outputs.map((output) => [output.kind, output.id]), [
    ['visualization', 'call-1:visualization:0'],
    ['artifact', 'call-1:artifact:file-1'],
    ['artifact', 'call-1:artifact:file-2'],
    ['text', 'call-1:text:result'],
    ['text', 'call-1:text:stderr'],
  ]);
  assert.equal(outputs[0].spec, VIZ);
  assert.deepEqual(
    { mimeType: outputs[1].mimeType, name: outputs[1].name },
    { mimeType: 'image/png', name: 'plot.png' },
  );
  assert.deepEqual(outputs[3].stream, 'result');
  assert.deepEqual(outputs[3].text, '1');
  assert.deepEqual(outputs[4].stream, 'stderr');
});

test('legacy artifacts dedupe by fileId and drop malformed entries', () => {
  const outputs = toolOutputsOf({
    id: 'call-2',
    name: 'code_interpreter',
    artifacts: [
      { id: 'dup', mimeType: 'text/csv' },
      { id: 'dup', name: 'again.csv' },
      { id: '' },
      null,
      {},
    ],
    output: 'ok',
  });
  assert.deepEqual(
    outputs.filter((output) => output.kind === 'artifact').map((output) => output.id),
    ['call-2:artifact:dup'],
  );
});

test('a streaming render_visualization reads the spec from its arguments', () => {
  const call = {
    id: 'call-3',
    name: 'render_visualization',
    input: VIZ,
    _run: { phase: 'running' },
  };
  assert.equal(visualizationSpecOf(call), VIZ);
  const outputs = toolOutputsOf(call);
  assert.deepEqual(outputs.map((output) => output.kind), ['visualization']);
  assert.equal(outputs[0].spec, VIZ);
});

test('a non-v1 spec is never handed to a renderer', () => {
  assert.equal(visualizationSpecOf({ id: 'x', name: 'render_visualization', input: { version: 2 } }), null);
  assert.equal(visualizationSpecOf({ id: 'x', name: 'Read', visualization: { version: 0 } }), null);
  assert.deepEqual(toolOutputsOf({ id: 'x', name: 'Read', visualization: { version: 2 } }), []);
});

test('persisted outputs win over legacy fields and are validated entry by entry', () => {
  const outputs = toolOutputsOf({
    id: 'call-4',
    name: 'code_interpreter',
    visualization: VIZ,
    artifacts: [{ id: 'legacy-file' }],
    output: 'legacy text',
    outputs: [
      { kind: 'visualization', spec: VIZ },
      { kind: 'visualization', spec: VIZ },
      { kind: 'artifact', fileId: 'file-9', mimeType: 'image/png' },
      { kind: 'artifact', fileId: '' },
      { kind: 'text', stream: 'stdout', text: 'chunk' },
      { kind: 'text', stream: 'nope', text: 'fallback' },
      { kind: 'mystery' },
      null,
    ],
  });
  assert.deepEqual(outputs.map((output) => output.id), [
    'call-4:visualization:0',
    'call-4:artifact:file-9',
    'call-4:text:stdout',
    'call-4:text:result',
  ]);
  // The legacy visualization/artifact/text on the same call must not also
  // appear: the writer's normalized list is authoritative.
  assert.equal(outputs.some((output) => output.kind === 'artifact' && output.fileId === 'legacy-file'), false);
  assert.equal(outputs.some((output) => output.kind === 'text' && output.text === 'legacy text'), false);
  // Empty text and unknown streams collapse to result; empty text is dropped.
  assert.equal(outputs[3].stream, 'result');
  assert.equal(outputs[3].text, 'fallback');
});

test('attachment outputs keep charts and files but leave text in the row', () => {
  const outputs = attachmentOutputsOf({
    id: 'call-5',
    name: 'code_interpreter',
    visualization: VIZ,
    artifacts: [{ id: 'file-5' }],
    output: '3 rows',
  });
  assert.deepEqual(outputs.map((output) => output.kind), ['visualization', 'artifact']);
  assert.deepEqual(attachmentOutputsOf(null), []);
  assert.deepEqual(toolOutputsOf(undefined), []);
});

test('Python files require a prose reference while native visualizations stay automatic', () => {
  const python = {
    id: 'call-python',
    name: 'code_interpreter',
    visualization: VIZ,
    artifacts: [{ id: 'plot-file', mimeType: 'image/png', name: 'plot.png' }],
  };
  assert.deepEqual(
    automaticAttachmentOutputsOf(python).map((output) => output.kind),
    ['visualization'],
  );
  assert.deepEqual(
    automaticAttachmentOutputsOf({
      id: 'call-native',
      name: 'render_visualization',
      visualization: VIZ,
    }).map((output) => output.kind),
    ['visualization'],
  );
});

test('artifact directives resolve only Python-owned ids and dedupe first reference', () => {
  const calls = [
    {
      id: 'python-call',
      name: 'code_interpreter',
      artifacts: [{ id: 'owned-file', mimeType: 'image/png', name: 'plot.png' }],
    },
    {
      id: 'other-call',
      name: 'workspace_agent',
      artifacts: [{ id: 'foreign-file', mimeType: 'image/png', name: 'other.png' }],
    },
  ];
  const map = pythonArtifactMap(calls);
  assert.deepEqual([...map.keys()], ['owned-file']);

  const raw = [
    'Before.',
    '{{artifact:owned-file}}',
    'Middle.',
    '{{artifact:foreign-file}}',
    '{{artifact:owned-file}}',
    'After.',
  ].join('\n');
  const segments = splitArtifactDirectiveSegments(raw, 0, map);
  assert.equal(segments.filter((segment) => segment.kind === 'artifact').length, 1);
  assert.equal(segments.find((segment) => segment.kind === 'artifact').output.fileId, 'owned-file');
  assert.equal(segments.filter((segment) => segment.kind === 'text').map((segment) => segment.text).join(''), 'Before.\nMiddle.\nAfter.');
});

test('malformed, inline and partial reserved artifact syntax never leaks into prose', () => {
  assert.equal(stripArtifactDirectives('A {{artifact:unknown}} B'), 'A  B');
  assert.equal(stripArtifactDirectives('A\n{{artifact:unfinished'), 'A\n');
  assert.equal(stripArtifactDirectives('A\n{{arti'), 'A\n');
  const segments = splitArtifactDirectiveSegments(
    'Lead\n{{artifact:missing}}\nTail\n{{artifact:partial',
    10,
    new Map(),
  );
  assert.equal(segments.map((segment) => segment.text || '').join(''), 'Lead\nTail\n');
  assert.equal(segments.some((segment) => segment.kind === 'artifact'), false);
});
