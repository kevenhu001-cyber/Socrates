import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EMPTY_CHAIN,
  LEARNING_MODES,
  appendChainStep,
  appendOwnQuestion,
  askCandidates,
  chainNodeLabel,
  chainView,
  isLearningModeId,
  learningModeAction,
  looksLikeQuestion,
  mistakeCandidates,
  normalizeChainText,
  seedChain,
  stepLearningMode,
} from './think/model.ts';

test('seedChain starts from the root and resets on a new session', () => {
  const seeded = seedChain(EMPTY_CHAIN, 'a', '  Why is it  hot in summer? ');
  assert.deepEqual(seeded.steps.map((s) => s.text), ['Why is it hot in summer?']);
  const walked = appendChainStep(seeded, 'What if the axis were upright?');
  assert.equal(seedChain(walked, 'a', 'other root'), walked, 'same session keeps the chain');
  const fresh = seedChain(walked, 'b', 'New topic');
  assert.deepEqual(fresh.steps.map((s) => s.text), ['New topic']);
  assert.equal(seedChain(EMPTY_CHAIN, 'c', '').steps.length, 0);
});

test('appendChainStep ignores blanks and repeats of the current question', () => {
  const one = appendChainStep(seedChain(EMPTY_CHAIN, 'a', 'Root'), 'Next?');
  assert.equal(appendChainStep(one, 'Next?'), one);
  assert.equal(appendChainStep(one, '   '), one);
  assert.equal(appendChainStep(one, 'Again?').steps.length, 3);
});

test('normalizeChainText flattens whitespace and caps length', () => {
  assert.equal(normalizeChainText('a\n\n b'), 'a b');
  const long = normalizeChainText('x'.repeat(400));
  assert.equal(long.length, 140);
});

test('chainView folds the middle of long chains', () => {
  let state = seedChain(EMPTY_CHAIN, 's', 'q1');
  for (const q of ['q2', 'q3', 'q4', 'q5']) state = appendChainStep(state, q);
  const folded = chainView(state.steps, false);
  assert.equal(folded.current?.text, 'q5');
  assert.equal(folded.current?.index, 5);
  assert.deepEqual(folded.walked.map((s) => s.index), [1, 4]);
  assert.equal(folded.hiddenCount, 2);
  assert.equal(folded.nextIndex, 6);
  const open = chainView(state.steps, true);
  assert.deepEqual(open.walked.map((s) => s.index), [1, 2, 3, 4]);
  assert.equal(open.hiddenCount, 0);
  assert.equal(chainView([], false).current, null);
  assert.equal(chainNodeLabel(3), '03');
});

test('learning modes map to host actions', () => {
  assert.deepEqual(LEARNING_MODES.map((m) => m.id), ['think', 'recall', 'connect', 'diagnose', 'mistakes']);
  assert.deepEqual(learningModeAction('think', 'session'), { kind: 'chain' });
  /* RN-6: no mode pre-fills copy; the server-owned prompt does the work. */
  assert.deepEqual(learningModeAction('recall', 'home'), { kind: 'chain' });
  assert.deepEqual(learningModeAction('recall', 'session'), { kind: 'turn' });
  assert.deepEqual(learningModeAction('connect', 'session'), { kind: 'panel', panel: 'knowledge', refresh: 'concepts' });
  assert.deepEqual(learningModeAction('diagnose', 'session'), { kind: 'diagnostic' });
  assert.ok(LEARNING_MODES.every((mode) => !('promptKey' in mode.homeAction) && !('promptKey' in mode.sessionAction)));
  assert.deepEqual(learningModeAction('mistakes', 'home'), { kind: 'panel', panel: 'mistakes' });
  assert.equal(isLearningModeId('recall'), true);
  assert.equal(isLearningModeId('chat'), false);
  assert.equal(stepLearningMode('think', -1), 'mistakes');
  assert.equal(stepLearningMode('mistakes', 1), 'think');
});

test('candidates: unresolved mistakes newest first, prompts deduplicated', () => {
  const mistakes = mistakeCandidates([
    { id: 'a', q: 'old', timestamp: 1 },
    { id: 'b', q: 'done', timestamp: 3, resolved: true },
    { id: 'c', q: 'new', timestamp: 2 },
    { id: 'd', q: '  ', timestamp: 4 },
  ]);
  assert.deepEqual(mistakes.map((c) => [c.id, c.text, c.kind]), [['mistake:c', 'new', 'mistake'], ['mistake:a', 'old', 'mistake']]);
  assert.deepEqual(askCandidates(['Why?', 'Why?', '', 'How?']).map((c) => c.text), ['Why?', 'How?']);
});

test('askCandidates skips questions already on the chain, falling back to all', () => {
  const walked = [{ id: 'root', text: 'Root' }, { id: 's1', text: 'Why?' }];
  assert.deepEqual(askCandidates(['Why?', 'How?'], walked).map((c) => c.text), ['How?']);
  assert.deepEqual(askCandidates(['Why?'], walked).map((c) => c.text), ['Why?']);
});

test('RN-14 looksLikeQuestion: question marks, interrogatives and particles; answers are not questions', () => {
  for (const text of ['那二阶导数呢？', 'why does it work', 'Is x = 2 a root?', '为什么要取极限', '这样算对吗', '能不能换个例子', 'what about x=0']) {
    assert.equal(looksLikeQuestion(text), true, text);
  }
  for (const text of ['我觉得是时间间隔很短', 'I think it is 2x', '42', '?', '', '   ', '好的']) {
    assert.equal(looksLikeQuestion(text), false, text);
  }
});

test('RN-14 appendOwnQuestion marks the step as the learner\'s own and skips anything already on the chain', () => {
  const root = seedChain(EMPTY_CHAIN, 'a', '为什么导数能表示变化率？');
  assert.equal(appendOwnQuestion(root, ' 为什么导数能表示变化率？ '), root, 'the root is not added twice');
  const own = appendOwnQuestion(root, '那二阶导数呢？');
  assert.deepEqual(own.steps.at(-1), { id: 's1', text: '那二阶导数呢？', origin: 'own' });
  const followed = appendChainStep(own, 'AI 的下一问？');
  assert.equal(followed.steps.at(-1)?.origin, undefined, 'a followed suggestion carries no origin');
  assert.equal(appendOwnQuestion(followed, '那二阶导数呢？'), followed, 'an earlier own question is not repeated');
  assert.equal(appendOwnQuestion(followed, '   '), followed);
  assert.equal(chainView(followed.steps, true).walked[1].origin, 'own', 'the view keeps the origin');
});
