import assert from 'node:assert/strict';
import test from 'node:test';

import { ExtensionRegistry } from '../src/extensions/registry.ts';
import { publishAgentRun, getAgentRunSnapshot } from '../src/extensions/agentRunStore.ts';
import { writeExtension } from '../src/extensions/modules/write.ts';
import { researchExtension } from '../src/extensions/modules/research.ts';
import { exploreExtension } from '../src/extensions/modules/explore.ts';
import { deepResearchExtension } from '../src/extensions/modules/deepResearch.ts';
import { analyzeExtension } from '../src/extensions/modules/analyze.ts';
import { examExtension } from '../src/extensions/modules/exam.ts';
import { extensiveThinkingExtension } from '../src/extensions/modules/extensiveThinking.ts';
import { uploadExtension } from '../src/extensions/modules/upload.ts';
import { skillsExtension } from '../src/extensions/modules/skills.ts';

const MODULES = [
  writeExtension,
  researchExtension,
  exploreExtension,
  deepResearchExtension,
  analyzeExtension,
  examExtension,
  extensiveThinkingExtension,
  uploadExtension,
  skillsExtension,
];

test('every extension module declares the canonical fields', () => {
  for (const def of MODULES) {
    assert.ok(def.key, `${def.nameFallback} missing key`);
    assert.ok(['template', 'toggle', 'action'].includes(def.kind), `${def.key} bad kind`);
    assert.ok(def.nameKey, `${def.key} missing nameKey`);
    assert.ok(def.nameFallback, `${def.key} missing nameFallback`);
    assert.ok(def.icon.includes('<svg'), `${def.key} icon is not an inline SVG`);
    assert.equal(typeof def.onActivate, 'function', `${def.key} missing onActivate`);
  }
});

test('registry rejects duplicate keys', () => {
  const r = new ExtensionRegistry();
  r.register(writeExtension);
  assert.throws(() => r.register(writeExtension), /Duplicate extension key/);
  const fake = { ...writeExtension, key: 'write' };
  assert.throws(() => r.register(fake), /Duplicate extension key/);
});

test('registry placement ordering is ascending', () => {
  const r = new ExtensionRegistry();
  r.register(writeExtension)
    .register(researchExtension)
    .register(exploreExtension)
    .register(deepResearchExtension)
    .register(analyzeExtension)
    .register(examExtension)
    .register(extensiveThinkingExtension)
    .register(uploadExtension)
    .register(skillsExtension);

  const tools = r.byPlacement('tools');
  const orders = tools.map((d) => d.placement.tools ?? -1);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
  assert.ok(orders.length >= 8, 'tools menu should have 8+ items');
  assert.equal(tools[0].key, 'upload', 'upload opens the tools menu');
  assert.equal(tools[tools.length - 1].key, 'skills', 'skills closes the tools menu');

  const picker = r.byPlacement('picker');
  const pickerKeys = picker.map((d) => d.key);
  assert.ok(pickerKeys.includes('deepResearch'));
  assert.ok(pickerKeys.includes('exam'));
  assert.ok(pickerKeys.includes('extensiveThinking'));
});

test('template extensions preserve byte-identical legacy prompts', () => {
  assert.match(writeExtension.systemPrompt ?? '', /expert writing and editing assistant/);
  assert.match(researchExtension.systemPrompt ?? '', /source-research mode/);
  assert.match(exploreExtension.systemPrompt ?? '', /Stage 1 — Scope/);
  assert.match(analyzeExtension.systemPrompt ?? '', /data-analysis mode/);
});

test('research and explore share the legacy webSearch side-effect key', () => {
  // The legacy EXTENSION_SIDE_EFFECTS map is keyed by extensionKey, and the
  // chip's × button calls clearActiveTemplate() directly — so the template
  // key must stay "webSearch" to keep the toggle in sync on every path.
  assert.equal(writeExtension.key, 'write');
  assert.equal(researchExtension.key, 'research');
  assert.equal(exploreExtension.key, 'explore');
});

