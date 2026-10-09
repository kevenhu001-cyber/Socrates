import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearStreamScaffolds,
  findStreamScaffold,
  registerStreamScaffold,
  renderStreamScaffoldPreview,
} from '../src/render/markdownScaffolds.js';

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
  assert.match(preview, /class="inline-quiz scaffold-stream-live"/);
  assert.match(preview, /inline-quiz-opt-letter">A\.<\/span>/);
  assert.match(preview, /<p>Choose & continue<\/p>/);
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
