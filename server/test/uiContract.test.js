import assert from 'node:assert/strict';
import test from 'node:test';

import { GET_UI_CONTRACT_TOOL, uiContractContent } from '../src/services/uiContract.js';
import { validateIntelligentUi, INTELLIGENT_UI_TOOL } from '../src/services/intelligentUi.js';
import { normalizeIntelligentUiArgs } from '../src/services/intelligentUiNormalize.js';
import { createToolExecutorRegistry } from '../src/routes/chat/pipeline/executors/executorLookup.js';
import { createToolRegistry } from '../src/services/tools/toolCapabilityCatalog.js';
import { repairToolArguments, validateToolArguments } from '../src/services/tools/toolCallSafety.js';
import { DEMONSTRATION_GUIDANCE } from '../src/services/demonstrationGuide.js';
import { OPENUI_TOOL_GUIDANCE } from '../src/services/openUiPrompt.generated.js';
import { LEARNING_UI_GUIDANCE } from '@socrates/core/learningUi';
import { INTELLIGENT_UI_CONTROL_GUIDANCE } from '@socrates/core/intelligentUiControls';
import { PHYSICS_MODELS } from '@socrates/core/physicsModelRegistry';

test('the provider-visible compact format survives repair, schema and renderer validation', () => {
  const schema = INTELLIGENT_UI_TOOL.function.parameters;
  const args = { nodes: [{ type: 'visualization', template: 'line',
    payload: { categories: ['A', 'B'], series: [{ data: [2, 4] }] } }] };
  const repaired = repairToolArguments(JSON.stringify(args), schema, { toolName: 'render_intelligent_ui' });
  assert.equal(repaired.ok, true);
  assert.equal(validateToolArguments(repaired.value, schema).ok, true);
  assert.equal(validateIntelligentUi(repaired.value).ok, true);
  assert.equal(normalizeIntelligentUiArgs(args).nodes[0].id, 'n1');
  const repairedLossy = validateIntelligentUi({ nodes: [{ type: 'visualization', template: 'line',
    payload: { categories: ['A'], series: [{ data: [1, 2] }] } }] });
  assert.equal(repairedLossy.ok, true,
    'legacy renderer explicitly accepts category mismatch by trimming values');
  assert.match(repairedLossy.warnings.join(' '), /Dropped 1 value/,
    'lossy normalization must never be silently accepted');
  assert.equal(validateIntelligentUi({ nodes: [{ type: 'visualization', template: 'function',
    payload: { functions: [{ expression: 'document.cookie' }] } }] }).ok, false,
    'unsafe or unsupported expressions must still be rejected');
});

test('contract discovery is callable, routed to an executor and schema-valid', async () => {
  const schema = GET_UI_CONTRACT_TOOL.function.parameters;
  const args = { kind: 'visualization', template: 'heatmap' };
  assert.equal(validateToolArguments(args, schema).ok, true);
  const registry = createToolRegistry({ codeInterpreterToolDef: null, mode: 'chat' });
  assert.equal(registry.get('get_ui_contract').enabled, true);
  assert.equal(registry.get('get_ui_contract').pure, true);
  const events = [];
  const executor = createToolExecutorRegistry().get('get_ui_contract');
  assert.equal(typeof executor, 'function', 'tool must be wired into the real executor registry');
  const outcome = await executor(args, { id: 'contract-1' },
    { emitter: { event: (...eventArgs) => events.push(eventArgs) } }, {
      activeToolNames: ['get_ui_contract'],
    });
  assert.equal(outcome.result.status, 'completed');
  assert.match(outcome.result.output, /Verified example arguments/);
  assert.equal(events[0][1].name, 'get_ui_contract');
});

test('all advanced contracts are recoverable in bounded pages', () => {
  const exact = {
    openui: OPENUI_TOOL_GUIDANCE,
    demonstration: DEMONSTRATION_GUIDANCE,
    learning: LEARNING_UI_GUIDANCE,
    physics: 'Physics node: {"type":"physics","scene":"<scene>","parameters":{...}}\n' +
      JSON.stringify(PHYSICS_MODELS.map((model) => ({
        scene: model.id, assumptions: model.assumption, parameters: model.parameters,
      }))),
    controls: INTELLIGENT_UI_CONTROL_GUIDANCE,
  };
  for (const kind of ['openui', 'demonstration', 'learning', 'physics', 'controls']) {
    const first = uiContractContent({ kind });
    assert.equal(first.ok, true, kind);
    let joined = '';
    for (let page = 1; page <= first.pages; page++) {
      const part = uiContractContent({ kind, page });
      assert.equal(part.ok, true);
      assert.ok(part.output.length <= 5160);
      joined += part.output.slice(part.output.indexOf('\n') + 1);
    }
    assert.equal(joined, exact[kind], kind + ': full advanced contract must round-trip exactly');
    assert.equal(uiContractContent({ kind, page: first.pages + 1 }).ok, false);
  }
});

test('unknown and inherited-property visualization template names fail closed', () => {
  for (const template of ['not-a-template', '__proto__', 'constructor', 'toString']) {
    assert.equal(uiContractContent({ kind: 'visualization', template }).ok, false, template);
  }
  assert.equal(uiContractContent({ kind: 'visualization', template: 'bar' }).ok, true);
});
