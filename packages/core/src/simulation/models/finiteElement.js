import { record, finite, located } from '../foundation.js';
import { name } from '../expression/functions.js';
import { parseDemonstrationExpression } from '../expression/parser.js';
import { expressionNames } from '../expression/evaluate.js';

// Piecewise-linear 1D Galerkin finite elements on a user-supplied mesh.
// -(a u')' + c u = f, positive a, nonnegative c, Dirichlet endpoints.
// Two-point Gauss quadrature; tridiagonal assembly and elimination.
function finiteElementSpec(program){
  const s=program.finiteElement;if(s===undefined)return null;
  const fail=m=>{throw located('finiteElement',Error(m));};
  if(!record(s)||program.dynamics!==undefined||program.duration!==undefined||
    ['optimization','nonlinearSystem','sparseSystem','analysis'].some(k=>program[k]!==undefined))fail('Use standalone stationary finiteElement model');
  const nodes=s.nodes;
  if(!Array.isArray(nodes)||nodes.length<3||nodes.length>257||nodes.some((v,i)=>!finite(v)||Math.abs(v)>1e6||(i>0&&v-nodes[i-1]<1e-9)))fail('Use 3–257 strictly increasing mesh coordinates');
  const params=new Set((Array.isArray(program.parameters)?program.parameters:[]).map(p=>p?.id));
  const outputs={femValue:'0*x',femGradient:'0*x',femResidual:0,femNodes:0};
  if(Object.keys(outputs).some(k=>params.has(k)||Object.hasOwn(program.definitions??{},k)))fail('Finite element output name collision');
  const check=(v,scope)=>{try{expressionNames(parseDemonstrationExpression(v),scope);}catch(e){fail(String(e));}};
  for(const v of [s.diffusion,s.reaction??0,s.source])check(v,new Set([...params,'x']));
  for(const v of [s.left,s.right])check(v,params);
  return {...s,outputs};
}
function lowerFiniteElement(program,s=finiteElementSpec(program)){return s?{...program,definitions:{...program.definitions,...s.outputs}}:program;
}

export { finiteElementSpec, lowerFiniteElement };
