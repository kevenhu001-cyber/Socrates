import { DYNAMICS_BUDGET, finite, range, located, at } from '../foundation.js';
import { name } from '../expression/functions.js';
import { evaluatePreparedExpression } from '../expression/evaluate.js';

function linearSample(array, u) {
  if (!finite(u) || u < -1e-10 || u > array.length - 1 + 1e-10) return Number.NaN;
  u = Math.max(0, Math.min(array.length - 1, u));
  const i = Math.floor(u),
    f = u - i;
  return array[i] * (1 - f) + array[Math.min(i + 1, array.length - 1)] * f;
}
function fftInPlace(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let length = 2; length <= n; length *= 2) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / length,
      wr = Math.cos(angle),
      wi = Math.sin(angle);
    for (let i = 0; i < n; i += length) {
      let ur = 1,
        ui = 0;
      for (let j = 0; j < length / 2; j++) {
        const a = i + j,
          b = a + length / 2,
          tr = ur * re[b] - ui * im[b],
          ti = ur * im[b] + ui * re[b];
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const next = ur * wr - ui * wi;
        ui = ur * wi + ui * wr;
        ur = next;
      }
    }
  }
  if (inverse)
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
}
function* prepareScientificAnalysis(s, runtime, params, compile, compileSource) {
  const fail = (m) => {
    throw located('analysis', Error(m));
  };
  const scope = Object.assign(Object.create(null), params),
    budget = { remaining: DYNAMICS_BUDGET };
  const read = (expr) => evaluatePreparedExpression(compile(expr), scope, budget);
  if (s.kind === 'fft') {
    const n = s.samples ?? 256,
      [start, end] = s.timeRange,
      dt = (end - start) / n,
      df = 1 / (end - start),
      nyquist = 1 / (2 * dt);
    if (
      runtime.warnings.length ||
      ((s.subprogram.dynamics !== undefined || runtime.duration > 0) &&
        end > runtime.duration + 1e-10)
    )
      fail('FFT window exceeds completed trajectory');
    const signal = new Float64Array(n);
    runtime.resetBudget();
    for (let i = 0; i < n; i++) {
      signal[i] = runtime.evaluate(s.expression, start + i * dt);
      if (!finite(signal[i])) fail('Nonfinite signal sample');
      if (i % 32 === 0) yield;
    }
    const mean = s.removeMean ? signal.reduce((a, b) => a + b, 0) / n : 0;
    const re = new Float64Array(n),
      im = new Float64Array(n);
    let coherent = 0;
    for (let i = 0; i < n; i++) {
      const w = s.window === 'hann' ? 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n) : 1;
      coherent += w;
      re[i] = (signal[i] - mean) * w;
    }
    fftInPlace(re, im);
    const amp = new Float64Array(n / 2 + 1),
      phase = new Float64Array(amp.length);
    let peak = 0;
    for (let k = 0; k < amp.length; k++) {
      amp[k] = (Math.hypot(re[k], im[k]) * (k === 0 || k === n / 2 ? 1 : 2)) / coherent;
      phase[k] = Math.atan2(im[k], re[k]);
      if (amp[k] > amp[peak]) peak = k;
    }
    const filtered = signal.slice();
    if (s.lowpass !== undefined) {
      const cutoff = read(s.lowpass);
      if (!finite(cutoff) || cutoff < 0 || cutoff > nyquist)
        fail('Low-pass cutoff must be between zero and Nyquist');
      const imag = new Float64Array(n);
      fftInPlace(filtered, imag);
      for (let k = 0; k < n; k++)
        if (Math.min(k, n - k) * df > cutoff) {
          filtered[k] = 0;
          imag[k] = 0;
        }
      fftInPlace(filtered, imag, true);
    }
    const scalars = {
      fftFrequencyStep: df,
      fftPeakFrequency: peak * df,
      fftPeakAmplitude: amp[peak],
      fftNyquist: nyquist,
    };
    return {
      read(name, x) {
        if (Object.hasOwn(scalars, name)) return scalars[name];
        if (name === 'fftAmplitude') return linearSample(amp, x / df);
        if (name === 'fftPhase') {
          const k = Math.round(x / df);
          return x >= 0 && x <= nyquist && amp[k] > 1e-12 ? phase[k] : Number.NaN;
        }
        return linearSample(name === 'fftOriginal' ? signal : filtered, (x - start) / dt);
      },
      diagnostics: { analysisSamples: n },
    };
  }
  if (s.kind === 'eigen') {
    const n = s.matrix.length,
      original = Float64Array.from(s.matrix.flat(), read),
      a = original.slice(),
      v = new Float64Array(n * n);
    if (!a.every((v) => finite(v) && Math.abs(v) <= 1e12))
      fail('Nonfinite or excessive matrix coefficient');
    let scale = 0;
    for (let i = 0; i < n; i++) {
      v[i * n + i] = 1;
      for (let j = 0; j < n; j++) scale = Math.max(scale, Math.abs(a[i * n + j]));
    }
    const norm = scale || 1;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(a[i * n + j] - a[j * n + i]) > 1e-12 * norm)
          fail('Eigen analysis requires symmetric matrix');
        a[i * n + j] = a[j * n + i] = (a[i * n + j] + a[j * n + i]) * 0.5;
      }
    let iterations = 0;
    for (; iterations < 100 * n * n; iterations++) {
      let p = 0,
        q = 0,
        big = 0;
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++)
          if (Math.abs(a[i * n + j]) > big) {
            p = i;
            q = j;
            big = Math.abs(a[i * n + j]);
          }
      if (big <= 1e-13 * norm) break;
      const app = a[p * n + p],
        aqq = a[q * n + q],
        apq = a[p * n + q];
      const angle = 0.5 * Math.atan2(2 * apq, aqq - app),
        cs = Math.cos(angle),
        sn = Math.sin(angle);
      for (let k = 0; k < n; k++)
        if (k !== p && k !== q) {
          const x = a[k * n + p],
            y = a[k * n + q];
          a[k * n + p] = a[p * n + k] = cs * x - sn * y;
          a[k * n + q] = a[q * n + k] = sn * x + cs * y;
        }
      a[p * n + p] = cs * cs * app - 2 * sn * cs * apq + sn * sn * aqq;
      a[q * n + q] = sn * sn * app + 2 * sn * cs * apq + cs * cs * aqq;
      a[p * n + q] = a[q * n + p] = 0;
      for (let k = 0; k < n; k++) {
        const x = v[k * n + p],
          y = v[k * n + q];
        v[k * n + p] = cs * x - sn * y;
        v[k * n + q] = sn * x + cs * y;
      }
      if (iterations % 16 === 0) yield;
    }
    if (iterations >= 100 * n * n) fail('Jacobi eigen iteration failed to converge');
    const order = Array.from({ length: n }, (_, i) => i).sort(
        (i, j) => a[i * n + i] - a[j * n + j],
      ),
      values = order.map((i) => a[i * n + i]);
    let residual = 0,
      orthogonality = 0;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        let av = 0,
          dot = 0;
        for (let k = 0; k < n; k++) {
          av += original[i * n + k] * v[k * n + order[j]];
          dot += v[k * n + order[i]] * v[k * n + order[j]];
        }
        residual = Math.max(residual, Math.abs(av - values[j] * v[i * n + order[j]]) / norm);
        orthogonality = Math.max(orthogonality, Math.abs(dot - (i === j ? 1 : 0)));
      }
    const scalars = { eigenResidual: residual, eigenOrthogonality: orthogonality, eigenCount: n };
    return {
      read(name, x) {
        if (Object.hasOwn(scalars, name)) return scalars[name];
        const i = Math.round(x);
        if (x < 0 || x > n - 1) return Number.NaN;
        if (name === 'eigenValue') return values[i];
        return v[(Number(name.slice(11)) - 1) * n + order[i]];
      },
      diagnostics: {
        analysisSamples: n,
        eigenResidual: residual,
        eigenOrthogonality: orthogonality,
        eigenIterations: iterations,
      },
    };
  }
  const n = s.samples ?? 9,
    [lo, hi] = s.range,
    h = (hi - lo) / (n - 1),
    values = new Float64Array(n),
    slopes = new Float64Array(n);
  const factory = compileSource(s.subprogram),
    time = s.time ?? s.subprogram.dynamics?.duration ?? 0;
  let min = 0,
    max = 0;
  for (let i = 0; i < n; i++) {
    const q = yield* factory({ ...params, [s.parameter]: i === n - 1 ? hi : lo + i * h });
    if (q.warnings.length || (q.duration > 0 && time > q.duration + 1e-10))
      fail('Sweep run incomplete at sample ' + i);
    values[i] = q.evaluate(s.expression, time);
    if (!finite(values[i])) fail('Nonfinite sweep result at sample ' + i);
    if (values[i] < values[min]) min = i;
    if (values[i] > values[max]) max = i;
    yield;
  }
  for (let i = 0; i < n; i++)
    slopes[i] =
      i === 0
        ? (values[1] - values[0]) / h
        : i === n - 1
          ? (values[i] - values[i - 1]) / h
          : (values[i + 1] - values[i - 1]) / (2 * h);
  const scalars = {
    sweepMin: values[min],
    sweepMax: values[max],
    sweepMinAt: lo + min * h,
    sweepMaxAt: lo + max * h,
    sweepCount: n,
  };
  return {
    read(name, x) {
      if (Object.hasOwn(scalars, name)) return scalars[name];
      return linearSample(name === 'sweepValue' ? values : slopes, (x - lo) / h);
    },
    diagnostics: { analysisSamples: n },
  };
}

export { prepareScientificAnalysis };
