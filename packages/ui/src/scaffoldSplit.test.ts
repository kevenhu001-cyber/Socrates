import assert from 'node:assert/strict';
import test from 'node:test';
import { applyScaffoldTurnPlan, scaffoldTurnPlan, splitScaffolds, type ScaffoldBlock } from './learn/split.ts';

const QUIZ = '<quiz><q>Pick?</q><o letter="A">a</o><o letter="B">b</o><correct>B</correct></quiz>';

function kinds(text: string): string[] {
  return splitScaffolds(text).map((segment) => segment.kind);
}

function blocks(text: string): ScaffoldBlock[] {
  return splitScaffolds(text)
    .filter((segment) => segment.kind === 'scaffold')
    .map((segment) => (segment.kind === 'scaffold' ? segment.block : null))
    .filter((block): block is ScaffoldBlock => block !== null);
}

test('text without scaffolds passes through unchanged', () => {
  assert.deepEqual(splitScaffolds('Just prose with <b>html</b>.'), [{ kind: 'text', text: 'Just prose with <b>html</b>.' }]);
});

test('the first quiz becomes the card and a later one degrades to its question', () => {
  const segments = splitScaffolds(`Intro\n${QUIZ}\nmid\n${QUIZ}\noutro`);
  assert.deepEqual(kinds(`Intro\n${QUIZ}\nmid\n${QUIZ}\noutro`), ['text', 'scaffold', 'text', 'text', 'text']);
  const degraded = segments[3];
  assert.equal(degraded.kind === 'text' ? degraded.text : '', 'Pick?\n\n- A. a\n- B. b');
  assert.equal(blocks(`Intro\n${QUIZ}`).length, 1);
});

test('the first practice becomes the card and a later one degrades to its problem', () => {
  const segments = splitScaffolds('<practice correct="x=2"><problem>P1</problem></practice><practice><problem>P2</problem></practice>');
  assert.deepEqual(kinds('<practice correct="x=2"><problem>P1</problem></practice><practice><problem>P2</problem></practice>'), ['scaffold', 'text']);
  const degraded = segments[1];
  assert.equal(degraded.kind === 'text' ? degraded.text : '', 'P2');
  const first = blocks('<practice correct="x=2"><problem>P1</problem></practice>')[0];
  assert.equal(first.kind === 'practice' ? first.parsed.correct : null, 'x=2');
});

test('a malformed block falls back and never consumes the interactive slot', () => {
  const segments = splitScaffolds(`<quiz><q>Missing options</q><o letter="A">Only one</o></quiz>${QUIZ}`);
  assert.deepEqual(kinds(`<quiz><q>Missing options</q><o letter="A">Only one</o></quiz>${QUIZ}`), ['fallback', 'scaffold']);
  const fallback = segments[0];
  assert.equal(fallback.kind === 'fallback' ? fallback.scaffold : '', 'quiz');
});

test('every other kind mounts as its own card, as often as it appears', () => {
  const example = '<example><problem>P</problem><solution>S</solution></example>';
  const text = `<example><problem>P</problem><solution>S</solution></example>${example}<flashcard><front>F</front><back>B</back></flashcard>`;
  assert.deepEqual(kinds(text), ['scaffold', 'scaffold', 'scaffold']);
  assert.deepEqual(blocks(text).map((block) => block.kind), ['example', 'example', 'flashcard']);
});

test('the outermost block wins and a nested scaffold stays part of the body', () => {
  const segments = splitScaffolds(`<practice><problem>Outer</problem><quiz>${QUIZ}</quiz></practice>`);
  assert.deepEqual(kinds(`<practice><problem>Outer</problem><quiz>${QUIZ}</quiz></practice>`), ['scaffold']);
  const block = blocks(`<practice><problem>Outer</problem><quiz>${QUIZ}</quiz></practice>`)[0];
  assert.equal(block.kind === 'practice' ? block.parsed.problem : '', 'Outer');
});

test('a proof inside a theorem folds into the theorem card', () => {
  const block = blocks('<theorem><title>T</title><statement>S</statement><proof><body>Because.</body></proof></theorem>')[0];
  assert.equal(block.kind, 'theorem');
  if (block.kind !== 'theorem') return;
  assert.equal(block.parsed.statement, 'S');
  assert.equal(block.parsed.proofBody, 'Because.');
});

test('steps are numbered by position unless the block declares its own', () => {
  const blocks_ = blocks('<step><body>one</body></step><step><body>two</body></step><step n="7"><body>three</body></step>');
  assert.deepEqual(blocks_.map((block) => (block.kind === 'step' ? block.parsed.n : 0)), [1, 2, 7]);
});

test('a host-pinned slot id is read from the opening tag', () => {
  const block = blocks('<quiz data-quiz-id="redo-quiz-1"><q>Q</q><o letter="A">a</o><o letter="B">b</o></quiz>')[0];
  assert.equal(block.slotId, 'redo-quiz-1');
});

test('scaffold-looking markup in inline and fenced code stays prose', () => {
  const example = '<example><problem>P</problem><solution>S</solution></example>';
  const source = `Inline \`${example}\`.\n\n\`\`\`xml\n${example}\n\`\`\`\n\nReal example:\n${example}`;
  const segments = splitScaffolds(source);

  assert.deepEqual(kinds(source), ['text', 'scaffold']);
  assert.equal(segments[0].kind === 'text' ? segments[0].text : '', source.slice(0, source.lastIndexOf(example)));
  assert.equal(blocks(source).length, 1);
});

