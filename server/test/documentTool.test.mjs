import { after } from 'node:test';
import { shutdownPubsub } from '../src/lib/pubsub.js';
after(async () => { await shutdownPubsub(); });
import test from 'node:test';
import assert from 'node:assert/strict';
import { DOCUMENT_TOOL, executeDocument, validateDocumentArgs } from '../src/services/core/planning.ts';
import { createToolRegistry } from '../src/services/tools/toolRegistry.ts';
import { createToolExecutorRegistry } from '../src/routes/chat/pipeline/executors/registry.ts';
import { resolveToolName } from '../src/services/tools/toolCallSafety.ts';
import { appendToolRoutingHints } from '../src/routes/chat/helpers.ts';

test('one document capability exposes two strictly discriminated content contracts', () => {
  const names = createToolRegistry({}).definitions.map(tool => tool.function.name);
  assert.ok(names.includes('create_document'));
  assert.ok(!names.includes('create_plan') && !names.includes('create_spec'));
  assert.deepEqual(DOCUMENT_TOOL.function.parameters.required, ['kind', 'content']);
  const plan = executeDocument({ kind: 'plan', content: { title: 'Review', steps: [{title:'Read'}, {title:'Practice'}] } });
  assert.equal(plan.status, 'completed');
  assert.equal(plan.plan.steps[0].title, 'Read');
  const spec = executeDocument({ kind: 'spec', content: { title: 'Export', requirements: ['Keep equations'] } });
  assert.equal(spec.status, 'completed');
  assert.deepEqual(spec.spec.requirements, ['Keep equations']);
  for (const input of [{ kind: 'other', content: {} }, { kind: 'plan', content: { title: 'x', requirements: ['x'] } }, { kind: 'spec', content: { title: 'x', steps: ['x'] } }, { kind: 'plan', content: {}, extra: true }]) {
    assert.equal(validateDocumentArgs(input).ok, false);
    assert.equal(executeDocument(input).status, 'failed');
  }
});

test('routing injection follows the offered tool and uses the unified envelope', () => {
  const messages = [{ role: 'system', content: 'Tutor' }];
  const routed = appendToolRoutingHints(messages, ['create_document', 'render_intelligent_ui']);
  assert.match(routed[0].content, /create_document with \{kind:/);
  assert.doesNotMatch(routed[0].content, /When `create_plan`|When `create_spec`|one openui node/);
  assert.match(routed[0].content, /EVERY displayed formula/);
  assert.deepEqual(appendToolRoutingHints(routed, ['create_document', 'render_intelligent_ui']), routed);
});

test('removed tool names and aliases cannot resolve or execute', () => {
  const registry = createToolRegistry({});
  const executors = createToolExecutorRegistry();
  const names = registry.definitions.map(tool => tool.function.name);
  for (const name of ['create_plan', 'create_spec', 'render_visualization', 'make_plan', 'update_plan', 'requirements']) {
    assert.equal(registry.get(name), null);
    assert.equal(executors.get(name), null);
    assert.equal(resolveToolName(name, names).name, null);
  }
});
