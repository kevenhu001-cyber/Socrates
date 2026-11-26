import { BUDGET, finite } from '../foundation.js';
import { resolveDefinition, evaluatePreparedExpression } from '../expression/evaluate.js';
import { numberLike } from '../compiler/normalize.js';
import { createConsistentState } from './algebraic.js';
import { prepareDynamics } from './dynamics.js';
import { createResultStore, prepareStationary, prepareSpatial, prepareAnalysis } from './providers.js';

/** Common runtime: parameter revisions, evaluation scope, caches and lifecycle. */
function* prepareRuntime(program, definitions, stateNames, compile, dependencies, values, solver, compileSource) {
  const budget = { remaining: BUDGET };
  const warnings = [];
  const params = Object.fromEntries(
    (program.parameters ?? []).map((p) => {
      const value = numberLike(values?.[p.id]);
      return [p.id, finite(value) ? Math.max(p.min, Math.min(p.max, value)) : p.value];
    }),
  );
  const hasSpaceZ=program.views.some(view=>(view.presentation==='vectors3d'||view.presentation==='isosurface'||view.slicePlane!==undefined));
  const base = Object.assign(Object.create(null), params,hasSpaceZ?{spaceZ:0}:{});
  const constants = new Map();
  const results=createResultStore();
  const stationaryDiagnostics=yield* prepareStationary(solver,params,compile,results);
  let previousTime;
  const timeValues = new Map();
  const scopeAt = (t, x, y, state, evaluate, reusableSample, spaceZ=0) => {
    const scope = Object.assign(Object.create(base), state, { x, y, t },hasSpaceZ?{spaceZ}:{});
    results.attach(scope);
    if (!definitions.size) return scope;
    const sample = reusableSample ?? new Map();
    scope[resolveDefinition] = (name) => {
      if(results.has(name))return results.read(name,scope);
      if (!definitions.has(name)) return undefined;
      const expression = definitions.get(name);
      const mask = dependencies(expression);
      const cache = mask === 0 ? constants : reusableSample && mask === 4 ? timeValues : sample;
      if (!cache.has(name)) cache.set(name, evaluate(expression, scope));
      return cache.get(name);
    };
    return scope;
  };
  const evalRaw = (expression, scope) =>
    evaluatePreparedExpression(compile(expression), scope, budget);
  const dynamics=program.dynamics;
  const consistentState=createConsistentState(dynamics,base,scopeAt,evalRaw);
  const spatial=yield* prepareSpatial(solver,params,compile,warnings,results);
  const evolution=spatial??(dynamics?yield* prepareDynamics(dynamics,stateNames,params,compile,scopeAt,consistentState,solver,warnings,hasSpaceZ):undefined);
  const duration=evolution?.duration??program.duration??0;
  const stateAt = (time) => consistentState(evolution?.stateAt(time)??{}, Math.max(0,Math.min(duration,finite(time)?time:0)), evalRaw);
  let sampleScope, sampleHasState;
  const sampleValues = new Map();
  const emptyState = Object.create(null);
  const runtime = {
    duration,
    eventTimes: evolution?.eventTimes??[],
    diagnostics: stationaryDiagnostics??evolution?.diagnostics,
    parameters: params,
    warnings,
    dependencies,
    resetBudget() {
      budget.remaining = BUDGET;
    },
    evaluate(expression, t = 0, x = 0, y = 0, spaceZ=0) {
      const needsState = (dependencies(expression) & 4) !== 0 && stateNames.length > 0;
      if (t !== previousTime) {
        previousTime = t;
        timeValues.clear();
        sampleScope = undefined;
      }
      if (!sampleScope || (needsState && !sampleHasState)) {
        sampleValues.clear();
        sampleHasState = needsState;
        sampleScope = scopeAt(t, x, y, needsState ? stateAt(t) : emptyState, evalRaw, sampleValues,spaceZ);
      } else if (x !== sampleScope.x || y !== sampleScope.y || (hasSpaceZ && spaceZ!==sampleScope.spaceZ)) {
        sampleValues.clear();
        sampleScope.x = x;
        sampleScope.y = y;
        if(hasSpaceZ)sampleScope.spaceZ=spaceZ;
      }
      return evalRaw(expression, sampleScope);
    },
    stateAt,
  };
  if(solver.analysisSpec){
    yield* prepareAnalysis(solver.analysisSpec,runtime,params,compile,compileSource,results);
    constants.clear();timeValues.clear();sampleValues.clear();sampleScope=undefined;runtime.resetBudget();
  }
  return runtime;
}

/** Axis bounds can follow parameter/state-dependent expressions. Reversed
 * bounds are swapped and equal bounds widened; a non-finite bound uses the
 * fallback when one is given (for example a range fitted to the samples). */
function demonstrationDomain(bounds, runtime, time = 0, fallback) {
  let problem = '';
  const values = bounds.map((value) => {
    try {
      return runtime.evaluate(value, time);
    } catch (error) {
      problem ||= error instanceof Error ? error.message : String(error);
      return Number.NaN;
    }
  });
  if (values.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e6)) {
    if (fallback) return fallback;
    throw Error(`Axis bounds must be finite and within ±1e6${problem ? ` (${problem})` : ''}`);
  }
  let [a, b] = values;
  if (a > b) [a, b] = [b, a];
  if (a === b) {
    const pad = a === 0 ? 1 : Math.abs(a) * 0.1;
    a -= pad;
    b += pad;
  }
  return [a, b];
}

export { prepareRuntime, demonstrationDomain };
