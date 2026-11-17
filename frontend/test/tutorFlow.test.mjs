import test from 'node:test';
import assert from 'node:assert/strict';

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;

const { buildSocraticPrompt, buildSocraticMessages, buildFollowUpMessages } =
  await import('../src/tutor/flow.ts');
const { configureTemplateSystemPrompt, injectTemplateSystemPrompt } =
  await import('../src/chat/templateSystemPrompt.ts');
const { dispatchPatches, dispatchSearch, dispatchSession, searchStore, sessionStore } =
  await import('../src/store/index.ts');
const { getProjectCacheSnapshot, setCachedProjects } =
  await import('../src/projects/projectCache.ts');

test('socratic prompt embeds topic, level, and context', () => {
  const previousSearch = searchStore.getState().searchContext;
  dispatchSearch({ type: 'search/set', key: 'searchContext', value: '' });
  try {
    const prompt = buildSocraticPrompt('Photosynthesis', 'beginner', 'my ctx');
    assert.match(prompt, /^\[Assistant mode instructions\]\n/);
    assert.match(prompt, /Photosynthesis/);
    assert.match(prompt, /beginner/);
    assert.match(prompt, /my ctx/);
    assert.match(prompt, /no \[Web research\] block is present/);
  } finally {
    dispatchSearch({ type: 'search/set', key: 'searchContext', value: previousSearch ?? '' });
  }
});

test('socratic prompt notes live research when search context exists', () => {
  const previousSearch = searchStore.getState().searchContext;
  dispatchSearch({ type: 'search/set', key: 'searchContext', value: 'evidence' });
  try {
    const prompt = buildSocraticPrompt('Topic', 'level');
    assert.match(prompt, /separate \[Web research\] context block follows/);
    assert.match(prompt, /Markdown link/);
    assert.doesNotMatch(prompt, /do NOT paste result URLs into your reply/i);
    assert.match(prompt, /diagnostic question/);
  } finally {
    dispatchSearch({ type: 'search/set', key: 'searchContext', value: previousSearch ?? '' });
  }
});

test('socratic messages open the first turn at the current stage', () => {
  const previousStage = sessionStore.getState().teachingStage;
  dispatchSession({ type: 'session/set', key: 'teachingStage', value: 'motivate' });
  try {
    const msgs = buildSocraticMessages({ name: 'Fractions' }, 'math', [], true);
    assert.equal(msgs[0].role, 'system');
    assert.match(msgs[0].content, /Fractions/);
    assert.match(msgs[0].content, /You are beginning the 'motivate' stage/);
    assert.equal(
      msgs[msgs.length - 1].content,
      "I'm ready to begin. Please teach me about Fractions.",
    );
  } finally {
    dispatchSession({
      type: 'session/set',
      key: 'teachingStage',
      value: previousStage ?? 'motivate',
    });
  }
});

test('socratic messages continue without restarting', () => {
  const previousStage = sessionStore.getState().teachingStage;
  dispatchSession({ type: 'session/set', key: 'teachingStage', value: 'check' });
  try {
    const msgs = buildSocraticMessages({ name: 'Fractions' }, 'math', [], false);
    assert.match(msgs[0].content, /Do NOT restart from the beginning/);
    assert.equal(msgs[msgs.length - 1].content, 'Continue the lesson from where we left off.');
  } finally {
    dispatchSession({
      type: 'session/set',
      key: 'teachingStage',
      value: previousStage ?? 'motivate',
    });
  }
});

test('follow-up messages reflect practice attempts in exercise stage', () => {
  const previousStage = sessionStore.getState().teachingStage;
  const previousAttempts = sessionStore.getState().practiceAttempts;
  dispatchSession({ type: 'session/set', key: 'teachingStage', value: 'exercise' });
  dispatchSession({ type: 'session/set', key: 'practiceAttempts', value: 2 });
  try {
    const msgs = buildFollowUpMessages('42', { name: 'Fractions' }, 'math', []);
    assert.match(msgs[0].content, /2 attempt\(s\)/);
    assert.equal(msgs[msgs.length - 1].content, '42');
  } finally {
    dispatchSession({
      type: 'session/set',
      key: 'teachingStage',
      value: previousStage ?? 'motivate',
    });
    dispatchSession({ type: 'session/set', key: 'practiceAttempts', value: previousAttempts ?? 0 });
  }
});

test('follow-up messages keep research evidence and project context separate from tutor instructions', () => {
  const previousSearch = searchStore.getState().searchContext;
  const previousProject = sessionStore.getState().currentProjectId;
  const previousProjects = getProjectCacheSnapshot();
  dispatchPatches({
    search: { searchContext: '[Web research]\nTutor evidence' },
    session: { currentProjectId: 'tutor-project' },
  });
  setCachedProjects([
    { id: 'tutor-project', name: 'Calculus notes', systemPrompt: 'Use the shared notation.' },
  ]);
  try {
    const messages = buildFollowUpMessages('My answer', { name: 'Derivatives' }, 'math', []);
    assert.ok(
      messages.some(
        (message) =>
          message.role === 'system' && message.content.includes('[Web research]\nTutor evidence'),
      ),
    );
    assert.ok(
      messages.some(
        (message) => message.role === 'system' && message.content.includes('Calculus notes'),
      ),
    );
    assert.doesNotMatch(messages[0].content, /Tutor evidence|Calculus notes/);
  } finally {
    dispatchPatches({
      search: { searchContext: previousSearch ?? '' },
      session: { currentProjectId: previousProject ?? null },
    });
    setCachedProjects(previousProjects);
  }
});

test('template injection is a passthrough without an active template', () => {
  configureTemplateSystemPrompt({ getActiveTemplate: () => null });
  const base = [{ role: 'system', content: 'base' }];
  assert.equal(injectTemplateSystemPrompt(base), base);
});

test('template injection stamps once after the first system message', () => {
  configureTemplateSystemPrompt({
    getActiveTemplate: () => ({ id: 't1', systemPrompt: 'Be brief.' }),
  });
  try {
    const out = injectTemplateSystemPrompt([
      { role: 'system', content: 'base' },
      { role: 'user', content: 'hi' },
    ]);
    assert.equal(out.length, 3);
    assert.match(out[1].content, /Be brief\./);
    assert.match(out[1].content, /\[template:t1\]/);
    assert.equal(injectTemplateSystemPrompt(out).length, 3);

    const prepended = injectTemplateSystemPrompt([{ role: 'user', content: 'hi' }]);
    assert.equal(prepended.length, 2);
    assert.match(prepended[0].content, /\[template:t1\]/);
  } finally {
    configureTemplateSystemPrompt({ getActiveTemplate: () => null });
  }
});
