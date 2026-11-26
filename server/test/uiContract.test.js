import assert from 'node:assert/strict';
import test, { after } from 'node:test';

// Importing the full executor registry starts the shared PostgreSQL listener.
// Close it explicitly: the strict suite starts one Node process per test file.
after(async () => {
  const { shutdownPubsub } = await import('../src/lib/pubsub.js');
  await shutdownPubsub();
});

import { GET_UI_CONTRACT_TOOL, uiContractContent } from '../src/services/uiContract.js';
import { validateIntelligentUi, INTELLIGENT_UI_TOOL, INTELLIGENT_UI_PROVIDER_TOOL } from '../src/services/intelligentUi.js';
import { normalizeIntelligentUiArgs } from '../src/services/intelligentUiNormalize.js';
import { createToolExecutorRegistry } from '../src/routes/chat/pipeline/executors/executorLookup.js';
import { createToolRegistry } from '../src/services/tools/toolCapabilityCatalog.js';
import {
  repairToolArguments,
  validateToolArguments,
} from '../src/services/tools/toolCallSafety.js';
import { DEMONSTRATION_GUIDANCE } from '../src/services/demonstrationGuide.js';
import { DEMONSTRATION_SECTIONS, demonstrationSectionContent } from '../src/services/demonstrationSections.js';
import { readFileSync } from 'node:fs';
import { OPENUI_TOOL_GUIDANCE } from '../src/services/openUiPrompt.generated.js';
import { LEARNING_UI_GUIDANCE } from '@socrates/core/learningUi';
import { INTELLIGENT_UI_CONTROL_GUIDANCE } from '@socrates/core/intelligentUiControls';
import { PHYSICS_MODELS } from '@socrates/core/physicsModelRegistry';

test('the provider-visible compact format survives repair, schema and renderer validation', () => {
  const schema = INTELLIGENT_UI_TOOL.function.parameters;
  const args = {
    nodes: [
      {
        type: 'visualization',
        template: 'line',
        payload: { categories: ['A', 'B'], series: [{ data: [2, 4] }] },
      },
    ],
  };
  const repaired = repairToolArguments(JSON.stringify(args), schema, {
    toolName: 'render_intelligent_ui',
  });
  assert.equal(repaired.ok, true);
  assert.equal(validateToolArguments(repaired.value, schema).ok, true);
  assert.equal(validateIntelligentUi(repaired.value).ok, true);
  assert.equal(normalizeIntelligentUiArgs(args).nodes[0].id, 'n1');
  const repairedLossy = validateIntelligentUi({
    nodes: [
      {
        type: 'visualization',
        template: 'line',
        payload: { categories: ['A'], series: [{ data: [1, 2] }] },
      },
    ],
  });
  assert.equal(
    repairedLossy.ok,
    true,
    'legacy renderer explicitly accepts category mismatch by trimming values',
  );
  assert.match(
    repairedLossy.warnings.join(' '),
    /Dropped 1 value/,
    'lossy normalization must never be silently accepted',
  );
  assert.equal(
    validateIntelligentUi({
      nodes: [
        {
          type: 'visualization',
          template: 'function',
          payload: { functions: [{ expression: 'document.cookie' }] },
        },
      ],
    }).ok,
    false,
    'unsafe or unsupported expressions must still be rejected',
  );
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
  const outcome = await executor(
    args,
    { id: 'contract-1' },
    { emitter: { event: (...eventArgs) => events.push(eventArgs) } },
    {
      activeToolNames: ['get_ui_contract'],
    },
  );
  assert.equal(outcome.result.status, 'completed');
  assert.match(outcome.result.output, /Verified example arguments/);
  assert.equal(events[0][1].name, 'get_ui_contract');
});

test('all advanced contracts are recoverable in bounded pages', () => {
  const exact = {
    openui: OPENUI_TOOL_GUIDANCE,
    demonstration: DEMONSTRATION_GUIDANCE,
    learning: LEARNING_UI_GUIDANCE,
    physics:
      'Physics node: {"type":"physics","scene":"<scene>","parameters":{...}}\n' +
      JSON.stringify(
        PHYSICS_MODELS.map((model) => ({
          scene: model.id,
          assumptions: model.assumption,
          parameters: model.parameters,
        })),
      ),
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

test('simulation section discovery is focused, bounded and exhaustive',()=>{
  const schema=GET_UI_CONTRACT_TOOL.function.parameters;
  assert.equal(validateToolArguments({kind:'demonstration',section:'pde'},schema).ok,true);
  const index=uiContractContent({kind:'demonstration',section:'index'});
  assert.equal(index.ok,true);
  assert.equal(index.pages,1);
  for(const name of Object.keys(DEMONSTRATION_SECTIONS)){
    assert.ok(index.output.includes(name+':'));
    const first=uiContractContent({kind:'demonstration',section:name});
    assert.equal(first.ok,true,name);
    assert.equal(first.pages,1,name);
    assert.equal(first.output.slice(first.output.indexOf('\n')+1),demonstrationSectionContent(name));
  }
  assert.match(uiContractContent({kind:'demonstration',section:'pde'}).output,/finiteElement/);
  assert.doesNotMatch(uiContractContent({kind:'demonstration',section:'pde'}).output,/Gillespie|fftAmplitude/);
  assert.match(uiContractContent({kind:'demonstration',section:'geometry3d'}).output,/isosurface/);
  assert.match(uiContractContent({kind:'demonstration',section:'analysis'}).output,/fftAmplitude/);
  for(const section of ['__proto__','constructor','toString','unknown'])
    assert.equal(uiContractContent({kind:'demonstration',section}).ok,false);
  assert.equal(uiContractContent({kind:'physics',section:'ode'}).ok,false);
  assert.equal(uiContractContent({kind:'demonstration',section:'ode',page:2}).ok,false);
});
test('compact provider schema preserves valid fixtures; full local schema still rejects bad inputs',()=>{
  const compact=INTELLIGENT_UI_PROVIDER_TOOL.function.parameters,full=INTELLIGENT_UI_TOOL.function.parameters;
  const fullProgram=full.properties.nodes.items.properties.program;
  const compactProgram=compact.properties.nodes.items.properties.program;
  assert.ok(JSON.stringify(compactProgram).length<.8*JSON.stringify(fullProgram).length);
  for(const filename of ['algorithmic-demonstrations.json','intelligent-ui-physics.json','scientific-simulation.json']){
    const programs=JSON.parse(readFileSync(new URL('../../docs/examples/'+filename,import.meta.url),'utf8'));
    for(const [id,program] of Object.entries(programs)){
      const args={nodes:[{type:'demonstration',program}]};
      assert.equal(validateToolArguments(args,compact).ok,true,id+' compact');
      assert.equal(validateToolArguments(args,full).ok,true,id+' full');
      assert.equal(validateIntelligentUi(args).ok,true,id+' semantic');
    }
  }
  const malformed={nodes:[{type:'demonstration',program:{version:1,finiteElement:{nodes:[0,1],diffusion:1,source:2,left:0,right:0},views:[{kind:'plot',x:[0,1],y:[0,1],curves:[{expression:'femValue'}]}]}}]};
  // Generic argument validation is depth-bounded; check the program schema directly.
  assert.equal(validateToolArguments(malformed.nodes[0].program,fullProgram).ok,false);
  assert.equal(validateIntelligentUi(malformed).ok,false);
});
