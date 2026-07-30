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

test('chat prompts use the server supplied native argument object format', () => {
  for (const prompt of [CHAT_SYSTEM_PROMPT, CHAT_CONCISE_PROMPT]) {
    assert.match(prompt, /native function calling/i);
    assert.match(prompt, /argument object directly/i);
    assert.match(prompt, /never wrap it in `input`, `arguments`/i);
    assert.doesNotMatch(prompt, /\[(?:web_search|code_interpreter):/i);
  }
});

test('chat prompts do not demand disclosure of private chain of thought', () => {
  for (const prompt of [CHAT_SYSTEM_PROMPT, CHAT_CONCISE_PROMPT]) {
    assert.doesNotMatch(prompt, /state your reasoning openly|showing your thinking/i);
  }
});

test('chat prompts share the written no-emoji response style', () => {
  for (const prompt of [CHAT_SYSTEM_PROMPT, CHAT_CONCISE_PROMPT]) {
    assert.match(prompt, /professional, written register/i);
    assert.match(prompt, /em dash \(—\)/i);
    assert.match(prompt, /Do not use emoji/i);
  }
});

test('chat prompt policies stay compact enough to avoid crowding user context', () => {
  assert.ok(CHAT_SYSTEM_PROMPT.length < 9_000, `high-effort prompt is ${CHAT_SYSTEM_PROMPT.length} chars`);
  assert.ok(CHAT_CONCISE_PROMPT.length < 7_000, `concise prompt is ${CHAT_CONCISE_PROMPT.length} chars`);
  assert.ok(PYTHON_RUNNABLE_RULES.length < 2_500, `python appendix is ${PYTHON_RUNNABLE_RULES.length} chars`);
});
