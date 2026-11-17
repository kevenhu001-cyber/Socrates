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
    assert.match(prompt, /server policy above/i);
    assert.match(prompt, /`tools` array supplied by the server/i);
    assert.doesNotMatch(
      prompt,
      /MiniMax|deny it if directly asked|web_search|web_fetch|code_interpreter|render_visualization|create_plan|create_spec/,
    );
    /* Tool-calling protocol and global writing rules live only in
       SERVER_SYSTEM_POLICY (routes/chat/prepare/prompts.ts); minimaxProxy always
       applies enforceServerSystemBoundary before injecting this file, so a
       second copy here would just drift and contradict. */
    for (const serverOwnedRule of [
      'native function-calling interface',
      'written register',
      'Do not use emoji',
      'dash punctuation',
    ]) {
      assert.equal(
        prompt.includes(serverOwnedRule),
        false,
        `server-owned rule duplicated: ${serverOwnedRule}`,
      );
    }
    for (const staleProtocol of [
      '[web_search:',
      'conversation_search',
      'recent_chats',
      'tool_search',
    ]) {
      assert.equal(
        prompt.includes(staleProtocol),
        false,
        `stale tool protocol found: ${staleProtocol}`,
      );
    }
  });

  test('code-interpreter prompt defers execution mechanics to the tool schema', async () => {
    _clearPromptCacheForTests();
    const prompt = await getCodeInterpreterPrompt();
    assert.ok(prompt);
    /* Python syntax rules, package availability, limits and error recovery
       live once in the code_interpreter tool description
       (services/codeInterpreter.ts); this appendix only carries routing. */
    assert.match(prompt, /render_intelligent_ui/);
    assert.match(prompt, /tool description and JSON schema are the authoritative/i);
    assert.equal(prompt.includes('[code_interpreter:'), false);
  });

  test('teacher prompt keeps tutor-specific pedagogy without duplicating the global prose default', async () => {
    _clearPromptCacheForTests();
    const prompt = await getTeacherModePrompt();
    assert.ok(prompt);
    /* Tutor-only mechanics that belong to this mode: teaching cards,
       tool routing, math KaTeX compatibility, one-practice-per-reply. */
    assert.match(prompt, /Teaching cards/);
    assert.match(prompt, /KaTeX/);
    assert.match(prompt, /begin\{aligned\}/);
    assert.match(prompt, /One practice or quiz per reply/);
    /* Visualization routing is owned once by the server's
       appendToolRoutingHints helper (routes/chat/prepare/prompts.ts) and is appended
       only when the matching native tool is available. teacher-mode must not
       restate the render_visualization/Mermaid/SVG/ASCII guidance, or the two
       copies would drift. */
    assert.equal(
      prompt.includes('render_visualization'),
      false,
      'viz routing duplicated in teacher-mode',
    );
    /* Global response-format guidance is owned once by
       SERVER_SYSTEM_POLICY (routes/chat/prepare/prompts.ts); teacher-mode must not
       restate the full rule here, or the two copies would drift. */
    assert.equal(
      prompt.includes('默认不要把正文写成项目符号'),
      false,
      'global prose default duplicated in teacher-mode',
    );
    assert.equal(
      prompt.includes('只有当顺序、检查清单'),
      false,
      'global prose default duplicated in teacher-mode',
    );
  });
});
