import assert from 'node:assert/strict';
import test from 'node:test';

import {
  initialStateForNodes,
  intelligentUiChartDomain,
  normalizeIntelligentUiImageUrl,
  normalizeIntelligentUiTone,
  normalizeIntelligentUiTrend,
  parseIntelligentUiRecords,
  resolveIntelligentUiValue,
  splitIntelligentUiText,
  stripIntelligentUiBlocks,
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

  const segments = splitIntelligentUiText(text);
  assert.deepEqual(
    segments.map((segment) => segment.kind),
    ['text', 'ui', 'text'],
  );
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

  const segments = splitIntelligentUiText(text);
  const ui = segments.find((segment) => segment.kind === 'ui');
  assert.ok(ui);
  assert.equal(ui.open, true);

  const nodes = parseIntelligentUiRecords(ui.source);
  assert.equal(nodes.length, 2);
  assert.deepEqual(
    nodes.map((node) => node.id),
    ['panel', 'slider'],
  );
  assert.deepEqual(initialStateForNodes(nodes), { users: 5 });
});

test('rejects unknown node types, unsafe ids, and duplicate ids', () => {
  const source = [
    '{"id":"ok","type":"panel"}',
    '{"id":"ok","type":"metric"}',
    '{"id":"bad id","type":"panel"}',
    '{"id":"script","type":"script"}',
  ].join('\n');

  assert.deepEqual(
    parseIntelligentUiRecords(source).map((node) => node.id),
    ['ok'],
  );
});

test('accepts registered native node types and rejects unknown elements', () => {
  const source = [
    '{"id":"chart","type":"chart"}',
    '{"id":"tabs","type":"tabs"}',
    '{"id":"entity","type":"entity"}',
    '{"id":"image1","type":"image"}',
    '{"id":"gallery","type":"image-gallery"}',
    '{"id":"acc","type":"accordion"}',
    '{"id":"st","type":"steps"}',
    '{"id":"bdg","type":"badge"}',
    '{"id":"notify","type":"toggle","bind":"notify","checked":true}',
    '{"id":"iframe","type":"iframe"}',
  ].join('\n');

  assert.deepEqual(
    parseIntelligentUiRecords(source).map((node) => node.type),
    ['chart', 'tabs', 'entity', 'image', 'image-gallery', 'accordion', 'steps', 'badge', 'toggle'],
  );
});

test('tone and trend hints normalize to the supported vocabulary', () => {
  assert.equal(normalizeIntelligentUiTone('warning'), 'warning');
  assert.equal(normalizeIntelligentUiTone(' DANGER '), 'danger');
  assert.equal(normalizeIntelligentUiTone('urgent'), 'neutral');
  assert.equal(normalizeIntelligentUiTone(undefined), 'neutral');
  assert.equal(normalizeIntelligentUiTrend('up'), 'up');
  assert.equal(normalizeIntelligentUiTrend('sideways'), null);
});

test('evaluates local state expressions without executing code', () => {
  const context = { state: { users: 5, price: 20 } };
  const value = resolveIntelligentUiValue(
    {
      op: 'mul',
      args: [{ state: 'users' }, { state: 'price' }],
    },
    context,
  );
  assert.equal(value, 100);

  const conditional = resolveIntelligentUiValue(
    {
      op: 'if',
      args: [{ op: 'gte', args: [{ state: 'users' }, 5] }, 'team', 'solo'],
    },
    context,
  );
  assert.equal(conditional, 'team');
});

test('can bind values from an existing tool record by index or id', () => {
  const tools = [
    { id: 'search-1', results: [{ title: 'A', score: 0.9 }] },
    { id: 'calc-1', output: { total: 42 } },
  ];
  const context = { state: {}, tools };

  assert.equal(resolveIntelligentUiValue({ tool: 0, path: 'results.0.title' }, context), 'A');
  assert.equal(resolveIntelligentUiValue({ tool: 'calc-1', path: 'output.total' }, context), 42);
  assert.equal(
    resolveIntelligentUiValue({ tool: 'calc-1', path: '__proto__.polluted' }, context),
    undefined,
  );
});

