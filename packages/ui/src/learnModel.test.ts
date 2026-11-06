import assert from 'node:assert/strict';
import test from 'node:test';
import {
  flashcardReducer,
  formatAnswerKey,
  gradeQuiz,
  hintLevels,
  initialFlashcardState,
  initialQuizState,
  isFullyRevealed,
  parseAnswerKey,
  parseDefinitionInner,
  parseDerivationInner,
  parseExampleInner,
  parseFlashcardInner,
  parseKeyPointInner,
  parsePracticeInner,
  parseProofInner,
  parseQuizInner,
  parseTheoremInner,
  proofNeedsQed,
  quizOptionMark,
  quizReducer,
  revealAll,
  revealNext,
  revealNone,
  revealState,
  scaffoldReadiness,
  splitDerivationSteps,
  derivationStepSource,
  fillTemplate,
  type QuizState,
} from './learn/model.ts';

test('answer keys accept single, joined and separated letters', () => {
  assert.deepEqual(parseAnswerKey('a'), ['A']);
  assert.deepEqual(parseAnswerKey('CA'), ['A', 'C']);
  assert.deepEqual(parseAnswerKey('A, C'), ['A', 'C']);
  assert.deepEqual(parseAnswerKey('B、D'), ['B', 'D']);
  assert.deepEqual(parseAnswerKey('A and C'), ['A', 'C']);
  assert.deepEqual(parseAnswerKey(''), []);
  assert.deepEqual(parseAnswerKey('xyz'), []);
  assert.equal(formatAnswerKey(['A', 'C']), 'A, C');
});

test('quiz parse keeps the historical shape and adds multi / explanation only when present', () => {
  const single = parseQuizInner('<q>Pick one</q><o letter="A">Alpha</o><o letter="B">Beta</o><correct>A</correct>');
  assert.deepEqual(single, { q: 'Pick one', options: [{ letter: 'A', text: 'Alpha' }, { letter: 'B', text: 'Beta' }], correct: 'A' });
  const multi = parseQuizInner('<q>Pick</q><o letter="A">1</o><o letter="B">2</o><o letter="C">3</o><correct>C,A</correct><explain>Odd numbers.</explain>');
  assert.equal(multi?.correct, 'AC');
  assert.equal(multi?.multi, true);
  assert.equal(multi?.explanation, 'Odd numbers.');
  const flagged = parseQuizInner('<q>Pick</q><o letter="A">1</o><o letter="B">2</o><correct>A</correct>', ' type="multiple"');
  assert.equal(flagged?.multi, true);
  const stray = parseQuizInner('<q>Pick</q><o letter="A">1</o><o letter="B">2</o><correct>E</correct>');
  assert.equal(stray?.correct, null);
  assert.equal(parseQuizInner('<q>Only one</q><o letter="A">1</o>'), null);
  assert.equal(parseQuizInner('<o letter="A">1</o><o letter="B">2</o>'), null);
});

test('practice and example collect hint levels and keep markdown', () => {
  assert.deepEqual(parsePracticeInner('<title>Try it</title><problem>Compute</problem><hint>Use x</hint>'), { title: 'Try it', problem: 'Compute', hint: 'Use x' });
  const levels = parsePracticeInner('<problem>Solve $x^2=4$</problem><hint>Roots</hint><hint>Both signs</hint><solution>$x=\\pm 2$</solution>')!;
  assert.deepEqual(levels.hints, ['Roots', 'Both signs']);
  assert.equal(levels.hint, 'Roots');
  assert.equal(levels.solution, '$x=\\pm 2$');
  assert.deepEqual(hintLevels(levels), ['Roots', 'Both signs']);
  assert.deepEqual(hintLevels({ hint: 'One' }), ['One']);
  assert.deepEqual(hintLevels({ hint: '' }), []);
  assert.equal(parsePracticeInner('<hint>only</hint>'), null);
  assert.deepEqual(parseExampleInner('<title>Ex 1</title><problem>Solve</problem><solution>Answer</solution>'), { title: 'Ex 1', problem: 'Solve', solution: 'Answer' });
  assert.equal(parseExampleInner('<q>x</q>'), null);
  assert.equal(parseExampleInner('<problem>p &amp; q</problem>')?.problem, 'p & q');
});

