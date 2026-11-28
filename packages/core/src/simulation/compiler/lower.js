import { record, located } from '../foundation.js';
import { lowerSpatialProgram } from '../models/spatial.js';
import { lowerReactionNetwork } from '../models/reactions.js';
import { lowerStateSpace, lowerCircuitProgram } from '../models/electrical.js';
import { lowerLinearAlgebra } from '../models/linearAlgebra.js';
import { implicitGridSpec, lowerImplicitGrid } from '../models/implicitGrid.js';
import { sparseSystemSpec, lowerSparseSystem } from '../models/sparse.js';
import { optimizationSpec, lowerOptimization } from '../models/optimization.js';
import { nonlinearSpec, lowerNonlinearSystem } from '../models/nonlinear.js';
import { coupledGridSpec, lowerCoupledGrid } from '../models/coupledGrid.js';
import { scientificAnalysisSpec, lowerScientificAnalysis } from '../models/analysis.js';
import { verletSpec, lowerVerlet } from '../models/verlet.js';
import { finiteElementSpec, lowerFiniteElement } from '../models/finiteElement.js';

// A single ordered lowering plan; one validated spec per specialized model.
// The ordering keeps generated identifiers visible to subsequent model checks.
const stages = Object.freeze([
  {
    key: 'analysisSpec',
    inspect: (p, validate) => scientificAnalysisSpec(p, validate),
    lower: (p, s, validate) => lowerScientificAnalysis(p, validate, s),
  },
  { key: 'finiteElementSpec', inspect: finiteElementSpec, lower: lowerFiniteElement },
  { key: 'verletSpec', inspect: verletSpec, lower: lowerVerlet },
  { key: 'optimizationSpec', inspect: optimizationSpec, lower: lowerOptimization },
  { key: 'rootSpec', inspect: nonlinearSpec, lower: lowerNonlinearSystem },
  { key: 'sparseSpec', inspect: sparseSystemSpec, lower: lowerSparseSystem },
  { key: 'coupledSpec', inspect: coupledGridSpec, lower: lowerCoupledGrid },
  { key: 'implicitGrid', inspect: implicitGridSpec, lower: lowerImplicitGrid },
]);
const modelAdapters = Object.freeze([
  lowerReactionNetwork,
  lowerStateSpace,
  lowerCircuitProgram,
  lowerSpatialProgram,
]);
export function lowerNumericalProgram(program, metadata, validateSource) {
  let lowered = lowerLinearAlgebra(program);
  const d = lowered.dynamics;
  if (record(d)) {
    const forms = [
      'spatial',
      'coupledFields',
      'circuit',
      'stateSpace',
      'reactionNetwork',
      'mechanics',
    ].filter((key) => d[key] !== undefined);
    if (forms.length > 1)
      throw located('dynamics', new Error('Choose exactly one specialized dynamics model'));
    if (d.method === 'verlet' && !d.mechanics)
      throw located('dynamics.method', new Error('Verlet requires mechanics'));
    if (d.method === 'ssa' && !d.reactionNetwork)
      throw located('dynamics.method', new Error('SSA requires a reaction network'));
    if (d.method === 'grid-heun' && !d.coupledFields)
      throw located('dynamics.method', new Error('grid-heun requires coupledFields'));
  }
  if (metadata)
    Object.assign(metadata, {
      reactionModel: d?.reactionNetwork !== undefined,
      reactionSSA: d?.method === 'ssa' ? d.reactionNetwork : null,
    });
  for (const stage of stages) {
    const spec = stage.inspect(lowered, validateSource);
    if (metadata) metadata[stage.key] = spec;
    if (spec) lowered = stage.lower(lowered, spec, validateSource);
  }
  for (const lower of modelAdapters) lowered = lower(lowered);
  return lowered;
}
