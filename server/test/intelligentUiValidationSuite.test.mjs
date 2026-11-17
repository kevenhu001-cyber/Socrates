import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeIntelligentUiArgs,
  validateIntelligentUi,
} from '@socrates/core';
import {
  inferIntelligentUiExample,
  INTELLIGENT_UI_EXAMPLES,
} from '../src/services/intelligentUiExamples.js';
import {
  toolReliabilityTracker,
} from '../src/services/tools/toolReliabilityMetrics.js';

test('Reliability Suite: Learning components validate and normalize across variants', () => {
  // 1. Single Choice Quiz
  const singleChoice = normalizeIntelligentUiArgs({
    version: 1,
    nodes: [
      {
        id: 'q1',
        type: 'learning',
        kind: 'quiz',
        question: 'What is 2 + 2?',
        options: ['3', '4', '5'],
        answer: 'B',
        explanation: '2 + 2 equals 4',
      },
    ],
  });
  const vSingle = validateIntelligentUi(singleChoice);
  assert.equal(vSingle.ok, true, 'Single choice quiz must pass validation');

  // 2. Multiple Choice Quiz
  const multiChoice = normalizeIntelligentUiArgs({
    version: 1,
    nodes: [
      {
        id: 'q2',
        type: 'learning',
        kind: 'quiz',
        question: 'Select prime numbers',
        options: ['2', '3', '4', '6'],
        answer: 'AB',
        explanation: '2 and 3 are prime numbers',
      },
    ],
  });
  const vMulti = validateIntelligentUi(multiChoice);
  assert.equal(vMulti.ok, true, 'Multi choice quiz must pass validation');

  // 3. Ungraded / Survey Quiz (graded: false)
  const ungraded = normalizeIntelligentUiArgs({
    version: 1,
    nodes: [
      {
        id: 'q3',
        type: 'learning',
        kind: 'quiz',
        question: 'Which topic would you like to explore next?',
        options: ['Calculus', 'Linear Algebra', 'Discrete Math'],
        graded: false,
        explanation: 'Feel free to pick any path',
      },
    ],
  });
  const vUngraded = validateIntelligentUi(ungraded);
  assert.equal(vUngraded.ok, true, 'Ungraded quiz must pass validation');

  // 4. Practice card
  const practice = normalizeIntelligentUiArgs({
    version: 1,
    nodes: [
      {
        id: 'p1',
        type: 'learning',
        kind: 'practice',
        problem: 'Solve for x: 3x - 6 = 0',
        solution: 'x = 2',
        hints: ['Add 6 to both sides', 'Divide by 3'],
      },
    ],
  });
  const vPractice = validateIntelligentUi(practice);
  assert.equal(vPractice.ok, true, 'Practice card must pass validation');

  // 5. Definition card
  const definition = normalizeIntelligentUiArgs({
    version: 1,
    nodes: [
      {
        id: 'd1',
        type: 'learning',
        kind: 'definition',
        term: 'Eigenvector',
        body: 'A non-zero vector that changes at most by a scalar factor when linear transformation is applied.',
      },
    ],
  });
  const vDef = validateIntelligentUi(definition);
  assert.equal(vDef.ok, true, 'Definition card must pass validation');

  // 6. Flashcard
  const flashcard = normalizeIntelligentUiArgs({
    version: 1,
    nodes: [
      {
        id: 'f1',
        type: 'learning',
        kind: 'flashcard',
        front: 'Derivative of sin(x)',
        back: 'cos(x)',
      },
    ],
  });
  const vFlash = validateIntelligentUi(flashcard);
  assert.equal(vFlash.ok, true, 'Flashcard must pass validation');

  // 7. Theorem card
  const theorem = normalizeIntelligentUiArgs({
    version: 1,
    nodes: [
      {
        id: 't1',
        type: 'learning',
        kind: 'theorem',
        title: 'Pythagorean Theorem',
        statement: 'In a right triangle, a^2 + b^2 = c^2.',
      },
    ],
  });
  const vTheorem = validateIntelligentUi(theorem);
  assert.equal(vTheorem.ok, true, 'Theorem card must pass validation');

  // 8. Example card
  const example = normalizeIntelligentUiArgs({
    version: 1,
    nodes: [
      {
        id: 'e1',
        type: 'learning',
        kind: 'example',
        title: 'Integration by Parts',
        problem: 'Integrate x * e^x dx',
        solution: 'uv - int(v du) = x*e^x - e^x + C',
      },
    ],
  });
  const vExample = validateIntelligentUi(example);
  assert.equal(vExample.ok, true, 'Example card must pass validation');

  // 9. Step card
  const step = normalizeIntelligentUiArgs({
    version: 1,
    nodes: [
      {
        id: 's1',
        type: 'learning',
        kind: 'step',
        n: 1,
        title: 'Base Case',
        body: 'Verify P(1) is true.',
      },
    ],
  });
  const vStep = validateIntelligentUi(step);
  assert.equal(vStep.ok, true, 'Step card must pass validation');
});