test('static scaffold parsers', () => {
  assert.deepEqual(parseDefinitionInner('<term>Group</term><body>A set</body>'), { term: 'Group', body: 'A set' });
  assert.deepEqual(parseDefinitionInner('plain'), { term: '', body: 'plain' });
  assert.deepEqual(parseFlashcardInner('<front>Q</front>'), { front: 'Q', back: '' });
  assert.deepEqual(parseTheoremInner('<statement>a^2+b^2=c^2</statement>'), { title: '', statement: 'a^2+b^2=c^2' });
  assert.equal(parseTheoremInner('<term>x</term>'), null);
  assert.deepEqual(parseProofInner('<title>P</title><body>Done</body>'), { title: 'P', body: 'Done' });
  assert.equal(parseDerivationInner('<title>only</title>'), null);
  assert.deepEqual(parseKeyPointInner('  **bold** '), { body: '**bold**' });
  assert.equal(parseKeyPointInner('   '), null);
});

test('derivation steps split by paragraph, then by chain continuations, never inside display math', () => {
  assert.deepEqual(splitDerivationSteps('x + 1\n= 2'), ['x + 1', '= 2']);
  assert.deepEqual(splitDerivationSteps('First line\n\nSecond line'), ['First line', 'Second line']);
  assert.deepEqual(splitDerivationSteps('$$\na = b\n\n= c\n$$'), ['$$\na = b\n\n= c\n$$']);
  assert.deepEqual(splitDerivationSteps('a\n\\Rightarrow b\n⇒ c'), ['a', '\\Rightarrow b', '⇒ c']);
  assert.deepEqual(splitDerivationSteps('$a=b$\n$\\Rightarrow c$\n$= d$'), ['$a=b$', '$\\Rightarrow c$', '$= d$']);
  assert.deepEqual(splitDerivationSteps('   '), []);
});

test('proof QED is appended only when missing', () => {
  assert.equal(proofNeedsQed('Therefore it holds.'), true);
  assert.equal(proofNeedsQed('Therefore it holds. ∎'), false);
  assert.equal(proofNeedsQed('$x = y \\blacksquare$'), false);
  assert.equal(proofNeedsQed('Q.E.D.'), false);
});

test('stream readiness waits for the closing tag and a parsable body', () => {
  assert.equal(scaffoldReadiness('quiz', '', false), 'empty');
  assert.equal(scaffoldReadiness('quiz', '<q>x</q><o letter="A">1</o>', false), 'partial');
  assert.equal(scaffoldReadiness('quiz', '<q>x</q><o letter="A">1</o>', true), 'partial');
  assert.equal(scaffoldReadiness('quiz', '<q>x</q><o letter="A">1</o><o letter="B">2</o>', true), 'complete');
  assert.equal(scaffoldReadiness('key-point', 'body', true), 'complete');
  assert.equal(scaffoldReadiness('theorem', '<title>t</title>', true), 'partial');
});

test('single-choice quiz: select replaces, submit, resolve and retry only after a wrong answer', () => {
  let state: QuizState = initialQuizState;
  state = quizReducer(state, { type: 'submit' });
  assert.equal(state.phase, 'choosing', 'nothing selected cannot submit');
  state = quizReducer(state, { type: 'toggle', letter: 'b', multi: false });
  state = quizReducer(state, { type: 'toggle', letter: 'C', multi: false });
  assert.deepEqual(state.selected, ['C']);
  state = quizReducer(state, { type: 'submit' });
  assert.equal(state.phase, 'pending');
  assert.equal(quizReducer(state, { type: 'toggle', letter: 'A', multi: false }), state, 'locked while pending');
  state = quizReducer(state, { type: 'resolve', verdict: 'incorrect', feedback: 'Wrong: A' });
  assert.equal(state.phase, 'answered');
  assert.equal(state.attempts, 1);
  assert.equal(quizOptionMark('C', state, ['A']), 'incorrect');
  assert.equal(quizOptionMark('A', state, ['A']), 'missed');
  assert.equal(quizOptionMark('B', state, ['A']), 'muted');
  state = quizReducer(state, { type: 'retry' });
  assert.equal(state.phase, 'choosing');
  assert.deepEqual(state.selected, []);
  assert.equal(state.attempts, 1);
  state = quizReducer(quizReducer(quizReducer(state, { type: 'toggle', letter: 'A', multi: false }), { type: 'submit' }), { type: 'resolve', verdict: 'correct', feedback: 'ok' });
  assert.equal(quizOptionMark('A', state, ['A']), 'correct');
  assert.equal(quizReducer(state, { type: 'retry' }), state, 'no retry after a correct answer');
});

