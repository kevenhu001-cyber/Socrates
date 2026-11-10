import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LEARNING_MODE_IDS,
  _clearPromptCacheForTests,
  getLearningModePrompt,
  parseLearningModeSections,
} from '../src/lib/prompts.js';
import { appendTurnContext } from '../src/lib/chatPromptContext.js';
import { ChatPayloadSchema, buildLearningModeTurn } from '../src/routes/chat/helpers.js';

describe('RN-6 learning-mode prompts', () => {
  test('every mode gets autonomous learning and inline feedback instructions', async () => {
    _clearPromptCacheForTests();
    for (const mode of LEARNING_MODE_IDS) {
      const prompt = await getLearningModePrompt(mode);
      assert.ok(prompt, `missing section for ${mode}`);
      assert.match(prompt, /Do not emit next-questions suggestion blocks/, `${mode} lacks autonomous learning instructions`);
      assert.match(prompt, /native quiz fields/);
      assert.doesNotMatch(prompt, /<(?:quiz|practice|flashcard|correct|o)[ >]/);
      assert.match(prompt, /Unless the user explicitly requests fill-in-the-blank/);
      assert.ok(prompt.length < 4_000, `${mode} prompt grew to ${prompt.length}`);
      assert.doesNotMatch(prompt, /[—–]/, `${mode} prompt uses a dash the server policy forbids`);
    }
  });

  test('recall asks for 3-5 native flashcards with a tool-free fallback', async () => {
    const prompt = await getLearningModePrompt('recall');
    assert.match(prompt, /three to five flashcards/);
    assert.match(prompt, /kind "flashcard" and nonempty front and back fields/);
    assert.match(prompt, /Without the tool, present question\/answer pairs in Markdown/);
  });

  test('section parser ignores the preamble and unknown headings', () => {
    const { shared, modes } = parseLearningModeSections('# T\nintro\n## shared\nS\n## mode: a\nA body\n## notes\nx\n');
    assert.equal(shared, 'S');
    assert.deepEqual(modes, { a: 'A body' });
  });

  test('the turn block is server-owned and carries the focus as untrusted data', async () => {
    const block = await buildLearningModeTurn('practice', '  条件概率  ');
    assert.match(block, /^\[Learning mode: practice; server-owned\]\n/);
    assert.match(block, /<client_context_data scope="untrusted">\nLearning focus: 条件概率\n<\/client_context_data>$/);
    assert.doesNotMatch(await buildLearningModeTurn('think', ''), /Learning focus/);
  });

  test('the server block leads the turn context on the last user message', () => {
    const out = appendTurnContext(
      [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'a' }, { role: 'user', content: 'q' }],
      ['stage: explain'],
      null,
      '[Learning mode: recall; server-owned]\nR',
    );
    assert.equal(out[0].content, 'hi');
    const text = String(out[2].content);
    assert.ok(text.indexOf('[Learning mode: recall') < text.indexOf('[Current turn instructions'));
    assert.ok(text.startsWith('q\n\n[Learning mode: recall'));
  });

  test('the payload accepts known modes only', () => {
    const base = { messages: [{ role: 'user', content: 'x' }], mode: 'tutor' };
    assert.equal(ChatPayloadSchema.parse({ ...base, learningMode: 'recall' }).learningMode, 'recall');
    assert.throws(() => ChatPayloadSchema.parse({ ...base, learningMode: 'freestyle' }));
    assert.equal(ChatPayloadSchema.parse(base).learningMode, undefined);
  });
});
