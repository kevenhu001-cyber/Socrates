import { DYNAMICS_BUDGET, finite, located } from '../foundation.js';
import { evaluatePreparedExpression } from '../expression/evaluate.js';

function* solveFiniteElement(s, params, compile) {
  const nodes = s.nodes,
    n = nodes.length,
    diag = new Float64Array(n),
    off = new Float64Array(n - 1),
    rhs = new Float64Array(n),
    u = new Float64Array(n);
  const scope = Object.assign(Object.create(null), params),
    budget = { remaining: DYNAMICS_BUDGET },
    read = (expr) => evaluatePreparedExpression(compile(expr), scope, budget);
  const fail = (m) => {
    throw located('finiteElement', new Error(m));
  };
  u[0] = read(s.left);
  u[n - 1] = read(s.right);
  if (!finite(u[0]) || !finite(u[n - 1])) fail('Nonfinite boundary value');
  for (let i = 0; i < n - 1; i++) {
    const h = nodes[i + 1] - nodes[i];
    for (const g of [-1 / Math.sqrt(3), 1 / Math.sqrt(3)]) {
      const l = (1 - g) / 2,
        r = (1 + g) / 2;
      scope.x = nodes[i] + r * h;
      const a = read(s.diffusion),
        c = read(s.reaction ?? 0),
        f = read(s.source),
        w = h / 2;
      if (!finite(a) || a <= 0 || !finite(c) || c < 0 || !finite(f))
        fail(
          'Require positive diffusion, nonnegative reaction and finite source at quadrature points',
        );
      diag[i] += w * (a / (h * h) + c * l * l);
      diag[i + 1] += w * (a / (h * h) + c * r * r);
      off[i] += w * (-a / (h * h) + c * l * r);
      rhs[i] += w * f * l;
      rhs[i + 1] += w * f * r;
    }
    if (i % 16 === 0) yield;
  }
  rhs[1] -= off[0] * u[0];
  rhs[n - 2] -= off[n - 2] * u[n - 1];
  if (!diag.every(finite) || !off.every(finite) || !rhs.every(finite))
    fail('Nonfinite assembled finite element coefficients');
  const d = diag.slice(),
    b = rhs.slice();
  for (let i = 1; i < n - 1; i++) {
    if (i > 1) {
      const q = off[i - 1] / d[i - 1];
      d[i] -= q * off[i - 1];
      b[i] -= q * b[i - 1];
    }
    if (!(d[i] > 0) || !finite(d[i])) fail('Invalid finite element pivot');
  }
  for (let i = n - 2; i >= 1; i--) u[i] = (b[i] - (i < n - 2 ? off[i] * u[i + 1] : 0)) / d[i];
  if (!u.every(finite)) fail('Nonfinite finite element solution');
  let residual = 0,
    scale = 0;
  for (let i = 1; i < n - 1; i++) {
    const a = diag[i] * u[i],
      l = i > 1 ? off[i - 1] * u[i - 1] : 0,
      r = i < n - 2 ? off[i] * u[i + 1] : 0;
    residual = Math.max(residual, Math.abs(a + l + r - rhs[i]));
    scale = Math.max(scale, Math.abs(a) + Math.abs(l) + Math.abs(r) + Math.abs(rhs[i]));
  }
  residual /= Math.max(scale, Number.MIN_VALUE);
  if (!finite(residual)) fail('Nonfinite finite element residual');
  const locate = (x) => {
    let lo = 0,
      hi = n - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (nodes[m] <= x) lo = m;
      else hi = m;
    }
    return lo;
  };
  return {
    read(name, x) {
      if (name === 'femResidual') return residual;
      if (name === 'femNodes') return n;
      if (!finite(x) || x < nodes[0] || x > nodes[n - 1]) return Number.NaN;
      const i = locate(x),
        h = nodes[i + 1] - nodes[i],
        slope = (u[i + 1] - u[i]) / h;
      return name === 'femGradient' ? slope : u[i] + slope * (x - nodes[i]);
    },
    diagnostics: { gridNodes: n, relativeResidual: residual },
  };
}

export { solveFiniteElement };