test('multi-choice quiz toggles letters and grades the whole set', () => {
  let state: QuizState = initialQuizState;
  state = quizReducer(state, { type: 'toggle', letter: 'C', multi: true });
  state = quizReducer(state, { type: 'toggle', letter: 'A', multi: true });
  state = quizReducer(state, { type: 'toggle', letter: 'B', multi: true });
  state = quizReducer(state, { type: 'toggle', letter: 'B', multi: true });
  assert.deepEqual(state.selected, ['A', 'C']);
  assert.equal(gradeQuiz(state.selected, ['A', 'C']), 'correct');
  assert.equal(gradeQuiz(['A'], ['A', 'C']), 'incorrect');
  assert.equal(gradeQuiz(['A'], []), 'recorded');
});

test('a failed host submission unlocks the quiz; recorded picks never mark right or wrong', () => {
  let state = quizReducer(quizReducer(initialQuizState, { type: 'toggle', letter: 'A', multi: false }), { type: 'submit' });
  state = quizReducer(state, { type: 'fail' });
  assert.equal(state.phase, 'choosing');
  assert.deepEqual(state.selected, ['A']);
  state = quizReducer(quizReducer(state, { type: 'submit' }), { type: 'resolve', verdict: 'recorded', feedback: 'Recorded: A' });
  assert.equal(quizOptionMark('A', state, []), 'selected');
  assert.equal(quizOptionMark('B', state, []), 'muted');
});

test('flashcard flips both ways and only takes a rating after the back was seen', () => {
  let state = flashcardReducer(initialFlashcardState, { type: 'rate', rating: 'good' });
  assert.equal(state.rating, null);
  state = flashcardReducer(state, { type: 'flip' });
  assert.equal(state.face, 'back');
  state = flashcardReducer(state, { type: 'rate', rating: 'fuzzy' });
  assert.equal(state.rating, 'fuzzy');
  state = flashcardReducer(state, { type: 'flip' });
  assert.equal(state.face, 'front');
  assert.equal(state.rating, 'fuzzy', 'turning back keeps the self-rating');
  assert.deepEqual(flashcardReducer(state, { type: 'reset' }), initialFlashcardState);
});

test('progressive reveal clamps to its total', () => {
  let state = revealState(3, 9);
  assert.equal(state.shown, 3);
  state = revealNone(state);
  state = revealNext(state);
  assert.equal(state.shown, 1);
  assert.equal(isFullyRevealed(state), false);
  state = revealAll(state);
  assert.equal(isFullyRevealed(revealNext(state)), true);
  assert.equal(revealState(-1).total, 0);
  assert.equal(fillTemplate('提示 {n}/{total}', { n: 1, total: 2 }), '提示 1/2');
});

test('derivation steps written as bare LaTeX render as display math, CJK prose keeps inline math', () => {
  assert.equal(derivationStepSource('\\operatorname{Res}(f,z_0) = \\lim_{z\\to z_0}(z-z_0)f(z)'), '$$\\operatorname{Res}(f,z_0) = \\lim_{z\\to z_0}(z-z_0)f(z)$$');
  assert.equal(derivationStepSource('= \\lim_{z\\to 0} z\\cdot\\frac{e^z}{z}'), '$$= \\lim_{z\\to 0} z\\cdot\\frac{e^z}{z}$$');
  assert.equal(derivationStepSource('由柯西定理 \\oint_C f(z)\\,dz = 0，得证'), '由柯西定理 $\\oint_C f(z)\\,dz = 0$，得证');
  assert.equal(derivationStepSource('$a = \\frac{1}{2}$'), '$a = \\frac{1}{2}$');
  assert.equal(derivationStepSource('\\[x = 1\\]'), '\\[x = 1\\]');
  assert.equal(derivationStepSource('= 1'), '= 1');
  assert.equal(derivationStepSource('先找出奇点'), '先找出奇点');
});


