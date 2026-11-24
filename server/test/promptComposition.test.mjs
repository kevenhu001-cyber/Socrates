import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendFinalOutputConstraints,
  appendServerPolicy,
  FINAL_OUTPUT_CONSTRAINTS,
} from '../src/lib/chatPolicy.js';
import { enforceServerSystemBoundary } from '../src/routes/chat/prepare/clientSystem.js';
import {
  getTeacherModePrompt,
  getLearningModePrompt,
  LEARNING_MODE_IDS,
} from '../src/lib/prompts.js';
import { CHAT_SYSTEM_PROMPT, CHAT_CONCISE_PROMPT } from '../../frontend/src/chat/systemPrompts.ts';
import { SOCRATIC_SYSTEM_PROMPT } from '../../frontend/src/prompts/socratic.ts';
import * as webTutor from '../../frontend/src/chat/socraticDirectives.ts';
import { splitPromptContext } from '../src/lib/chatPromptContext.js';

test('production chat and tutor instructions agree on native learning output and response defaults', async () => {
  for (const client of [CHAT_SYSTEM_PROMPT, CHAT_CONCISE_PROMPT, SOCRATIC_SYSTEM_PROMPT]) {
    let messages = enforceServerSystemBoundary([
      { role: 'system', content: '[Assistant mode instructions]\n' + client },
      { role: 'user', content: '请充分解释原因，并用一个例子帮助我理解。' },
    ]);
    if (client === SOCRATIC_SYSTEM_PROMPT) {
      messages = appendServerPolicy(
        messages,
        '[Server policy: teacher-mode]',
        await getTeacherModePrompt(),
      );
    }
    const prompt = appendFinalOutputConstraints(messages)[0].content;
    assert.ok(prompt.endsWith(FINAL_OUTPUT_CONSTRAINTS));
    assert.match(prompt, /Output style never overrides these requirements/);
    assert.match(prompt, /one thought per short paragraph/);
    assert.match(prompt, /For explanations in any mode/);
    assert.match(prompt, /complete requested derivations/);
    assert.match(prompt, /important equations on their own display lines/i);
    assert.match(prompt, /an excellent textbook in conversation/);
    assert.doesNotMatch(prompt, /detailed, rich, self-contained explanation/);
    // Actual composed instructions must never teach the retired output format.
    assert.doesNotMatch(prompt, /<(?:quiz|practice|definition|flashcard|correct)[ >]/);
    assert.doesNotMatch(
      prompt,
      /explanation attribute|reasons out loud|overrides everything above/,
    );
  }
});

test('every learning mode composes with teacher policy without reintroducing XML generation', async () => {
  const teacher = await getTeacherModePrompt();
  for (const mode of LEARNING_MODE_IDS) {
    const prompt = teacher + '\n\n' + (await getLearningModePrompt(mode));
    assert.doesNotMatch(prompt, /<(?:quiz|practice|definition|flashcard|correct)[ >]/, mode);
    assert.match(prompt, /tool is unavailable/, mode);
    assert.match(prompt, /latest explicit request/, mode);
  }
});
