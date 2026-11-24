import test from 'node:test';
import assert from 'node:assert/strict';

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;

/* Seed before the module graph loads: legacy/effortPicker.ts runs
   syncEffortUI() at import time when document.readyState is not
   "loading" (always true under JSDOM), which caches the effort. */
globalThis.localStorage.setItem('socrates-reasoning-effort', 'high');

const {
  appendClientContextMessages,
  memoriesSuffix,
  projectContextSuffix,
  thinkingSuffix,
  toneVoiceSuffix,
} = await import('../src/chat/promptSuffixes.ts');
const { setTonePreset } = await import('../src/config/tonePresets.ts');
const { setAppMode } = await import('../src/config/providers.ts');
const { dispatchSearch, dispatchSession, searchStore, sessionStore } =
  await import('../src/store/index.ts');
const { getProjectCacheSnapshot, setCachedProjects } =
  await import('../src/projects/projectCache.ts');
const { clearUserMemories, setUserMemories } =
  await import('../src/app/lifecycle/userMemory.ts');

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

test('thinkingSuffix carries no effort directive in tutor mode either', () => {
  /* P_reasoning-effort-server-owned — the depth directive is server-owned
     (`[Server policy: reasoning-effort]`), because the server is the side
     that knows which effort level the turn actually runs at. A client copy
     sat in a lower priority tier than the server's response defaults and
     only burned tokens. */
  setAppMode('tutor');
  try {
    const suffix = thinkingSuffix();
    assert.match(suffix, /Do not emit <think> blocks/);
    assert.doesNotMatch(suffix, /decisive point|reasoning effort|deepen/i);
  } finally {
    setAppMode('chat');
  }
});

test('profile cache is not injected again; unsynced local memory is retained', async () => {
  const { setMemory, replaceMemoryId, clearAllMemories } = await import('../src/storage/memoryStore.ts');
  const previousProjectId = sessionStore.getState().currentProjectId;
  dispatchSession({ type: 'session/set', key: 'currentProjectId', value: null });
  clearAllMemories();
  setUserMemories(['cached server fact']);
  try {
    const local = setMemory('preference', 'local fact');
    const synced = setMemory('fact', 'synced fact');
    replaceMemoryId(synced.id, '00000000-0000-4000-8000-000000000001');
    assert.ok(local);
    assert.match(memoriesSuffix(), /local fact/);
    assert.doesNotMatch(memoriesSuffix(), /cached server fact|synced fact/);
    dispatchSession({ type: 'session/set', key: 'currentProjectId', value: 'project-1' });
    assert.equal(memoriesSuffix(), '');
  } finally {
    clearAllMemories();
    clearUserMemories();
    dispatchSession({ type: 'session/set', key: 'currentProjectId', value: previousProjectId ?? null });
  }
});

test('projectContextSuffix is empty without a matching active project', () => {
  const previousProjectId = sessionStore.getState().currentProjectId;
  const previousProjects = getProjectCacheSnapshot();
  dispatchSession({ type: 'session/set', key: 'currentProjectId', value: 'missing-project' });
  setCachedProjects([]);
  try {
    assert.equal(projectContextSuffix(), '');
  } finally {
    dispatchSession({
      type: 'session/set',
      key: 'currentProjectId',
      value: previousProjectId ?? null,
    });
    setCachedProjects(previousProjects);
  }
});

test('projectContextSuffix renders the active project block', () => {
  const previousProjectId = sessionStore.getState().currentProjectId;
  const previousProjects = getProjectCacheSnapshot();
  setCachedProjects([
    {
      id: 'p1',
      name: 'Physics',
      description: 'Mechanics',
      systemPrompt: 'Be concise.',
    },
  ]);
  dispatchSession({ type: 'session/set', key: 'currentProjectId', value: 'p1' });
  try {
    const suffix = projectContextSuffix();
    assert.match(suffix, /## Active project/);
    assert.match(suffix, /Project: Physics/);
    assert.match(suffix, /Purpose: Mechanics/);
    assert.match(suffix, /Project instructions: Be concise\./);
  } finally {
    dispatchSession({
      type: 'session/set',
      key: 'currentProjectId',
      value: previousProjectId ?? null,
    });
    setCachedProjects(previousProjects);
  }
});

test('appendClientContextMessages composes project context and research without client memories', () => {
  const previousProjectId = sessionStore.getState().currentProjectId;
  const previousSearch = searchStore.getState().searchContext;
  const previousProjects = getProjectCacheSnapshot();
  setCachedProjects([{ id: 'p1', name: 'Physics' }]);
  dispatchSession({ type: 'session/set', key: 'currentProjectId', value: 'p1' });
  dispatchSearch({ type: 'search/set', key: 'searchContext', value: 'evidence' });
  try {
    const base = [{ role: 'user', content: 'hi' }];
    const withResearch = appendClientContextMessages(base, true);
    assert.equal(withResearch.length, 3);
    assert.equal(withResearch[0].content, 'hi');
    assert.match(withResearch[1].content, /Active project/);
    assert.match(withResearch[2].content, /Web research handling/);
    assert.match(withResearch[2].content, /Markdown link/);

    const withoutResearch = appendClientContextMessages(base);
    assert.equal(withoutResearch.length, 2);
  } finally {
    dispatchSession({
      type: 'session/set',
      key: 'currentProjectId',
      value: previousProjectId ?? null,
    });
    dispatchSearch({ type: 'search/set', key: 'searchContext', value: previousSearch ?? '' });
    setCachedProjects(previousProjects);
  }
});
