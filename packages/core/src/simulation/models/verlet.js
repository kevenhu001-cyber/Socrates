import { record, finite, located } from '../foundation.js';
import { name } from '../expression/functions.js';
import { parseDemonstrationExpression } from '../expression/parser.js';
import { expressionNames } from '../expression/evaluate.js';

// Separable autonomous mechanical systems q'=v, v'=a(q). The user
// supplies the physical acceleration; symplecticity assumes conservative
// forces and compatible canonical coordinates/masses.
function verletSpec(program) {
  const d = program.dynamics;
  if (!record(d) || d.mechanics === undefined) return null;
  const s = d.mechanics,
    fail = (m) => {
      throw located('dynamics.mechanics', new Error(m));
    };
  if (
    d.method !== 'verlet' ||
    !record(s) ||
    !Array.isArray(s.coordinates) ||
    s.coordinates.length < 1 ||
    s.coordinates.length > 8 ||
    [
      'initial',
      'derivatives',
      'massMatrix',
      'algebraic',
      'events',
      'rtol',
      'atol',
      'spatial',
      'coupledFields',
      'reactionNetwork',
      'circuit',
      'stateSpace',
    ].some((k) => d[k] !== undefined)
  )
    fail('Use standalone Verlet mechanics with 1–8 coordinate pairs');
  if (
    !finite(d.duration) ||
    d.duration <= 0 ||
    d.duration > 300 ||
    !finite(d.step) ||
    d.step < 1e-6 ||
    d.step > 1 ||
    Math.ceil(d.duration / d.step) > 10000
  )
    fail('Verlet duration/step exceeds limits');
  const params = new Set(
      (Array.isArray(program.parameters) ? program.parameters : []).map((p) => p?.id),
    ),
    used = new Set([...params, ...Object.keys(program.definitions ?? {})]),
    positions = [];
  const check = (v, scope) => {
    try {
      expressionNames(parseDemonstrationExpression(v), scope);
    } catch (e) {
      fail(String(e));
    }
  };
  for (const q of s.coordinates) {
    if (
      !record(q) ||
      !name(q.position) ||
      !name(q.velocity) ||
      q.position === q.velocity ||
      used.has(q.position) ||
      used.has(q.velocity)
    )
      fail('Coordinate and velocity names must be distinct');
    used.add(q.position);
    used.add(q.velocity);
    positions.push(q.position);
    check(q.initialPosition, params);
    check(q.initialVelocity, params);
  }
  for (const q of s.coordinates) check(q.acceleration, new Set([...params, ...positions]));
  return s;
}
function lowerVerlet(program, s = verletSpec(program)) {
  if (!s) return program;
  const d = { ...program.dynamics };
  delete d.mechanics;
  const initial = {},
    derivatives = {};
  for (const q of s.coordinates) {
    initial[q.position] = q.initialPosition;
    initial[q.velocity] = q.initialVelocity;
    derivatives[q.position] = q.velocity;
    derivatives[q.velocity] = q.acceleration;
  }
  return { ...program, dynamics: { ...d, method: 'rk45', initial, derivatives } };
}

export { verletSpec, lowerVerlet };
