import test, { after } from 'node:test';

// Importing the native dispatcher starts the shared PostgreSQL listener.
after(async () => {
  const { shutdownPubsub } = await import('../src/lib/pubsub.js');
  await shutdownPubsub();
});
import assert from 'node:assert/strict';
import { validateIntelligentUi } from '../src/services/intelligentUi.js';
import { normalizeIntelligentUiArgs } from '../src/services/intelligentUiNormalize.js';
import { executeIntelligentUi } from '../src/routes/chat/pipeline/executors/intelligentUi.js';
import { SERVER_SYSTEM_POLICY } from '../src/lib/chatPolicy.js';
import { OPENUI_SCHEMA, OPENUI_TOOL_GUIDANCE } from '../src/services/openUiPrompt.generated.js';

const node = { id: 'root', type: 'panel', title: 'A useful view' };
test('native UI validates version, node bounds, identity and parent graph', () => {
  assert.equal(validateIntelligentUi({ version: 1, nodes: [node, { id: 'text', type: 'text', parent: 'root', text: 'Hello' }] }).ok, true);
  assert.equal(validateIntelligentUi({ version: 1, nodes: [node, { id: 'notify', type: 'toggle', parent: 'root', bind: 'notify', label: 'Notify' }] }).ok, true);
  for (const document of [
    { version: 2, nodes: [node] }, { version: 1, nodes: [] },
    { version: 1, nodes: [node, node] }, { version: 1, nodes: [{ ...node, type: 'script' }] },
    { version: 1, nodes: [{ ...node, parent: 'missing' }] },
    { version: 1, nodes: [{ ...node, parent: 'root' }] },
    { version: 1, nodes: Array.from({ length: 81 }, (_, i) => ({ ...node, id: String(i) })) },
  ]) assert.equal(validateIntelligentUi(document).ok, false);
});
test('unsafe keys, credentials, URL schemes and nested payloads are rejected', () => {
  for (const value of [
    { action: { type: 'open_url', url: 'javascript:alert(1)' } },
    { image: 'https://user:pass@example.com/image.png' },
    { state: JSON.parse('{"__proto__":{"polluted":true}}') },
    { html: '<script>alert(1)</script>' },
  ]) assert.equal(validateIntelligentUi({ version: 1, nodes: [{ ...node, ...value }] }).ok, false);
});
test('executor sends normal tool results without mixing UI into assistant prose', async () => {
  const events = [];
  const outcome = await executeIntelligentUi({ version: 1, nodes: [node] }, { id: 'ui' }, { emitter: { event: (...args) => events.push(args) } });
  assert.equal(outcome.result.status, 'completed');
  assert.equal(events[0][0], 'tool_result');
  assert.doesNotMatch(outcome.result.output, /socrates-ui|"type"/);
});

test('native UI validation failures reach persistence outcome accounting', async () => {
  const { createToolRunner } = await import('../src/routes/chat/pipeline/toolExecutors.js');
  const outcomes = [];
  const runner = createToolRunner({
    req: {}, sessionIdFromQuery: null, projectIdFromBody: null, mode: 'chat',
    emitter: { event() {} }, abortSignal: new AbortController().signal,
    schemaForTool: () => null, connectorConnectionsByProvider: {}, projectConnectorConnectionsByProvider: {},
    onResult: (id, result) => outcomes.push({ id, result }),
    toolPolicy: { retryDelayMs: () => 0, recordResult() {}, unmarkCall() {} },
  });
  await runner({ toolName: 'render_intelligent_ui', call: { id: 'unsafe', function: { name: 'render_intelligent_ui' } }, args: { version: 1, nodes: [{ ...node, parent: 'missing' }] } }, ['render_intelligent_ui']);
  assert.equal(outcomes[0].id, 'unsafe');
  assert.equal(outcomes[0].result.status, 'failed');
  assert.equal(outcomes[0].result.errorCode, 'invalid_tool_arguments');
});

test('native OpenUI nodes use the existing tool contract and retain source for clients', async () => {
  const { INTELLIGENT_UI_TOOL } = await import('../src/services/intelligentUi.js');
  const source = 'root = Col([Text("Hello from OpenUI")])';
  const args = { version: 1, nodes: [{ id: 'openui', type: 'openui', source }] };
  const events = [];
  const outcome = await executeIntelligentUi(args, { id: 'openui-call' }, { emitter: { event: (...args) => events.push(args) } });
  assert.equal(outcome.result.status, 'completed');
  assert.equal(events[0][1].name, 'render_intelligent_ui');
  const nodeSchema = INTELLIGENT_UI_TOOL.function.parameters.properties.nodes.items.properties;
  assert.ok(nodeSchema.type.enum.includes('openui'));
  assert.match(nodeSchema.source.description, /Available positional signatures/);
  for (const invalid of ['', ' ', null, 'x'.repeat(50001)]) {
    assert.equal(validateIntelligentUi({ version: 1, nodes: [{ id: 'app', type: 'openui', source: invalid }] }).ok, false);
  }
});

