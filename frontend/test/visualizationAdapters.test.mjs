import test from 'node:test';
import assert from 'node:assert/strict';
import { applyGeoGebraCommands, mermaidText, plotlyTracesForVisualization } from '../src/render/visualizationAdapters.ts';

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
  const traces = plotlyTracesForVisualization(spec, { primary: '#36c' }, () => ({ points: [] }));
  assert.deepEqual(traces.map(({ type, mode }) => [type, mode]), [
    ['scatter', 'lines+markers'], ['bar', undefined], ['scatter', 'markers'],
  ]);
});

test('state diagrams use Mermaid state syntax and safe labels', () => {
  const text = mermaidText({
    template: 'state',
    payload: {
      nodes: [{ id: 'idle', label: 'Idle "state"' }, { id: 'ready', label: 'Ready' }],
      edges: [{ from: 'idle', to: 'ready', label: 'start | go' }],
    },
  });
  assert.match(text, /^stateDiagram-v2/);
  assert.match(text, /state "Idle  state " as n_idle/);
  assert.match(text, /n_idle --> n_ready : start   go/);
  assert.doesNotMatch(text, /\|/);
});

test('GeoGebra rejected commands become render failures instead of silent success', () => {
  const commands = [];
  assert.throws(() => applyGeoGebraCommands({
    evalCommand(command) { commands.push(command); return command !== 'Circle(A,4)'; },
  }, ['A=(0,0)', 'Circle(A,4)']), /Construction app rejected a command: Circle\(A,4\)/);
  assert.deepEqual(commands, ['A=(0,0)', 'Circle(A,4)']);
});
