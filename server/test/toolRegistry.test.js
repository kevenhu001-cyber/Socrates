import test from 'node:test';
import assert from 'node:assert/strict';
import {createToolRegistry} from '../src/services/toolRegistry.js';
import {PI_AGENT_ENABLED} from '../src/services/piAgent.js';

test('tool registry exposes the same native search and visual tools in tutor mode', () => {
  const chat = createToolRegistry({ codeInterpreterToolDef: { function: { name: 'code_interpreter' } }, mode: 'chat' });
  const workspaceTools = PI_AGENT_ENABLED ? ['workspace_agent', 'initialize_workspace'] : [];
  assert.deepEqual(chat.definitions.map((tool) => tool.function.name), ['code_interpreter', ...workspaceTools, 'render_visualization', 'web_search', 'web_fetch', 'read_attachment', 'save_memory', 'create_plan', 'create_spec', 'create_site', 'arxiv_search']);
  const tutor = createToolRegistry({ codeInterpreterToolDef: null, mode: 'tutor' });
  assert.deepEqual(tutor.definitions.map((tool) => tool.function.name), [...workspaceTools, 'render_visualization', 'web_search', 'web_fetch', 'read_attachment', 'save_memory', 'create_plan', 'create_spec', 'create_site', 'arxiv_search']);
  /* sessionSerial carries the lane name: workspace tools share 'workspace'
     (a reset must not overlap an agent run); code_interpreter's scratch
     dir is an independent 'code' lane. */
  assert.equal(chat.get('code_interpreter').sessionSerial, 'code');
  assert.equal(chat.get('workspace_agent').sessionSerial, 'workspace');
  assert.equal(chat.get('initialize_workspace').sessionSerial, 'workspace');
  assert.equal(chat.get('initialize_workspace').pure, false);
  assert.equal(tutor.get('workspace_agent').pure, false);
  assert.equal(chat.get('render_visualization').pure, true);
  /* read_attachment is pure (no side effects) and unserialized — the
     model may page several files in parallel within one turn. */
  assert.equal(chat.get('read_attachment').pure, true);
  assert.equal(chat.get('read_attachment').sessionSerial, false);
  assert.equal(tutor.get('read_attachment').enabled, true);
  /* save_memory writes to the memories table — side-effecting, so it
     must stay non-pure (fuzzy recovery cannot reach it). */
  assert.equal(chat.get('save_memory').enabled, true);
  assert.equal(chat.get('save_memory').pure, false);
});
