import test from 'node:test';
import assert from 'node:assert/strict';
import { reduceTurnEvent, normalizeTurnRuntime, settleTurnRuntime } from '@socrates/core';
import { deriveTurnPresentationState } from '../src/ui/turnActivityModel.ts';
import { buildBeaconMessages } from '../src/session/beacon.js';
const event = (seq, payload) => ({ version: 1, turnId: 'turn-1', seq, at: 100, ...payload });
const panel = { id: 'panel', type: 'panel', state: { count: 1 } };
const activity = { id: 'summary', kind: 'reasoning_summary', phase: 'running', text: 'Checking two official sources.', startedAt: 100 };
test('activity survives prose and running tools and round-trips through persistence', () => {
  let runtime = reduceTurnEvent(null, event(1, { type: 'activity.upsert', activity }));
  runtime = reduceTurnEvent(runtime, event(2, { type: 'generation', phase: 'streaming' }));
  const message = { role: 'assistant', type: 'streaming', rawText: 'An initial finding.', turnRuntime: runtime };
  const view = deriveTurnPresentationState(message, { live: true, hasRunningRow: true });
  assert.equal(view.showActivityTimeline, true);
  assert.equal(view.activities[0].phase, 'running');
  assert.equal(view.publicSummary, activity.text);
  runtime = settleTurnRuntime(runtime, 'done', 180);
  const stored = buildBeaconMessages([{ ...message, type: 'assistant', turnRuntime: runtime }])[0];
  assert.deepEqual(normalizeTurnRuntime(JSON.parse(JSON.stringify(stored.turnRuntime))), runtime);
  assert.equal(deriveTurnPresentationState(stored).activities[0].phase, 'done');
});
test('validated add/patch/commit rejects unsafe changes and replay', () => {
  let runtime = reduceTurnEvent(null, event(1, { type: 'ui.begin', surfaceId: 'ui', toolCallId: 'ui', textOffset: 10 }));
  runtime = reduceTurnEvent(runtime, event(2, { type: 'ui.add', surfaceId: 'ui', node: panel }));
  assert.equal(reduceTurnEvent(runtime, event(2, { type: 'ui.add', surfaceId: 'ui', node: panel })), runtime);
  assert.equal(reduceTurnEvent(runtime, { ...event(3, { type: 'generation', phase: 'streaming' }), turnId: 'wrong-turn' }), runtime);
  for (const props of [{ id: 'new' }, { html: '<script/>' }, { image: 'javascript:bad' }, JSON.parse('{"__proto__":{"polluted":true}}')]) {
    assert.equal(reduceTurnEvent(runtime, event(3, { type: 'ui.patch', surfaceId: 'ui', nodeId: 'panel', props })), runtime);
  }
  runtime = reduceTurnEvent(runtime, event(4, { type: 'ui.patch', surfaceId: 'ui', nodeId: 'panel', props: { title: 'Updated' } }));
  assert.equal(runtime.uiSurfaces[0].nodes[0].title, 'Updated');
  runtime = reduceTurnEvent(runtime, event(5, { type: 'ui.commit', surfaceId: 'ui', nodes: [panel] }));
  assert.equal(reduceTurnEvent(runtime, event(6, { type: 'ui.patch', surfaceId: 'ui', nodeId: 'panel', props: { title: 'late' } })), runtime);
  assert.deepEqual(normalizeTurnRuntime(runtime), runtime);
});
test('stop/failure retracts unfinished UI and leaves committed artifacts intact', () => {
  const start = reduceTurnEvent(null, event(1, { type: 'ui.begin', surfaceId: 'ui', toolCallId: 'ui', textOffset: 0 }));
  const live = reduceTurnEvent(start, event(2, { type: 'ui.add', surfaceId: 'ui', node: panel }));
  for (const phase of ['stopped', 'failed']) {
    const settled = settleTurnRuntime(live, phase);
    assert.equal(settled.lifecycle, phase);
    assert.equal(settled.uiSurfaces[0].phase, 'aborted');
    assert.deepEqual(settled.uiSurfaces[0].nodes, []);
  }
  const done = reduceTurnEvent(live, event(3, { type: 'ui.commit', surfaceId: 'ui', nodes: [panel] }));
  assert.deepEqual(settleTurnRuntime(done).uiSurfaces[0].nodes, [panel]);
});
test('stored snapshots reject malformed, unbounded and unsafe data', () => {
  const runtime = reduceTurnEvent(null, event(1, { type: 'activity.upsert', activity }));
  for (const bad of [null, {}, { ...runtime, seq: -1 }, { ...runtime, activities: Array(257).fill(activity) },
    { ...runtime, activities: [{ ...activity, kind: 'reasoning', text: 'private' }] },
    { ...runtime, uiSurfaces: [{ id: 'ui', toolCallId: 'ui', textOffset: 0, phase: 'committed', nodes: [{ ...panel, html: '<script/>' }] }] },
  ]) assert.equal(normalizeTurnRuntime(bad), null);
});
