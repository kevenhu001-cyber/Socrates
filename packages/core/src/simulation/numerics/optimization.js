import { DYNAMICS_BUDGET, finite, located } from '../foundation.js';
import { dualExpression, evaluateDemonstrationExpression } from '../expression/evaluate.js';

function* solveOptimization(s, params, compile) {
  const n = s.ids.length,
    scope = Object.assign(Object.create(null), params),
    budget = { remaining: DYNAMICS_BUDGET };
  const objective = compile(s.objective),
    sign = s.goal === 'max' ? -1 : 1;
  const fail = (m) => {
    throw located('optimization', new Error(m));
  };
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const widths = s.variables.map((v) => v.max - v.min);
  const decode = (u, i) => s.variables[i].min + u * widths[i];
  const read = (ast) => evaluateDemonstrationExpression(ast, scope, budget);
  let u = Float64Array.from(s.variables, (v, i) => {
    const initial = read(compile(v.initial));
    if (!finite(initial) || initial < v.min || initial > v.max)
      fail('Initial variable outside bounds');
    return (initial - v.min) / widths[i];
  });
  const set = (u) =>
    s.ids.forEach((id, i) => {
      scope[id] = decode(u[i], i);
    });
  const value = (u) => {
    set(u);
    return sign * read(objective);
  };
  let adColumns = 0,
    finiteDifferenceColumns = 0,
    evaluations = 0;
  const evaluate = (u) => {
    evaluations++;
    return value(u);
  };
  const gradient = (u, f) => {
    set(u);
    const g = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      set(u);
      const d = dualExpression(objective, scope, s.ids[i], budget)[1];
      if (finite(d)) {
        g[i] = sign * d * widths[i];
        adColumns++;
        continue;
      }
      finiteDifferenceColumns++;
      const l = u.slice(),
        r = u.slice();
      l[i] = clamp(u[i] - 1e-6);
      r[i] = clamp(u[i] + 1e-6);
      const a = evaluate(l),
        b = evaluate(r);
      g[i] =
        finite(a) && finite(b)
          ? (b - a) / (r[i] - l[i])
          : finite(b) && r[i] > u[i]
            ? (b - f) / (r[i] - u[i])
            : finite(a) && l[i] < u[i]
              ? (f - a) / (u[i] - l[i])
              : Number.NaN;
    }
    if (!g.every(finite)) fail('Nonfinite objective gradient');
    return g;
  };
  const H = new Float64Array(n * n);
  const reset = () => {
    H.fill(0);
    for (let i = 0; i < n; i++) H[i * n + i] = 1;
  };
  const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
  const projected = (u, g) =>
    g.map((v, i) => ((u[i] <= 1e-12 && v > 0) || (u[i] >= 1 - 1e-12 && v < 0) ? 0 : v));
  reset();
  let f = evaluate(u);
  if (!finite(f)) fail('Initial objective is not finite');
  let g = gradient(u, f),
    iterations = 0;
  while (iterations < s.maxIterations) {
    const pg = projected(u, g),
      error = Math.max(...pg.map(Math.abs));
    if (error <= s.tolerance) break;
    let accepted = null;
    for (let attempt = 0; attempt < 2 && !accepted; attempt++) {
      if (attempt) reset();
      const direction = pg.map((_, i) => -pg.reduce((sum, v, j) => sum + H[i * n + j] * v, 0));
      for (let k = 0; k < 24; k++) {
        const a = 2 ** -k,
          trial = u.map((v, i) => clamp(v + a * direction[i])),
          step = trial.map((v, i) => v - u[i]);
        const slope = dot(g, step);
        if (!(slope < 0)) continue;
        const q = evaluate(trial);
        if (finite(q) && q <= f + 1e-4 * slope) {
          accepted = { trial, step, q };
          break;
        }
      }
    }
    if (!accepted)
      fail('Optimization line search failed; rescale the objective or change the initial guess');
    const { trial, step, q } = accepted,
      next = gradient(trial, q),
      y = next.map((v, i) => v - g[i]),
      ys = dot(y, step);
    if (ys > 1e-12 * Math.sqrt(dot(y, y) * dot(step, step))) {
      const hy = y.map((_, i) => y.reduce((sum, v, j) => sum + H[i * n + j] * v, 0)),
        factor = (ys + dot(y, hy)) / (ys * ys);
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
          H[i * n + j] += factor * step[i] * step[j] - (hy[i] * step[j] + step[i] * hy[j]) / ys;
      if (!H.every(finite)) reset();
    } else reset();
    u = trial;
    g = next;
    f = q;
    iterations++;
    yield;
  }
  const error = Math.max(...projected(u, g).map(Math.abs));
  if (error > s.tolerance)
    fail('Optimization iteration limit reached; projected gradient ' + error);
  return {
    values: Object.fromEntries(s.ids.map((id, i) => [id, decode(u[i], i)])),
    objective: sign * f,
    error,
    iterations,
    adColumns,
    finiteDifferenceColumns,
    evaluations,
  };
}

export { solveOptimization };
