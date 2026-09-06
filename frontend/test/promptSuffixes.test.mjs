import test from 'node:test';
import assert from 'node:assert/strict';

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;

/* Seed before the module graph loads: ui/effortPicker.js runs
   syncEffortUI() at import time when document.readyState is not
   "loading" (always true under JSDOM), which caches the effort. */
globalThis.localStorage.setItem('socrates-reasoning-effort', 'high');

const {
  appendClientContextMessages,
  beagleSuffix,
  configurePromptSuffixes,
  memoriesSuffix,
  projectContextSuffix,
  thinkingSuffix,
  toneVoiceSuffix,
} = await import('../src/chat/promptSuffixes.ts');
const { setTonePreset } = await import('../src/config/tonePresets.js');
const { setAppMode } = await import('../src/config/providers.js');
const { stateStore } = await import('../src/state/store.js');

test('beagleSuffix stays a no-op for legacy call sites', () => {
  assert.equal(beagleSuffix(), '');
});

test('toneVoiceSuffix is empty for the default preset', () => {
  setTonePreset('default');
  assert.equal(toneVoiceSuffix(), '');
});

test('toneVoiceSuffix renders the VOICE block for a named preset', () => {
  setTonePreset('friendly');
  try {
    const suffix = toneVoiceSuffix();
    assert.match(suffix, /^## VOICE \(tone and register\)\n/m);
    assert.match(suffix, /\n$/);
  } finally {
    setTonePreset('default');
  }
});

test('thinkingSuffix keeps the reply focused without effort guidance in chat mode', () => {
  setAppMode('chat');
  assert.equal(
    thinkingSuffix(),
    '\n\nKeep the user-facing reply focused on the answer. Do not emit <think> blocks or reasoning_content in the user-facing message.',
  );
});

test('thinkingSuffix prepends high-effort guidance for tutor mode', () => {
  setAppMode('tutor');
  try {
    const suffix = thinkingSuffix();
    assert.match(suffix, /prioritize depth/);
    assert.match(suffix, /Do not emit <think> blocks/);
  } finally {
    setAppMode('chat');
  }
});

test('memoriesSuffix lists cached server memories', () => {
  configurePromptSuffixes({ getUserMemories: () => ['likes tea', 5] });
  try {
    const suffix = memoriesSuffix();
    assert.match(suffix, /## User's saved memories/);
    assert.match(suffix, /- likes tea/);
    assert.match(suffix, /- 5/);
  } finally {
    configurePromptSuffixes({ getUserMemories: () => [] });
  }
});

test('projectContextSuffix is empty without a matching active project', () => {
  delete globalThis.window.__activeProject;
  assert.equal(projectContextSuffix(), '');
});

test('projectContextSuffix renders the active project block', () => {
  const previousProjectId = stateStore.read('currentProjectId');
  globalThis.window.__activeProject = {
    id: 'p1',
    name: 'Physics',
    description: 'Mechanics',
    systemPrompt: 'Be concise.',
  };
  stateStore.dispatch({ type: 'state/set', key: 'currentProjectId', value: 'p1' });
  try {
    const suffix = projectContextSuffix();
    assert.match(suffix, /## Active project/);
    assert.match(suffix, /Project: Physics/);
    assert.match(suffix, /Purpose: Mechanics/);
    assert.match(suffix, /Project instructions: Be concise\./);
  } finally {
    delete globalThis.window.__activeProject;
    stateStore.dispatch({ type: 'state/set', key: 'currentProjectId', value: previousProjectId ?? null });
  }
});

test('appendClientContextMessages composes memories, project, and research', () => {
  const previousProjectId = stateStore.read('currentProjectId');
  const previousSearch = stateStore.read('searchContext');
  configurePromptSuffixes({ getUserMemories: () => ['likes tea'] });
  globalThis.window.__activeProject = { id: 'p1', name: 'Physics' };
  stateStore.dispatch({ type: 'state/set', key: 'currentProjectId', value: 'p1' });
  stateStore.dispatch({ type: 'state/set', key: 'searchContext', value: 'evidence' });
  try {
    const base = [{ role: 'user', content: 'hi' }];
    const withResearch = appendClientContextMessages(base, true);
    assert.equal(withResearch.length, 4);
    assert.equal(withResearch[0].content, 'hi');
    assert.match(withResearch[1].content, /saved memories/);
    assert.match(withResearch[2].content, /Active project/);
    assert.match(withResearch[3].content, /Web research handling/);

    const withoutResearch = appendClientContextMessages(base);
    assert.equal(withoutResearch.length, 3);
  } finally {
    configurePromptSuffixes({ getUserMemories: () => [] });
    delete globalThis.window.__activeProject;
    stateStore.dispatch({ type: 'state/set', key: 'currentProjectId', value: previousProjectId ?? null });
    stateStore.dispatch({ type: 'state/set', key: 'searchContext', value: previousSearch ?? '' });
  }
});