test('OpenUI semantic failures produce actionable tool feedback', async () => {
  for (const source of ['not a program', 'root = Col([Button("=")])', 'root = Col([Input(5, "Amount")])', 'root = Col([Text($missing)])']) {
    const outcome = await executeIntelligentUi({ version: 1, nodes: [{ id: 'app', type: 'openui', source }] }, { id: 'bad-ui' }, { emitter: { event() {} } });
    assert.equal(outcome.result.status, 'failed', source);
    assert.match(outcome.result.correction, /Fix the UI/);
  }
  assert.equal(validateIntelligentUi({ version: 1, nodes: [{ id: 'app', type: 'openui', source: 'root = Col([Calculator("计算器")])' }] }).ok, true);
});

test('legacy native UI cannot report successful nonfunctional buttons', () => {
  for (const action of [undefined, { type: 'calculate' }, { type: 'set', key: '__proto__', value: 3 }, { type: 'prompt' }, { type: 'set', key: 'result' }]) {
    assert.equal(validateIntelligentUi({ version: 1, nodes: [{ id: 'action', type: 'button', label: 'Run', action }] }).ok, false);
  }
});

test('composed visualizations receive the existing native payload validation', () => {
  const valid = 'root = Col([Slider($n,1,8),Visualization("bar","Linked",{categories:["A"],series:[{data:[$n * 2]}]},"Linked chart")])\n$n = 2';
  const accepted = validateIntelligentUi({ version: 1, nodes: [{ id: 'app', type: 'openui', source: valid }] });
  assert.equal(accepted.ok, true);
  if (accepted.ok) {
    assert.equal(accepted.visualizations.length, 1);
    assert.equal(accepted.visualizations[0].template, 'bar');
    assert.deepEqual(accepted.visualizations[0].payload.categories, ['A']);
    assert.equal(accepted.visualizations[0].payload.series[0].data[0], 4);
  }
  for (const source of [valid.replace('"bar"', '"unknown"'), valid.replace('series:', 'wrong:')]) {
    const result = validateIntelligentUi({ version: 1, nodes: [{ id: 'app', type: 'openui', source }] });
    assert.equal(result.ok, false);
    assert.match(result.error, /Visualization/);
  }
});

test('Intelligent UI tool results expose extracted visuals to native clients', async () => {
  const source = 'root = Col([Visualization("bar","Sales",{categories:["Q1"],series:[{name:"Sales",data:[12]}]},"Sales by quarter")])';
  const events = [];
  const outcome = await executeIntelligentUi(
    { version: 1, nodes: [{ id: 'app', type: 'openui', source }] },
    { id: 'chart-ui' },
    { emitter: { event: (...args) => events.push(args) } },
  );
  assert.equal(outcome.result.status, 'completed');
  assert.equal(outcome.result.visualizations.length, 1);
  assert.equal(events[0][1].visualizations[0].template, 'bar');
});

test('client-only OpenUI functions do not invalidate otherwise valid visualizations', () => {
  for (const expression of ['@Payment($n,0,12)', '@Round(@Payment($n,0,12),2)', '@Pow($n,2) + 1']) {
    const source = `root = Col([Slider($n,1,100),Visualization("bar","Computed",{categories:["A"],series:[{data:[${expression}]}]},"Computed value"),Visualization("bar","Static",{categories:["A"],series:[{data:[3]}]},"Static value")])\n$n = 12`;
    const result = validateIntelligentUi({ version: 1, nodes: [{ id: 'app', type: 'openui', source }] });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(result.visualizations.map((visual) => visual.title), ['Static']);
  }
});

test('built-in OpenUI calculations still produce validated native snapshots', () => {
  const source = 'root = Col([Slider($n,1,100),Visualization("bar","Rounded",{categories:["A"],series:[{data:[@Round($n / 3,2)]}]},"Rounded value")])\n$n = 10';
  const result = validateIntelligentUi({ version: 1, nodes: [{ id: 'app', type: 'openui', source }] });
  assert.equal(result.ok, true);
  assert.equal(result.visualizations[0].payload.series[0].data[0], 3.33);
});

