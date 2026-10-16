import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntelligentUiNodeStream } from '../src/services/intelligentUiStream.js';
import { createTurnEventController } from '../src/services/turnEvents.js';
import { reduceTurnEvent } from '../../packages/core/src/turnRuntime.js';
const root = { id: 'root', type: 'panel', title: 'A "quoted" {view} \\ ending', state: { count: 1 } };
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
    const first = parser.push(args.slice(0, split)), last = parser.push(args);
    assert.equal(first.failed || last.failed, false, `split ${split}`);
    assert.deepEqual([...first.nodes, ...last.nodes], [root, child]);
    assert.deepEqual(parser.push(args).nodes, []);
  }
  const parser = createIntelligentUiNodeStream(), nodes = [];
  for (let i = 1; i <= args.length; i++) nodes.push(...parser.push(args.slice(0, i)).nodes);
  assert.deepEqual(nodes, [root, child]);
});
test('nested fields and string contents cannot masquerade as the top-level nodes array', () => {
  const parser = createIntelligentUiNodeStream();
  assert.deepEqual(parser.push(JSON.stringify({ info: { nodes: [root] }, text: '"nodes":[{"id":"fake"}]', version: 1, nodes: [child] })).nodes, [child]);
});
test('rewrites, oversized streams and non-object nodes stop previews', () => {
  for (const text of ['{"nodes":[12', '{"nodes":[[', 'x'.repeat(64001)]) assert.equal(createIntelligentUiNodeStream().push(text).failed, true);
  const parser = createIntelligentUiNodeStream();
  parser.push('{"nodes":[');
  assert.equal(parser.push('{"version":1,"nodes":[').failed, true);
});
test('nodes are emitted before complete arguments, but commit waits for the tool result', () => {
  const f = fixture();
  f.ctl.toolArguments({ id: 'ui', name: 'render_intelligent_ui', arguments: '{"version":1,"nodes":[' + JSON.stringify(root) + ',{"id":"child"' }, 9);
  assert.deepEqual(f.events.map((e) => e.type), ['ui.begin', 'ui.add']);
  assert.deepEqual(f.runtime().uiSurfaces[0].nodes, [root]);
  f.ctl.toolArguments({ id: 'ui', name: 'render_intelligent_ui', arguments: args }, 9);
  assert.equal(f.runtime().uiSurfaces[0].phase, 'streaming');
  f.ctl.toolResult('ui', true, JSON.parse(args));
  assert.equal(f.runtime().uiSurfaces[0].phase, 'committed');
  assert.deepEqual(f.runtime().uiSurfaces[0].nodes, [root, child]);
});
test('forward parents wait; failed or unsafe UI retracts the preview', () => {
  const f = fixture();
  f.ctl.toolArguments({ id: 'ui', name: 'render_intelligent_ui', arguments: '{"version":1,"nodes":[' + JSON.stringify(child) + ',' }, 0);
  assert.equal(f.runtime().uiSurfaces[0].nodes.length, 0);
  f.ctl.toolArguments({ id: 'ui', name: 'render_intelligent_ui', arguments: JSON.stringify({ version: 1, nodes: [child, root] }) }, 0);
  assert.deepEqual(f.runtime().uiSurfaces[0].nodes, [root, child]);
  f.ctl.toolResult('ui', false, JSON.parse(args));
  assert.equal(f.runtime().uiSurfaces[0].phase, 'aborted');
  assert.deepEqual(f.runtime().uiSurfaces[0].nodes, []);
  for (const extra of [{ html: '<script/>' }, { action: { type: 'open_url', url: 'javascript:alert(1)' } }, { state: JSON.parse('{"__proto__":{}}') }]) {
    const bad = fixture();
    bad.ctl.toolArguments({ id: 'unsafe', name: 'render_intelligent_ui', arguments: JSON.stringify({ version: 1, nodes: [{ ...root, ...extra }] }) }, 0);
    assert.equal(bad.events.some((e) => e.type === 'ui.add'), false);
    assert.equal(bad.runtime().uiSurfaces[0].phase, 'aborted');
  }
});
test('prose, parallel tools and public summaries advance independently with ordered replay', () => {
  const f = fixture();
  f.ctl.activity({ type: 'thinking' }); f.ctl.reasoning(); f.ctl.generation();
  for (const id of ['a', 'b']) f.ctl.activity({ type: 'tool', toolCallId: id, toolName: 'web_search' });
  f.ctl.activity({ type: 'public_reasoning_summary', text: 'Checking publication dates.' });
  f.ctl.toolResult('a', true);
  assert.equal(f.runtime().generation, 'streaming');
  assert.equal(f.runtime().activities.find((a) => a.toolCallId === 'b').phase, 'running');
  assert.equal(f.runtime().activities.find((a) => a.kind === 'reasoning_summary').text, 'Checking publication dates.');
  f.ctl.done('stopped', 1400);
  assert.equal(f.runtime().activities.find((a) => a.toolCallId === 'b').phase, 'stopped');
  assert.deepEqual(f.events.map((e) => e.seq), f.events.map((_, i) => i + 1));
  assert.equal(reduceTurnEvent(f.runtime(), f.events[0]).seq, f.runtime().seq);
  const length = f.events.length; f.ctl.reasoning(); f.ctl.generation();
  assert.equal(f.events.length, length);
});

