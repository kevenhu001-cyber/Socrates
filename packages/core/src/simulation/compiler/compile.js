import { solveFiniteElement } from '../numerics/finiteElement.js';
import { solveSparseSystem } from '../numerics/sparse.js';
import { solveNonlinearSystem } from '../numerics/nonlinear.js';
import { solveOptimization } from '../numerics/optimization.js';
import { prepareCoupledGrid } from '../numerics/coupledGrid.js';
import { prepareImplicitGrid } from '../numerics/implicitGrid.js';
import { prepareScientificAnalysis } from '../numerics/analysis.js';
import { integrateRK4 } from '../numerics/rk4.js';
import { integrateAdaptive } from '../numerics/adaptive.js';
import { integrateVerlet } from '../numerics/verlet.js';
import { integrateReactionSSA } from '../numerics/ssa.js';
import { inspectCompilation, createCompiledFactory } from './factory.js';
const algorithms = Object.freeze({
  solveFiniteElement,
  solveSparseSystem,
  solveNonlinearSystem,
  solveOptimization,
  prepareCoupledGrid,
  prepareImplicitGrid,
  prepareScientificAnalysis,
  integrateRK4,
  integrateAdaptive,
  integrateVerlet,
  integrateReactionSSA,
});
export function compileDemonstrationRuntime(input) {
  return createCompiledFactory(inspectCompilation(input), algorithms, compileDemonstrationRuntime);
}
export function createDemonstrationRuntime(input, values = {}) {
  const work = compileDemonstrationRuntime(input)(values);
  let next = work.next();
  while (!next.done) next = work.next();
  return next.value;
}