test('image URLs are restricted to absolute credential-free HTTP(S)', () => {
  assert.equal(
    normalizeIntelligentUiImageUrl('https://example.com/reference.png'),
    'https://example.com/reference.png',
  );
  assert.equal(
    normalizeIntelligentUiImageUrl('http://example.com/reference.png'),
    'http://example.com/reference.png',
  );
  assert.equal(
    normalizeIntelligentUiImageUrl(
      '/api/v2/intelligent-ui/image?url=https%3A%2F%2Fexample.com%2Fpic.jpg',
    ),
    '/api/v2/intelligent-ui/image?url=https%3A%2F%2Fexample.com%2Fpic.jpg',
  );
  assert.equal(normalizeIntelligentUiImageUrl('/relative.png'), null);
  assert.equal(normalizeIntelligentUiImageUrl('data:image/png;base64,AAAA'), null);
  assert.equal(normalizeIntelligentUiImageUrl('javascript:alert(1)'), null);
  assert.equal(normalizeIntelligentUiImageUrl('https://user:pass@example.com/private.png'), null);
});

test('chart domains include a zero baseline and remain finite for degenerate input', () => {
  assert.deepEqual(intelligentUiChartDomain([4, 8]), [0, 8]);
  assert.deepEqual(intelligentUiChartDomain([-3, -1]), [-3, 0]);
  assert.deepEqual(intelligentUiChartDomain([-4, 12]), [-4, 12]);
  assert.deepEqual(intelligentUiChartDomain([0, 0]), [0, 1]);
  assert.deepEqual(intelligentUiChartDomain(['not-a-number']), [0, 1]);
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

  const stripped = stripIntelligentUiBlocks(text);
  assert.doesNotMatch(stripped, /socrates-ui|"type":"panel"/);
  assert.match(stripped, /Use this result/);
  assert.match(stripped, /Then continue/);
});

test('OpenUI fences split prose and strip source from copy and speech output', () => {
  const source = 'Before.\n```openui\nroot = Col([Text("Hello")])\n```\nAfter.';
  const segments = splitIntelligentUiText(source);
  assert.deepEqual(
    segments.map((segment) => segment.kind),
    ['text', 'ui', 'text'],
  );
  assert.equal(segments[1].format, 'openui');
  assert.equal(segments[1].open, false);
  assert.match(segments[1].source, /root = Col/);
  assert.equal(stripIntelligentUiBlocks(source), 'Before.\nAfter.');
  const live = splitIntelligentUiText('```openui\nroot = Col([heading])\nheading = Title("Hi');
  assert.equal(live[0].open, true);
  assert.equal(live[0].format, 'openui');
  assert.match(live[0].source, /heading = Title/);
});

test('recovers a validated bare or JSON-fenced document with pretty-printed nodes and original offsets', () => {
  const document = {
    version: 1,
    nodes: [
      {
        id: 'demo',
        type: 'demonstration',
        program: {
          version: 1,
          views: [
            { kind: 'plot', x: [-5, 5], y: [0, 1.05], curves: [{ expression: 'sinc(pi*x)^2' }] },
          ],
        },
      },
    ],
  };
  for (const raw of [
    JSON.stringify(document),
    JSON.stringify(document, null, 2),
    '```json\n' + JSON.stringify(document, null, 2) + '\n```',
    '```socrates-ui\n' + JSON.stringify(document, null, 2) + '\n```',
  ]) {
    const text = '演示如下：\n' + raw + '\n继续说明。';
    const segments = splitIntelligentUiText(text);
    const ui = segments.find((segment) => segment.kind === 'ui');
    assert.ok(ui, raw);
    assert.equal(ui.open, false);
    assert.equal(parseIntelligentUiRecords(ui.source)[0].type, 'demonstration');
    assert.equal(text.slice(ui.start, ui.end), raw);
    assert.match(stripIntelligentUiBlocks(text), /继续说明/);
    assert.doesNotMatch(stripIntelligentUiBlocks(text), /"nodes"/);
  }
});

