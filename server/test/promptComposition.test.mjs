import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFinalOutputConstraints, appendServerPolicy, FINAL_OUTPUT_CONSTRAINTS } from '../src/lib/chatPolicy.js';
import { enforceServerSystemBoundary } from '../src/routes/chat/helpers.js';
import { getTeacherModePrompt, getLearningModePrompt, LEARNING_MODE_IDS } from '../src/lib/prompts.js';
import { CHAT_SYSTEM_PROMPT, CHAT_CONCISE_PROMPT } from '../../frontend/src/chat/systemPrompts.ts';
import { SOCRATIC_SYSTEM_PROMPT } from '../../frontend/src/prompts/socratic.ts';
import * as webTutor from '../../frontend/src/chat/socraticDirectives.ts';
import * as universalTutor from '../../packages/ui/src/tutor.ts';
import { splitPromptContext } from '../src/lib/chatPromptContext.js';

test('Universal App teaching stages reach the turn context instead of freezing into the session', () => {
  for (const stage of ['motivate', 'define', 'exercise']) {
    const content = universalTutor.buildTutorVoice({ topic: 'Algebra', stage, isFirst: stage === 'motivate' });
    const split = splitPromptContext([{ role: 'system', content }, { role: 'user', content: '继续' }], 'tutor');
    assert.equal(split.initialization.length, 0);
    assert.equal(split.turnInstructions.length, 1);
    assert.match(split.turnInstructions[0], new RegExp(stage));
    assert.equal(split.conversation.length, 1);
  }
});

test('production chat and tutor instructions agree on native learning output and response defaults', async () => {
  for (const client of [CHAT_SYSTEM_PROMPT, CHAT_CONCISE_PROMPT, SOCRATIC_SYSTEM_PROMPT]) {
    let messages = enforceServerSystemBoundary([
      { role: 'system', content: '[Assistant mode instructions]\n' + client },
      { role: 'user', content: '请充分解释原因，并用一个例子帮助我理解。' },
    ]);
    if (client === SOCRATIC_SYSTEM_PROMPT) {
      messages = appendServerPolicy(messages, '[Server policy: teacher-mode]', await getTeacherModePrompt());
    }
    const prompt = appendFinalOutputConstraints(messages)[0].content;
    assert.ok(prompt.endsWith(FINAL_OUTPUT_CONSTRAINTS));
    assert.match(prompt, /Output style never overrides these requirements/);
    assert.match(prompt, /detailed, rich, self-contained explanation/);
    // Actual composed instructions must never teach the retired output format.
    assert.doesNotMatch(prompt, /<(?:quiz|practice|definition|flashcard|correct)[ >]/);
    assert.doesNotMatch(prompt, /explanation attribute|reasons out loud|overrides everything above/);
  }
});

test('every learning mode composes with teacher policy without reintroducing XML generation', async () => {
  const teacher = await getTeacherModePrompt();
  for (const mode of LEARNING_MODE_IDS) {
    const prompt = teacher + '\n\n' + await getLearningModePrompt(mode);
    assert.doesNotMatch(prompt, /<(?:quiz|practice|definition|flashcard|correct)[ >]/, mode);
    assert.match(prompt, /tool is unavailable/, mode);
    assert.match(prompt, /latest explicit request/, mode);
  }
});

test('web and Universal App agree on foundation depth and stage precedence', () => {
  assert.equal(webTutor.BASELINE_LEVEL, universalTutor.BASELINE_LEVEL);
  for (const status of ['blank', 'fuzzy', 'internalized', 'unknown']) {
    for (const continuation of [false, true]) {
      assert.equal(webTutor.fromBasicsDirective({ status }, { continuation }), universalTutor.fromBasicsDirective({ status }, { continuation }));
    }
    const foundation = webTutor.fromBasicsDirective({ status });
    assert.match(foundation, /motivate stage, start with intuition and defer the formal definition/);
    assert.doesNotMatch(foundation, /3\+|more examples \(/);
  }
  for (const stage of ['motivate', 'define', 'develop', 'illustrate', 'exercise', 'check', 'unknown']) {
    assert.equal(webTutor.stageInstruction(stage), universalTutor.stageInstruction(stage));
    for (const first of [false, true]) {
      const scope = webTutor.tutorTurnDirective(stage, first);
      assert.equal(scope, universalTutor.tutorTurnDirective(stage, first));
      assert.match(scope, /within the server policy and native output schemas/);
      assert.match(scope, /direct user request.*takes precedence/);
    }
  }
});