test('server evidence uses stable source IDs and never infers claims from search results', () => {
  const f = fixture();
  const sources = f.ctl.registerSources([
    { url: 'https://example.test/page', title: 'Official guide', snippet: 'Evidence.' },
    { url: 'https://example.test/page', title: 'Duplicate' },
    { url: 'javascript:alert(1)' }, { url: 'https://user:pass@example.test' },
  ]);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].id, sources[1].id);
  assert.equal(f.runtime().sources.length, 1);
  assert.equal(f.runtime().claims, undefined);
  const quote = 'A verified claim.';
  assert.equal(f.ctl.citeSources({ claims: [{ quote, sourceIds: [sources[0].id] }] }, quote).ok, true);
  assert.deepEqual(f.runtime().claims[0], { id: 'claim-1', quote, start: 0, end: quote.length, citationIds: ['citation-source-1'] });
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
  assert.equal(f.ctl.citeSources({ claims: [{ ...claim, occurrence: 1 }] }, 'A claim. A claim.').ok, true);
  assert.equal(f.runtime().claims[0].start, 9);
});

test('model-authored UI transactions validate revisions, remove subtrees and roll back invalid batches', () => {
  const f = fixture();
  const nodes = [root, child, { id: 'nested', type: 'text', parent: 'child', text: 'Remove together' }];
  f.ctl.toolResult('ui', true, { version: 1, nodes });
  assert.equal(f.ctl.patchUi({ surfaceId: 'missing', revision: 0, operations: [] }).ok, false);
  const edit = (revision, operations) => f.ctl.patchUi({ surfaceId: 'ui', revision, operations });
  assert.equal(edit(0, [{ op: 'patch', nodeId: 'root', props: { title: 'Updated' } }]).ok, true);
  assert.equal(f.runtime().uiSurfaces[0].revision, 1);
  assert.equal(f.runtime().uiSurfaces[0].nodes[0].title, 'Updated');
  const before = f.runtime();
  for (const operations of [
    [{ op: 'patch', nodeId: 'root', props: { title: 'Should not commit' } }, { op: 'patch', nodeId: 'missing', props: {} }],
    [{ op: 'patch', nodeId: 'root', props: { image: 'javascript:alert(1)' } }],
    [{ op: 'patch', nodeId: 'root', props: JSON.parse('{"__proto__":{"polluted":true}}') }],
    [{ op: 'remove', nodeId: 'root' }],
  ]) { assert.equal(edit(1, operations).ok, false); assert.deepEqual(f.runtime(), before); }
  assert.equal(edit(0, [{ op: 'remove', nodeId: 'child' }]).ok, false);
  assert.equal(edit(1, [{ op: 'remove', nodeId: 'child' }]).ok, true);
  assert.deepEqual(f.runtime().uiSurfaces[0].nodes.map((node) => node.id), ['root']);
  f.ctl.done('stopped');
  assert.equal(edit(2, [{ op: 'patch', nodeId: 'root', props: { title: 'Late' } }]).ok, false);
  assert.deepEqual(f.ctl.registerSources([{ url: 'https://example.test/late' }]), []);
});