test('Reliability Suite: Visualization components validate correctly', () => {
  // Bar chart
  const bar = normalizeIntelligentUiArgs({
    version: 1,
    nodes: [
      {
        id: 'viz-bar',
        type: 'visualization',
        template: 'bar',
        title: 'Sales by Quarter',
        accessibilitySummary: 'Sales bar chart',
        payload: {
          categories: ['Q1', 'Q2', 'Q3', 'Q4'],
          series: [{ name: 'Revenue', data: [100, 150, 120, 200] }],
        },
      },
    ],
  });
  assert.equal(validateIntelligentUi(bar).ok, true, 'Bar chart must pass');

  // Line chart
  const line = normalizeIntelligentUiArgs({
    version: 1,
    nodes: [
      {
        id: 'viz-line',
        type: 'visualization',
        template: 'line',
        title: 'Temperature Trend',
        accessibilitySummary: 'Temperature line chart',
        payload: {
          categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
          series: [{ name: 'Temp', data: [18, 21, 19, 22, 24] }],
        },
      },
    ],
  });
  assert.equal(validateIntelligentUi(line).ok, true, 'Line chart must pass');

  // Scatter plot
  const scatter = normalizeIntelligentUiArgs({
    version: 1,
    nodes: [
      {
        id: 'viz-scatter',
        type: 'visualization',
        template: 'scatter',
        title: 'Height vs Weight',
        accessibilitySummary: 'Height vs Weight scatter plot',
        payload: {
          data: [[160, 55], [170, 68], [180, 75]],
        },
      },
    ],
  });
  assert.equal(validateIntelligentUi(scatter).ok, true, 'Scatter plot must pass');

  // Function plot
  const fnPlot = normalizeIntelligentUiArgs({
    version: 1,
    nodes: [
      {
        id: 'viz-fn',
        type: 'visualization',
        template: 'function',
        title: 'Quadratic function',
        accessibilitySummary: 'Quadratic function plot',
        payload: {
          fn: 'x^2 - 4',
          domain: [-5, 5],
        },
      },
    ],
  });
  assert.equal(validateIntelligentUi(fnPlot).ok, true, 'Function plot must pass');

  // Heatmap
  const heatmap = normalizeIntelligentUiArgs({
    version: 1,
    nodes: [
      {
        id: 'viz-heatmap',
        type: 'visualization',
        template: 'heatmap',
        title: 'Activity Map',
        accessibilitySummary: 'Activity heatmap',
        payload: {
          xCategories: ['Morning', 'Afternoon', 'Evening'],
          yCategories: ['Mon', 'Tue', 'Wed'],
          data: [[0, 0, 5], [0, 1, 10], [1, 0, 8]],
        },
      },
    ],
  });
  assert.equal(validateIntelligentUi(heatmap).ok, true, 'Heatmap must pass');
});

