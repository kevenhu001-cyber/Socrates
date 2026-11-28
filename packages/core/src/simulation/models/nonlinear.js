import { record, finite, located } from '../foundation.js';
import { name } from '../expression/functions.js';
import { parseDemonstrationExpression } from '../expression/parser.js';
import { expressionNames } from '../expression/evaluate.js';

function nonlinearSpec(program) {
  const s = program.nonlinearSystem;
  if (s === undefined) return null;
  const fail = (m) => {
    throw located('nonlinearSystem', new Error(m));
  };
  if (
    !record(s) ||
    !record(s.guess) ||
    !record(s.residuals) ||
    program.dynamics !== undefined ||
    program.sparseSystem !== undefined ||
    program.duration !== undefined
  )
    fail('Use a standalone square residual system');
  const ids = Object.keys(s.guess),
    params = new Set(
      (Array.isArray(program.parameters) ? program.parameters : []).map((p) => p?.id),
    );
  const defs = Object.keys(program.definitions ?? {});
  if (
    !ids.length ||
    ids.length > 8 ||
    Object.keys(s.residuals).length !== ids.length ||
    ids.some(
      (id) => !name(id) || params.has(id) || defs.includes(id) || !Object.hasOwn(s.residuals, id),
    ) ||
    [...ids, ...params, ...defs].some((id) => ['rootResidual', 'rootIterations'].includes(id))
  )
    fail('Use 1–8 distinct unknowns with matching residuals and no result-name collisions');
  const check = (v, scope) => {
    try {
      expressionNames(parseDemonstrationExpression(v), scope);
    } catch (e) {
      fail(String(e));
    }
  };
  ids.forEach((id) => {
    check(s.guess[id], params);
    check(s.residuals[id], new Set([...params, ...ids]));
  });
  const tolerance = s.tolerance ?? 1e-9,
    maxIterations = s.maxIterations ?? 40;
  if (
    !finite(tolerance) ||
    tolerance < 1e-12 ||
    tolerance > 1e-3 ||
    !Number.isInteger(maxIterations) ||
    maxIterations < 1 ||
    maxIterations > 80
  )
    fail('Invalid Newton tolerance or iteration limit');
  return { ...s, ids, tolerance, maxIterations };
}
function lowerNonlinearSystem(program, s = nonlinearSpec(program)) {
  if (!s) return program;
  return {
    ...program,
    definitions: {
      ...program.definitions,
      ...Object.fromEntries(s.ids.map((id) => [id, 0])),
      rootResidual: 0,
      rootIterations: 0,
    },
  };
}

export { nonlinearSpec, lowerNonlinearSystem };
