import { DYNAMICS_BUDGET, finite, located } from '../foundation.js';
import { evaluateDemonstrationExpression } from '../expression/evaluate.js';

function* prepareCoupledGrid(g, params, compile, warnings) {
  const { nx, ny, two, x, y, steps, dt, ids } = g,
    n = ids.length,
    m = nx * ny,
    total = n * m;
  const dx = (x[1] - x[0]) / nx,
    dy = two ? (y[1] - y[0]) / ny : 1,
    periodic = g.boundary === 'periodic';
  const budget = { remaining: DYNAMICS_BUDGET },
    scope = Object.assign(Object.create(null), params);
  const read = (ast) => evaluateDemonstrationExpression(ast, scope, budget);
  const initial = g.fields.map((f) => compile(f.initial)),
    reaction = g.fields.map((f) => compile(f.reaction ?? 0));
  const alpha = g.fields.map((f) => read(compile(f.diffusivity)));
  const velocities = g.fields.map((f) =>
    (f.advection ?? (two ? [0, 0] : [0])).map((v) => read(compile(v))),
  );
  const fail = (m) => {
    throw located('dynamics.coupledFields', new Error(m));
  };
  if (alpha.some((v) => !finite(v) || v < 0)) fail('Diffusivity must be finite and nonnegative');
  const cfl = Math.max(...alpha) * dt * (1 / dx ** 2 + (two ? 1 / dy ** 2 : 0));
  if (velocities.some((v) => !v.every(finite))) fail('Advection velocities must be finite');
  const transportCFL = Math.max(
    ...alpha.map(
      (a, i) =>
        dt *
        (2 * a * (1 / dx ** 2 + (two ? 1 / dy ** 2 : 0)) +
          Math.abs(velocities[i][0]) / dx +
          (two ? Math.abs(velocities[i][1]) / dy : 0)),
    ),
  );
  if (transportCFL > 1 + 1e-12)
    fail('Explicit transport/diffusion CFL exceeds 1; reduce step or grid resolution');
  const left = new Int32Array(m),
    right = new Int32Array(m),
    up = new Int32Array(m),
    down = new Int32Array(m);
  const index = (i, j) => j * nx + i;
  const bound = (i, n) => (periodic ? (i + n) % n : Math.max(0, Math.min(n - 1, i)));
  let current = new Float64Array(total);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = index(i, j);
      scope.x = x[0] + (i + 0.5) * dx;
      scope.y = two ? y[0] + (j + 0.5) * dy : 0;
      left[k] = index(bound(i - 1, nx), j);
      right[k] = index(bound(i + 1, nx), j);
      up[k] = index(i, bound(j + 1, ny));
      down[k] = index(i, bound(j - 1, ny));
      for (let f = 0; f < n; f++) current[f * m + k] = read(initial[f]);
    }
    yield;
  }
  const valid = (a) => a.every((v) => finite(v) && Math.abs(v) <= 1e12);
  if (!valid(current)) fail('Nonfinite initial field');
  const frames = [current],
    means = [];
  const mean = (a) =>
    ids.map((_, f) => {
      let sum = 0;
      for (let k = 0; k < m; k++) sum += a[f * m + k];
      return sum / m;
    });
  means.push(mean(current));
  const k1 = new Float64Array(total),
    k2 = new Float64Array(total),
    stage = new Float64Array(total);
  function* rhs(a, t, out) {
    scope.t = t;
    for (let j = 0; j < ny; j++) {
      scope.y = two ? y[0] + (j + 0.5) * dy : 0;
      for (let i = 0; i < nx; i++) {
        const k = index(i, j);
        scope.x = x[0] + (i + 0.5) * dx;
        for (let f = 0; f < n; f++) scope[ids[f]] = a[f * m + k];
        for (let f = 0; f < n; f++) {
          const off = f * m,
            u = a[off + k],
            lap =
              (a[off + left[k]] - 2 * u + a[off + right[k]]) / dx ** 2 +
              (two ? (a[off + up[k]] - 2 * u + a[off + down[k]]) / dy ** 2 : 0);
          const [vx, vy = 0] = velocities[f];
          const advX =
            vx >= 0 ? (vx * (u - a[off + left[k]])) / dx : (vx * (a[off + right[k]] - u)) / dx;
          const advY = two
            ? vy >= 0
              ? (vy * (u - a[off + down[k]])) / dy
              : (vy * (a[off + up[k]] - u)) / dy
            : 0;
          out[off + k] = alpha[f] * lap - advX - advY + read(reaction[f]);
        }
      }
      if (j % 4 === 0) yield;
    }
  }
  try {
    for (let step = 1; step <= steps; step++) {
      yield* rhs(current, (step - 1) * dt, k1);
      for (let k = 0; k < total; k++) stage[k] = current[k] + dt * k1[k];
      if (!valid(stage)) fail('Nonfinite explicit predictor; reduce step');
      yield* rhs(stage, step * dt, k2);
      const next = current.map((v, k) => v + dt * 0.5 * (k1[k] + k2[k]));
      if (!valid(next)) fail('Coupled field diverged; reduce step');
      current = next;
      frames.push(next);
      means.push(mean(next));
      yield;
    }
  } catch (e) {
    warnings.push({
      path: 'dynamics.coupledFields',
      time: (frames.length - 1) * dt,
      message: String(e),
    });
  }
  const duration = frames.length === steps + 1 ? g.duration : (frames.length - 1) * dt;
  const interval = (t) => {
    let u = Math.max(0, Math.min(frames.length - 1, (finite(t) ? t : 0) / dt)),
      i = Math.floor(u);
    return [i, Math.min(i + 1, frames.length - 1), u - i];
  };
  function value(id, t, px, py) {
    const f = ids.indexOf(id);
    if (f < 0 || px < x[0] || px > x[1] || (two && (py < y[0] || py > y[1]))) return Number.NaN;
    const u = (px - x[0]) / dx - 0.5,
      v = two ? (py - y[0]) / dy - 0.5 : 0,
      i = Math.floor(u),
      j = Math.floor(v),
      a = u - i,
      b = v - j;
    const sample = (frame) => {
      const read = (i, j) => frame[f * m + index(bound(i, nx), bound(j, ny))];
      const low = read(i, j) * (1 - a) + read(i + 1, j) * a;
      return two ? low * (1 - b) + (read(i, j + 1) * (1 - a) + read(i + 1, j + 1) * a) * b : low;
    };
    const [lo, hi, w] = interval(t);
    return sample(frames[lo]) * (1 - w) + sample(frames[hi]) * w;
  }
  return {
    duration,
    ids,
    value,
    mean(id, t) {
      const [lo, hi, w] = interval(t),
        f = ids.indexOf(id);
      return means[lo][f] * (1 - w) + means[hi][f] * w;
    },
    diagnostics: {
      acceptedSteps: frames.length - 1,
      gridNodes: m,
      storedValues: total * frames.length,
      minStep: dt,
      maxStep: dt,
      diffusionCFL: cfl,
      transportCFL,
    },
  };
}

export { prepareCoupledGrid };
