import { finite } from '../foundation.js';
import { sparseReader } from '../expression/evaluate.js';
import { solveFiniteElement } from '../numerics/finiteElement.js';
import { solveSparseSystem } from '../numerics/sparse.js';
import { solveNonlinearSystem } from '../numerics/nonlinear.js';
import { solveOptimization } from '../numerics/optimization.js';
import { prepareCoupledGrid } from '../numerics/coupledGrid.js';
import { prepareImplicitGrid } from '../numerics/implicitGrid.js';
import { prepareScientificAnalysis } from '../numerics/analysis.js';

// A result provider owns its output names and reads physical coordinates
// from the current scope. No solver-specific result names in the runtime.
function createResultStore(){
  const readers=new Map();
  let indexedReader;
  return {
    register(provider){
      for(const [name,read] of Object.entries(provider.outputs??{})){
        if(readers.has(name))throw Error('Duplicate numerical output: '+name);
        readers.set(name,read);
      }
      if(provider.indexedReader)indexedReader=provider.indexedReader;
    },
    attach(scope){if(indexedReader)scope[sparseReader]=indexedReader;},
    has:name=>readers.has(name),
    read:(name,scope)=>readers.get(name)(scope),
  };
}
const named=(names,read)=>Object.fromEntries(names.map(name=>[name,scope=>read(name,scope)]));
const constants=values=>Object.fromEntries(Object.entries(values).map(([name,value])=>[name,()=>value]));
const stationarySolvers=Object.freeze([
  {key:'finiteElementSpec',solve:solveFiniteElement,adapt:(spec,r)=>({
    outputs:named(Object.keys(spec.outputs),(name,s)=>r.read(name,s.x)),
    diagnostics:{method:'P1 FEM',...r.diagnostics},
  })},
  {key:'sparseSpec',solve:solveSparseSystem,adapt:(_spec,r)=>({
    outputs:{...constants({sparseResidual:r.error,sparseIterations:r.iterations}),sparseValue:s=>{
      const u=s.x;if(!finite(u)||u<0||u>r.x.length-1)return Number.NaN;
      const i=Math.floor(u),j=Math.min(i+1,r.x.length-1);return r.x[i]+(u-i)*(r.x[j]-r.x[i]);
    }},
    indexedReader:i=>Number.isInteger(i)&&i>=0&&i<r.x.length?r.x[i]:Number.NaN,
    diagnostics:{method:r.method??'PCG',unknowns:r.x.length,nonzeros:r.nnz,iterations:r.iterations,relativeResidual:r.error},
  })},
  {key:'rootSpec',solve:solveNonlinearSystem,adapt:(spec,r)=>({
    outputs:constants({...r.values,rootResidual:r.error,rootIterations:r.iterations}),
    diagnostics:{method:'Newton',unknowns:spec.ids.length,iterations:r.iterations,absoluteResidual:r.error,adColumns:r.adColumns,finiteDifferenceColumns:r.finiteDifferenceColumns},
  })},
  {key:'optimizationSpec',solve:solveOptimization,adapt:(spec,r)=>({
    outputs:constants({...r.values,optObjective:r.objective,optGradient:r.error,optIterations:r.iterations}),
    diagnostics:{method:'Projected BFGS',unknowns:spec.ids.length,iterations:r.iterations,projectedGradient:r.error,objectiveEvaluations:r.evaluations,adColumns:r.adColumns,finiteDifferenceColumns:r.finiteDifferenceColumns},
  })},
]);
const spatialSolvers=Object.freeze([
  {key:'coupledSpec',method:'grid-heun',solve:prepareCoupledGrid,adapt:r=>({
    outputs:{...named(r.ids,(name,s)=>r.value(name,s.t,s.x,s.y)),
      ...named(r.ids.map(id=>'mean_'+id),(name,s)=>r.mean(name.slice(5),s.t))},
  })},
  {key:'implicitGrid',method:'grid-implicit',solve:prepareImplicitGrid,adapt:r=>({
    outputs:{gridValue:s=>r.value(s.t,s.x,s.y),gridMean:s=>r.mean(s.t)},
  })},
]);

function* prepareStationary(solver,params,compile,store){
  let diagnostics;
  for(const entry of stationarySolvers){
    const spec=solver[entry.key];if(!spec)continue;
    const result=yield* entry.solve(spec,params,compile),provider=entry.adapt(spec,result);
    store.register(provider);diagnostics??=provider.diagnostics;
  }
  return diagnostics;
}
function* prepareSpatial(solver,params,compile,warnings,store){
  for(const entry of spatialSolvers){
    const spec=solver[entry.key];if(!spec)continue;
    const r=yield* entry.solve(spec,params,compile,warnings);
    store.register(entry.adapt(r));
    return {duration:r.duration,eventTimes:[],stateAt:time=>({gridClock:Math.max(0,Math.min(r.duration,finite(time)?time:0))}),diagnostics:{method:entry.method,...r.diagnostics}};
  }
}
function* prepareAnalysis(spec,runtime,params,compile,compileSource,store){
  if(!spec)return;
  const r=yield* prepareScientificAnalysis(spec,runtime,params,compile,compileSource);
  store.register({outputs:named(Object.keys(spec.outputs),(name,s)=>r.read(name,s.x))});
  runtime.diagnostics={...(runtime.diagnostics??{method:spec.kind==='fft'?'FFT':spec.kind==='eigen'?'Jacobi eigen':'Parameter sweep'}),...r.diagnostics};
}
export { createResultStore, prepareStationary, prepareSpatial, prepareAnalysis };