test('the Visualization envelope misuse is reported as the argument shape it is', () => {
  const envelope = '{"version":1,"template":"bar","title":"T","accessibilitySummary":"S","payload":{"categories":["A"],"series":[{"name":"n","data":[1]}]}}';
  /* Passing the whole native envelope as the first argument, or nesting it in
     the payload, is the shape the model reaches for when it confuses the two
     contracts. Both must be named, not reported as a missing payload field. */
  const asFirstArgument = `root = Col([Visualization(${envelope},"T")])`;
  const nested = `root = Col([Visualization("bar","T",${envelope},"S")])`;
  for (const source of [asFirstArgument, nested]) {
    const result = validateIntelligentUi({ version: 1, nodes: [{ id: 'app', type: 'openui', source }] });
    assert.equal(result.ok, false);
    assert.match(result.error, /separate arguments|four arguments in order/);
    assert.doesNotMatch(result.error, /payload\.series: Required/);
  }
});

test('the server policy routes static and interactive visuals through Intelligent UI', () => {
  assert.match(SERVER_SYSTEM_POLICY, /render_intelligent_ui` for both static and interactive visuals/);
  assert.match(OPENUI_TOOL_GUIDANCE, /render_intelligent_ui for every reader-facing visual/);
  assert.doesNotMatch(SERVER_SYSTEM_POLICY, /render_visualization` for a static chart/);
});

test('the generated OpenUI guidance states the Visualization argument shape', () => {
  const description = OPENUI_SCHEMA['$defs'].Visualization.description;
  assert.match(description, /The arguments are the template name, a short title, the template payload and an accessibility summary/);
  assert.match(OPENUI_TOOL_GUIDANCE, /never a versioned visualization envelope/);
});


test('the tool supplies every visualization contract before the first attempt', async () => {
  const { INTELLIGENT_UI_TOOL } = await import('../src/services/intelligentUi.js');
  const { VISUALIZATION_TEMPLATE_CONTRACTS } = await import('../src/services/visualization.js');
  const guidance = INTELLIGENT_UI_TOOL.function.parameters.properties.nodes.items.properties.source.description;
  for (const [template, contract] of Object.entries(VISUALIZATION_TEMPLATE_CONTRACTS)) {
    assert.ok(guidance.includes(contract.guidance), template);
    const source = `root = Col([Visualization(${JSON.stringify(template)}, "Example", ${JSON.stringify(contract.payload)}, "Summary")])`;
    const result = validateIntelligentUi({ version: 1, nodes: [{ id: 'app', type: 'openui', source }] });
    assert.equal(result.ok, true, `${template}: ${JSON.stringify(result)}`);
  }
});

test('the prompt envelope example is valid JSON and an executable OpenUI program', () => {
  const example = OPENUI_TOOL_GUIDANCE.match(/Return tool arguments as (.*?)\. The source/)[1];
  assert.equal(validateIntelligentUi(JSON.parse(example)).ok, true);
  assert.match(OPENUI_TOOL_GUIDANCE, /50000 characters/);
  assert.match(SERVER_SYSTEM_POLICY, /never claim a failed tool succeeded/);
});

test('XML-style demonstration payloads are normalized into a valid program', () => {
  const args = {
    version: '1',
    nodes: [{
      id: ' nr ', type: 'Demonstration', title: 'Newton rings',
      program: {
        version: '1',
        parameters: { item: [{ id: 'lam', label: 'λ', value: '550', min: '380', max: '750', step: '10' }] },
        definitions: { ringI: 'lam * x' },
        views: { item: [
          { kind: 'controls' },
          { kind: 'plot', x: { item: ['-0.003', '0.003'] }, y: { item: ['0', '1.05'] },
            curves: { item: [{ expression: 'ringI', label: 'I(r)' }] } },
        ] },
      },
    }],
  };
  const normalized = normalizeIntelligentUiArgs(args);
  assert.equal(normalized.version, 1);
  assert.equal(normalized.nodes[0].id, 'nr');
  assert.equal(normalized.nodes[0].type, 'demonstration');
  assert.equal(normalized.nodes[0].program.version, 1);
  assert.equal(normalized.nodes[0].program.parameters[0].value, 550);
  assert.deepEqual(normalized.nodes[0].program.views[1].x, [-0.003, 0.003]);
  assert.equal(validateIntelligentUi(args).ok, true);
});

