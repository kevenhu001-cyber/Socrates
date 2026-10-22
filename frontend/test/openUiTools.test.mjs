import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatorStep, initialCalculatorState } from '@socrates/core';
import { programIssues } from '../src/react/intelligence-ui/openui/validateProgram.ts';
const press = (...keys) => keys.reduce(calculatorStep, initialCalculatorState);
test('calculator computes arithmetic, decimals, chained operators and repeated equals', () => {
  for (const [keys, result] of [
    [['2', '+', '3', '='], '5'], [['9', '-', '4', '='], '5'],
    [['6', '*', '7', '='], '42'], [['8', '/', '2', '='], '4'],
    [['0', '.', '1', '+', '0', '.', '2', '='], '0.3'],
    [['2', '+', '3', '*', '4', '='], '20'], [['2', '+', '3', '=', '='], '8'],
    [['9', '+', '-', '4', '='], '5'], [['9', 'Backspace', '7'], '7'],
    [['8', '±', '/', '2', '='], '-4'], [['1', '.', '.', '5'], '1.5'],
  ]) assert.equal(press(...keys).display, result, keys.join(' '));
});
test('calculator handles zero division, recovery and clear', () => {
  const error = press('8', '/', '0', '=');
  assert.equal(error.display, 'Error');
  assert.equal(calculatorStep(error, '2').display, '2');
  assert.deepEqual(calculatorStep(press('2', '+'), 'C'), initialCalculatorState);
});
test('program validation rejects decorative buttons, missing state and unbound inputs', () => {
  for (const source of [
    'not a program', 'root = Col([Button("=")])', 'root = Col([Input(2,"A")])',
    'root = Col([Text($missing)])', 'root = Col([missing])', 'root = Col([Unknown("x")])',
    'root = Col([Text("unfinished")',
  ]) assert.ok(programIssues(source).length, source);
  assert.deepEqual(programIssues('root = Col([Calculator("计算器")])'), []);
  assert.deepEqual(programIssues('root = Col([Input($a,"A","number"), Text($a * 2), Button("Reset", @Reset($a))])\n$a = 2'), []);
});
test('native visual payloads can read the same state as OpenUI controls', () => {
  assert.deepEqual(programIssues('root = Col([Slider($n, 1, 8), Visualization("bar", "Value", {categories:["A"],series:[{data:[$n]}]}, "Value of n")])\n$n = 2'), []);
});

test('dataflow validation rejects disconnected inputs and writes across arbitrary tools', () => {
  const failures = [
    'root = Col([Input($query,"Search"), Text("Static results")])\n$query = ""',
    'root = Col([Select($status,["open","done"],"Status"), Table([{key:"name",label:"Name"}],[{name:"Always the same"}])])\n$status = "open"',
    'root = Col([Button("Update",@Set($unused, 3)),Text("No result")])\n$unused = 0',
    'root = Col([Button("Update",@Set("count", 3)),Text($count)])\n$count = 0',
    'root = Col([Button("Update",Action([]))])',
    'root = Col([Form([Input($email,"Email")]), Button("Send",@ToAssistant("Continue"))])\n$email = ""',
  ];
  for (const source of failures) assert.ok(programIssues(source).length, source);
});

test('dataflow follows action dependencies and scoped form submission', () => {
  const valid = [
    'root = Col([Input($amount,"Amount","number"), Button("Calculate",@Set($result,$amount * 2)), Text($result)])\n$amount = 2\n$result = 0',
    'root = Col([Form([Input($email,"Email"),Button("Send",@ToAssistant("Use my email"))])])\n$email = ""',
    'root = Col([Input($task,"Task"),Button("Add",Action([@Set($tasks,@Append($tasks,$task)),@Set($task,"")])),Text(@Join($tasks,", "))])\n$task = ""\n$tasks = ["Read"]',
    'root = Col([Select($status,["open","done"],"Status"),Table([{key:"name",label:"Name"}],@Filter($rows,"status","==",$status))])\n$status = "open"\n$rows = [{name:"Read",status:"open"}]',
  ];
  for (const source of valid) assert.deepEqual(programIssues(source), [], source);
});

test('the Visualization component tells the model its argument shape', async () => {
  const { library } = await import('../src/react/intelligence-ui/openui/library.ts');
  const description = library.toJSONSchema()['$defs'].Visualization.description;
  assert.match(description, /arguments are the template name, a short title, the template payload and an accessibility summary/);
  assert.match(description, /Never pass the full render_visualization envelope/);
  assert.doesNotMatch(description, /using its exact template\/payload contract/);
});

test('runtime diagnostics identify invalid calculations in arbitrary nested state', async () => {
  const { openUiStateIssue } = await import('@socrates/core');
  assert.equal(openUiStateIssue({ result: 4, rows: [{ amount: 3 }] }), null);
  assert.match(openUiStateIssue({ result: Infinity }), /finite number/);
  assert.match(openUiStateIssue({ rows: [{ amount: NaN }] }), /rows.0.amount/);
});

test('arithmetic diagnostics catch invalid operations while respecting guards and disabled actions', async () => {
  const { runtimeProgramIssues } = await import('../src/react/intelligence-ui/openui/validateProgram.ts');
  const source = 'root = Col([Input($n,"N","number"),Text(10 / $n)])\n$n = 2';
  assert.deepEqual(runtimeProgramIssues(source, { $n: 2 }), []);
  assert.match(runtimeProgramIssues(source, { $n: 0 }).join(), /zero/);
  assert.deepEqual(programIssues('root = Col([Input($n,"N","number"),Text($n == 0 ? "Enter a nonzero number" : 10 / $n)])\n$n = 0'), []);
  assert.deepEqual(programIssues('root = Col([Input($n,"N","number"),Button("Go",@Set($r,10 / $n),null,null,null,null,$n == 0),Text($r)])\n$n = 0\n$r = 0'), []);
});
