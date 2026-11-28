import { record, finite, located } from '../foundation.js';
import { parseDemonstrationExpression } from '../expression/parser.js';
import { expressionNames } from '../expression/evaluate.js';

// Matrix-free rectangular diffusion. A first-order split backward Euler
// discretization requires only independent tridiagonal row/column solves.
function implicitGridSpec(program) {
  const d = program.dynamics;
  if (!record(d) || d.method !== 'grid-implicit') return null;
  const s = d.spatial;
  const fail = (message) => {
    throw located('dynamics.spatial', new Error(message));
  };
  if (
    !record(s) ||
    (s.equation ?? 'diffusion') !== 'diffusion' ||
    ![undefined, 1, 2].includes(s.dimension) ||
    [
      'initial',
      'derivatives',
      'massMatrix',
      'algebraic',
      'events',
      'circuit',
      'stateSpace',
      'rtol',
      'atol',
    ].some((k) => d[k] !== undefined)
  )
    fail('grid-implicit is for standalone linear diffusion with fixed Dirichlet boundaries');
  const two = s.dimension === 2,
    nx = two ? s.nx : s.nodes,
    ny = two ? s.ny : 1;
  const x = two ? s.xDomain : s.domain,
    y = two ? s.yDomain : [0, 1];
  const domain = (d) =>
    Array.isArray(d) &&
    d.length === 2 &&
    d.every((v) => finite(v) && Math.abs(v) <= 1e6) &&
    d[1] - d[0] >= 1e-8;
  if (
    !Number.isInteger(nx) ||
    nx < 3 ||
    nx > (two ? 65 : 257) ||
    !Number.isInteger(ny) ||
    (two && (ny < 3 || ny > 65)) ||
    !domain(x) ||
    !domain(y)
  )
    fail('Use 3–257 nodes in 1D or 3–65 per axis in 2D, with increasing numeric domains');
  const steps = Math.ceil(d.duration / d.step);
  if (
    !finite(d.duration) ||
    d.duration <= 0 ||
    d.duration > 300 ||
    !finite(d.step) ||
    d.step < 1e-6 ||
    d.step > 1 ||
    !Number.isInteger(steps) ||
    steps > 2000 ||
    nx * ny * (steps + 1) > 2000000
  )
    fail(
      'Grid history exceeds 2000 steps or 2,000,000 stored values; increase step or reduce resolution',
    );
  if (
    (program.parameters !== undefined && !Array.isArray(program.parameters)) ||
    (program.definitions !== undefined && !record(program.definitions))
  )
    fail('Invalid parameters or definitions');
  const params = (program.parameters ?? []).map((p) => p?.id);
  if (
    [...params, ...Object.keys(program.definitions ?? {})].some((id) =>
      ['gridValue', 'gridMean', 'gridClock'].includes(id),
    )
  )
    fail('gridValue, gridMean and gridClock are reserved');
  const check = (v, scope) => {
    try {
      expressionNames(parseDemonstrationExpression(v), new Set(scope));
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  };
  check(s.diffusivity, params);
  if (finite(s.diffusivity) && s.diffusivity < 0) fail('Diffusivity must be nonnegative');
  const coordinates = [...params, 'x', ...(two ? ['y'] : [])];
  for (const v of [s.initial, s.source ?? 0, ...(two ? [s.boundary] : [s.left, s.right])])
    check(v, coordinates);
  return { two, nx, ny, x, y, steps, dt: d.duration / steps, s, duration: d.duration };
}

function lowerImplicitGrid(program, grid = implicitGridSpec(program)) {
  if (!grid) return program;
  const rest = { ...program.dynamics };
  delete rest.spatial;
  // Validation uses symbolic placeholders only. At runtime gridValue and
  // gridMean are resolved by the numerical grid, never by these expressions.
  return {
    ...program,
    definitions: { ...program.definitions, gridValue: '0*x+0*y+0*t', gridMean: '0*t' },
    dynamics: { ...rest, method: 'rk45', initial: { gridClock: 0 }, derivatives: { gridClock: 1 } },
  };
}

export { implicitGridSpec, lowerImplicitGrid };