test('a demonstration without a program version defaults to version 1', () => {
  const args = {
    version: 1,
    nodes: [{ id: 'demo', type: 'demonstration', program: { views: [{ kind: 'controls' }] } }],
  };
  assert.equal(validateIntelligentUi(args).ok, true);
});

test('demonstration failures name the node and produce targeted feedback', async () => {
  const events = [];
  const outcome = await executeIntelligentUi(
    { version: 1, nodes: [{ id: 'demo', type: 'demonstration', program: { version: 1, views: [] } }] },
    { id: 'bad-demo' },
    { emitter: { event: (...args) => events.push(args) } },
  );
  assert.equal(outcome.result.status, 'failed');
  assert.equal(outcome.result.detail.stage, 'demonstration');
  assert.equal(outcome.result.detail.nodeId, 'demo');
  assert.match(outcome.result.error, /Demonstration node "demo"/);
  assert.match(outcome.result.correction, /version/);
  assert.match(outcome.result.correction, /JSON arrays/);
  assert.match(outcome.result.userMessage, /演示程序/);
  assert.notEqual(outcome.result.userMessage, '可视化结构不符合要求，已请模型修正。');
});

test('physics nodes survive quoted numeric parameters', () => {
  const args = {
    version: 1,
    nodes: [{ id: 'p', type: 'physics', scene: 'rayleigh', parameters: { separation: '2.4', wavelength: '550' }, separation: '2.4' }],
  };
  assert.equal(validateIntelligentUi(args).ok, true);
});

test('OpenUI source split into item lines is rejoined before parsing', () => {
  const args = {
    version: 1,
    nodes: [{ id: 'app', type: 'openui', source: { item: ['root = Col([', 'Text("Hello")])'] } }],
  };
  const result = validateIntelligentUi(args);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
});

test('physical scene objects validate and patch through the Intelligent UI tool contract', async () => {
 const { readFileSync } = await import('node:fs');
 const { INTELLIGENT_UI_TOOL } = await import('../src/services/intelligentUi.js');
 const { applyIntelligentUiPatch } = await import('../../packages/core/src/intelligentUiPatch.js');
 const examples = JSON.parse(readFileSync(new URL('../../docs/examples/intelligent-ui-physics.json', import.meta.url), 'utf8'));
 for (const program of Object.values(examples)) {
  const input = {version:1,nodes:[{id:'physical',type:'demonstration',program}]};
  assert.equal(validateIntelligentUi(input).ok,true);
 }
 const schema = INTELLIGENT_UI_TOOL.function.parameters.properties.nodes.items.properties.program;
 assert.ok(schema.properties.views.items.properties.kind.enum.includes('scene'));
 assert.equal(schema.properties.views.items.properties.objects.maxItems,32);
 const nodes = [{id:'physical',type:'demonstration',program:examples.oscillator}];
 const changed = structuredClone(examples.oscillator);
 changed.parameters[0].value = 2;
 const patch = applyIntelligentUiPatch(nodes,[{op:'patch',nodeId:'physical',props:{program:changed}}]);
 assert.equal(patch.ok,true);
 assert.equal(patch.nodes[0].program.parameters[0].value,2);
 assert.equal(nodes[0].program.parameters[0].value,1);
 const bad = structuredClone(examples.oscillator);
 bad.views[0].objects[1].to = ['missing', 0];
 assert.equal(validateIntelligentUi({version:1,nodes:[{id:'physical',type:'demonstration',program:bad}]}).ok,false);
});

test('learning cards normalize aliases and return located grading errors with the correct repair contract',async()=>{
 const {intelligentUiFeedback}=await import('../src/services/intelligentUiFeedback.js');
 const quiz={id:'quiz',type:'quiz',question:'Choose',choices:['First','Second'],answer:'B'};
 assert.equal(validateIntelligentUi({version:1,nodes:[quiz]}).ok,true);
 const normalized=normalizeIntelligentUiArgs({version:1,nodes:[quiz]});
 assert.equal(normalized.nodes[0].type,'learning');assert.equal(normalized.nodes[0].kind,'quiz');
 const result=validateIntelligentUi({version:1,nodes:[{...quiz,answer:'E'}]});
 assert.equal(result.ok,false);assert.equal(result.failure.stage,'learning');
 assert.match(result.error,/nodes.quiz.correct/);
 const feedback=intelligentUiFeedback(result.error,result.failure);
 assert.match(feedback.correction,/type:"learning"/);
 assert.match(feedback.correction,/never invent an answer/i);
 assert.equal(feedback.detail.stage,'learning');
 assert.ok(SERVER_SYSTEM_POLICY.includes('native learning nodes'));
 assert.ok(SERVER_SYSTEM_POLICY.includes('never OpenUI learning-card functions'));
});

