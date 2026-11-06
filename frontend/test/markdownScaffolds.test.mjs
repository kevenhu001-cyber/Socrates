import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearStreamScaffolds,
  findStreamScaffold,
  hasCompleteScaffold,
  registerStreamScaffold,
  renderStreamScaffoldPreview,
} from '../src/render/markdownScaffolds.ts';

test('stream scaffold previews use the injected markdown renderer', () => {
  const renderedValues = [];
  const preview = renderStreamScaffoldPreview(
    'quiz',
    '<q>Choose &amp; continue</q><o letter="A">Yes &amp; no</o>',
    '',
    (value) => {
      renderedValues.push(value);
      return '<p>' + value + '</p>';
    },
  );

  assert.deepEqual(renderedValues.sort(), ['Choose & continue', 'Yes & no']);
  assert.match(preview, /class="sc-live" data-scaffold-live="quiz"/);
  assert.match(preview, /sc-live-letter">A<\/span>/);
  assert.match(preview, /<p>Choose & continue<\/p>/);
});

test('stream field parsing ignores scaffold-field tags inside code examples', () => {
  const definition = [
    '<term>Markup</term><body>Literal example:',
    '```xml',
    '<definition><term>Fake</term><body>Not a card</body></definition>',
    '```',
    '</body>',
  ].join('\n');
  const definitionPreview = renderStreamScaffoldPreview('definition', definition, '', (value) => value);
  assert.match(definitionPreview, /<body>Not a card<\/body>/);

  const quiz = [
    '<q>Choose:',
    '```xml',
    '<q>Fake question</q><o letter="C">Fake option</o>',
    '```',
    'Which one?</q><o letter="A">One</o><o letter="B">Two</o>',
  ].join('\n');
  const quizPreview = renderStreamScaffoldPreview('quiz', quiz, '', (value) => value);
  assert.equal((quizPreview.match(/class="sc-live-letter"/g) || []).length, 2);
  assert.match(quizPreview, /Fake question/);
  assert.doesNotMatch(quizPreview, /sc-live-letter">C<\/span>/);
});

test('stream previews split derivations and reserve control rows like the mounted cards', () => {
  const derivation = renderStreamScaffoldPreview('derivation', '<body>x + 1\n= 2</body>', '', (value) => value);
  assert.equal((derivation.match(/class="sc-live-step"/g) || []).length, 2);
  const practice = renderStreamScaffoldPreview('practice', '<problem>6 × 7?</problem><hint>拆开', '', (value) => value);
  assert.match(practice, /sc-live-input/);
  assert.doesNotMatch(practice, /拆开/, 'hints stay hidden while streaming, as in the card');
  const flashcard = renderStreamScaffoldPreview('flashcard', '<front>Q</front><back>A secret', '', (value) => value);
  assert.doesNotMatch(flashcard, /secret/, 'the back face never streams into view');
  const empty = renderStreamScaffoldPreview('definition', '', '', (value) => value);
  assert.match(empty, /sc-live-skeleton/);
});

test('stream scaffold plugin registry replaces duplicate names and clears', () => {
  clearStreamScaffolds();
  try {
    const first = { parse: (value) => value, render: (value) => 'first:' + value };
    const second = { parse: (value) => value, render: (value) => 'second:' + value };
    registerStreamScaffold('custom', first.parse, first.render);
    registerStreamScaffold('custom', second.parse, second.render);

    assert.equal(findStreamScaffold('custom').render('value'), 'second:value');
  } finally {
    clearStreamScaffolds();
  }
  assert.equal(findStreamScaffold('custom'), null);
});

test('a settled turn needs the final renderer only when it holds a closed scaffold', () => {
  assert.equal(hasCompleteScaffold('<quiz><q>Q</q><o letter="A">1</o></quiz>'), true);
  assert.equal(hasCompleteScaffold('前文\n\n<flashcard>\n<front>F</front><back>B</back>\n</flashcard>'), true);
  assert.equal(hasCompleteScaffold('<key-point>K</key-point>'), true);
  assert.equal(hasCompleteScaffold('<quiz><q>half typed'), false);
  assert.equal(hasCompleteScaffold('plain prose with <b>bold</b>'), false);
  assert.equal(hasCompleteScaffold(''), false);
});

test('scaffold detection ignores complete tags inside Markdown code', () => {
  const quiz = '<quiz><q>Q</q><o letter="A">1</o></quiz>';
  assert.equal(hasCompleteScaffold(`\`${quiz}\``), false);
  assert.equal(hasCompleteScaffold(`\`\`\`xml\n${quiz}\n\`\`\``), false);
  assert.equal(hasCompleteScaffold(`\`\`\`xml\n${quiz}\n\`\`\`\n${quiz}`), true);
});

test('theorem preview reserves the proof toggle row once a nested proof opens', () => {
  const md = (value) => '<p>' + value + '</p>';
  const plain = renderStreamScaffoldPreview('theorem', '<title>T</title><statement>S</statement>', '', md);
  assert.doesNotMatch(plain, /sc-live-actions/);
  const open = renderStreamScaffoldPreview('theorem', '<statement>S</statement><proof><title>证明</title><body>半截', '', md);
  assert.match(open, /sc-live-actions/);
  assert.match(open, /sc-live-pill--quiet/);
  assert.doesNotMatch(open, /证明|半截/);
  const closed = renderStreamScaffoldPreview('theorem', '<title>T</title><statement>S</statement><proof><body>B</body></proof>', '', md);
  assert.match(closed, /<p>T<\/p>/);
  assert.equal((closed.match(/sc-live-actions"/g) || []).length, 1);
});
