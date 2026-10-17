import assert from 'node:assert/strict';
import test from 'node:test';

import {
  initialStateForNodes,
  intelligenceUiChartDomain,
  normalizeIntelligenceUiImageUrl,
  parseIntelligenceUiRecords,
  resolveIntelligenceUiValue,
  splitIntelligenceUiText,
  stripIntelligenceUiBlocks,
} from '@socrates/core';

test('splits prose around a settled intelligent UI fence', () => {
  const text = [
    'Before.',
    '',
    '```socrates-ui',
    '{"id":"panel","type":"panel","title":"Estimate"}',
    '{"id":"metric","type":"metric","parent":"panel","value":42}',
    '```',
    '',
    'After.',
  ].join('\n');

  const segments = splitIntelligenceUiText(text);
  assert.deepEqual(segments.map((segment) => segment.kind), ['text', 'ui', 'text']);
  assert.equal(segments[1].open, false);
  assert.match(segments[1].source, /"metric"/);
  assert.match(segments[0].text, /Before/);
  assert.match(segments[2].text, /After/);
});

test('an open streaming fence renders complete JSONL records and defers the partial tail', () => {
  const text = [
    'Live result:',
    '```socrates-ui',
    '{"id":"panel","type":"panel","state":{"users":5}}',
    '{"id":"slider","type":"slider","parent":"panel","bind":"users"}',
    '{"id":"partial","type":"metric",',
  ].join('\n');

  const segments = splitIntelligenceUiText(text);
  const ui = segments.find((segment) => segment.kind === 'ui');
  assert.ok(ui);
  assert.equal(ui.open, true);

  const nodes = parseIntelligenceUiRecords(ui.source);
  assert.equal(nodes.length, 2);
  assert.deepEqual(nodes.map((node) => node.id), ['panel', 'slider']);
  assert.deepEqual(initialStateForNodes(nodes), { users: 5 });
});

test('rejects unknown node types, unsafe ids, and duplicate ids', () => {
  const source = [
    '{"id":"ok","type":"panel"}',
    '{"id":"ok","type":"metric"}',
    '{"id":"bad id","type":"panel"}',
    '{"id":"script","type":"script"}',
  ].join('\n');

  assert.deepEqual(parseIntelligenceUiRecords(source).map((node) => node.id), ['ok']);
});

test('accepts only the four registered v2 native node types', () => {
  const source = [
    '{"id":"chart","type":"chart"}',
    '{"id":"tabs","type":"tabs"}',
    '{"id":"entity","type":"entity"}',
    '{"id":"gallery","type":"image-gallery"}',
    '{"id":"iframe","type":"iframe"}',
  ].join('\n');

  assert.deepEqual(
    parseIntelligenceUiRecords(source).map((node) => node.type),
    ['chart', 'tabs', 'entity', 'image-gallery'],
  );
});

test('evaluates local state expressions without executing code', () => {
  const context = { state: { users: 5, price: 20 } };
  const value = resolveIntelligenceUiValue({
    op: 'mul',
    args: [{ state: 'users' }, { state: 'price' }],
  }, context);
  assert.equal(value, 100);

  const conditional = resolveIntelligenceUiValue({
    op: 'if',
    args: [
      { op: 'gte', args: [{ state: 'users' }, 5] },
      'team',
      'solo',
    ],
  }, context);
  assert.equal(conditional, 'team');
});

test('can bind values from an existing tool record by index or id', () => {
  const tools = [
    { id: 'search-1', results: [{ title: 'A', score: 0.9 }] },
    { id: 'calc-1', output: { total: 42 } },
  ];
  const context = { state: {}, tools };

  assert.equal(
    resolveIntelligenceUiValue({ tool: 0, path: 'results.0.title' }, context),
    'A',
  );
  assert.equal(
    resolveIntelligenceUiValue({ tool: 'calc-1', path: 'output.total' }, context),
    42,
  );
  assert.equal(
    resolveIntelligenceUiValue({ tool: 'calc-1', path: '__proto__.polluted' }, context),
    undefined,
  );
});

test('image URLs are restricted to absolute credential-free HTTP(S)', () => {
  assert.equal(
    normalizeIntelligenceUiImageUrl('https://example.com/reference.png'),
    'https://example.com/reference.png',
  );
  assert.equal(
    normalizeIntelligenceUiImageUrl('http://example.com/reference.png'),
    'http://example.com/reference.png',
  );
  assert.equal(normalizeIntelligenceUiImageUrl('/relative.png'), null);
  assert.equal(normalizeIntelligenceUiImageUrl('data:image/png;base64,AAAA'), null);
  assert.equal(normalizeIntelligenceUiImageUrl('javascript:alert(1)'), null);
  assert.equal(normalizeIntelligenceUiImageUrl('https://user:pass@example.com/private.png'), null);
});

test('chart domains include a zero baseline and remain finite for degenerate input', () => {
  assert.deepEqual(intelligenceUiChartDomain([4, 8]), [0, 8]);
  assert.deepEqual(intelligenceUiChartDomain([-3, -1]), [-3, 0]);
  assert.deepEqual(intelligenceUiChartDomain([-4, 12]), [-4, 12]);
  assert.deepEqual(intelligenceUiChartDomain([0, 0]), [0, 1]);
  assert.deepEqual(intelligenceUiChartDomain(['not-a-number']), [0, 1]);
});

test('copy and TTS helpers can remove UI source while preserving prose', () => {
  const text = [
    'Use this result.',
    '',
    '```socrates-ui',
    '{"id":"panel","type":"panel"}',
    '```',
    '',
    'Then continue.',
  ].join('\n');

  const stripped = stripIntelligenceUiBlocks(text);
  assert.doesNotMatch(stripped, /socrates-ui|"type":"panel"/);
  assert.match(stripped, /Use this result/);
  assert.match(stripped, /Then continue/);
});