test('outputMode, when declared, is one of chat or canvas', () => {
  for (const def of MODULES) {
    if (def.outputMode === undefined) continue;
    assert.ok(
      ['chat', 'canvas'].includes(def.outputMode),
      `${def.key} outputMode must be 'chat' or 'canvas' (got ${def.outputMode})`
    );
  }
});

test('write is the only canvas extension at ship time', () => {
  const canvasKeys = MODULES.filter((d) => d.outputMode === 'canvas').map((d) => d.key);
  assert.deepEqual(canvasKeys, ['write'],
    `Only 'write' should opt into canvas right now; found ${canvasKeys.join(',')}`);
});

test('canvas extension autoLaunch is false (input bar stays visible)', () => {
  for (const def of MODULES) {
    if (def.outputMode !== 'canvas') continue;
    assert.equal(def.autoLaunch, false,
      `${def.key} is canvas so autoLaunch should be false (user iterates)`);
  }
});

test('agent-run store publishes structured stage events', () => {
  publishAgentRun({
    runId: 'run-1',
    workflow: 'explore',
    stage: 'searching',
    status: 'running',
    current: 2,
    total: 4,
  });
  const snap = getAgentRunSnapshot();
  assert.equal(snap.lastEvent?.stage, 'searching');
  assert.equal(snap.runs.get('run-1')?.current, 2);
  publishAgentRun({
    runId: 'run-1',
    workflow: 'explore',
    stage: 'completed',
    status: 'succeeded',
  });
  assert.equal(getAgentRunSnapshot().runs.get('run-1')?.stage, 'completed');
  assert.ok(getAgentRunSnapshot().revision >= 2);
});

test('agent-run store ignores malformed events', () => {
  const before = getAgentRunSnapshot().revision;
  publishAgentRun({ runId: '', workflow: 'explore', stage: 'planning', status: 'running' });
  publishAgentRun({ runId: 'x', workflow: 'explore', stage: '', status: 'running' });
  assert.equal(getAgentRunSnapshot().revision, before);
});

test('research/explore onActivate publish planning with a shared runId', () => {
  let templateSpec = null;
  const published = [];
  const fakeCtx = {
    t: (_k, fallback) => fallback,
    setTemplate: (spec) => {
      templateSpec = spec;
    },
    syncQuickChips: () => {},
    focusComposer: () => {},
    publishAgentRun: (ev) => published.push(ev),
  };
  researchExtension.onActivate(fakeCtx);
  assert.ok(templateSpec, 'research setTemplate called');
  assert.match(templateSpec.runId, /^research-/);
  assert.equal(templateSpec.workflow, 'research');
  assert.equal(published.length, 1);
  assert.equal(published[0].stage, 'planning');
  assert.equal(published[0].status, 'running');
  assert.equal(published[0].workflow, 'research');
  assert.equal(published[0].runId, templateSpec.runId, 'runId shared with setTemplate');
  templateSpec = null;
  published.length = 0;
  exploreExtension.onActivate(fakeCtx);
  assert.ok(templateSpec, 'explore setTemplate called');
  assert.match(templateSpec.runId, /^explore-/);
  assert.equal(templateSpec.workflow, 'explore');
  assert.equal(published[0].stage, 'planning');
  assert.equal(published[0].runId, templateSpec.runId, 'runId shared with setTemplate');
  templateSpec = null;
  published.length = 0;
  analyzeExtension.onActivate(fakeCtx);
  assert.ok(templateSpec, 'analyze setTemplate called');
  assert.match(templateSpec.runId, /^analyze-/);
  assert.equal(templateSpec.workflow, 'analyze');
  assert.equal(published[0].stage, 'planning');
  assert.equal(published[0].runId, templateSpec.runId, 'runId shared with setTemplate');
});