test('hallucinated OpenUI quiz functions get learning-specific repair instead of chart instructions',()=>{
 const result=validateIntelligentUi({version:1,nodes:[{id:'mixed',type:'openui',source:'root = Col([Quiz("Question", ["A", "B"], "A")])'}]});
 assert.equal(result.ok,false);
 assert.equal(result.failure.stage,'learning');
});

test('every hallucinated learning component name is routed to the learning contract',()=>{
 for(const name of ['Quiz','QuizCard','Question','QuestionCard','KnowledgeCard','MCQ']){
  const result=validateIntelligentUi({version:1,nodes:[{id:'mixed',type:'openui',source:`root = Col([${name}("Question")])`}]});
  assert.equal(result.ok,false,name);
  assert.equal(result.failure.stage,'learning',name);
  assert.ok(result.failure.issues.some(issue=>/is not an OpenUI component/.test(issue.message)),name);
 }
 /* Real OpenUI components that merely look like cards are not a learning misuse. */
 const flashcard=validateIntelligentUi({version:1,nodes:[{id:'card',type:'openui',source:'root = Col([Flashcard("front", "back")])'}]});
 assert.equal(flashcard.ok,true);
 const text=validateIntelligentUi({version:1,nodes:[{id:'text',type:'openui',source:'root = Col([Text("hello")])'}]});
 assert.equal(text.ok,true);
});

test('native visualization nodes validate and extract normalized specs without OpenUI source wrapper', async () => {
 const { intelligentUiFeedback } = await import('../src/services/intelligentUiFeedback.js');
 const viz = {
  id: 'sales-chart',
  type: 'visualization',
  template: 'bar',
  title: 'Quarterly Sales',
  accessibilitySummary: 'Q1: 10, Q2: 20',
  payload: {
   categories: ['Q1', 'Q2'],
   series: [{ name: 'Sales', data: [10, 20] }],
  },
 };
 const result = validateIntelligentUi({ version: 1, nodes: [viz] });
 assert.equal(result.ok, true, result.ok ? '' : result.error);
 assert.equal(result.visualizations.length, 1);
 assert.equal(result.visualizations[0].template, 'bar');
 assert.equal(result.visualizations[0].title, 'Quarterly Sales');

 const normalized = normalizeIntelligentUiArgs({
  version: 1,
  nodes: [{ id: 'sales-chart', type: 'visualization', kind: 'line', data: { categories: ['A'], series: [{ data: [1] }] } }],
 });
 assert.equal(normalized.nodes[0].template, 'line');
 assert.deepEqual(normalized.nodes[0].payload, { categories: ['A'], series: [{ data: [1] }] });

 const bad = { id: 'bad-chart', type: 'visualization', template: 'bar', payload: { categories: ['A'], series: [{ data: [1, 2] }] } };
 const badResult = validateIntelligentUi({ version: 1, nodes: [bad] });
 assert.equal(badResult.ok, false);
 assert.equal(badResult.failure.stage, 'visualization');
 assert.match(badResult.error, /nodes.bad-chart/);

 const feedback = intelligentUiFeedback(badResult.error, badResult.failure);
 assert.match(feedback.correction, /type:"visualization"/);
 assert.ok(SERVER_SYSTEM_POLICY.includes('type: "visualization"'));
});

test('static tables in intelligent_ui trigger telemetry warning, while interactive tables pass clean', () => {
 const staticTable = {
  version: 1,
  nodes: [{ id: 'tbl', type: 'table', columns: [{ key: 'a', label: 'A' }], rows: [{ a: '1' }] }],
 };
 const staticResult = validateIntelligentUi(staticTable);
 assert.equal(staticResult.ok, true);
 assert.ok(staticResult.warnings.some((w) => w.includes('static table rendered via intelligent_ui')));

 const interactiveTable = {
  version: 1,
  state: { selected: '1' },
  nodes: [{ id: 'tbl', type: 'table', bind: 'selected', columns: [{ key: 'a', label: 'A' }], rows: [{ a: '1' }] }],
 };
 const interactiveResult = validateIntelligentUi(interactiveTable);
 assert.equal(interactiveResult.ok, true);
 assert.equal(interactiveResult.warnings.some((w) => w.includes('static table rendered via intelligent_ui')), false);
});