test('Reliability Suite: Interactive controls validate and normalize correctly', () => {
  // Slider without bind must fail
  const badSlider = {
    type: 'interactive',
    version: 1,
    nodes: [
      { id: 's1', type: 'slider', min: 0, max: 10, step: 1 },
    ],
  };
  const vBadSlider = validateIntelligentUi(badSlider);
  assert.equal(vBadSlider.ok, false);
  assert.match(vBadSlider.error, /Expected a safe local state key/);

  // Slider with bind and coerced string numbers must pass
  const validSlider = normalizeIntelligentUiArgs({
    type: 'interactive',
    version: '1',
    nodes: [
      { id: 's1', type: 'slider', bind: 'x', min: '0', max: '100', step: '5', value: '25' },
    ],
  });
  const vValidSlider = validateIntelligentUi(validSlider);
  assert.equal(vValidSlider.ok, true, 'Normalized slider must pass validation');
  assert.equal(validSlider.nodes[0].min, 0);
  assert.equal(validSlider.nodes[0].max, 100);
  assert.equal(validSlider.nodes[0].step, 5);
  assert.equal(validSlider.nodes[0].value, 25);

  // Choice control with string array options must normalize to {label, value}
  const choiceDoc = normalizeIntelligentUiArgs({
    type: 'interactive',
    version: 1,
    nodes: [
      { id: 'c1', type: 'choice', bind: 'sel', options: ['Option Alpha', 'Option Beta'] },
    ],
  });
  assert.deepEqual(choiceDoc.nodes[0].options, [
    { label: 'Option Alpha', value: 'Option Alpha' },
    { label: 'Option Beta', value: 'Option Beta' },
  ]);
  assert.equal(validateIntelligentUi(choiceDoc).ok, true);

  // Toggle control
  const toggleDoc = normalizeIntelligentUiArgs({
    type: 'interactive',
    version: 1,
    nodes: [
      { id: 't1', type: 'toggle', bind: 'enabled', label: 'Enable physics', value: true },
    ],
  });
  assert.equal(validateIntelligentUi(toggleDoc).ok, true);

  // Button control with valid action
  const buttonDoc = normalizeIntelligentUiArgs({
    type: 'interactive',
    version: 1,
    nodes: [
      { id: 'b1', type: 'button', label: 'Reset', action: { type: 'set', target: 'x', value: 0 } },
    ],
  });
  assert.equal(validateIntelligentUi(buttonDoc).ok, true);

  // Button control without valid action must fail
  const badButtonDoc = {
    type: 'interactive',
    version: 1,
    nodes: [
      { id: 'b1', type: 'button', label: 'Broken Button' },
    ],
  };
  const vBadButton = validateIntelligentUi(badButtonDoc);
  assert.equal(vBadButton.ok, false);
  assert.match(vBadButton.error, /button action/i);

  // Table control without rows should default to [] and pass
  const tableDoc = normalizeIntelligentUiArgs({
    type: 'interactive',
    version: 1,
    nodes: [
      { id: 'tbl1', type: 'table', columns: [{ key: 'name', label: 'Name' }] },
    ],
  });
  assert.deepEqual(tableDoc.nodes[0].rows, []);
  assert.equal(validateIntelligentUi(tableDoc).ok, true);

  // Tabs control with valid children and active tab
  const tabsDoc = normalizeIntelligentUiArgs({
    type: 'interactive',
    version: 1,
    nodes: [
      {
        id: 'tabs1',
        type: 'tabs',
        tabs: [
          { id: 'tab1', label: 'Theory', children: ['txt1'] },
          { id: 'tab2', label: 'Practice', children: ['txt2'] },
        ],
        activeTab: 'tab1',
      },
      { id: 'txt1', type: 'text', text: 'Theory text' },
      { id: 'txt2', type: 'text', text: 'Practice text' },
    ],
  });
  assert.equal(validateIntelligentUi(tabsDoc).ok, true);
});

