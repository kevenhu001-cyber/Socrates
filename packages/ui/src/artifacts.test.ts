import assert from 'node:assert/strict';
import test from 'node:test';
import { artifactFromFence, artifactsFromToolCalls, islandKindForLang, parseArtifactBridgeMessage } from './artifacts.ts';

test('island fenced languages map to island kinds and plain code does not', () => {
  assert.equal(islandKindForLang('html'), 'html');
  assert.equal(islandKindForLang('Mermaid'), 'mermaid');
  assert.equal(islandKindForLang('three'), 'three');
  assert.equal(islandKindForLang('viz'), 'viz');
  assert.equal(islandKindForLang('js'), null);
  assert.equal(islandKindForLang(undefined), null);
});

test('a mermaid fence becomes an island card with the source document', () => {
  const artifact = artifactFromFence({ lang: 'mermaid', text: 'graph TD; A-->B;', mode: 'light', index: 0 });
  assert.ok(artifact);
  assert.equal(artifact.kind, 'mermaid');
  assert.match(artifact.document(), /graph TD; A--&gt;B;/);
  assert.equal(artifactFromFence({ lang: 'js', text: 'const x = 1;', mode: 'light', index: 1 }), null);
});

test('a viz fence holding a v1 spec renders a chart document', () => {
  const spec = JSON.stringify({ version: 1, template: 'line', title: 'Trend', accessibilitySummary: 'up', payload: { series: [{ data: [1, 2, 3] }] } });
  const artifact = artifactFromFence({ lang: 'viz', text: spec, mode: 'dark', index: 2 });
  assert.ok(artifact);
  assert.match(artifact.document(), /<svg/);
  assert.equal(artifact.title, 'Trend');
});

test('visualization tool calls yield descriptors once per call', () => {
  const descriptors = artifactsFromToolCalls([
    { id: 't1', name: 'render_visualization', visualization: { version: 1, template: 'pie', title: 'Share', accessibilitySummary: 's', payload: { series: [{ data: [1, 2] }] } } },
    { id: 't2', name: 'web_search' },
  ], 'light');
  assert.equal(descriptors.length, 1);
  assert.equal(descriptors[0].kind, 'chart');
  assert.match(descriptors[0].document(), /<path /);
});

test('bridge messages are validated before they reach the host', () => {
  assert.deepEqual(parseArtifactBridgeMessage('{"type":"ready","artifactId":"a1"}'), { type: 'ready', artifactId: 'a1' });
  assert.deepEqual(parseArtifactBridgeMessage({ type: 'resize', height: 340 }), { type: 'resize', height: 340 });
  assert.equal(parseArtifactBridgeMessage({ type: 'resize', height: -5 }), null);
  assert.deepEqual(parseArtifactBridgeMessage({ type: 'openLink', url: 'https://example.com/x' }), { type: 'openLink', url: 'https://example.com/x' });
  assert.equal(parseArtifactBridgeMessage({ type: 'openLink', url: 'javascript:alert(1)' }), null);
  assert.deepEqual(parseArtifactBridgeMessage({ type: 'copy', text: 'hi' }), { type: 'copy', text: 'hi' });
  assert.deepEqual(parseArtifactBridgeMessage({ type: 'share', title: 't', content: 'c' }), { type: 'share', title: 't', content: 'c' });
  assert.deepEqual(parseArtifactBridgeMessage({ type: 'error', message: 'boom' }), { type: 'error', message: 'boom' });
  assert.equal(parseArtifactBridgeMessage('not json'), null);
  assert.equal(parseArtifactBridgeMessage({ type: 'unknown' }), null);
});
