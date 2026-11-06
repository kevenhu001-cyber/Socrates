import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIntelligenceUiRecords, splitIntelligenceUiText, stripIntelligenceUiBlocks } from '@socrates/core';

const separator = ']<]minimax[>[';
const program = 'root = Col([Visualization("svg_illustration", "Rayleigh", {"source":"<svg xmlns=\\"http://www.w3.org/2000/svg\\"><text>A & B</text></svg>"})])';
function serialized(source = program) {
  return '<invoke name="render_intelligent_ui">' + separator
    + ['<version>1', '</version>', '<nodes>', '<item>', '<id>fig', '</id>', '<type>openui', '</type>', '<source>' + source, '</source>', '</item>', '</nodes>', '</invoke>'].join(separator)
    + '\n' + separator + '</tool_call>';
}

test('recovers the serialized MiniMax display call seen in restored history', () => {
  const raw = '## An intuitive diagram' + serialized() + '\n\nAfter the diagram: $x$.';
  const segments = splitIntelligenceUiText(raw);
  assert.deepEqual(segments.map(part => part.kind), ['text', 'ui', 'text']);
  assert.equal(segments[0].text, '## An intuitive diagram');
  const ui = segments[1];
  assert.equal(ui.open, false);
  assert.deepEqual(parseIntelligenceUiRecords(ui.source), [{ id: 'fig', type: 'openui', source: program, parent: undefined, state: undefined }]);
  assert.equal(segments[2].start, raw.indexOf('\n\nAfter the diagram'));
  assert.equal(segments[2].text, raw.slice(segments[2].start));
  assert.equal(stripIntelligenceUiBlocks(raw), '## An intuitive diagram\n\nAfter the diagram: $x$.');
});

test('every streaming prefix after the invoke header isolates protocol from prose', () => {
  const header = '<invoke name="render_intelligent_ui">';
  const raw = 'Diagram:\n' + serialized();
  const start = raw.indexOf(header);
  for (let length = start + header.length; length < raw.indexOf('</invoke>'); length++) {
    const segments = splitIntelligenceUiText(raw.slice(0, length));
    assert.equal(segments[0].text, 'Diagram:\n');
    assert.equal(segments[1].kind, 'ui');
    assert.equal(segments[1].start, start);
    assert.equal(segments[1].end, length);
    assert.equal(segments[1].open, true);
  }
});

test('fenced and inline examples remain literal; canonical UI fences still render', () => {
  for (const example of ['```xml\n' + serialized() + '\n```', '`' + serialized().replaceAll('\n', '') + '`']) {
    const parts = splitIntelligenceUiText(example);
    assert.equal(parts.some(part => part.kind === 'ui'), false);
    assert.equal(parts.map(part => part.text).join(''), example);
  }
  const raw = serialized() + '\n```openui\nroot = Col([Text("Next")])\n```';
  assert.equal(splitIntelligenceUiText(raw).filter(part => part.kind === 'ui').length, 2);
});

test('handles multiple envelopes without changing surrounding offsets or source strings', () => {
  const one = '<tool_call>' + separator + serialized();
  const raw = 'Before\n' + one + '\nMiddle\n' + one + '\nAfter';
  const parts = splitIntelligenceUiText(raw);
  assert.equal(parts.filter(part => part.kind === 'ui').length, 2);
  for (const part of parts.filter(part => part.kind === 'text')) assert.equal(part.text, raw.slice(part.start, part.end));
  assert.doesNotMatch(parts.filter(part => part.kind === 'text').map(part => part.text).join(''), /minimax|tool_call|invoke/);
});

test('malformed or oversized calls use the unavailable UI path instead of printing raw markup', () => {
  for (const raw of ['<invoke name="render_intelligent_ui"><nodes></nodes></invoke>', serialized('x'.repeat(100_001))]) {
    const [ui] = splitIntelligenceUiText(raw);
    assert.equal(ui.kind, 'ui');
    assert.equal(ui.format, 'openui');
    assert.equal(ui.source, '');
    assert.equal(ui.open, false);
  }
});

test('does not promote any other tool into a renderable call', () => {
  const raw = serialized().replace('render_intelligent_ui', 'delete_file');
  const parts = splitIntelligenceUiText(raw);
  assert.equal(parts.some(part => part.kind === 'ui'), false);
});


test('partial provider separator and tool envelope suffixes do not leak after invoke completion', () => {
  const raw = serialized();
  const end = raw.indexOf('</invoke>') + '</invoke>'.length;
  for (let length = end; length <= raw.length; length++) {
    const parts = splitIntelligenceUiText(raw.slice(0, length));
    assert.equal(parts.some(part => part.kind === 'text' && part.text.trim()), false, raw.slice(end, length));
  }
});
