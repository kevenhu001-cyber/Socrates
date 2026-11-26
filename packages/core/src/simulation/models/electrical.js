import { record, finite, located, at } from '../foundation.js';
import { SAFE, name } from '../expression/functions.js';
import { normalizeDemonstrationExpression, parseDemonstrationExpression } from '../expression/parser.js';
import { expressionNames } from '../expression/evaluate.js';

function lowerStateSpace(program) {
  const dynamics = program.dynamics;
  if (!record(dynamics) || dynamics.stateSpace === undefined) return program;
  const spec = dynamics.stateSpace;
  const invalid = (message) => { throw located('dynamics.stateSpace', Error(message)); };
  if (!record(spec) || !['rk45','sdirk2'].includes(dynamics.method) ||
      dynamics.initial !== undefined || dynamics.derivatives !== undefined ||
      dynamics.spatial !== undefined || dynamics.circuit !== undefined || dynamics.massMatrix !== undefined)
    invalid('State space requires an adaptive solver and replaces other dynamics models');
  const { states, initial, A, B, inputs, C, D, outputs } = spec;
  const n = states?.length, m = inputs?.length, k = outputs?.length;
  const validNames = (ids, max) => Array.isArray(ids) && ids.length >= 1 && ids.length <= max &&
    ids.every(name) && new Set(ids).size === ids.length;
  const validValue = (v) => finite(v) || (typeof v === 'string' && v.length > 0 && v.length <= 100);
  const matrix = (v, rows, cols) => Array.isArray(v) && v.length === rows &&
    v.every(row => Array.isArray(row) && row.length === cols && row.every(validValue));
  if (!validNames(states, dynamics.method === 'sdirk2' ? 8 : 16) ||
      !Array.isArray(initial) || initial.length !== n || !initial.every(validValue) ||
      !Array.isArray(inputs) || m < 1 || m > 4 || !inputs.every(validValue) ||
      !validNames(outputs, 8) || states.some(id => outputs.includes(id)) ||
      !matrix(A,n,n) || !matrix(B,n,m) || !matrix(C,k,n) || !matrix(D,k,m))
    invalid('Need compatible A,B,C,D matrices, 1–16 states (8 stiff), 1–4 inputs and 1–8 outputs');
  const definitions = { ...program.definitions };
  if (outputs.some(id => Object.hasOwn(definitions,id))) invalid('Output name collides with a definition');
  // A and C may depend on parameters/time, but not the states or outputs:
  // a state-space model is linear in its states and input signals.
  const scope = new Set(['t', ...(Array.isArray(program.parameters) ? program.parameters.map(p=>p?.id) : [])]);
  for (const value of [...A.flat(),...B.flat(),...C.flat(),...D.flat(),...inputs]) {
    try { expressionNames(parseDemonstrationExpression(value),scope); }
    catch { invalid('Matrix coefficients and inputs must use only parameters, constants and time'); }
  }
  const formula = (row, vector) => row.flatMap((v,i)=>v===0?[]:[`(${v})*(${vector[i]})`]);
  const combine = (a,b) => [...a,...b].join('+') || '0';
  const derivatives = Object.fromEntries(states.map((id,i)=>[id,combine(formula(A[i],states),formula(B[i],inputs))]));
  outputs.forEach((id,i)=>{ definitions[id]=combine(formula(C[i],states),formula(D[i],inputs)); });
  const {stateSpace: _stateSpace,...rest}=dynamics;
  return {...program,definitions,dynamics:{...rest,initial:Object.fromEntries(states.map((id,i)=>[id,initial[i]])),derivatives}};
}

