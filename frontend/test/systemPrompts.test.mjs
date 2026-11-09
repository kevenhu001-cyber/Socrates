import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHAT_CONCISE_PROMPT,
  CHAT_SYSTEM_PROMPT,
  HIGH_EFFORT_OUTPUT_GUIDANCE,
  LEARNING_SCAFFOLD_GUIDANCE,
  PYTHON_RUNNABLE_RULES,
} from '../src/chat/systemPrompts.ts';
import { splitScaffolds } from '@socrates/ui/learn-split';
import { SOCRATIC_SYSTEM_PROMPT } from '../src/prompts/socratic.ts';

test('Chat and Tutor share one optional learning scaffold contract', () => {
  for (const prompt of [CHAT_SYSTEM_PROMPT, CHAT_CONCISE_PROMPT, SOCRATIC_SYSTEM_PROMPT]) {
    assert.ok(prompt.includes(LEARNING_SCAFFOLD_GUIDANCE));
  }
  assert.match(LEARNING_SCAFFOLD_GUIDANCE, /never place scaffold tags inside fenced or inline code/);
  assert.match(LEARNING_SCAFFOLD_GUIDANCE, /ordinary conversation stays in prose/i);
  assert.match(LEARNING_SCAFFOLD_GUIDANCE, /<theorem>/);
  assert.match(LEARNING_SCAFFOLD_GUIDANCE, /never wraps the whole answer/);
});

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
  assert.match(HIGH_EFFORT_OUTPUT_GUIDANCE, /For substantive requests, deepen the explanation/i);
  assert.match(HIGH_EFFORT_OUTPUT_GUIDANCE, /Keep ordinary conversation proportionate/);
  /* Paragraph-first / no-bullet formatting and chain-of-thought protection are
     owned once by SERVER_SYSTEM_POLICY and must not be re-declared here, so
     the effort level cannot drift from or override the global writing rules. */
  assert.doesNotMatch(HIGH_EFFORT_OUTPUT_GUIDANCE, /Avoid bullet points/i);
  assert.match(HIGH_EFFORT_OUTPUT_GUIDANCE, /without revealing private chain-of-thought/i);
  assert.match(HIGH_EFFORT_OUTPUT_GUIDANCE, /needed to verify the answer/i);
  assert.doesNotMatch(HIGH_EFFORT_OUTPUT_GUIDANCE, /Do not omit meaningful intermediate reasoning/i);
  assert.match(CHAT_SYSTEM_PROMPT, /high reasoning-effort mode/i);
  assert.doesNotMatch(CHAT_CONCISE_PROMPT, /high reasoning-effort mode/i);
});

test('chat prompt policies stay compact enough to avoid crowding user context', () => {
  assert.ok(CHAT_SYSTEM_PROMPT.length < 5_000, `high-effort prompt is ${CHAT_SYSTEM_PROMPT.length} chars`);
  assert.ok(CHAT_CONCISE_PROMPT.length < 4_500, `concise prompt is ${CHAT_CONCISE_PROMPT.length} chars`);
  assert.ok(PYTHON_RUNNABLE_RULES.length < 2_500, `python appendix is ${PYTHON_RUNNABLE_RULES.length} chars`);
});


test('every prompted learning-card example is accepted by the actual shared parser', () => {
  const examples = LEARNING_SCAFFOLD_GUIDANCE.split('\n').filter(line => line.startsWith('<'));
  assert.equal(examples.length, 10);
  for (const example of examples) {
    const parts = splitScaffolds(example);
    assert.equal(parts.length, 1, example);
    assert.equal(parts[0].kind, 'scaffold', example);
  }
  assert.match(LEARNING_SCAFFOLD_GUIDANCE, /practice (?:only )?for an? (?:explicitly requested )?question without answer options/);
});
