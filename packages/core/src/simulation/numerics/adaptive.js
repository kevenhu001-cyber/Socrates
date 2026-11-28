import { finite, at } from '../foundation.js';
import { name } from '../expression/functions.js';
import { solveSmallSystem } from './dense.js';

// Dormand–Prince 5(4) embedded pair. Keep a bounded trajectory of accepted
// segments, separate from the rendering clock. All arithmetic is app-owned.
const DP_A = [
  [],
  [1 / 5],
  [3 / 40, 9 / 40],
  [44 / 45, -56 / 15, 32 / 9],
  [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
  [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
];
const DP_C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
const DP_B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];

// L-stable two-stage SDIRK, order two. Newton solves use a finite-difference
// Jacobian and the existing row-scaled pivoted linear solver. Step doubling
// estimates local error without a dependency or generated code.
function createImplicitStepper(n, rhs, rtol, atol) {
  const gamma = 1 - 1 / Math.sqrt(2);
  const jac = new Float64Array(n * n),
    delta = new Float64Array(n);
  const norm = (v, a, b) =>
    v.reduce(
      (m, x, i) =>
        Math.max(m, Math.abs(x) / (atol + rtol * Math.max(Math.abs(a[i]), Math.abs(b[i])))),
      0,
    );
  function stage(base, time, hg) {
    const z = base.slice();
    for (let iteration = 0; iteration < 8; iteration++) {
      const f = rhs(z, time);
      for (let i = 0; i < n; i++) delta[i] = base[i] + hg * f[i] - z[i];
      if (norm(delta, base, z) <= 0.025) return { z, f };
      for (let j = 0; j < n; j++) {
        const shifted = z.slice();
        const eps = Math.sqrt(Number.EPSILON) * Math.max(1, Math.abs(z[j]));
        shifted[j] += eps;
        const fp = rhs(shifted, time);
        for (let i = 0; i < n; i++)
          jac[i * n + j] = (i === j ? 1 : 0) - (hg * (fp[i] - f[i])) / (shifted[j] - z[j]);
      }
      if (!solveSmallSystem(jac, delta, n)) return null;
      for (let i = 0; i < n; i++) z[i] += delta[i];
      if (!z.every((v) => finite(v) && Math.abs(v) <= 1e12)) return null;
    }
    return null;
  }
  function step(a, t, h) {
    const first = stage(a, t + gamma * h, gamma * h);
    if (!first) return null;
    const base = a.map((v, i) => v + h * (1 - gamma) * first.f[i]);
    return stage(base, t + h, gamma * h);
  }
  return (a, t, h) => {
    const full = step(a, t, h);
    if (!full) return null;
    const half = step(a, t, h / 2);
    if (!half) return null;
    const end = step(half.z, t + h / 2, h / 2);
    if (!end) return null;
    const error = end.z.map((v, i) => (v - full.z[i]) / 3);
    return { next: end.z, err: norm(error, a, end.z), k0: rhs(a, t), k1: end.f };
  };
}

function* integrateAdaptive(
  dynamics,
  names,
  initial,
  derivative,
  eventValue,
  eventReset,
  warnings,
  nonnegative = false,
) {
  const n = names.length;
  const stages = Array.from({ length: 7 }, () => new Float64Array(n));
  const work = new Float64Array(n);
  const segments = [];
  let t = 0,
    h = Math.min(dynamics.step, dynamics.duration);
  let current = Float64Array.from(names, (name) => initial[name]);
  const toState = (v) => Object.fromEntries(names.map((name, i) => [name, v[i]]));
  const checked = (v) => {
    if (!v.every((x) => finite(x) && Math.abs(x) <= 1e12))
      throw Error('Non-finite or divergent state');
    return v;
  };
  const interpolate = (segment, time) => {
    const u = Math.max(0, Math.min(1, (time - segment.t) / segment.h));
    const u2 = u * u,
      u3 = u2 * u;
    return segment.a.map(
      (x, i) =>
        (2 * u3 - 3 * u2 + 1) * x +
        (u3 - 2 * u2 + u) * segment.h * segment.k0[i] +
        (-2 * u3 + 3 * u2) * segment.b[i] +
        (u3 - u2) * segment.h * segment.k1[i],
    );
  };
  const events = dynamics.events ?? [];
  const readEvent = (event, time, value) => {
    const result = eventValue(event, time, toState(value));
    if (!finite(result)) throw Error('Event expression is not finite');
    return result;
  };
  let eventCount = 0,
    rejectedSteps = 0,
    maxLocalError = 0;
  const eventTimes = [];
  const disarmed = new Set();
  const rtol = dynamics.rtol ?? 1e-6,
    atol = dynamics.atol ?? 1e-9;
  const stiff = dynamics.method === 'sdirk2';
  const rhsVector = (v, time) => {
    const k = derivative(toState(v), time);
    return checked(Float64Array.from(names, (name) => k[name]));
  };
  const implicit = stiff ? createImplicitStepper(n, rhsVector, rtol, atol) : null;
  try {
    for (let attempt = 0; t < dynamics.duration; attempt++) {
      if (attempt >= 10000) throw Error('Adaptive integration step budget exceeded');
      if (attempt % 16 === 0) yield;
      const remaining = dynamics.duration - t;
      h = Math.min(h, remaining);
      // Do not create a spurious sub-ulp tail step from accumulated clock rounding.
      if (
        remaining - h <=
        Math.min(h * 1e-6, 4 * (attempt + 1) * Number.EPSILON * Math.max(1, dynamics.duration))
      )
        h = remaining;
      if (t + h === t) throw Error('Adaptive step underflow');
      let next,
        err = 0,
        k0,
        k1;
      if (implicit) {
        const result = implicit(current, t, h);
        if (!result) {
          rejectedSteps++;
          h *= 0.25;
          continue;
        }
        ({ next, err, k0, k1 } = result);
      } else {
        for (let stage = 0; stage < 7; stage++) {
          for (let i = 0; i < n; i++) {
            let value = current[i];
            for (let j = 0; j < stage; j++) value += h * DP_A[stage][j] * stages[j][i];
            work[i] = value;
          }
          checked(work);
          const k = derivative(toState(work), t + DP_C[stage] * h);
          for (let i = 0; i < n; i++) stages[stage][i] = k[names[i]];
          checked(stages[stage]);
        }
        next = work.slice();
        for (let i = 0; i < n; i++) {
          let low = current[i];
          for (let j = 0; j < 7; j++) low += h * DP_B4[j] * stages[j][i];
          err = Math.max(
            err,
            Math.abs(next[i] - low) /
              (atol + rtol * Math.max(Math.abs(current[i]), Math.abs(next[i]))),
          );
        }
        k0 = stages[0].slice();
        k1 = stages[6].slice();
      }
      if (!finite(err)) throw Error('Non-finite integration error');
      const factor =
        err === 0 ? 5 : Math.max(0.2, Math.min(5, 0.9 * err ** (stiff ? -1 / 3 : -0.2)));
      if (err > 1) {
        rejectedSteps++;
        h *= Math.min(0.9, factor);
        continue;
      }
      if (nonnegative && next.some((v) => v < -atol)) {
        rejectedSteps++;
        h *= 0.5;
        continue;
      }
      if (nonnegative && next.some((v) => v < 0)) {
        next = next.map((v) => Math.max(0, v));
        k1 = rhsVector(next, t + h);
      }
      maxLocalError = Math.max(maxLocalError, err);
      const segment = { t, h, end: t + h, a: current, b: next, k0, k1 };
      const hits = [],
        rearm = [];
      for (const event of events) {
        const direction = event.direction ?? 0;
        const crosses = (a, b) =>
          (direction <= 0 && a > 0 && b <= 0) || (direction >= 0 && a < 0 && b >= 0);
        let lo = t,
          hi = t + h,
          a = readEvent(event, t, current);
        const mid = t + h / 2;
        const m = readEvent(event, mid, interpolate(segment, mid));
        const b = readEvent(event, hi, next);
        const tolerance = event.rearmTolerance ?? 1e-9;
        if (disarmed.has(event)) {
          if (Math.abs(a) > tolerance) rearm.push({ event, time: t });
          else if (Math.abs(m) > tolerance) {
            rearm.push({ event, time: mid });
            lo = mid;
            a = m;
          } else {
            if (Math.abs(b) > tolerance) rearm.push({ event, time: hi });
            continue;
          }
        }
        if (lo === t && crosses(a, m)) hi = mid;
        else if (crosses(m, b)) {
          lo = mid;
          a = m;
        } else continue;
        for (let i = 0; i < 40 && hi - lo > Math.max(1e-12, h * 1e-9); i++) {
          const mid = (lo + hi) / 2;
          const m = readEvent(event, mid, interpolate(segment, mid));
          if (m > 0 === a > 0 && m !== 0) lo = mid;
          else hi = mid;
        }
        hits.push({ event, time: hi });
      }
      hits.sort((a, b) => a.time - b.time);
      const hit = hits[0];
      for (const item of rearm) if (item.time <= (hit?.time ?? t + h)) disarmed.delete(item.event);
      if (hit) {
        if (++eventCount > 128)
          throw Error('Event budget exceeded; possible chattering or repeated contact');
        const before = interpolate(segment, hit.time);
        const prior = toState(before);
        const reset = { ...prior };
        const assigned = new Set();
        const simultaneous = hits.filter(
          (item) => Math.abs(item.time - hit.time) <= Math.max(1e-12, h * 1e-8),
        );
        for (const { event } of simultaneous) {
          disarmed.add(event);
          const result = eventReset(event, hit.time, prior);
          for (const key of Object.keys(event.reset ?? {})) {
            if (assigned.has(key))
              throw Error('Simultaneous events reset the same state; combine their reset maps');
            assigned.add(key);
            reset[key] = result[key];
          }
        }
        const after = checked(Float64Array.from(names, (name) => reset[name]));
        segments.push({ ...segment, end: hit.time });
        t = hit.time;
        eventTimes.push(t);
        current = after;
        if (simultaneous.some(({ event }) => event.terminal)) break;
        // Move forward from a reset rather than replaying the remainder of a pre-event step.
        h = Math.min(dynamics.step, Math.max(h * 0.25, 1e-9));
      } else {
        segments.push(segment);
        current = next;
        t += h;
        h = Math.min(dynamics.step, h * factor);
      }
    }
  } catch (error) {
    warnings.push({
      path: error instanceof Error && error.path ? error.path : 'dynamics',
      time: t,
      message: `Adaptive dynamics stopped at t = ${t}: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
  return {
    duration: t,
    eventTimes,
    diagnostics: {
      acceptedSteps: segments.length,
      rejectedSteps,
      events: eventTimes.length,
      maxLocalError,
      ...(segments.length
        ? {
            minStep: segments.reduce((m, s) => Math.min(m, s.end - s.t), Infinity),
            maxStep: segments.reduce((m, s) => Math.max(m, s.end - s.t), 0),
          }
        : {}),
    },
    stateAt(time) {
      const target = Math.max(0, Math.min(t, finite(time) ? time : 0));
      if (target === t) return toState(current);
      let lo = 0,
        hi = segments.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (segments[mid].end <= target) lo = mid + 1;
        else hi = mid;
      }
      const result = segments.length ? interpolate(segments[lo], target) : current;
      return toState(nonnegative ? result.map((v) => Math.max(0, v)) : result);
    },
  };
}

export { integrateAdaptive };