test('scaffold blocks can contain fenced examples with literal scaffold tags', () => {
  const source = [
    '<definition><term>Markup</term><body>Literal example:',
    '```xml',
    '<definition><term>Fake</term><body>Not a card</body></definition>',
    '```',
    '</body></definition>',
  ].join('\n');
  const segments = splitScaffolds(source);
  const block = blocks(source)[0];

  assert.deepEqual(kinds(source), ['scaffold']);
  assert.equal(blocks(source).length, 1);
  assert.equal(block.kind, 'definition');
  assert.match(block.raw, /<definition><term>Fake<\/term><body>Not a card<\/body><\/definition>/);
  assert.match(block.raw, /<\/body>$/);
  if (block.kind === 'definition') {
    assert.equal(block.parsed.term, 'Markup');
    assert.match(block.parsed.body, /<body>Not a card<\/body>/);
  }
  assert.equal(segments[0].kind, 'scaffold');
});

test('quiz field tags inside Markdown code do not replace real fields', () => {
  const source = [
    '<quiz><q>Choose the correct answer:',
    '```xml',
    '<q>Fake question</q><o letter="C">Fake option</o>',
    '```',
    '</q><o letter="A">One</o><o letter="B">Two</o><correct>B</correct></quiz>',
  ].join('\n');
  const block = blocks(source)[0];

  assert.equal(block.kind, 'quiz');
  if (block.kind !== 'quiz') return;
  assert.deepEqual(block.parsed.options.map((option) => option.letter), ['A', 'B']);
  assert.match(block.parsed.q, /<q>Fake question<\/q>/);
});

test('an unclosed scaffold opener does not hide a later complete card', () => {
  const example = '<example><problem>Problem</problem><solution>Solution</solution></example>';
  const source = `<quiz>unfinished answer\n${example}`;

  assert.deepEqual(kinds(source), ['text', 'scaffold']);
  assert.equal(blocks(source)[0].kind, 'example');
});

test('a degraded quiz keeps its options and their math', () => {
  const second = '<quiz><q>Which is $x^2$?</q><o letter="A"><b>a</b></o><o letter="B">$2x$</o><correct>B</correct></quiz>';
  const segments = splitScaffolds(QUIZ + second);
  const degraded = segments[1];
  assert.equal(degraded.kind === 'text' ? degraded.text : '', 'Which is $x^2$?\n\n- A. a\n- B. $2x$');
});

test('the turn plan keeps one quiz across pieces rendered separately', () => {
  const quizB = QUIZ.replace('Pick?', 'Pick again?');
  const pieceA = `Intro\n\n${QUIZ}`;
  const pieceB = `More\n\n${quizB}`;
  const plan = scaffoldTurnPlan(pieceA + '\n\n' + pieceB);
  assert.equal(plan.quiz, QUIZ);
  assert.equal(applyScaffoldTurnPlan(pieceA, plan), pieceA);
  const rewritten = applyScaffoldTurnPlan(pieceB, plan);
  assert.equal(blocks(rewritten).length, 0);
  assert.match(rewritten, /Pick again\?\n\n- A\. a\n- B\. b/);
  const mounted = [pieceA, pieceB].flatMap((piece) => blocks(applyScaffoldTurnPlan(piece, plan)));
  assert.deepEqual(mounted.map((block) => block.kind), ['quiz']);
});

test('the turn plan skips a malformed first quiz and leaves prose untouched', () => {
  const plan = scaffoldTurnPlan(`<quiz><q>Missing options</q><o letter="A">Only one</o></quiz>\n\n${QUIZ}`);
  assert.equal(plan.quiz, QUIZ);
  assert.deepEqual(scaffoldTurnPlan('no scaffolds here'), {});
  const prose = 'plain <b>text</b>';
  assert.equal(applyScaffoldTurnPlan(prose, plan), prose);
});

test('the turn plan tracks practice separately from quiz', () => {
  const p1 = '<practice><title>T1</title><problem>P1</problem></practice>';
  const p2 = '<practice><title>T2</title><problem>P2</problem></practice>';
  const plan = scaffoldTurnPlan(`${QUIZ}\n\n${p1}\n\n${p2}`);
  assert.equal(plan.practice, p1);
  const rewritten = applyScaffoldTurnPlan(p2, plan);
  assert.equal(rewritten.trim(), '**T2**\n\nP2');
  assert.equal(applyScaffoldTurnPlan(QUIZ, plan), QUIZ);
});


test('legacy short-form definition, question and practice blocks become cards', () => {
  const source = '<definition>Definition with $x$.</definition><quiz>What is $x$?</quiz><practice>Explain why.</practice>';
  assert.deepEqual(kinds(source), ['scaffold', 'scaffold', 'scaffold']);
  const parsed = blocks(source);
  assert.deepEqual(parsed.map(block => block.kind), ['definition', 'quiz', 'practice']);
  assert.equal(parsed[1].kind === 'quiz' ? parsed[1].parsed.options.length : -1, 0);
  assert.deepEqual(scaffoldTurnPlan(source), { quiz: '<quiz>What is $x$?</quiz>', practice: '<practice>Explain why.</practice>' });
});
