import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntelligentUiNodeStream } from '../src/services/intelligentUiStream.js';
import { createTurnEventController } from '../src/services/turnEvents.js';
import { reduceTurnEvent } from '../../packages/core/src/turnRuntime.js';
const root = {
  id: 'root',
  type: 'panel',
  title: 'A "quoted" {view} \\ ending',
  state: { count: 1 },
};
const child = { id: 'child', parent: 'root', type: 'metric', value: { state: 'count' } };
const args = JSON.stringify({ version: 1, nodes: [root, child] });
function fixture() {
  const events = [];
  const ctl = createTurnEventController((event) => events.push(event), 'turn-test');
  return { ctl, events, runtime: () => events.reduce(reduceTurnEvent, null) };
}
test('every character boundary yields complete nodes once, including nested/escaped JSON', () => {
  for (let split = 0; split <= args.length; split++) {
    const parser = createIntelligentUiNodeStream();
    const first = parser.push(args.slice(0, split)),
      last = parser.push(args);
    assert.equal(first.failed || last.failed, false, `split ${split}`);
    assert.deepEqual([...first.nodes, ...last.nodes], [root, child]);
    assert.deepEqual(parser.push(args).nodes, []);
  }
  const parser = createIntelligentUiNodeStream(),
    nodes = [];
  for (let i = 1; i <= args.length; i++) nodes.push(...parser.push(args.slice(0, i)).nodes);
  assert.deepEqual(nodes, [root, child]);
});
test('nested fields and string contents cannot masquerade as the top-level nodes array', () => {
  const parser = createIntelligentUiNodeStream();
  assert.deepEqual(
    parser.push(
      JSON.stringify({
        info: { nodes: [root] },
        text: '"nodes":[{"id":"fake"}]',
        version: 1,
        nodes: [child],
      }),
    ).nodes,
    [child],
  );
});
test('rewrites, oversized streams and non-object nodes stop previews', () => {
  for (const text of ['{"nodes":[12', '{"nodes":[[', 'x'.repeat(64001)])
    assert.equal(createIntelligentUiNodeStream().push(text).failed, true);
  const parser = createIntelligentUiNodeStream();
  parser.push('{"nodes":[');
  assert.equal(parser.push('{"version":1,"nodes":[').failed, true);
});
test('nodes are emitted before complete arguments, but commit waits for the tool result', () => {
  const f = fixture();
  f.ctl.toolArguments(
    {
      id: 'ui',
      name: 'render_intelligent_ui',
      arguments: '{"version":1,"nodes":[' + JSON.stringify(root) + ',{"id":"child"',
    },
    9,
  );
  assert.deepEqual(
    f.events.map((e) => e.type),
    ['ui.begin', 'ui.add'],
  );
  assert.deepEqual(f.runtime().uiSurfaces[0].nodes, [root]);
  f.ctl.toolArguments({ id: 'ui', name: 'render_intelligent_ui', arguments: args }, 9);
  assert.equal(f.runtime().uiSurfaces[0].phase, 'streaming');
  f.ctl.toolResult('ui', true, JSON.parse(args));
  assert.equal(f.runtime().uiSurfaces[0].phase, 'committed');
  assert.deepEqual(f.runtime().uiSurfaces[0].nodes, [root, child]);
});
test('forward parents wait; failed or unsafe UI retracts the preview', () => {
  const f = fixture();
  f.ctl.toolArguments(
    {
      id: 'ui',
      name: 'render_intelligent_ui',
      arguments: '{"version":1,"nodes":[' + JSON.stringify(child) + ',',
    },
    0,
  );
  assert.equal(f.runtime().uiSurfaces[0].nodes.length, 0);
  f.ctl.toolArguments(
    {
      id: 'ui',
      name: 'render_intelligent_ui',
      arguments: JSON.stringify({ version: 1, nodes: [child, root] }),
    },
    0,
  );
  assert.deepEqual(f.runtime().uiSurfaces[0].nodes, [root, child]);
  f.ctl.toolResult('ui', false, JSON.parse(args));
  assert.equal(f.runtime().uiSurfaces[0].phase, 'aborted');
  assert.deepEqual(f.runtime().uiSurfaces[0].nodes, []);
  for (const extra of [
    { html: '<script/>' },
    { action: { type: 'open_url', url: 'javascript:alert(1)' } },
    { state: JSON.parse('{"__proto__":{}}') },
  ]) {
    const bad = fixture();
    bad.ctl.toolArguments(
      {
        id: 'unsafe',
        name: 'render_intelligent_ui',
        arguments: JSON.stringify({ version: 1, nodes: [{ ...root, ...extra }] }),
      },
      0,
    );
    assert.equal(
      bad.events.some((e) => e.type === 'ui.add'),
      false,
    );
    assert.equal(bad.runtime().uiSurfaces[0].phase, 'aborted');
  }
});
test('prose, parallel tools and public summaries advance independently with ordered replay', () => {
  const f = fixture();
  f.ctl.activity({ type: 'thinking' });
  f.ctl.reasoning();
  f.ctl.generation();
  for (const id of ['a', 'b'])
    f.ctl.activity({ type: 'tool', toolCallId: id, toolName: 'web_search' });
  f.ctl.activity({ type: 'public_reasoning_summary', text: 'Checking publication dates.' });
  f.ctl.toolResult('a', true);
  assert.equal(f.runtime().generation, 'streaming');
  assert.equal(f.runtime().activities.find((a) => a.toolCallId === 'b').phase, 'running');
  assert.equal(
    f.runtime().activities.find((a) => a.kind === 'reasoning_summary').text,
    'Checking publication dates.',
  );
  f.ctl.done('stopped', 1400);
  assert.equal(f.runtime().activities.find((a) => a.toolCallId === 'b').phase, 'stopped');
  assert.deepEqual(
    f.events.map((e) => e.seq),
    f.events.map((_, i) => i + 1),
  );
  assert.equal(reduceTurnEvent(f.runtime(), f.events[0]).seq, f.runtime().seq);
  const length = f.events.length;
  f.ctl.reasoning();
  f.ctl.generation();
  assert.equal(f.events.length, length);
});

