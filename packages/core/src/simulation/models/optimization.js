import { record, finite, located } from '../foundation.js';
import { name } from '../expression/functions.js';
import { parseDemonstrationExpression } from '../expression/parser.js';
import { expressionNames } from '../expression/evaluate.js';

function optimizationSpec(program) {
  const s = program.optimization;
  if (s === undefined) return null;
  const fail = (m) => {
    throw located('optimization', Error(m));
  };
  if (
    !record(s) ||
    !Array.isArray(s.variables) ||
    s.variables.length < 1 ||
    s.variables.length > 8 ||
    program.dynamics !== undefined ||
    program.duration !== undefined ||
    program.sparseSystem !== undefined ||
    program.nonlinearSystem !== undefined
  )
    fail('Optimization is a standalone box-constrained problem with 1–8 variables');
  const params = new Set(
    (Array.isArray(program.parameters) ? program.parameters : []).map((p) => p?.id),
  );
  const used = new Set([
    ...params,
    ...Object.keys(program.definitions ?? {}),
    'optObjective',
    'optGradient',
    'optIterations',
  ]);
  const ids = [];
  const check = (v, scope) => {
    try {
      expressionNames(parseDemonstrationExpression(v), scope);
    } catch (e) {
      fail(String(e));
    }
  };
  for (const v of s.variables) {
    if (
      !record(v) ||
      !name(v.id) ||
      used.has(v.id) ||
      !finite(v.min) ||
      !finite(v.max) ||
      v.max <= v.min ||
      Math.abs(v.min) > 1e6 ||
      Math.abs(v.max) > 1e6
    )
      fail('Variables need unique identifiers and finite increasing numeric bounds');
    check(v.initial, params);
    ids.push(v.id);
    used.add(v.id);
  }
  check(s.objective, new Set([...params, ...ids]));
  const tolerance = s.tolerance ?? 1e-7,
    maxIterations = s.maxIterations ?? 150,
    goal = s.goal ?? 'min';
  if (
    !['min', 'max'].includes(goal) ||
    !finite(tolerance) ||
    tolerance < 1e-10 ||
    tolerance > 1e-2 ||
    !Number.isInteger(maxIterations) ||
    maxIterations < 1 ||
    maxIterations > 300
  )
    fail('Invalid optimization goal, tolerance or iteration cap');
  return { ...s, ids, tolerance, maxIterations, goal };
}
function lowerOptimization(program, s = optimizationSpec(program)) {
  if (!s) return program;
  return {
    ...program,
    definitions: {
      ...program.definitions,
      ...Object.fromEntries(s.ids.map((id) => [id, 0])),
      optObjective: 0,
      optGradient: 0,
      optIterations: 0,
    },
  };
}

export { optimizationSpec, lowerOptimization };
