/*
 * Teaching-module regression tests (chat-experience-revamp, task 9.2).
 *
 * Requirement 4.1/4.2/4.3: the revamp restyles teaching-module containers
 * only (task 9.1) and must not alter functional inputs/outputs. These are
 * example/regression tests over the pure parse and dispatch surfaces of the
 * four retained teaching modules — socraticDirectives, tutorSocratic
 * (its pure directive logic lives in socraticDirectives), diagnostic, and
 * visualization — asserting that fixed inputs still yield the same parsed
 * outputs and that each teaching payload type routes to its module.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BASELINE_LEVEL,
  fromBasicsDirective,
  stageInstruction,
  tutorTurnDirective,
} from '../src/chat/socraticDirectives.js';
import {
  extractDiagQuestionsBalanced,
  normalizeDiagQuestions,
} from '../src/chat/diagnosticParser.js';
import {
  categoryAxisLayout,
  formatCategoryLabel,
  parseFunctionExpression,
  sampleFunction,
} from '../src/render/visualization.js';
import { usesSpecializedRenderer } from '../src/render/visualizationAdapters.js';
import {
  parseDefinitionInner,
  parseExampleInner,
  parsePracticeInner,
  parseQuizInner,
  parseTheoremInner,
} from '../src/render/widgetParsers.js';

/* ---------------------------------------------------------------------
 * socraticDirectives / tutorSocratic directive logic (Requirement 4.1, 4.3)
 * Fixed stage inputs must map to the same directive strings after the
 * restyle-only change.
 * ------------------------------------------------------------------- */
test('socraticDirectives: stageInstruction is stable per teaching stage', () => {
  assert.equal(
    stageInstruction('motivate'),
    'Give a short motivation and one concrete intuition. Do not define the concept yet.',
  );
  assert.equal(
    stageInstruction('define'),
    'Give the precise definition and only the essential first derivation. Build on the motivation already shown.',
  );
  assert.equal(
    stageInstruction('exercise'),
    'Give exactly one transfer practice problem and wait for the student\'s attempt.',
  );
  assert.equal(
    stageInstruction('check'),
    'Give brief feedback and exactly one short quiz. Do not add another example or practice problem.',
  );
  // Unknown stages fall back to the single-step default, unchanged.
  assert.equal(stageInstruction('nonsense-stage'), 'Advance the lesson by one focused step.');
});

test('socraticDirectives: fromBasicsDirective depth cue and continuation are stable', () => {
  assert.equal(
    BASELINE_LEVEL,
    'baseline (not mastery) — depth cue only, always start from the core definition',
  );

  const cold = fromBasicsDirective({ status: 'fuzzy' }, {});
  assert.match(cold, /^CRITICAL — TWO PRINCIPLES/);
  assert.match(cold, /diagnostic for this sub-topic is 'fuzzy'/);
  assert.match(cold, /ALWAYS START FROM THE FOUNDATION/);

  // Missing node/status defaults to "unknown", not a crash.
  assert.match(fromBasicsDirective(null, null), /diagnostic for this sub-topic is 'unknown'/);

  const continuation = fromBasicsDirective({ status: 'fuzzy' }, { continuation: true });
  assert.match(continuation, /^FOUNDATION ANCHOR FOR THIS FOLLOW-UP/);
  assert.match(continuation, /already been introduced/);
  assert.doesNotMatch(continuation, /CRITICAL — TWO PRINCIPLES/);
});

test('socraticDirectives: tutorTurnDirective scope wording is stable by stage and first-turn flag', () => {
  const firstMotivate = tutorTurnDirective('motivate', true);
  assert.match(firstMotivate, /This is the opening turn for the current sub-topic\./);
  assert.match(firstMotivate, /no more than one closing question/);

  const contExercise = tutorTurnDirective('exercise', false);
  assert.match(contExercise, /This is a continuation turn\./);
  assert.match(contExercise, /exactly one practice scaffold/);

  assert.match(tutorTurnDirective('illustrate', false), /at most two example scaffolds/);
  assert.match(tutorTurnDirective('check', false), /exactly one quiz scaffold/);
  // Every directive states that turn-scope rules override generic defaults.
  assert.match(tutorTurnDirective('unknown', false), /TURN-SCOPE RULES\./);
});

