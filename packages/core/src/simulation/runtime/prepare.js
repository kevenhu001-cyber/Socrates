import { BUDGET, DYNAMICS_BUDGET, budgetError, finite, range, located, at } from '../foundation.js';
import { name } from '../expression/functions.js';
import { resolveDefinition, sparseReader, evaluatePreparedExpression } from '../expression/evaluate.js';
import { solveSmallSystem } from '../numerics/dense.js';
import { numberLike } from '../compiler/normalize.js';
import { integrateReactionSSA } from '../models/reactions.js';
import { prepareImplicitGrid } from '../numerics/implicitGrid.js';
import { solveSparseSystem } from '../numerics/sparse.js';
import { optimizationSpec, solveOptimization } from '../numerics/optimization.js';
import { solveNonlinearSystem } from '../numerics/nonlinear.js';
import { prepareCoupledGrid } from '../numerics/coupledGrid.js';
import { prepareScientificAnalysis } from '../numerics/analysis.js';
import { verletSpec, integrateVerlet } from '../numerics/verlet.js';
import { finiteElementSpec, solveFiniteElement } from '../numerics/finiteElement.js';
import { integrateAdaptive } from '../numerics/adaptive.js';

/** Yield between integration batches so a host can cancel them. */
function* prepareRuntime(program, definitions, stateNames, compile, dependencies, values, solver, compileSource) {
  const {implicitGrid,sparseSpec,reactionModel,reactionSSA,rootSpec,coupledSpec,optimizationSpec:optSpec,analysisSpec,verletSpec:mechanics,finiteElementSpec:femSpec}=solver;
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
  let grid,coupled,analysisResult;
  const fem=femSpec?yield* solveFiniteElement(femSpec,params,compile):null;
  const sparse = sparseSpec ? yield* solveSparseSystem(sparseSpec,params,compile) : null;
  const root = rootSpec ? yield* solveNonlinearSystem(rootSpec,params,compile) : null;
  const optimum=optSpec?yield* solveOptimization(optSpec,params,compile):null;
  let previousTime;
  const timeValues = new Map();
  const scopeAt = (t, x, y, state, evaluate, reusableSample, spaceZ=0) => {
    const scope = Object.assign(Object.create(base), state, { x, y, t },hasSpaceZ?{spaceZ}:{});
    if(sparse)scope[sparseReader]=i=>Number.isInteger(i)&&i>=0&&i<sparse.x.length?sparse.x[i]:Number.NaN;
    if (!definitions.size) return scope;
    const sample = reusableSample ?? new Map();
    scope[resolveDefinition] = (name) => {
      if(fem&&Object.hasOwn(femSpec.outputs,name))return fem.read(name,scope.x);
      if(analysisResult&&Object.hasOwn(analysisSpec.outputs,name))return analysisResult.read(name,scope.x);
      if(optimum&&Object.hasOwn(optimum.values,name))return optimum.values[name];
      if(optimum&&name==='optObjective')return optimum.objective;
      if(optimum&&name==='optGradient')return optimum.error;
      if(optimum&&name==='optIterations')return optimum.iterations;
      if(root&&Object.hasOwn(root.values,name))return root.values[name];
      if(root&&name==='rootResidual')return root.error;
      if(root&&name==='rootIterations')return root.iterations;
      if (sparse && name === 'sparseValue') {
        const u=scope.x;
        if(!finite(u)||u<0||u>sparse.x.length-1)return Number.NaN;
        const i=Math.floor(u),j=Math.min(i+1,sparse.x.length-1);return sparse.x[i]+(u-i)*(sparse.x[j]-sparse.x[i]);
      }
      if (sparse && name === 'sparseResidual') return sparse.error;
      if (sparse && name === 'sparseIterations') return sparse.iterations;
      if(coupled&&coupled.ids.includes(name))return coupled.value(name,scope.t,scope.x,scope.y);
      if(coupled&&name.startsWith('mean_')&&coupled.ids.includes(name.slice(5)))return coupled.mean(name.slice(5),scope.t);
      if (grid && name === 'gridValue') return grid.value(scope.t,scope.x,scope.y);
      if (grid && name === 'gridMean') return grid.mean(scope.t);
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
  let trajectory = [],
    step = 0;
  let adaptiveResult, derivativeEvaluations=0;
  const dynamics = program.dynamics;
  let duration = dynamics?.duration ?? program.duration ?? 0;
  const algebraic = dynamics?.algebraic;
  const algebraicIds = Object.keys(algebraic?.guess ?? {});
  const initialGuess = algebraicIds.map(id=>evalRaw(algebraic.guess[id],base));
  if (!initialGuess.every(finite)) throw located('dynamics.algebraic.guess', Error('Non-finite algebraic initial guess'));
  function consistentState(s,t,evaluate) {
    if (!algebraicIds.length) return s;
    const n = algebraicIds.length;
    const z = Float64Array.from(initialGuess);
    const jac = new Float64Array(n*n), delta = new Float64Array(n);
    const tolerance = algebraic.tolerance ?? 1e-8;
    const merged = (v)=>({...s,...Object.fromEntries(algebraicIds.map((id,i)=>[id,v[i]]))});
    const residual = (v)=>{
      const scope = scopeAt(t,0,0,merged(v),evaluate);
      return Float64Array.from(algebraicIds,id=>evaluate(algebraic.residuals[id],scope));
    };
    const norm = v=>v.every(finite)?Math.max(...v.map(Math.abs)):Infinity;
    for(let iteration=0;iteration<12;iteration++){
      const f=residual(z), error=norm(f);
      if(error<=tolerance)return merged(z);
      if(!finite(error))break;
      for(let j=0;j<n;j++){
        const shifted=z.slice();
        shifted[j]+=Math.sqrt(Number.EPSILON)*Math.max(1,Math.abs(z[j]));
        const fp=residual(shifted);
        for(let i=0;i<n;i++)jac[i*n+j]=(fp[i]-f[i])/(shifted[j]-z[j]);
      }
      for(let i=0;i<n;i++)delta[i]=-f[i];
      if(!solveSmallSystem(jac,delta,n))break;
      let improved=false;
      for(let scale=1;scale>=1/64;scale/=2){
        const next=z.map((v,i)=>v+scale*delta[i]);
        if(next.every(v=>finite(v)&&Math.abs(v)<=1e12)&&norm(residual(next))<error){
          z.set(next);improved=true;break;
        }
      }
      if(!improved)break;
    }
    if(norm(residual(z))<=tolerance)return merged(z);
    throw located('dynamics.algebraic',Error('Algebraic Newton solve did not converge; check constraints, scaling and initial guess'));
  }
  if(coupledSpec){
    coupled=yield* prepareCoupledGrid(coupledSpec,params,compile,warnings);
    duration=coupled.duration;
  } else if (implicitGrid) {
    grid = yield* prepareImplicitGrid(implicitGrid,params,compile,warnings);
    duration = grid.duration;
  } else if (dynamics) {
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
  }
  const differentialStateAt = (time) => {
    if (grid||coupled) return {gridClock:Math.max(0,Math.min(duration,finite(time)?time:0))};
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
  const stateAt = (time) => consistentState(differentialStateAt(time), Math.max(0,Math.min(duration,finite(time)?time:0)), evalRaw);
  let sampleScope, sampleHasState;
  const sampleValues = new Map();
  const emptyState = Object.create(null);
  const runtime = {
    duration,
    eventTimes: adaptiveResult?.eventTimes ?? [],
    diagnostics: fem ? {method:'P1 FEM',...fem.diagnostics} : optimum ? {method:'Projected BFGS',unknowns:optSpec.ids.length,iterations:optimum.iterations,projectedGradient:optimum.error,objectiveEvaluations:optimum.evaluations,adColumns:optimum.adColumns,finiteDifferenceColumns:optimum.finiteDifferenceColumns} : root ? {method:'Newton',unknowns:rootSpec.ids.length,iterations:root.iterations,absoluteResidual:root.error,adColumns:root.adColumns,finiteDifferenceColumns:root.finiteDifferenceColumns} : sparse ? {method:sparse.method??'PCG',unknowns:sparse.x.length,nonzeros:sparse.nnz,iterations:sparse.iterations,relativeResidual:sparse.error} :
      coupled ? {method:'grid-heun',...coupled.diagnostics} : grid ? {method:'grid-implicit',...grid.diagnostics} : dynamics ? {method:mechanics?'verlet':dynamics.method??'rk4',derivativeEvaluations,
        ...(adaptiveResult?.diagnostics??{acceptedSteps:Math.max(0,trajectory.length-1),rejectedSteps:0,events:0,minStep:step,maxStep:step})} : undefined,
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
  if(analysisSpec){
    analysisResult=yield* prepareScientificAnalysis(analysisSpec,runtime,params,compile,compileSource);
    runtime.diagnostics={...(runtime.diagnostics??{method:analysisSpec.kind==='fft'?'FFT':analysisSpec.kind==='eigen'?'Jacobi eigen':'Parameter sweep'}),...analysisResult.diagnostics};
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
