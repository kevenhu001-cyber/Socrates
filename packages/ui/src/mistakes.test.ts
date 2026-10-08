import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  assignMistakeQuizSlot,
  bumpMistakeRedo,
  createMistake,
  filterMistakes,
  formatMistakeTime,
  mistakeOptionTag,
  mistakeRedoPlan,
  mistakesBadgeText,
  mistakesEmptyState,
  normalizeMistakes,
  practiceMistakeFor,
  prependMistake,
  quizMistakeFor,
  removeMistakesForQuizSlot,
  unresolvedMistakeCount,
  type BookMistake,
} from './mistakes.ts';

const OPTIONS = [{ letter: 'A', text: '3' }, { letter: 'B', text: '4' }];

test('a wrong quiz pick with a declared answer lands in the baseline shape', () => {
  const mistake = quizMistakeFor({ q: 'What is 2+2?', options: OPTIONS, picked: 'A', correct: 'B', slotId: 'msg-1:quiz' }, { topic: 'Algebra', node: 'Sums', nodeIdx: 1, now: 1000, id: 'm1' });
  assert.deepEqual(mistake, {
    id: 'm1', type: 'quiz', topic: 'Algebra', node: 'Sums', nodeIdx: 1,
    q: 'What is 2+2?', options: OPTIONS, correct: 'B', userAnswer: 'A', judgedAnswer: null,
    timestamp: 1000, redoCount: 0, quizSlotId: 'msg-1:quiz',
  });
});

test('right picks and undeclared answers never land', () => {
  assert.equal(quizMistakeFor({ q: 'Q', options: OPTIONS, picked: 'B', correct: 'B' }), null);
  assert.equal(quizMistakeFor({ q: 'Q', options: OPTIONS, picked: 'A', correct: null }), null);
  assert.equal(practiceMistakeFor({ problem: 'P', answer: 'x=5', correct: null, isRight: null }), null);
  assert.equal(practiceMistakeFor({ problem: 'P', answer: 'x=4', correct: 'x=4', isRight: true }), null);
});

test('incorrect practice attempts land without options and keep the attempt', () => {
  const mistake = practiceMistakeFor({ problem: 'Solve x+1=2', answer: 'x=5', correct: 'x=1', isRight: false });
  assert.ok(mistake);
  assert.equal(mistake?.type, 'practice');
  assert.deepEqual(mistake?.options, []);
  assert.equal(mistake?.userAnswer, 'x=5');
  assert.equal(mistake?.judgedAnswer, 'x=1');
  assert.match(mistake!.id, /^m-[0-9a-z]+-[0-9a-z]{1,4}$/);
});

test('prepend is newest-first; unresolved count and baseline badge have distinct semantics', () => {
  const first = createMistake({ type: 'quiz', q: 'Q1', options: OPTIONS, correct: 'B', userAnswer: 'A' }, { id: 'a' });
  const second = createMistake({ type: 'quiz', q: 'Q2', options: OPTIONS, correct: 'B', userAnswer: 'A' }, { id: 'b' });
  const list = prependMistake(prependMistake([], first), second);
  assert.deepEqual(list.map((m) => m.q), ['Q2', 'Q1']);
  assert.equal(unresolvedMistakeCount(list), 2);
  assert.equal(mistakesBadgeText(list), '2');
  const mixed = [{ ...first, resolved: true }, second];
  assert.equal(unresolvedMistakeCount(mixed), 1);
  // Baseline updateMistakesBadge renders mistakes.length, resolved included.
  assert.equal(mistakesBadgeText(mixed), '2');
  assert.equal(mistakesBadgeText([{ ...first, resolved: true }]), '1');
  assert.equal(mistakesBadgeText([]), '');
});

test('normalize reads baseline rows and round 16-10 server-shaped rows', () => {
  const rows = normalizeMistakes([
    { id: 'm-x', type: 'quiz', topic: 'T', node: 'N', nodeIdx: 2, q: 'Q', options: [{ letter: 'A', text: 'a' }, { bogus: 1 }], correct: 'A', userAnswer: 'B', timestamp: 5, redoCount: 2, quizSlotId: 's' },
    { id: 'm-y', sessionId: 's1', nodeName: 'Node', questionContent: 'Old', userAnswer: 'A. 3', correctAnswer: 'B', source: 'practice', isResolved: true, collectedAt: '1970-01-01T00:00:01.000Z' },
    null, 'junk',
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].options, [{ letter: 'A', text: 'a' }]);
  assert.equal(rows[0].redoCount, 2);
  assert.equal(rows[1].q, 'Old');
  assert.equal(rows[1].type, 'practice');
  assert.equal(rows[1].node, 'Node');
  assert.equal(rows[1].correct, 'B');
  assert.equal(rows[1].timestamp, 1000);
  assert.equal(rows[1].resolved, true);
  assert.deepEqual(normalizeMistakes(undefined), []);
});

