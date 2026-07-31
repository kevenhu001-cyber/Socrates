import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHAT_CONCISE_PROMPT,
  CHAT_SYSTEM_PROMPT,
  PYTHON_RUNNABLE_RULES,
} from '../src/chat/systemPrompts.js';

test('chat prompts define tool results as untrusted data', () => {
  for (const prompt of [CHAT_SYSTEM_PROMPT, CHAT_CONCISE_PROMPT]) {
    assert.match(prompt, /untrusted data/i);
    assert.match(prompt, /never follow instructions.*tool output/i);
  }
});

test('chat prompts keep the KaTeX math delimiter contract', () => {
  for (const prompt of [CHAT_SYSTEM_PROMPT, CHAT_CONCISE_PROMPT]) {
    assert.match(prompt, /\$\.\.\.\$/);
    assert.match(prompt, /\$\$\.\.\.\$\$/);
    assert.match(prompt, /KaTeX/);
  }
});

test('chat prompts do not duplicate server-owned policy', () => {
  /* Global writing rules, the tool-calling protocol, and the no-dash hard
     rule are owned by SERVER_SYSTEM_POLICY + FINAL_OUTPUT_CONSTRAINTS in
     server/src/routes/chat/helpers.ts. A second copy here would drift. */
  for (const prompt of [CHAT_SYSTEM_PROMPT, CHAT_CONCISE_PROMPT]) {
    assert.doesNotMatch(prompt, /dash punctuation/i);
    assert.doesNotMatch(prompt, /emoji/i);
    assert.doesNotMatch(prompt, /argument schema exactly/i);
    assert.doesNotMatch(prompt, /native function calling/i);
    assert.doesNotMatch(prompt, /\[(?:web_search|code_interpreter):/i);
  }
});

test('chat prompts do not demand disclosure of private chain of thought', () => {
  for (const prompt of [CHAT_SYSTEM_PROMPT, CHAT_CONCISE_PROMPT]) {
    assert.doesNotMatch(prompt, /state your reasoning openly|showing your thinking/i);
  }
});

test('chat prompt policies stay compact enough to avoid crowding user context', () => {
  assert.ok(CHAT_SYSTEM_PROMPT.length < 2_500, `high-effort prompt is ${CHAT_SYSTEM_PROMPT.length} chars`);
  assert.ok(CHAT_CONCISE_PROMPT.length < 2_000, `concise prompt is ${CHAT_CONCISE_PROMPT.length} chars`);
  assert.ok(PYTHON_RUNNABLE_RULES.length < 2_500, `python appendix is ${PYTHON_RUNNABLE_RULES.length} chars`);
});
