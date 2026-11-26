import { DYNAMICS_BUDGET, budgetError, finite, located, at } from '../foundation.js';
import { evaluatePreparedExpression } from '../expression/evaluate.js';
import { solveSmallSystem } from '../numerics/dense.js';
import { integrateReactionSSA } from '../numerics/ssa.js';
import { integrateVerlet } from '../numerics/verlet.js';
import { integrateAdaptive } from '../numerics/adaptive.js';

/** Time integration returns one trajectory interface for all integrators. */
export function* prepareDynamics(dynamics,stateNames,params,compile,scopeAt,consistentState,solver,warnings,hasSpaceZ) {
  const {reactionModel,reactionSSA,verletSpec:mechanics}=solver;
  let trajectory=[],step=0,adaptiveResult,derivativeEvaluations=0,duration=dynamics.duration;
    const names = stateNames,
      count = Math.ceil(dynamics.duration / dynamics.step);
    step = dynamics.duration / count;
    // Integration has its own budget, so a long ODE does not starve the views.
    const dynamicsBudget = { remaining: DYNAMICS_BUDGET };
    const evalDynamics = (expression, scope) =>
      evaluatePreparedExpression(compile(expression), scope, dynamicsBudget);
    const base = Object.assign(Object.create(null), params, { x: 0, y: 0, t: 0 },hasSpaceZ?{spaceZ:0}:{});
    const state = Object.fromEntries(
      names.map((key) => {
        const value = at(`dynamics.initial.${key}`, () =>
          evalDynamics(dynamics.initial[key], base),
        );
        if (reactionModel && value<0) throw located(`dynamics.initial.${key}`,Error('Species initial amount must be nonnegative'));
        if (!finite(value))
          throw located(
            `dynamics.initial.${key}`,
            Error('Initial state is not a finite number for these parameter values'),
          );
        return [key, value];
      }),
    );
    trajectory = [{ t: 0, state }];
    const matrix = dynamics.massMatrix ? new Float64Array(names.length ** 2) : undefined;
    const rhs = matrix ? new Float64Array(names.length) : undefined;
    const derivative = (s, t) => {
      derivativeEvaluations++;
      const scope = scopeAt(t, 0, 0, consistentState(s,t,evalDynamics), evalDynamics);
      if (matrix) {
        const n = names.length;
        dynamicsBudget.remaining -= n ** 3;
        if (dynamicsBudget.remaining < 0) throw budgetError();
        for (let i = 0; i < n; i++) {
          rhs[i] = evalDynamics(dynamics.derivatives[names[i]], scope);
          for (let j = 0; j < n; j++)
            matrix[i * n + j] = evalDynamics(dynamics.massMatrix[i][j], scope);
        }
        if (!solveSmallSystem(matrix, rhs, n))
          throw located('dynamics.massMatrix', Error('Mass matrix is singular or numerically ill-conditioned'));
        return Object.fromEntries(names.map((key, i) => [key, rhs[i]]));
      }
      return Object.fromEntries(
        names.map((key) => [key, evalDynamics(dynamics.derivatives[key], scope)]),
      );
    };
    const add = (s, k, factor) =>
      Object.fromEntries(names.map((key) => [key, s[key] + factor * k[key]]));
    if(mechanics){
      adaptiveResult=yield* integrateVerlet(dynamics,mechanics,state,derivative,warnings);duration=adaptiveResult.duration;
    } else if(reactionSSA){
      adaptiveResult=yield* integrateReactionSSA(reactionSSA,dynamics,names,state,expr=>evalDynamics(expr,base),warnings);
      duration=adaptiveResult.duration;
    } else if (['rk45', 'sdirk2'].includes(dynamics.method)) {
      const eventValue = (event, t, s) =>
        evalDynamics(event.expression, scopeAt(t, 0, 0, consistentState(s,t,evalDynamics), evalDynamics));
      const eventReset = (event, t, s) => {
        const scope = scopeAt(t, 0, 0, consistentState(s,t,evalDynamics), evalDynamics);
        return { ...s, ...Object.fromEntries(Object.entries(event.reset ?? {}).map(
          ([key, expression]) => [key, evalDynamics(expression, scope)],
        )) };
      };
      adaptiveResult = yield* integrateAdaptive(dynamics, names, state, derivative, eventValue, eventReset, warnings,reactionModel);
      duration = adaptiveResult.duration;
    } else {
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
    }
  const differentialStateAt = (time) => {
    if (adaptiveResult) return adaptiveResult.stateAt(time);
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

  return {
    duration, stateAt:differentialStateAt, eventTimes:adaptiveResult?.eventTimes??[],
    diagnostics:{method:mechanics?'verlet':dynamics.method??'rk4',derivativeEvaluations,
      ...(adaptiveResult?.diagnostics??{acceptedSteps:Math.max(0,trajectory.length-1),rejectedSteps:0,events:0,minStep:step,maxStep:step})},
  };
}