test('Reliability Suite: Infer intelligent UI examples matches specific minimal templates', () => {
  assert.deepEqual(inferIntelligentUiExample({ template: 'quiz' }), { version: 1, nodes: [INTELLIGENT_UI_EXAMPLES['learning.quiz']] });
  assert.deepEqual(inferIntelligentUiExample({ template: 'practice' }), { version: 1, nodes: [INTELLIGENT_UI_EXAMPLES['learning.practice']] });
  assert.deepEqual(inferIntelligentUiExample({ template: 'bar' }), { version: 1, nodes: [INTELLIGENT_UI_EXAMPLES['visualization.bar']] });
  assert.deepEqual(inferIntelligentUiExample({ template: 'line' }), { version: 1, nodes: [INTELLIGENT_UI_EXAMPLES['visualization.line']] });
  assert.deepEqual(inferIntelligentUiExample({ nodes: [{ type: 'slider' }] }), { version: 1, nodes: [INTELLIGENT_UI_EXAMPLES['interactive.slider']] });
  assert.deepEqual(inferIntelligentUiExample({ nodes: [{ type: 'button' }] }), { version: 1, nodes: [INTELLIGENT_UI_EXAMPLES['interactive.button']] });
  assert.deepEqual(inferIntelligentUiExample({ nodes: [{ type: 'table' }] }), { version: 1, nodes: [INTELLIGENT_UI_EXAMPLES['table']] });
  assert.deepEqual(inferIntelligentUiExample({ type: 'demonstration' }), { version: 1, nodes: [INTELLIGENT_UI_EXAMPLES['demonstration']] });
});

test('Reliability Suite: Tool reliability metrics accounting works accurately', () => {
  toolReliabilityTracker.reset();

  // Turn 1: tool validation failure, then recovery
  toolReliabilityTracker.recordValidation({
    toolName: 'intelligent_ui',
    componentType: 'interactive',
    attemptNumber: 1,
    success: false,
    failureStage: 'control',
    errorCode: 'arguments_schema_failed',
  });
  toolReliabilityTracker.recordValidation({
    toolName: 'intelligent_ui',
    componentType: 'interactive',
    attemptNumber: 2,
    success: true,
  });
  toolReliabilityTracker.recordExecution({
    toolName: 'intelligent_ui',
    componentType: 'interactive',
    success: true,
    durationMs: 15,
  });
  toolReliabilityTracker.recordRender({
    toolName: 'intelligent_ui',
    componentType: 'interactive',
    success: true,
  });
  toolReliabilityTracker.recordInteraction({
    toolName: 'intelligent_ui',
    componentType: 'interactive',
    actionType: 'slider',
    success: true,
  });

  // Turn 2: chart tool succeeds first attempt
  toolReliabilityTracker.recordValidation({
    toolName: 'visualization',
    componentType: 'chart',
    attemptNumber: 1,
    success: true,
  });
  toolReliabilityTracker.recordExecution({
    toolName: 'visualization',
    componentType: 'chart',
    success: true,
    durationMs: 10,
  });
  toolReliabilityTracker.recordRender({
    toolName: 'visualization',
    componentType: 'chart',
    success: true,
  });

  // Turn 3: truncated call
  toolReliabilityTracker.recordValidation({
    toolName: 'intelligent_ui',
    attemptNumber: 1,
    success: false,
    failureStage: 'openui_truncated',
    errorCode: 'arguments_truncated',
  });

  const summary = toolReliabilityTracker.getSummary();
  assert.equal(summary.total_validation_attempts, 4);
  assert.equal(summary.total_validation_successes, 2);
  assert.equal(summary.first_attempt_validation_success_rate, 0.333); // 1 out of 3 first attempts succeeded
  assert.equal(summary.tool_execution_success_rate, 1);
  assert.equal(summary.component_render_success_rate, 1);
  assert.equal(summary.interaction_success_rate, 1);
  assert.equal(summary.tool_schema_rejection_count, 1);
  assert.equal(summary.tool_arguments_truncated_count, 1);
  assert.equal(summary.average_attempts_per_success, 1.5); // (2 + 1) / 2 = 1.5
});