/* ---------------------------------------------------------------------
 * diagnostic module (Requirement 4.1, 4.3)
 * Fixed diagnostic payloads must normalize/extract to the same shapes.
 * ------------------------------------------------------------------- */
test('diagnostic: normalizeDiagQuestions produces the same normalized shape for a fixed payload', () => {
  const input = [
    {
      q: '  What is a group?  ',
      knowledgePoint: ' Groups ',
      subarea: ' Algebra ',
      nodeIdx: 2,
      opts: [
        { text: 'I know this well' },
        { text: 'I have heard of this' },
        { text: 'I do not know this' },
      ],
    },
  ];

  const out = normalizeDiagQuestions(input);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], {
    q: 'What is a group?',
    knowledgePoint: 'Groups',
    subarea: 'Algebra',
    nodeIdx: 2,
    opts: [
      { letter: 'A', text: 'I know this well', level: 'internalized' },
      { letter: 'B', text: 'I have heard of this', level: 'fuzzy' },
      { letter: 'C', text: 'I do not know this', level: 'blank' },
    ],
  });
});

test('diagnostic: normalizeDiagQuestions drops malformed questions and caps at 5', () => {
  // Fewer than 3 options -> dropped.
  assert.deepEqual(
    normalizeDiagQuestions([{ q: 'too few', opts: [{ text: 'a' }, { text: 'b' }] }]),
    [],
  );
  // Non-array input -> empty.
  assert.deepEqual(normalizeDiagQuestions('not an array'), []);

  const many = Array.from({ length: 8 }, (_, i) => ({
    q: `Q${i}`,
    opts: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
  }));
  assert.equal(normalizeDiagQuestions(many).length, 5);
});

test('diagnostic: extractDiagQuestionsBalanced recovers objects from a fixed array body', () => {
  const text = '[{"q":"What is x?","subarea":"Basics","nodeIdx":0,'
    + '"opts":[{"letter":"A","text":"know","level":"internalized"},'
    + '{"letter":"B","text":"fuzzy","level":"fuzzy"},'
    + '{"letter":"C","text":"blank","level":"blank"}]}]';
  const out = extractDiagQuestionsBalanced(text);
  assert.equal(out.length, 1);
  assert.equal(out[0].q, 'What is x?');
  assert.equal(out[0].subarea, 'Basics');
  // The balanced extractor only reads string-valued keys; a numeric
  // nodeIdx is skipped here (normalizeDiagQuestions later assigns a slot).
  assert.equal(out[0].nodeIdx, undefined);
  assert.equal(out[0].opts.length, 3);
  assert.equal(out[0].opts[0].letter, 'A');

  // The balanced extractor output still normalizes to a valid question,
  // confirming the diagnostic pipeline routes end-to-end unchanged.
  const normalized = normalizeDiagQuestions(out);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].q, 'What is x?');
});

/* ---------------------------------------------------------------------
 * visualization module (Requirement 4.1, 4.3)
 * Fixed expressions/labels sample and lay out to the same values.
 * ------------------------------------------------------------------- */
test('visualization: parseFunctionExpression evaluates fixed inputs to the same values', () => {
  assert.equal(parseFunctionExpression('ln(x)')(Math.E), 1);
  assert.equal(parseFunctionExpression('2*x + 1')(3), 7);
  assert.ok(Math.abs(parseFunctionExpression('sin(x)^2 + cos(x)^2')(0.83) - 1) < 1e-12);
  // Code-like input is still rejected (safety behavior preserved).
  assert.throws(() => parseFunctionExpression('window.alert(1)'), /Unsupported|Expected/);
});

