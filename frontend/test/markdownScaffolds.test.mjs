import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearStreamScaffolds,
  findStreamScaffold,
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
