import { DYNAMICS_BUDGET, budgetError, finite, located, at } from '../foundation.js';
import { evaluatePreparedExpression } from '../expression/evaluate.js';
import { solveSmallSystem } from '../numerics/dense.js';
import { selectIntegrator } from './integrators.js';

/** Time integration returns one trajectory interface for all integrators. */
export function* prepareDynamics(dynamics,stateNames,params,compile,scopeAt,consistentState,solver,warnings,hasSpaceZ) {
  const {reactionModel}=solver;
  const names=stateNames;
  let derivativeEvaluations=0;
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
      const eventValue = (event, t, s) =>
        evalDynamics(event.expression, scopeAt(t, 0, 0, consistentState(s,t,evalDynamics), evalDynamics));
      const eventReset = (event, t, s) => {
        const scope = scopeAt(t, 0, 0, consistentState(s,t,evalDynamics), evalDynamics);
        return { ...s, ...Object.fromEntries(Object.entries(event.reset ?? {}).map(
          ([key, expression]) => [key, evalDynamics(expression, scope)],
        )) };
      };
  const {method,integrate}=selectIntegrator(dynamics,solver);
  const result=yield* integrate({dynamics,names,state,derivative,eventValue,eventReset,warnings,solver,readRate:expr=>evalDynamics(expr,base)});
  return {...result,diagnostics:{method,derivativeEvaluations,...result.diagnostics}};
}
