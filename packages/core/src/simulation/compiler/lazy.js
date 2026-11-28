import { inspectCompilation, createCompiledFactory } from './factory.js';

// Literal import paths keep advanced algorithms in independent bundler chunks.
const loaders = Object.freeze({
  solveFiniteElement: () =>
    import('../numerics/finiteElement.js').then((m) => m.solveFiniteElement),
  solveSparseSystem: () => import('../numerics/sparse.js').then((m) => m.solveSparseSystem),
  solveNonlinearSystem: () =>
    import('../numerics/nonlinear.js').then((m) => m.solveNonlinearSystem),
  solveOptimization: () => import('../numerics/optimization.js').then((m) => m.solveOptimization),
  prepareCoupledGrid: () => import('../numerics/coupledGrid.js').then((m) => m.prepareCoupledGrid),
  prepareImplicitGrid: () =>
    import('../numerics/implicitGrid.js').then((m) => m.prepareImplicitGrid),
  prepareScientificAnalysis: () =>
    import('../numerics/analysis.js').then((m) => m.prepareScientificAnalysis),
  integrateRK4: () => import('../numerics/rk4.js').then((m) => m.integrateRK4),
  integrateAdaptive: () => import('../numerics/adaptive.js').then((m) => m.integrateAdaptive),
  integrateVerlet: () => import('../numerics/verlet.js').then((m) => m.integrateVerlet),
  integrateReactionSSA: () => import('../numerics/ssa.js').then((m) => m.integrateReactionSSA),
});
export function requiredAlgorithms({ program, solver }) {
  const keys = [];
  for (const [spec, key] of [
    ['finiteElementSpec', 'solveFiniteElement'],
    ['sparseSpec', 'solveSparseSystem'],
    ['rootSpec', 'solveNonlinearSystem'],
    ['optimizationSpec', 'solveOptimization'],
    ['coupledSpec', 'prepareCoupledGrid'],
    ['implicitGrid', 'prepareImplicitGrid'],
    ['analysisSpec', 'prepareScientificAnalysis'],
  ])
    if (solver[spec]) keys.push(key);
  if (program.dynamics && !solver.coupledSpec && !solver.implicitGrid)
    keys.push(
      solver.verletSpec
        ? 'integrateVerlet'
        : solver.reactionSSA
          ? 'integrateReactionSSA'
          : ['rk45', 'sdirk2'].includes(program.dynamics.method)
            ? 'integrateAdaptive'
            : 'integrateRK4',
    );
  return keys;
}
export async function compileDemonstrationRuntimeAsync(input) {
  const plan = inspectCompilation(input);
  const keys = requiredAlgorithms(plan);
  const [entries, source] = await Promise.all([
    Promise.all(keys.map(async (key) => [key, await loaders[key]()])),
    plan.solver.analysisSpec?.kind === 'sweep'
      ? compileDemonstrationRuntimeAsync(plan.solver.analysisSpec.subprogram)
      : undefined,
  ]);
  // Sweep source is independently validated and compiled before execution.
  return createCompiledFactory(plan, Object.fromEntries(entries), () => {
    if (!source) throw new Error('No compiled analysis source');
    return source;
  });
}
