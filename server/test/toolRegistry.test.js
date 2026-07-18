import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolRegistry } from '../src/services/toolRegistry.js';

test('tool registry exposes native visuals by default and disables tutor search', () => {
  const chat = createToolRegistry({ codeInterpreterToolDef: { function: { name: 'code_interpreter' } }, mode: 'chat' });
  assert.deepEqual(chat.definitions.map((tool) => tool.function.name), ['code_interpreter', 'render_visualization', 'web_search']);
  const tutor = createToolRegistry({ codeInterpreterToolDef: null, mode: 'tutor' });
  assert.deepEqual(tutor.definitions.map((tool) => tool.function.name), ['render_visualization']);
  assert.equal(chat.get('code_interpreter').sessionSerial, true);
  assert.equal(chat.get('render_visualization').pure, true);
});
