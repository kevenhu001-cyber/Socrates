import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDiagnosticResults,
  BASELINE_LEVEL,
  buildColdStartNodes,
  buildDiagPrompt,
  buildTeachingPlanFromKB,
  buildTutorVoice,
  cleanTopicDomain,
  DIAG_ASPECTS,
  diagError,
  diagnosticPointsForNode,
  extractDiagQuestionsBalanced,
  fromBasicsDirective,
  isSubstantiveAnswer,
  nextTeachingStage,
  normalizeDiagQuestions,
  parseDiagResponse,
  stageInstruction,
  syncCurrentNodeFromTeachingPlan,
  tutorTurnDirective,
} from './tutor.ts';

test('stage machine walks motivate to check and stops', () => {
  assert.equal(stageInstruction('motivate').includes('motivation'), true);
  assert.equal(stageInstruction('nope'), 'Advance the lesson by one focused step.');
  assert.deepEqual(nextTeachingStage('motivate'), { stage: 'define', resetPractice: false });
  assert.deepEqual(nextTeachingStage('illustrate'), { stage: 'exercise', resetPractice: true });
  assert.deepEqual(nextTeachingStage('check'), { stage: 'check', resetPractice: false });
  assert.deepEqual(nextTeachingStage('bogus'), { stage: 'motivate', resetPractice: false });
});

test('only substantive free-form answers advance the stage', () => {
  assert.equal(isSubstantiveAnswer('Short.'), false);
  assert.equal(isSubstantiveAnswer('This is a long enough free-form answer with more than eight words in it.'), true);
  assert.equal(isSubstantiveAnswer('This is a long enough free-form answer with more than eight words in it.', 'quiz'), false);
  assert.equal(isSubstantiveAnswer('This is a long enough free-form answer with more than eight words in it.', 'practice'), false);
});

test('foundation directives carry the baseline contract', () => {
  assert.ok(fromBasicsDirective({ status: 'fuzzy' }).includes('ALWAYS START FROM THE FOUNDATION'));
  assert.ok(fromBasicsDirective(null, { continuation: true }).includes('FOUNDATION ANCHOR'));
  assert.ok(tutorTurnDirective('exercise', true).includes('exactly one practice'));
  assert.ok(BASELINE_LEVEL.includes('baseline'));
});

test('diagnostic prompts name the aspect, count and language', () => {
  const first = buildDiagPrompt({ topic: 'Algebra', language: 'zh', index: 0, count: 5, previous: [] });
  assert.match(first.system, /question 1 of 5/);
  assert.match(first.system, /Chinese/);
  assert.match(first.system, /basic concepts/);
  assert.equal(first.user, 'Topic: Algebra');
  const later = buildDiagPrompt({ topic: 'Algebra', index: 2, previous: ['Q1?'], searchContext: 'ctx' });
  assert.match(later.system, /question 3 of 5/);
  assert.match(later.user, /\[Web research\]/);
  assert.equal(DIAG_ASPECTS.length, 5);
});

test('diagnostic responses parse through fences and prose', () => {
  const body = '{"q":"What is x?","knowledgePoint":"variables","opts":[{"letter":"A","text":"Known","level":"internalized"},{"letter":"B","text":"Heard","level":"fuzzy"},{"letter":"C","text":"Unknown","level":"blank"}]}';
  const plain = parseDiagResponse(`Intro.\n\`\`\`json\n${body}\n\`\`\`\nThanks!`, 2)!;
  assert.equal(plain.q, 'What is x?');
  assert.equal(plain.nodeIdx, 2);
  assert.deepEqual(plain.opts.map((o) => o.letter), ['A', 'B', 'C']);
  assert.equal(diagError(), null);
  assert.equal(parseDiagResponse('no json here', 0), null);
  assert.match(diagError() || '', /no JSON object/);
});

test('the balanced fallback rescues what JSON.parse rejects', () => {
  // Stray ASCII quotes kill JSON.parse outright; the string-aware walk
  // still recovers the clean fields (same truncation the web baseline
  // produces — verified against its design, not improved upon).
  const tricky = '[{"q":"What?","knowledgePoint":"k","opts":[{"letter":"A","text":"Yes","level":"internalized"},{"letter":"B","text":"Say "hi" ok","level":"fuzzy"},{"letter":"C","text":"No","level":"blank"}]}]';
  assert.throws(() => JSON.parse(tricky));
  const out = extractDiagQuestionsBalanced(tricky);
  assert.equal(out.length, 1);
  assert.equal(out[0].q, 'What?');
  assert.equal(out[0].opts.length, 3);
});

test('cold-start nodes mirror the five aspects', () => {
  const nodes = buildColdStartNodes('cell biology!');
  assert.equal(nodes.length, 5);
  assert.equal(nodes[0].name, 'Basic concepts of Cell biology');
  assert.ok(nodes.every((n) => n.status === 'blank'));
  assert.equal(cleanTopicDomain('Learn about matrices...'), 'Matrices');
});

test('teaching plans go blank-first and track the node', () => {
  const kbNodes = buildColdStartNodes('Algebra');
  kbNodes[1].status = 'fuzzy';
  const plan = buildTeachingPlanFromKB(kbNodes)!;
  assert.equal(plan.subtopics[0].status, 'blank');
  const synced = syncCurrentNodeFromTeachingPlan(plan, kbNodes)!;
  assert.equal(synced.currentNode, 0);
  assert.equal(buildTeachingPlanFromKB([]), null);
});

test('diagnostic answers fold into node baselines', () => {
  const kbNodes = buildColdStartNodes('Algebra');
  const questions = normalizeDiagQuestions([{
    q: 'Q?', knowledgePoint: 'vars', nodeIdx: 0,
    opts: [
      { letter: 'A', text: 'Know', level: 'internalized' },
      { letter: 'B', text: 'Heard', level: 'fuzzy' },
      { letter: 'C', text: 'Nope', level: 'blank' },
    ],
  }]);
  const graded = applyDiagnosticResults({ kbNodes, diagQuestions: questions, diagAnswers: [1] });
  assert.equal(graded[0].status, 'fuzzy');
  assert.match(graded[0].system_note, /vars/);
  const skipped = applyDiagnosticResults({ kbNodes, diagQuestions: questions, diagAnswers: [undefined] });
  assert.equal(skipped[0].status, 'blank');
});

test('tutor voice leads with the stage and foundation', () => {
  const voice = buildTutorVoice({ topic: 'Algebra', stage: 'define', nodeName: 'Vars', nodeStatus: 'blank', isFirst: true });
  assert.match(voice, /Socratic tutor teaching Algebra/);
  assert.match(voice, /define/);
  assert.match(voice, /LaTeX/);
});

test('diagnostic points name the tested concept and the chosen level', () => {
  const questions = normalizeDiagQuestions([{
    q: 'Q?', knowledgePoint: 'vars', nodeIdx: 0,
    opts: [
      { letter: 'A', text: 'Know', level: 'internalized' },
      { letter: 'B', text: 'Heard', level: 'fuzzy' },
      { letter: 'C', text: 'Nope', level: 'blank' },
    ],
  }]);
  assert.deepEqual(diagnosticPointsForNode(questions, { 0: 2 }, 0), ['vars (diagnostic result: blank)']);
  assert.deepEqual(diagnosticPointsForNode(questions, {}, 0), ['vars (diagnostic result: unknown)']);
  assert.deepEqual(diagnosticPointsForNode(questions, { 0: 0 }, 1), []);
});