test('server evidence uses stable source IDs and never infers claims from search results', () => {
  const f = fixture();
  const sources = f.ctl.registerSources([
    { url: 'https://example.test/page', title: 'Official guide', snippet: 'Evidence.' },
    { url: 'https://example.test/page', title: 'Duplicate' },
    { url: 'javascript:alert(1)' },
    { url: 'https://user:pass@example.test' },
  ]);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].id, sources[1].id);
  assert.equal(f.runtime().sources.length, 1);
  assert.equal(f.runtime().claims, undefined);
  const quote = 'A verified claim.';
  assert.equal(
    f.ctl.citeSources({ claims: [{ quote, sourceIds: [sources[0].id] }] }, quote).ok,
    true,
  );
  assert.deepEqual(f.runtime().claims[0], {
    id: 'claim-1',
    quote,
    start: 0,
    end: quote.length,
    citationIds: ['citation-source-1'],
  });
  assert.equal(f.runtime().citations[0].sourceId, sources[0].id);
});

test('claim batches reject unknown evidence, ambiguous matches, code and private reasoning atomically', () => {
  const f = fixture();
  const [source] = f.ctl.registerSources([{ url: 'https://example.test/page' }]);
  const claim = { quote: 'A claim.', sourceIds: [source.id] };
  for (const [claims, text] of [
    [[{ ...claim, sourceIds: ['invented'] }], 'A claim.'],
    [[claim], 'A claim. A claim.'],
    [[claim], '<think>first\nA claim.</think>'],
    [[claim], '```js\nA claim.\n```'],
    [[claim], '$A claim.$'],
    [[claim, { ...claim, quote: 'Not written yet.' }], 'A claim.'],
    [[claim, claim], 'A claim.'],
  ]) {
    const before = f.events.length;
    assert.equal(f.ctl.citeSources({ claims }, text).ok, false, text);
    assert.equal(f.events.length, before);
  }
  assert.equal(
    f.ctl.citeSources({ claims: [{ ...claim, occurrence: 1 }] }, 'A claim. A claim.').ok,
    true,
  );
  assert.equal(f.runtime().claims[0].start, 9);
});

test('model-authored UI transactions validate revisions, remove subtrees and roll back invalid batches', () => {
  const f = fixture();
  const nodes = [
    root,
    child,
    { id: 'nested', type: 'text', parent: 'child', text: 'Remove together' },
  ];
  f.ctl.toolResult('ui', true, { version: 1, nodes });
  assert.equal(f.ctl.patchUi({ surfaceId: 'missing', revision: 0, operations: [] }).ok, false);
  const edit = (revision, operations) => f.ctl.patchUi({ surfaceId: 'ui', revision, operations });
  assert.equal(edit(0, [{ op: 'patch', nodeId: 'root', props: { title: 'Updated' } }]).ok, true);
  assert.equal(f.runtime().uiSurfaces[0].revision, 1);
  assert.equal(f.runtime().uiSurfaces[0].nodes[0].title, 'Updated');
  const before = f.runtime();
  for (const operations of [
    [
      { op: 'patch', nodeId: 'root', props: { title: 'Should not commit' } },
      { op: 'patch', nodeId: 'missing', props: {} },
    ],
    [{ op: 'patch', nodeId: 'root', props: { image: 'javascript:alert(1)' } }],
    [{ op: 'patch', nodeId: 'root', props: JSON.parse('{"__proto__":{"polluted":true}}') }],
    [{ op: 'remove', nodeId: 'root' }],
  ]) {
    assert.equal(edit(1, operations).ok, false);
    assert.deepEqual(f.runtime(), before);
  }
  assert.equal(edit(0, [{ op: 'remove', nodeId: 'child' }]).ok, false);
  assert.equal(edit(1, [{ op: 'remove', nodeId: 'child' }]).ok, true);
  assert.deepEqual(
    f.runtime().uiSurfaces[0].nodes.map((node) => node.id),
    ['root'],
  );
  f.ctl.done('stopped');
  assert.equal(edit(2, [{ op: 'patch', nodeId: 'root', props: { title: 'Late' } }]).ok, false);
  assert.deepEqual(f.ctl.registerSources([{ url: 'https://example.test/late' }]), []);
});

