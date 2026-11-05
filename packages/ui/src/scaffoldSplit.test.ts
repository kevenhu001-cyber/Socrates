import assert from 'node:assert/strict';
import test from 'node:test';
import { splitScaffolds, type ScaffoldBlock } from './learn/split.ts';

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
  assert.equal(degraded.kind === 'text' ? degraded.text : '', 'Pick?');
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
  const segments = splitScaffolds(`<quiz>no options</quiz>${QUIZ}`);
  assert.deepEqual(kinds(`<quiz>no options</quiz>${QUIZ}`), ['fallback', 'scaffold']);
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