test('filters and empty states follow the baseline renderMistakes branches', () => {
  const open = createMistake({ type: 'quiz', q: 'open', options: OPTIONS, correct: 'B', userAnswer: 'A' }, { id: 'o' });
  const done: BookMistake = { ...createMistake({ type: 'quiz', q: 'done', options: OPTIONS, correct: 'B', userAnswer: 'A' }, { id: 'd' }), resolved: true };
  assert.deepEqual(filterMistakes([open, done], 'all').map((m) => m.id), ['o', 'd']);
  assert.deepEqual(filterMistakes([open, done], 'unresolved').map((m) => m.id), ['o']);
  assert.deepEqual(filterMistakes([open, done], 'resolved').map((m) => m.id), ['d']);
  assert.equal(mistakesEmptyState([], 'resolved'), 'empty');
  assert.equal(mistakesEmptyState([open], 'resolved'), 'filterResolved');
  assert.equal(mistakesEmptyState([done], 'unresolved'), 'filterOther');
  assert.equal(mistakesEmptyState([open], 'all'), null);
});

test('redo bumps the counter and plans the right widget', () => {
  const quiz = createMistake({ type: 'quiz', q: 'Q', options: OPTIONS, correct: 'B', userAnswer: 'A', quizSlotId: 'slot-1' }, { id: 'q' });
  const practice = createMistake({ type: 'practice', q: 'P', correct: 'x=1', userAnswer: 'x=2' }, { id: 'p' });
  const bumped = bumpMistakeRedo([quiz, practice], 'q');
  assert.equal(bumped.mistake?.redoCount, 1);
  assert.equal(bumped.list[0].redoCount, 1);
  assert.equal(bumpMistakeRedo(bumped.list, 'q').mistake?.redoCount, 2);
  assert.equal(bumpMistakeRedo([quiz], 'missing').mistake, null);
  assert.deepEqual(mistakeRedoPlan(quiz), { kind: 'quiz', q: 'Q', options: OPTIONS, correct: 'B', slotId: 'slot-1' });
  assert.deepEqual(mistakeRedoPlan(practice), { kind: 'practice', problem: 'P', correct: 'x=1' });
  // A quiz row without options falls back to the practice widget (U-L4).
  assert.equal(mistakeRedoPlan({ ...quiz, options: [] }).kind, 'practice');
});

test('a correct pick on the slot conquers every row recorded against it', () => {
  const a = createMistake({ type: 'quiz', q: 'Q', options: OPTIONS, correct: 'B', userAnswer: 'A', quizSlotId: 'slot-1' }, { id: 'a' });
  const again = createMistake({ type: 'quiz', q: 'Q', options: OPTIONS, correct: 'B', userAnswer: 'A', quizSlotId: 'slot-1' }, { id: 'a2' });
  const other = createMistake({ type: 'quiz', q: 'Other', options: OPTIONS, correct: 'B', userAnswer: 'A', quizSlotId: 'slot-2' }, { id: 'b' });
  const list = [again, a, other];
  assert.deepEqual(removeMistakesForQuizSlot(list, 'slot-1').map((m) => m.id), ['b']);
  assert.equal(removeMistakesForQuizSlot(list, 'slot-9'), list);
  assert.equal(removeMistakesForQuizSlot(list, null), list);
  const moved = assignMistakeQuizSlot(list, 'b', 'redo-1');
  assert.equal(moved[2].quizSlotId, 'redo-1');
  assert.deepEqual(removeMistakesForQuizSlot(moved, 'redo-1').map((m) => m.id), ['a2', 'a']);
});

test('option tags and relative time match the baseline card', () => {
  const m = createMistake({ type: 'quiz', q: 'Q', options: OPTIONS, correct: 'B', userAnswer: 'A' });
  assert.equal(mistakeOptionTag(m, 'B'), 'correct');
  assert.equal(mistakeOptionTag(m, 'A'), 'wrong');
  assert.equal(mistakeOptionTag(m, 'C'), null);
  const now = 10 * 86400000;
  assert.equal(formatMistakeTime(now - 30000, now), 'just now');
  assert.equal(formatMistakeTime(now - 5 * 60000, now), '5m ago');
  assert.equal(formatMistakeTime(now - 3 * 3600000, now), '3h ago');
  assert.equal(formatMistakeTime(now - 26 * 3600000, now), 'Yesterday');
  assert.equal(formatMistakeTime(now - 3 * 86400000, now), '3 days ago');
});
