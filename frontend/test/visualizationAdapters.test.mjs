import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyGeoGebraCommands,
  mermaidText,
  plotlyTracesForVisualization,
} from '../src/render/visualizationAdapters.ts';

test('paper charts preserve line, bar and scatter intent in Plotly traces', () => {
  const spec = {
    template: 'paper_chart',
    payload: {
      categories: ['A', 'B'],
      series: [
        { name: 'Trend', kind: 'line', data: [1, 2] },
        { name: 'Counts', kind: 'bar', data: [3, 4] },
        { name: 'Samples', kind: 'scatter', data: [5, 6] },
      ],
    },
  };
  const traces = plotlyTracesForVisualization(spec, { primary: '#36c' });
  assert.deepEqual(
    traces.map(({ type, mode }) => [type, mode]),
    [
      ['scatter', 'lines+markers'],
      ['bar', undefined],
      ['scatter', 'markers'],
    ],
  );
});

test('state diagrams use Mermaid state syntax and safe labels', () => {
  const text = mermaidText({
    template: 'state',
    payload: {
      nodes: [
        { id: 'idle', label: 'Idle "state"' },
        { id: 'ready', label: 'Ready' },
      ],
      edges: [{ from: 'idle', to: 'ready', label: 'start | go' }],
    },
  });
  assert.match(text, /^stateDiagram-v2/);
  assert.match(text, /state "Idle #34;state#34;" as n_idle/);
  assert.match(text, /n_idle --> n_ready : start #124; go/);
  assert.doesNotMatch(text, /\|/);
});

test('GeoGebra rejected commands become render failures instead of silent success', () => {
  const commands = [];
  assert.throws(
    () =>
      applyGeoGebraCommands(
        {
          evalCommand(command) {
            commands.push(command);
            return command !== 'Circle(A,4)';
          },
        },
        ['A=(0,0)', 'Circle(A,4)'],
      ),
    /Construction app rejected a command: Circle\(A,4\)/,
  );
  assert.deepEqual(commands, ['A=(0,0)', 'Circle(A,4)']);
});

test('Mermaid text escapes label characters that can change diagram grammar', () => {
  for (const template of ['flowchart', 'state', 'sequence']) {
    const text = mermaidText({
      template,
      payload: {
        nodes: [
          { id: 'a', label: 'x < 2; #1 & >0' },
          { id: 'b', label: 'B' },
        ],
        edges: [{ from: 'a', to: 'b', label: 'x; y < 0' }],
      },
    });
    assert.match(text, /#60; 2#59; #35;1 #38; #62;0/);
    assert.match(text, /x#59; y #60; 0/);
  }
});

test('Mermaid formula labels preserve delimiters and absolute-value bars', () => {
  const formula = '$\\frac{|x|+x^2+x^3+x^4+x^5+x^6+x^7+x^8}{\\sqrt{1+x^2}}$';
  const text = mermaidText({
    template: 'flowchart',
    payload: {
      nodes: [{ id: 'a', label: formula }],
      edges: [],
    },
  });
  assert.ok(text.includes(formula.replaceAll('|', '#124;')));
  assert.doesNotMatch(text, /…/);
});