function lowerCircuitProgram(program) {
  const dynamics = program.dynamics;
  if (!record(dynamics) || dynamics.circuit === undefined) return program;
  const spec = dynamics.circuit;
  const invalid = (message) => { throw located('dynamics.circuit', Error(message)); };
  if (!record(spec) || !['rk45', 'sdirk2'].includes(dynamics.method) ||
      dynamics.spatial !== undefined || dynamics.initial !== undefined ||
      dynamics.derivatives !== undefined || dynamics.massMatrix !== undefined)
    invalid('Circuit needs an adaptive solver and replaces initial/derivatives maps');
  const { nodes, elements } = spec;
  if (!Array.isArray(nodes) || nodes.length < 1 || nodes.length > 5 ||
      new Set(nodes).size !== nodes.length || !nodes.every((id) => typeof id === 'string' && SAFE.test(id)) ||
      !Array.isArray(elements) || elements.length < 1 || elements.length > 10)
    invalid('Use 1–5 unique non-ground nodes and 1–10 elements');
  const ids = new Set();
  for (const e of elements) {
    if (!record(e) || !['R','L','C','V','I'].includes(e.kind) || typeof e.id !== 'string' ||
        !SAFE.test(e.id) || ids.has(e.id) || !['0', ...nodes].includes(e.p) ||
        !['0', ...nodes].includes(e.n) || e.p === e.n)
      invalid('Elements require unique safe ids, R/L/C/V/I kind and different declared p/n nodes');
    ids.add(e.id);
    if (!finite(e.value) && (typeof e.value !== 'string' || !e.value.length || e.value.length > 100))
      invalid('Element values must be finite numbers or short expressions');
    if (['R','L','C'].includes(e.kind) && finite(e.value) && e.value <= 0)
      invalid('R, L and C values must be positive');
    if (['C','L'].includes(e.kind) && e.initial !== undefined &&
        !finite(e.initial) && typeof e.initial !== 'string')
      invalid('Initial capacitor voltage or inductor current must be an expression');
  }
  const branches = elements.filter((e) => e.kind === 'V' || e.kind === 'C');
  const states = elements.filter((e) => e.kind === 'L' || e.kind === 'C');
  const n = nodes.length + branches.length;
  if (n > 6 || states.length < 1 || states.length > 8)
    invalid('MNA supports at most six algebraic unknowns and 1–8 reactive states');
  if ((program.parameters !== undefined && !Array.isArray(program.parameters)) ||
      (program.definitions !== undefined && !record(program.definitions)))
    invalid('Parameters and definitions must have their normal program shapes');
  const parameterScope = new Set((program.parameters ?? []).map((p) => p?.id));
  for (const e of elements.filter((e) => ['C','L'].includes(e.kind))) {
    try { expressionNames(parseDemonstrationExpression(e.value), parameterScope); }
    catch { invalid('Capacitance and inductance must be constants or parameter expressions'); }
  }
  const valueId = (e) => `mnaVal_${e.id}`;
  const stateId = (e) => `mnaState_${e.id}`;
  const voltageId = (id) => `voltage_${id}`;
  const currentId = (e) => `current_${e.id}`;
  const generated = [...nodes.map(voltageId), ...elements.map(currentId), ...elements.map(valueId), ...states.map(stateId)];
  const used = [...(program.parameters ?? []).map((p) => p?.id), ...Object.keys(program.definitions ?? {})];
  if (generated.some((id) => id.length > 40 || used.includes(id))) invalid('Circuit-generated names collide or exceed identifier length');
  const definitions = { ...program.definitions }, initial = {}, derivatives = {};
  const M = Array.from({length:n}, () => Array.from({length:n}, () => []));
  const b = Array.from({length:n}, () => []);
  const nodeIndex = (id) => id === '0' ? -1 : nodes.indexOf(id);
  const v = (id) => id === '0' ? '0' : voltageId(id);
  const stamp = (i,j,term) => { if (i >= 0 && j >= 0) M[i][j].push(term); };
  const inject = (i,term) => { if (i >= 0) b[i].push(term); };
  const sum = (terms) => terms.length ? terms.join('+') : '0';
  for (const e of elements) {
    const i = nodeIndex(e.p), j = nodeIndex(e.n);
    const raw = normalizeDemonstrationExpression(e.value);
    const positive = ['R','L','C'].includes(e.kind);
    definitions[valueId(e)] = positive ? `if((${raw})>0,(${raw}),sqrt(-1))` : raw;
    const ev = valueId(e), q = stateId(e), u = `(${v(e.p)}-${v(e.n)})`;
    if (e.kind === 'R') {
      const g = `1/${ev}`;
      stamp(i,i,g); stamp(j,j,g); stamp(i,j,`(-${g})`); stamp(j,i,`(-${g})`);
      definitions[currentId(e)] = `${u}/${ev}`;
    } else if (e.kind === 'I' || e.kind === 'L') {
      const k = e.kind === 'I' ? ev : q;
      inject(i,`(-${k})`); inject(j,k);
      definitions[currentId(e)] = k;
      if (e.kind === 'L') {
        initial[q] = e.initial ?? 0;
        derivatives[q] = `${u}/${ev}`;
      }
    } else {
      const k = nodes.length + branches.indexOf(e);
      stamp(i,k,'1'); stamp(j,k,'-1'); stamp(k,i,'1'); stamp(k,j,'-1');
      inject(k,e.kind === 'V' ? ev : q);
      if (e.kind === 'C') {
        initial[q] = e.initial ?? 0;
        derivatives[q] = `${currentId(e)}/${ev}`;
      }
    }
  }
  const args = [...M.flatMap((row) => row.map(sum)), ...b.map(sum)].join(',');
  nodes.forEach((id,i) => { definitions[voltageId(id)] = `solveN(${i+1},${n},${args})`; });
  branches.forEach((e,i) => { definitions[currentId(e)] = `solveN(${nodes.length+i+1},${n},${args})`; });
  const { circuit: _circuit, ...rest } = dynamics;
  return { ...program, definitions, dynamics: { ...rest, initial, derivatives } };
}

export { lowerStateSpace, lowerCircuitProgram };