test('short-form learning cards retain their Markdown and math without inventing fields', () => {
  const body = '**Concept**: $x < y$ means x is smaller.\n\nMore details.';
  assert.deepEqual(parseDefinitionInner(body), { term: '', body });
  assert.deepEqual(parseExampleInner(body), { title: 'Example', problem: body, solution: '' });
  assert.deepEqual(parsePracticeInner(body), { title: 'Practice', problem: body, hint: '' });
  assert.deepEqual(parseQuizInner(body), { q: body, options: [], correct: null });
  assert.deepEqual(parseTheoremInner(body), { title: '', statement: body });
  assert.deepEqual(parseProofInner(body), { title: '', body });
  assert.deepEqual(parseDerivationInner(body), { title: '', body });
});

test('plain cards preserve literal XML code examples and continue rejecting broken structured content', () => {
  const source = 'Markup example:\n```xml\n<term>literal</term>\n```';
  assert.equal(parseDefinitionInner(source)?.body, source);
  assert.equal(parseDefinitionInner('   '), null);
  assert.equal(parsePracticeInner('<problem>unclosed'), null);
  assert.equal(parseDefinitionInner('<body>unclosed'), null);
  assert.equal(parseQuizInner('<q>Q</q><o letter="A">Only one</o>'), null);
});


test('quiz option explanations are decoded separately from visible choices', () => {
  const parsed = parseQuizInner('<q>2 + 2?</q><o letter="A" explanation="Two pairs make &quot;four&quot;.">4</o><o letter="B" explanation="One too many.">5</o><correct>A</correct>');
  assert.deepEqual(parsed?.options, [
    { letter: 'A', text: '4', explanation: 'Two pairs make "four".' },
    { letter: 'B', text: '5', explanation: 'One too many.' },
  ]);
});

test('scaffold parsers tolerate Chinese quotation marks, unquoted attributes, and tag synonyms', () => {
  // Quiz with Chinese quotes and <question>/<answer>
  const chineseQuotes = parseQuizInner('<question>测试题</question><o letter=“A” explanation=“解析A”>选项1</o><o letter=“B” explanation=“解析B”>选项2</o><answer>A</answer>');
  assert.equal(chineseQuotes?.q, '测试题');
  assert.equal(chineseQuotes?.correct, 'A');
  assert.equal(chineseQuotes?.options[0].letter, 'A');
  assert.equal(chineseQuotes?.options[0].explanation, '解析A');

  // Quiz with <option> tags and text-based letter extraction
  const textLetters = parseQuizInner('<q>选择</q><option>A. 苹果</option><option>B. 香蕉</option><correct>B</correct>');
  assert.equal(textLetters?.options[0].letter, 'A');
  assert.equal(textLetters?.options[0].text, '苹果');
  assert.equal(textLetters?.options[1].letter, 'B');
  assert.equal(textLetters?.correct, 'B');

  // Definition with <concept> and <explanation>
  const def = parseDefinitionInner('<concept>导数</concept><explanation>切线斜率</explanation>');
  assert.deepEqual(def, { term: '导数', body: '切线斜率' });

  // Theorem with <content>
  const thm = parseTheoremInner('<title>费马小定理</title><content>a^p ≡ a (mod p)</content>');
  assert.deepEqual(thm, { title: '费马小定理', statement: 'a^p ≡ a (mod p)' });

  // Example with <question> and <answer>
  const ex = parseExampleInner('<title>例1</title><question>求积分</question><answer>结果为 x^2/2</answer>');
  assert.deepEqual(ex, { title: '例1', problem: '求积分', solution: '结果为 x^2/2' });
});