test('invalid OpenUI source patches are rejected atomically without changing the revision', () => {
  const f = fixture();
  const node = { id: 'app', type: 'openui', source: 'root = Col([Calculator("Calculator")])' };
  f.ctl.toolResult('ui', true, { version: 1, nodes: [node] });
  const before = f.runtime();
  const result = f.ctl.patchUi({
    surfaceId: 'ui',
    revision: 0,
    operations: [{ op: 'patch', nodeId: 'app', props: { source: 'root = Col([Button("=")])' } }],
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /explicit action/);
  assert.deepEqual(f.runtime(), before);
});

test('streamed demonstration nodes are normalized before the live preview', () => {
  const f = fixture();
  const demo = {
    id: 'demo',
    type: 'demonstration',
    title: 'Newton rings',
    program: {
      version: '1',
      parameters: { item: [{ id: 'a', label: 'A', value: '1', min: '0', max: '2' }] },
      views: { item: [{ kind: 'controls' }] },
    },
  };
  f.ctl.toolArguments(
    {
      id: 'ui',
      name: 'render_intelligent_ui',
      arguments: JSON.stringify({ version: 1, nodes: [demo] }),
    },
    0,
  );
  const added = f.events.find((event) => event.type === 'ui.add');
  assert.ok(added);
  assert.equal(added.node.program.version, 1);
  assert.equal(added.node.program.parameters[0].value, 1);
  assert.ok(Array.isArray(added.node.program.views));
});


test('compact streamed UI commits canonical IDs and supports patches', () => {
  const f = fixture();
  const input = { nodes: [
    { type: 'text', text: 'Original text' },
    { type: 'visualization', template: 'bar',
      payload: { categories: ['A'], series: [{ data: [1] }] } },
  ] };
  const raw = JSON.stringify(input);
  const partial = raw.slice(0, raw.indexOf('},{') + 2);
  f.ctl.toolArguments({
    id: 'compact', name: 'render_intelligent_ui', arguments: partial,
  }, 0);
  assert.equal(f.events.some((event) => event.type === 'ui.add'), false);
  f.ctl.toolArguments({
    id: 'compact', name: 'render_intelligent_ui', arguments: raw,
  }, 0);
  assert.equal(f.events.some((event) => event.type === 'ui.add'), false);
  f.ctl.toolResult('compact', true, input);
  const surface = f.runtime().uiSurfaces.find((entry) => entry.id === 'compact');
  assert.equal(surface.phase, 'committed');
  assert.deepEqual(surface.nodes.map((node) => node.id), ['n1', 'n2']);
  assert.deepEqual(f.events.find((event) => event.type === 'ui.commit')
    .nodes.map((node) => node.id), ['n1', 'n2']);
  const edit = f.ctl.patchUi({
    surfaceId: 'compact', revision: 0,
    operations: [{ op: 'patch', nodeId: 'n1', props: { text: 'Edited' } }],
  });
  assert.equal(edit.ok, true, edit.error);
  assert.equal(f.runtime().uiSurfaces[0].nodes[0].text, 'Edited');
});

test('compact stream reserves explicit IDs occurring after generated nodes', () => {
  const f = fixture();
  const input = { nodes: [
    { type: 'text', text: 'Automatic' },
    { type: 'text', id: 'n1', text: 'Explicit' },
  ] };
  f.ctl.toolArguments({
    id: 'mixed', name: 'render_intelligent_ui', arguments: JSON.stringify(input),
  }, 0);
  assert.equal(f.events.some((event) => event.type === 'ui.add'), false);
  f.ctl.toolResult('mixed', true, input);
  assert.deepEqual(f.runtime().uiSurfaces[0].nodes.map((node) => node.id), ['n1_2', 'n1']);
});

test('malformed explicit IDs are never silently regenerated', async () => {
  const { normalizeIntelligentUiArgs } = await import('../src/services/intelligentUiNormalize.js');
  const { validateIntelligentUi } = await import('../src/services/intelligentUi.js');
  for (const invalid of ['', '   ', null, 12, false]) {
    for (const kind of ['text', 'visualization', 'image', 'accordion', 'steps', 'badge']) {
      const fields = kind === 'visualization'
        ? { template: 'bar', payload: { categories: ['A'], series: [{ data: [1] }] } }
        : kind === 'image' ? { src: 'https://example.com/picture.png' }
          : { text: 'Text', items: [], label: 'Label' };
      const input = { nodes: [{ type: kind, ...fields, id: invalid }] };
      const normalized = normalizeIntelligentUiArgs(input);
      assert.notEqual(normalized.nodes[0].id, 'n1', kind);
      assert.equal(validateIntelligentUi(input).ok, false,
        `accepted invalid ID ${JSON.stringify(invalid)} on ${kind}`);
    }
  }
  const legacy = { node: { type: 'text', text: 'Compact single node' } };
  assert.equal(normalizeIntelligentUiArgs(legacy).nodes[0].id, 'n1');
});
