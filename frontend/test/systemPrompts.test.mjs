import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHAT_CONCISE_PROMPT,
  CHAT_SYSTEM_PROMPT,
  LEARNING_SCAFFOLD_GUIDANCE,
  PYTHON_RUNNABLE_RULES,
} from '../src/chat/systemPrompts.ts';
import { SOCRATIC_SYSTEM_PROMPT } from '../src/prompts/socratic.ts';

test('Chat and Tutor defer learning output protocols to the server', () => {
  for (const prompt of [CHAT_SYSTEM_PROMPT, CHAT_CONCISE_PROMPT, SOCRATIC_SYSTEM_PROMPT]) {
    assert.ok(prompt.includes(LEARNING_SCAFFOLD_GUIDANCE));
  }
  assert.match(LEARNING_SCAFFOLD_GUIDANCE, /server's learning-interaction policy/);
  assert.match(LEARNING_SCAFFOLD_GUIDANCE, /ordinary conversation stays in prose/i);
  assert.doesNotMatch(
    LEARNING_SCAFFOLD_GUIDANCE,
    /<(?:quiz|practice|theorem|definition|flashcard)[ >]/,
  );
  assert.match(LEARNING_SCAFFOLD_GUIDANCE, /never wrap the whole answer/);
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

test('the reasoning-depth directive is server-owned, not duplicated in the client prompt', () => {
  /* P_reasoning-effort-server-owned — the high-effort depth directive used
     to live here, inside the client-application instructions block, which is
     a LOWER priority tier than the server's own response defaults. The
     server copy won, so the client copy only burned tokens on every
     high-effort turn. The server emits it as `[Server policy:
     reasoning-effort]` next to the response defaults it refines. */
  for (const prompt of [CHAT_SYSTEM_PROMPT, CHAT_CONCISE_PROMPT]) {
    assert.doesNotMatch(prompt, /decisive point/i);
    assert.doesNotMatch(prompt, /reasoning effort/i);
    assert.doesNotMatch(prompt, /check it carefully/i);
  }
});

test('chat prompt policies stay compact enough to avoid crowding user context', () => {
  assert.ok(
    CHAT_SYSTEM_PROMPT.length < 5_000,
    `high-effort prompt is ${CHAT_SYSTEM_PROMPT.length} chars`,
  );
  assert.ok(
    CHAT_CONCISE_PROMPT.length < 4_500,
    `concise prompt is ${CHAT_CONCISE_PROMPT.length} chars`,
  );
  assert.ok(
    PYTHON_RUNNABLE_RULES.length < 2_500,
    `python appendix is ${PYTHON_RUNNABLE_RULES.length} chars`,
  );
});

test('client learning guidance stays compact and does not teach a competing protocol', () => {
  assert.ok(LEARNING_SCAFFOLD_GUIDANCE.length < 700);
  assert.match(LEARNING_SCAFFOLD_GUIDANCE, /Do not emit legacy XML learning tags/);
  assert.match(
    LEARNING_SCAFFOLD_GUIDANCE,
    /if the tool is unavailable, use ordinary prose or Markdown/,
  );
  assert.doesNotMatch(LEARNING_SCAFFOLD_GUIDANCE, /explanation attribute|<correct>|QuizCard\(/);
});
