/* RN-6 — AI-written learning content: how model output lands in the
   session's data, and what the tutor turns carry. Model calls are not made
   here; the shared normalizer has its own tests in packages/core. */
import test from 'node:test';
import assert from 'node:assert/strict';

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;

const { normalizeConceptMap } = await import('@socrates/core/learningBlocks');
const { applyConceptMap } = await import('../src/tutor/conceptMap.ts');
const { describeDiagnosticAnswers } = await import('../src/tutor/diagnosticInsight.ts');
const { describeMistake } = await import('../src/tutor/mistakeAnalysis.ts');
const { recordRecallRating, takeRecallContext, resetRecallRatingsForTests } = await import('../src/tutor/recallRatings.ts');
const { buildFollowUpMessages, buildLearningModeMessages } = await import('../src/tutor/flow.ts');
const { learningTurnOptions } = await import('../src/tutor/learningModeState.ts');
const { stateStore } = await import('../src/state/store.ts');

const NODES = [
  { name: '先验', status: 'blank', questions: 0, user_note: '我的笔记' },
  { name: '似然', status: 'fuzzy', questions: 2, definition: '旧定义' },
  { name: '后验', status: 'blank', questions: 0, links: [{ target: '先验', why: '旧连线' }] },
];

test('a concept map adds definitions and links without touching learner data', () => {
  const map = normalizeConceptMap({
    nodes: [{ name: '先验', definition: '观测前的信念。' }, { name: '似然', definition: '新定义' }, { name: '证据', definition: '归一化常数。' }],
    links: [{ from: '先验', to: '后验', relation: '组成部分', why: '后验正比于先验乘似然。' }],
  }, NODES.map((node) => node.name));
  const out = applyConceptMap(NODES, map);
  assert.equal(out[0].definition, '观测前的信念。');
  assert.equal(out[0].user_note, '我的笔记');
  assert.equal(out[1].definition, '旧定义', 'session-start apply keeps an existing definition');
  assert.equal(out[1].status, 'fuzzy');
  assert.deepEqual(out[0].links, [{ target: '后验', relation: '组成部分', why: '后验正比于先验乘似然。' }]);
  assert.equal(out[2].links, undefined, 'a new link set replaces the old one as a whole');
  assert.equal(out[3].name, '证据');
  assert.equal(out[3].status, 'blank');
  assert.equal(applyConceptMap(NODES, map, { replaceDefinitions: true })[1].definition, '新定义');
});

test('a failed concept map leaves the nodes as they were', () => {
  const out = applyConceptMap(NODES, normalizeConceptMap('{"nodes":[{"name":"先', NODES.map((node) => node.name)));
  assert.deepEqual(out, NODES);
});

test('diagnostic answers are described with the chosen option and its level', () => {
  const text = describeDiagnosticAnswers(
    [{ q: 'Q1', knowledgePoint: 'kp', nodeIdx: 1, opts: [{ letter: 'A', text: 'x', level: 'blank' }] }, { q: 'Q2' }],
    [0, -1],
    ['先验', '似然'],
  );
  assert.match(text, /^1\. Dimension: 似然; knowledge point: kp; question: Q1; answered A 「x」 \(level: blank\)/);
  assert.match(text, /2\. Dimension: 似然.*skipped$/);
});

test('a mistake is described with options, the answer and the key', () => {
  const text = describeMistake({ id: 'm', type: 'quiz', topic: '概率', node: '贝叶斯', q: 'P(A|B)?', options: [{ letter: 'A', text: '0.2' }, 'plain'], correct: 'A', userAnswer: 'B', timestamp: 0 });
  assert.match(text, /Topic: 概率; sub-topic: 贝叶斯/);
  assert.match(text, /A\. 0\.2\nB\. plain/);
  assert.match(text, /Learner's answer: B\nCorrect answer: A$/);
});

test('flashcard self-ratings reach exactly one following tutor turn', () => {
  resetRecallRatingsForTests();
  stateStore.dispatch({ type: 'state/batch', patch: { currentSessionId: 's1', teachingStage: 'define' } });
  recordRecallRating('<b>什么是先验？</b>', 'forgot');
  recordRecallRating('什么是似然？', 'good');
  const first = buildFollowUpMessages('继续', { name: '先验' }, '贝叶斯', []);
  const recall = first.find((message) => String(message.content).startsWith('[Current turn instructions]\nRecall self-assessment'));
  assert.ok(recall);
  assert.match(recall.content, /- forgot: 什么是先验？\n- remembered: 什么是似然？/);
  const second = buildFollowUpMessages('继续', { name: '先验' }, '贝叶斯', []);
  assert.equal(second.some((message) => String(message.content).includes('Recall self-assessment')), false);
  assert.equal(takeRecallContext(), null);
});

test('a learning-mode turn names the mode and focus, and carries no fixed request copy', () => {
  const msgs = buildLearningModeMessages({ name: '先验' }, '贝叶斯', [], { learningMode: 'practice', learningFocus: '先验 (观测前的信念)' });
  assert.equal(msgs[msgs.length - 1].role, 'user');
  assert.equal(msgs[msgs.length - 1].content, '[Learning mode: practice] Focus: 先验 (观测前的信念)');
  assert.match(String(msgs[0].content), /follow the server learning-mode instructions/);
});

test('turn options carry the learning mode only in Tutor mode', () => {
  assert.deepEqual(learningTurnOptions({ learningMode: 'recall' }), {}, 'chat mode sends no learning mode');
});