test('incomplete bare documents reserve a skeleton; ordinary JSON and quoted code stay literal', () => {
  const partial = '演示：\n{"version":1,"nodes":[{"id":"demo","type":"demonstration","program":';
  const ui = splitIntelligentUiText(partial).find((segment) => segment.kind === 'ui');
  assert.equal(ui.open, true);
  assert.deepEqual(parseIntelligentUiRecords(ui.source), []);
  for (const text of [
    '{"foo":42}',
    '`{"version":1,"nodes":[]}`',
    '```python\n{"version":1,"nodes":[]}\n```',
    '{"version":1,"nodes":[{"id":"bad","type":"script"}]}',
  ]) {
    assert.equal(
      splitIntelligentUiText(text).some((segment) => segment.kind === 'ui'),
      false,
    );
  }
});

test('frontend normalization handles string numeric attributes and choice options', async () => {
  const { normalizeIntelligentUiArgs, validateIntelligentUi } = await import('@socrates/core');
  const rawDoc = {
    version: '1',
    nodes: [
      { id: 's1', type: 'slider', bind: 'speed', min: '0', max: '100', step: '5', value: '50' },
      { id: 'c1', type: 'choice', bind: 'mode', options: ['Fast', 'Slow'] },
      {
        id: 'b1',
        type: 'button',
        label: 'Go',
        action: { type: 'set', target: 'speed', value: 100 },
      },
      { id: 't1', type: 'table', columns: ['A', 'B'] },
    ],
  };

  const normalized = normalizeIntelligentUiArgs(rawDoc);
  assert.equal(normalized.version, 1);
  assert.equal(normalized.nodes[0].min, 0);
  assert.equal(normalized.nodes[0].max, 100);
  assert.equal(normalized.nodes[0].step, 5);
  assert.equal(normalized.nodes[0].value, 50);
  assert.deepEqual(normalized.nodes[1].options, [
    { label: 'Fast', value: 'Fast' },
    { label: 'Slow', value: 'Slow' },
  ]);
  assert.equal(normalized.nodes[2].action.key, 'speed');
  assert.deepEqual(normalized.nodes[3].rows, []);

  const validation = validateIntelligentUi(normalized);
  assert.equal(validation.ok, true, validation.error);
});

test('a chart node takes the visualization template and payload contract', () => {
  /* A function graph is a chart: the compact `points` shorthand cannot express
     a curve, axes or a legend, so template+payload is the same contract the
     `visualization` node uses. */
  const graph = {
    id: 'graph',
    type: 'chart',
    template: 'function',
    payload: { functions: [{ expression: 'sin(x)', label: 'y = \\sin x' }] },
  };
  const kept = parseIntelligentUiRecords(JSON.stringify({ version: 1, nodes: [graph] }));
  assert.equal(kept.length, 1);
  assert.equal(kept[0].template, 'function');
  assert.deepEqual(kept[0].payload, graph.payload);

  /* Both spellings reach the renderer with the same shape. */
  const viz = parseIntelligentUiRecords(
    JSON.stringify({ version: 1, nodes: [{ ...graph, id: 'graph2', type: 'visualization' }] }),
  );
  assert.equal(viz[0].template, kept[0].template);
  assert.deepEqual(viz[0].payload, kept[0].payload);

  /* A chart with neither a template nor points carries no data: the document
     still recovers its other nodes, and this one draws nothing. */
  const empty = parseIntelligentUiRecords('{"id":"empty","type":"chart"}');
  assert.equal(empty.length, 1);
  assert.equal(empty[0].template, undefined);
  assert.equal(empty[0].payload, undefined);

  /* The shorthand still works and still normalizes its numbers. */
  const points = parseIntelligentUiRecords(
    JSON.stringify({
      version: 1,
      nodes: [
        {
          id: 'bars',
          type: 'chart',
          kind: 'line',
          points: [
            { label: 'a', value: '1' },
            { label: 'b', value: 2 },
          ],
        },
      ],
    }),
  );
  assert.equal(points[0].kind, 'line');
  assert.deepEqual(
    points[0].points.map((point) => point.value),
    [1, 2],
  );
});