test('visualization: sampleFunction keeps the ln(x) positive domain and gaps for discontinuities', () => {
  const sample = sampleFunction('ln(x)');
  assert.equal(sample.domain[0], 0);
  assert.ok(sample.points.some((point) => Number.isFinite(point[1])));

  const reciprocal = sampleFunction('1/x', [-2, 2], 401);
  assert.ok(reciprocal.points.some((point) => point[1] === null));
});

test('visualization: category label formatting and axis layout are stable for fixed inputs', () => {
  const wrapped = formatCategoryLabel('这是一个非常长的栏目名称需要避免重叠', {
    lineChars: 6,
    maxChars: 12,
  });
  assert.equal(wrapped.split('\n').length, 2);
  assert.match(wrapped, /…$/);

  const dense = categoryAxisLayout(
    Array.from({ length: 12 }, (_, index) => `Category ${index + 1} with long text`),
  );
  assert.equal(dense.rotate, 35);
  assert.ok(dense.bottom >= 80);
});

/* ---------------------------------------------------------------------
 * Payload routing (Requirement 4.2)
 * Each teaching payload type routes to the module/parser that owns it.
 * ------------------------------------------------------------------- */
test('routing: visualization templates dispatch to the specialized vs generic renderer', () => {
  // Specialized-renderer templates.
  for (const template of ['function', 'paper_chart', 'math_construction', 'geometry_3d', 'whiteboard']) {
    assert.equal(usesSpecializedRenderer(template), true, `${template} should be specialized`);
  }
  // Structure templates route to the specialized (mermaid-style) path.
  for (const template of ['flowchart', 'sequence', 'state', 'tree', 'mindmap', 'network', 'concept_map']) {
    assert.equal(usesSpecializedRenderer(template), true, `${template} should be specialized`);
  }
  // Plain chart templates fall through to the generic renderer.
  for (const template of ['line', 'bar', 'scatter', undefined, '']) {
    assert.equal(usesSpecializedRenderer(template), false, `${template} should be generic`);
  }
});

test('routing: each scaffold payload type is parsed only by its own widget parser', () => {
  const quiz = '<q>Pick one</q><o letter="A">Alpha</o><o letter="B">Beta</o><correct>A</correct>';
  const example = '<title>Ex 1</title><problem>Solve</problem><solution>Answer</solution>';
  const practice = '<title>Try it</title><problem>Compute</problem><hint>Use x</hint>';
  const definition = '<term>Group</term><body>A set with an operation</body>';
  const theorem = '<title>Pythagoras</title><statement>a^2 + b^2 = c^2</statement>';

  // Each payload routes to (parses under) its own module and yields the
  // expected structured output.
  assert.deepEqual(parseQuizInner(quiz), {
    q: 'Pick one',
    options: [
      { letter: 'A', text: 'Alpha' },
      { letter: 'B', text: 'Beta' },
    ],
    correct: 'A',
  });
  assert.deepEqual(parseExampleInner(example), {
    title: 'Ex 1',
    problem: 'Solve',
    solution: 'Answer',
  });
  assert.deepEqual(parsePracticeInner(practice), {
    title: 'Try it',
    problem: 'Compute',
    hint: 'Use x',
  });
  assert.deepEqual(parseDefinitionInner(definition), {
    term: 'Group',
    body: 'A set with an operation',
  });
  assert.deepEqual(parseTheoremInner(theorem), {
    title: 'Pythagoras',
    statement: 'a^2 + b^2 = c^2',
  });

  // A payload that belongs to a different scaffold does not accidentally
  // parse under the wrong module: a quiz body has no <problem>/<statement>,
  // so example/theorem parsers reject it.
  assert.equal(parseExampleInner(quiz), null);
  assert.equal(parseTheoremInner(definition), null);
});
