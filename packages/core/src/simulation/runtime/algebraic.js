import { finite, located } from '../foundation.js';
import { solveSmallSystem } from '../numerics/dense.js';

/** Index-one algebraic consistency, independent of the time integrator. */
export function createConsistentState(dynamics, base, scopeAt, evalRaw) {
  const algebraic = dynamics?.algebraic;
  const algebraicIds = Object.keys(algebraic?.guess ?? {});
  const initialGuess = algebraicIds.map((id) => evalRaw(algebraic.guess[id], base));
  if (!initialGuess.every(finite))
    throw located('dynamics.algebraic.guess', new Error('Non-finite algebraic initial guess'));
  function consistentState(s, t, evaluate) {
    if (!algebraicIds.length) return s;
    const n = algebraicIds.length;
    const z = Float64Array.from(initialGuess);
    const jac = new Float64Array(n * n),
      delta = new Float64Array(n);
    const tolerance = algebraic.tolerance ?? 1e-8;
    const merged = (v) => ({
      ...s,
      ...Object.fromEntries(algebraicIds.map((id, i) => [id, v[i]])),
    });
    const residual = (v) => {
      const scope = scopeAt(t, 0, 0, merged(v), evaluate);
      return Float64Array.from(algebraicIds, (id) => evaluate(algebraic.residuals[id], scope));
    };
    const norm = (v) => (v.every(finite) ? Math.max(...v.map(Math.abs)) : Infinity);
    for (let iteration = 0; iteration < 12; iteration++) {
      const f = residual(z),
        error = norm(f);
      if (error <= tolerance) return merged(z);
      if (!finite(error)) break;
      for (let j = 0; j < n; j++) {
        const shifted = z.slice();
        shifted[j] += Math.sqrt(Number.EPSILON) * Math.max(1, Math.abs(z[j]));
        const fp = residual(shifted);
        for (let i = 0; i < n; i++) jac[i * n + j] = (fp[i] - f[i]) / (shifted[j] - z[j]);
      }
      for (let i = 0; i < n; i++) delta[i] = -f[i];
      if (!solveSmallSystem(jac, delta, n)) break;
      let improved = false;
      for (let scale = 1; scale >= 1 / 64; scale /= 2) {
        const next = z.map((v, i) => v + scale * delta[i]);
        if (next.every((v) => finite(v) && Math.abs(v) <= 1e12) && norm(residual(next)) < error) {
          z.set(next);
          improved = true;
          break;
        }
      }
      if (!improved) break;
    }
    if (norm(residual(z)) <= tolerance) return merged(z);
    throw located(
      'dynamics.algebraic',
      new Error(
        'Algebraic Newton solve did not converge; check constraints, scaling and initial guess',
      ),
    );
  }
  return consistentState;
}
