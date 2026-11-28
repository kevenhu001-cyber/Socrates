import { DYNAMICS_BUDGET, finite, located } from '../foundation.js';
import { evaluateDemonstrationExpression } from '../expression/evaluate.js';

function* solveSparseSystem(spec, params, compile) {
  const n = spec.size,
    budget = { remaining: DYNAMICS_BUDGET };
  const scope = Object.assign(Object.create(null), params);
  const read = (expr) => {
    const v = evaluateDemonstrationExpression(compile(expr), scope, budget);
    if (!finite(v) || Math.abs(v) > 1e12)
      throw located('sparseSystem', new Error('Nonfinite sparse coefficient'));
    return v;
  };
  const counts = new Int32Array(n + 1),
    diagonal = new Float64Array(n);
  for (const [i, j] of spec.entries) {
    counts[i + 1]++;
    if (spec.symmetric && i !== j) counts[j + 1]++;
  }
  for (let i = 1; i <= n; i++) counts[i] += counts[i - 1];
  const cursor = counts.slice(),
    cols = new Int32Array(counts[n]),
    values = new Float64Array(counts[n]);
  for (const [i, j, expr] of spec.entries) {
    const v = read(expr),
      k = cursor[i]++;
    cols[k] = j;
    values[k] = v;
    if (i === j) diagonal[i] = v;
    else if (spec.symmetric) {
      const l = cursor[j]++;
      cols[l] = i;
      values[l] = v;
    }
  }
  if (spec.symmetric && !diagonal.every((v) => v > 0))
    throw located(
      'sparseSystem',
      new Error('CG requires positive diagonal and a symmetric positive-definite matrix'),
    );
  const b = Float64Array.from(spec.rhs, read),
    x = new Float64Array(n),
    r = b.slice(),
    z = new Float64Array(n),
    p = new Float64Array(n),
    ap = new Float64Array(n);
  const dot = (a, b) => {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += a[i] * b[i];
    return sum;
  };
  const multiply = (v, out) => {
    for (let i = 0; i < n; i++) {
      let a = 0;
      for (let k = counts[i]; k < counts[i + 1]; k++) a += values[k] * v[cols[k]];
      out[i] = a;
    }
  };
  const scale = Math.sqrt(dot(b, b)) || 1;
  const residual = () => {
    multiply(x, ap);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      r[i] = b[i] - ap[i];
      sum += r[i] * r[i];
    }
    return Math.sqrt(sum) / scale;
  };
  if (!spec.symmetric) {
    if (!diagonal.every((v) => finite(v) && Math.abs(v) > 1e-15))
      throw located(
        'sparseSystem',
        new Error('BiCGSTAB Jacobi preconditioner requires nonzero diagonals'),
      );
    const shadow = r.slice(),
      v = new Float64Array(n),
      s = new Float64Array(n),
      ph = new Float64Array(n),
      sh = new Float64Array(n),
      w = new Float64Array(n);
    let rhoOld = 1,
      alpha = 1,
      omega = 1,
      iterations = 0,
      error = Math.sqrt(dot(r, r)) / scale;
    const fail = () => {
      throw located('sparseSystem', new Error('BiCGSTAB breakdown or nonconvergence'));
    };
    while (error > spec.tolerance && iterations < spec.maxIterations) {
      const rho = dot(shadow, r);
      if (!finite(rho) || rho === 0 || omega === 0) fail();
      const beta = (rho / rhoOld) * (alpha / omega);
      for (let i = 0; i < n; i++) {
        p[i] = r[i] + beta * (p[i] - omega * v[i]);
        ph[i] = p[i] / diagonal[i];
      }
      multiply(ph, v);
      const denom = dot(shadow, v);
      if (!finite(denom) || denom === 0) fail();
      alpha = rho / denom;
      for (let i = 0; i < n; i++) s[i] = r[i] - alpha * v[i];
      iterations++;
      if (Math.sqrt(dot(s, s)) / scale <= spec.tolerance) {
        for (let i = 0; i < n; i++) x[i] += alpha * ph[i];
        error = residual();
        if (error <= spec.tolerance) break;
        // Restart with the true residual after a false convergence.
        shadow.set(r);
        p.fill(0);
        v.fill(0);
        rhoOld = alpha = omega = 1;
        yield;
        continue;
      }
      for (let i = 0; i < n; i++) sh[i] = s[i] / diagonal[i];
      multiply(sh, w);
      const ww = dot(w, w);
      if (!(ww > 0) || !finite(ww)) fail();
      omega = dot(w, s) / ww;
      if (!finite(omega) || omega === 0) fail();
      for (let i = 0; i < n; i++) {
        x[i] += alpha * ph[i] + omega * sh[i];
        r[i] = s[i] - omega * w[i];
      }
      error = Math.sqrt(dot(r, r)) / scale;
      if (!finite(error) || !x.every(finite)) fail();
      if (error <= spec.tolerance || iterations % 64 === 0) {
        error = residual();
        if (error <= spec.tolerance) break;
        shadow.set(r);
        p.fill(0);
        v.fill(0);
        rhoOld = alpha = omega = 1;
      } else rhoOld = rho;
      yield;
    }
    error = residual();
    if (error > spec.tolerance || !finite(error)) fail();
    return { x, error, iterations, nnz: values.length, method: 'BiCGSTAB' };
  }
  for (let i = 0; i < n; i++) p[i] = z[i] = r[i] / diagonal[i];
  let rho = dot(r, z),
    error = Math.sqrt(dot(r, r)) / scale,
    iterations = 0;
  while (error > spec.tolerance && iterations < spec.maxIterations) {
    multiply(p, ap);
    const curvature = dot(p, ap);
    if (!(curvature > 0) || !finite(curvature) || !finite(rho))
      throw located('sparseSystem', new Error('CG breakdown: matrix may not be positive definite'));
    const alpha = rho / curvature;
    for (let i = 0; i < n; i++) {
      x[i] += alpha * p[i];
      r[i] -= alpha * ap[i];
    }
    iterations++;
    error = Math.sqrt(dot(r, r)) / scale;
    // Recompute the actual residual before declaring convergence; restart
    // periodically to control loss of orthogonality from round-off.
    const restart = error <= spec.tolerance || iterations % 64 === 0;
    if (restart) error = residual();
    if (!finite(error) || !x.every(finite))
      throw located('sparseSystem', new Error('Sparse iteration diverged'));
    if (error <= spec.tolerance) break;
    for (let i = 0; i < n; i++) z[i] = r[i] / diagonal[i];
    const next = dot(r, z),
      beta = restart ? 0 : next / rho;
    for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
    rho = next;
    yield;
  }
  error = residual();
  if (error > spec.tolerance)
    throw located(
      'sparseSystem',
      new Error('CG failed to converge within the iteration budget; relative residual ' + error),
    );
  return { x, error, iterations, nnz: values.length };
}

export { solveSparseSystem };
