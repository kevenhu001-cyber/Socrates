import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolRegistry } from '../src/services/toolRegistry.js';

test('tool registry exposes the same native search and visual tools in tutor mode', () => {
  const chat = createToolRegistry({ codeInterpreterToolDef: { function: { name: 'code_interpreter' } }, mode: 'chat' });
  assert.deepEqual(chat.definitions.map((tool) => tool.function.name), ['code_interpreter', 'workspace_agent', 'initialize_workspace', 'render_visualization', 'web_search', 'web_fetch', 'create_plan', 'create_spec', 'arxiv_search']);
  const tutor = createToolRegistry({ codeInterpreterToolDef: null, mode: 'tutor' });
  assert.deepEqual(tutor.definitions.map((tool) => tool.function.name), ['workspace_agent', 'initialize_workspace', 'render_visualization', 'web_search', 'web_fetch', 'create_plan', 'create_spec', 'arxiv_search']);
  assert.equal(chat.get('code_interpreter').sessionSerial, true);
  assert.equal(chat.get('workspace_agent').sessionSerial, true);
  assert.equal(chat.get('initialize_workspace').sessionSerial, true);
  assert.equal(chat.get('initialize_workspace').pure, false);
  assert.equal(tutor.get('workspace_agent').pure, false);
  assert.equal(chat.get('render_visualization').pure, true);
});
