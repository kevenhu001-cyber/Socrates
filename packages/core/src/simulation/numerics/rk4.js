import { finite } from '../foundation.js';

/** Fixed-step classical RK4. The caller supplies a validated RHS. */
export function* integrateRK4(dynamics,names,state,derivative,warnings) {
  const count=Math.ceil(dynamics.duration/dynamics.step),step=dynamics.duration/count;
  let duration=dynamics.duration;
  const trajectory=[{t:0,state}];
    const add = (s, k, factor) =>
      Object.fromEntries(names.map((key) => [key, s[key] + factor * k[key]]));
    let current = state;
    try {
      for (let i = 1; i <= count; i++) {
        const t = (i - 1) * step,
          k1 = derivative(current, t),
          k2 = derivative(add(current, k1, step / 2), t + step / 2),
          k3 = derivative(add(current, k2, step / 2), t + step / 2),
          k4 = derivative(add(current, k3, step), t + step);
        const next = Object.fromEntries(
          names.map((key) => [
            key,
            current[key] + (step / 6) * (k1[key] + 2 * k2[key] + 2 * k3[key] + k4[key]),
          ]),
        );
        const bad = names.find((key) => !finite(next[key]) || Math.abs(next[key]) > 1e12);
        if (bad) {
          warnings.push({
            path: `dynamics.derivatives.${bad}`,
            time: t,
            message: `Dynamics diverged at t = ${Number(t.toFixed(3))} s (state ${bad}); reduce the time step or revise the equations`,
          });
          break;
        }
        current = next;
        trajectory.push({ t: i * step, state: current });
        if (i % 32 === 0) yield;
      }
    } catch (error) {
      const t = (trajectory.length - 1) * step;
      warnings.push({
        path: error instanceof Error && error.path ? error.path : 'dynamics',
        time: t,
        message: `Dynamics stopped at t = ${Number(t.toFixed(3))} s: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    // Keep the valid part of the history; animations stop where it ends.
    const reached = (trajectory.length - 1) * step;
    if (reached < dynamics.duration) duration = reached;
  const differentialStateAt = (time) => {
    if (!trajectory.length) return {};
    const index = Math.max(
        0,
        Math.min(trajectory.length - 1, (Number.isFinite(time) ? time : 0) / step),
      ),
      i = Math.floor(index),
      f = index - i;
    const a = trajectory[i].state,
      b = trajectory[Math.min(i + 1, trajectory.length - 1)].state;
    return Object.fromEntries(Object.keys(a).map((key) => [key, a[key] + (b[key] - a[key]) * f]));
  };

  return {duration,stateAt:differentialStateAt,eventTimes:[],
    diagnostics:{acceptedSteps:Math.max(0,trajectory.length-1),rejectedSteps:0,events:0,minStep:step,maxStep:step}};
}
