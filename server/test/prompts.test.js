// @ts-check
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  _clearPromptCacheForTests,
  getBeagleSystemPrompt,
  getCodeInterpreterPrompt,
} from '../src/lib/prompts.js';

describe('production prompt contracts', () => {
  test('Beagle prompt stays compact and references only native supplied tools', async () => {
    _clearPromptCacheForTests();
    const prompt = await getBeagleSystemPrompt();
    assert.ok(prompt);
    assert.ok(prompt.length < 8_000, `Beagle prompt grew to ${prompt.length} characters`);
    assert.match(prompt, /native function-calling interface/i);
    assert.match(prompt, /`tools` array supplied by the server/i);
    assert.match(prompt, /written register/i);
    assert.match(prompt, /Do not use emoji/i);
    for (const staleProtocol of [
      '[web_search:',
      'conversation_search',
      'recent_chats',
      'tool_search',
      'web_fetch',
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
});
