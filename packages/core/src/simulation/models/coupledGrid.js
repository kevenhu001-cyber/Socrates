import { record, finite, located } from '../foundation.js';
import { name } from '../expression/functions.js';
import { parseDemonstrationExpression } from '../expression/parser.js';
import { expressionNames } from '../expression/evaluate.js';

// Cell-centred multi-field reaction/diffusion: conservative finite-volume
// Laplacian, periodic or zero-normal-flux boundaries, explicit Heun.
function coupledGridSpec(program) {
  const d = program.dynamics;
  if (!record(d) || d.coupledFields === undefined) return null;
  const s = d.coupledFields,
    fail = (m) => {
      throw located('dynamics.coupledFields', new Error(m));
    };
  if (
    !record(s) ||
    d.method !== 'grid-heun' ||
    [
      'initial',
      'derivatives',
      'spatial',
      'reactionNetwork',
      'massMatrix',
      'algebraic',
      'events',
      'circuit',
      'stateSpace',
      'rtol',
      'atol',
    ].some((k) => d[k] !== undefined)
  )
    fail('Coupled fields require standalone grid-heun dynamics');
  const two = s.dimension === 2,
    nx = s.nx,
    ny = two ? s.ny : 1,
    x = s.xDomain,
    y = two ? s.yDomain : [0, 1];
  const domain = (a) =>
    Array.isArray(a) &&
    a.length === 2 &&
    a.every((v) => finite(v) && Math.abs(v) <= 1e6) &&
    a[1] - a[0] >= 1e-8;
  if (
    ![1, 2].includes(s.dimension) ||
    !Number.isInteger(nx) ||
    nx < 3 ||
    nx > (two ? 33 : 257) ||
    !Number.isInteger(ny) ||
    (two && (ny < 3 || ny > 33)) ||
    !domain(x) ||
    !domain(y) ||
    !['periodic', 'noFlux'].includes(s.boundary)
  )
    fail('Use 1D 3–257 or 2D 3–33 per axis, numeric domains and periodic/noFlux boundaries');
  if (!Array.isArray(s.fields) || s.fields.length < 1 || s.fields.length > 4)
    fail('Use 1–4 fields');
  const steps = Math.ceil(d.duration / d.step),
    size = nx * ny * s.fields.length;
  if (
    !finite(d.duration) ||
    d.duration <= 0 ||
    d.duration > 300 ||
    !finite(d.step) ||
    d.step < 1e-6 ||
    d.step > 1 ||
    !Number.isInteger(steps) ||
    steps > 2000 ||
    size * (steps + 1) > 2000000
  )
    fail('Coupled history exceeds 2000 steps or 2 million stored scalar values');
  const params = new Set(
    (Array.isArray(program.parameters) ? program.parameters : []).map((p) => p?.id),
  );
  const names = new Set([
    ...params,
    ...Object.keys(program.definitions ?? {}),
    'x',
    'y',
    't',
    'gridClock',
    'spaceZ',
  ]);
  const ids = [];
  for (const f of s.fields) {
    if (!record(f) || !name(f.id) || names.has(f.id) || names.has('mean_' + f.id))
      fail('Invalid or duplicate field identifier');
    ids.push(f.id);
    names.add(f.id);
    names.add('mean_' + f.id);
  }
  const coord = new Set([...params, 'x', 'y']),
    local = new Set([...coord, 't', ...ids]);
  const check = (v, scope) => {
    try {
      expressionNames(parseDemonstrationExpression(v), scope);
    } catch (e) {
      fail(String(e));
    }
  };
  for (const f of s.fields) {
    check(f.initial, coord);
    check(f.diffusivity, params);
    check(f.reaction ?? 0, local);
    if (f.advection !== undefined) {
      if (
        s.boundary !== 'periodic' ||
        !Array.isArray(f.advection) ||
        f.advection.length !== (two ? 2 : 1)
      )
        fail('Advection requires periodic boundaries and one velocity per axis');
      f.advection.forEach((v) => check(v, params));
    }
    if (finite(f.diffusivity) && f.diffusivity < 0) fail('Diffusivity must be nonnegative');
  }
  return { ...s, two, nx, ny, x, y, steps, dt: d.duration / steps, duration: d.duration, ids };
}
function lowerCoupledGrid(program, g = coupledGridSpec(program)) {
  if (!g) return program;
  const rest = { ...program.dynamics };
  delete rest.coupledFields;
  const defs = { ...program.definitions };
  for (const id of g.ids) {
    defs[id] = '0*x+0*y+0*t';
    defs['mean_' + id] = '0*t';
  }
  return {
    ...program,
    definitions: defs,
    dynamics: { ...rest, method: 'rk45', initial: { gridClock: 0 }, derivatives: { gridClock: 1 } },
  };
}

export { coupledGridSpec, lowerCoupledGrid };
