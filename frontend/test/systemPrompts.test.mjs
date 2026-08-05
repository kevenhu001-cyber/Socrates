import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHAT_CONCISE_PROMPT,
  CHAT_SYSTEM_PROMPT,
  HIGH_EFFORT_OUTPUT_GUIDANCE,
  PYTHON_RUNNABLE_RULES,
} from '../src/chat/systemPrompts.js';

test('chat prompts do not duplicate the server-owned untrusted-data rule', () => {
  /* untrusted-data handling is owned once by SERVER_SYSTEM_POLICY in
     server/src/routes/chat/helpers.ts and is always injected above the
     client block, so a second copy here would drift. */
  for (const prompt of [CHAT_SYSTEM_PROMPT, CHAT_CONCISE_PROMPT]) {
    assert.doesNotMatch(prompt, /untrusted data/i);
    assert.doesNotMatch(prompt, /never follow instructions.*tool output/i);
  }
});

test('chat prompts do not duplicate the server-owned math delimiter contract', () => {
  /* The `$...$` / `$$...$$` LaTeX delimiter contract now lives once in
     SERVER_SYSTEM_POLICY; the client should not restate it. */
  for (const prompt of [CHAT_SYSTEM_PROMPT, CHAT_CONCISE_PROMPT]) {
    assert.doesNotMatch(prompt, /\$\.\.\.\$/);
    assert.doesNotMatch(prompt, /\$\$\.\.\.\$\$/);
    assert.doesNotMatch(prompt, /KaTeX/);
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

test('high-effort prompt prioritizes detailed paragraph-based answers without duplicating global formatting rules', () => {
  assert.match(HIGH_EFFORT_OUTPUT_GUIDANCE, /very detailed, self-contained answer/i);
  assert.match(HIGH_EFFORT_OUTPUT_GUIDANCE, /高思考强度下/);
  /* Paragraph-first / no-bullet formatting and chain-of-thought protection are
     owned once by SERVER_SYSTEM_POLICY and must not be re-declared here, so
     the effort level cannot drift from or override the global writing rules. */
  assert.doesNotMatch(HIGH_EFFORT_OUTPUT_GUIDANCE, /Avoid bullet points/i);
  assert.doesNotMatch(HIGH_EFFORT_OUTPUT_GUIDANCE, /chain-of-thought/i);
  assert.match(CHAT_SYSTEM_PROMPT, /high reasoning-effort mode/i);
  assert.doesNotMatch(CHAT_CONCISE_PROMPT, /high reasoning-effort mode/i);
});

test('chat prompt policies stay compact enough to avoid crowding user context', () => {
  assert.ok(CHAT_SYSTEM_PROMPT.length < 2_500, `high-effort prompt is ${CHAT_SYSTEM_PROMPT.length} chars`);
  assert.ok(CHAT_CONCISE_PROMPT.length < 2_000, `concise prompt is ${CHAT_CONCISE_PROMPT.length} chars`);
  assert.ok(PYTHON_RUNNABLE_RULES.length < 2_500, `python appendix is ${PYTHON_RUNNABLE_RULES.length} chars`);
});
