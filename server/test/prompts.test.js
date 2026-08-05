// @ts-check
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  _clearPromptCacheForTests,
  getBeagleSystemPrompt,
  getCodeInterpreterPrompt,
  getTeacherModePrompt,
} from '../src/lib/prompts.js';

describe('production prompt contracts', () => {
  test('Beagle prompt stays compact and defers protocol/style to the server policy', async () => {
    _clearPromptCacheForTests();
    const prompt = await getBeagleSystemPrompt();
    assert.ok(prompt);
    assert.ok(prompt.length < 4_000, `Beagle prompt grew to ${prompt.length} characters`);
    assert.match(prompt, /server system policy/i);
    assert.match(prompt, /`tools` array supplied by the server/i);
    assert.match(prompt, /render_visualization/);
    assert.match(prompt, /code_interpreter/);
    assert.match(prompt, /web_search/);
    assert.match(prompt, /web_fetch/);
    /* Tool-calling protocol and global writing rules live only in
       SERVER_SYSTEM_POLICY (routes/chat/helpers.ts); minimaxProxy always
       applies enforceServerSystemBoundary before injecting this file, so a
       second copy here would just drift and contradict. */
    for (const serverOwnedRule of [
      'native function-calling interface',
      'written register',
      'Do not use emoji',
      'dash punctuation',
    ]) {
      assert.equal(prompt.includes(serverOwnedRule), false, `server-owned rule duplicated: ${serverOwnedRule}`);
    }
    for (const staleProtocol of [
      '[web_search:',
      'conversation_search',
      'recent_chats',
      'tool_search',
    ]) {
      assert.equal(prompt.includes(staleProtocol), false, `stale tool protocol found: ${staleProtocol}`);
    }
  });

  test('code-interpreter prompt contains valid async Python guidance', async () => {
    _clearPromptCacheForTests();
    const prompt = await getCodeInterpreterPrompt();
    assert.ok(prompt);
    assert.match(prompt, /async def main\(\)/);
    assert.match(prompt, /asyncio\.run\(main\(\)\)/);
    assert.equal(prompt.includes('def main(): await'), false);
    assert.equal(prompt.includes('[code_interpreter:'), false);
  });

  test('teacher prompt keeps tutor-specific pedagogy without duplicating the global prose default', async () => {
    _clearPromptCacheForTests();
    const prompt = await getTeacherModePrompt();
    assert.ok(prompt);
    /* Tutor-only mechanics that belong to this mode: teaching cards,
       tool routing, math KaTeX compatibility, one-practice-per-reply. */
    assert.match(prompt, /教学卡片/);
    assert.match(prompt, /KaTeX/);
    assert.match(prompt, /begin\{aligned\}/);
    assert.match(prompt, /一次只出一道题/);
    /* Visualization routing is owned once by the client's
       VISUALIZATION_ROUTING_PROMPT (frontend/src/prompts/visualization.js),
       which is injected into every chat/socratic system message. teacher-mode
       must not restate the render_visualization/Mermaid/SVG/ASCII guidance, or
       the two copies would drift. */
    assert.equal(prompt.includes('render_visualization'), false, 'viz routing duplicated in teacher-mode');
    /* The global paragraph-first / no-bullet default is owned once by
       SERVER_SYSTEM_POLICY (routes/chat/helpers.ts); teacher-mode must not
       restate the full rule here, or the two copies would drift. */
    assert.equal(prompt.includes('默认不要把正文写成项目符号'), false, 'global prose default duplicated in teacher-mode');
    assert.equal(prompt.includes('只有当顺序、检查清单'), false, 'global prose default duplicated in teacher-mode');
  });
});
