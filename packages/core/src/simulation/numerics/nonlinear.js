import { DYNAMICS_BUDGET, record, finite, located } from '../foundation.js';
import { name } from '../expression/functions.js';
import { parseDemonstrationExpression } from '../expression/parser.js';
import { dualExpression, evaluateDemonstrationExpression, expressionNames } from '../expression/evaluate.js';
import { solveSmallSystem } from './dense.js';

function nonlinearSpec(program){
  const s=program.nonlinearSystem;
  if(s===undefined)return null;
  const fail=m=>{throw located('nonlinearSystem',Error(m));};
  if(!record(s)||!record(s.guess)||!record(s.residuals)||program.dynamics!==undefined||
      program.sparseSystem!==undefined||program.duration!==undefined)fail('Use a standalone square residual system');
  const ids=Object.keys(s.guess),params=new Set((Array.isArray(program.parameters)?program.parameters:[]).map(p=>p?.id));
  const defs=Object.keys(program.definitions??{});
  if(!ids.length||ids.length>8||Object.keys(s.residuals).length!==ids.length||
      ids.some(id=>!name(id)||params.has(id)||defs.includes(id)||!Object.hasOwn(s.residuals,id))||
      [...ids,...params,...defs].some(id=>['rootResidual','rootIterations'].includes(id)))fail('Use 1–8 distinct unknowns with matching residuals and no result-name collisions');
  const check=(v,scope)=>{try{expressionNames(parseDemonstrationExpression(v),scope);}catch(e){fail(String(e));}};
  ids.forEach(id=>{check(s.guess[id],params);check(s.residuals[id],new Set([...params,...ids]));});
  const tolerance=s.tolerance??1e-9,maxIterations=s.maxIterations??40;
  if(!finite(tolerance)||tolerance<1e-12||tolerance>1e-3||!Number.isInteger(maxIterations)||maxIterations<1||maxIterations>80)fail('Invalid Newton tolerance or iteration limit');
  return {...s,ids,tolerance,maxIterations};
}
function lowerNonlinearSystem(program){
  const s=nonlinearSpec(program);
  if(!s)return program;
  return {...program,definitions:{...program.definitions,...Object.fromEntries(s.ids.map(id=>[id,0])),rootResidual:0,rootIterations:0}};
}
function* solveNonlinearSystem(s,params,compile){
  const n=s.ids.length,budget={remaining:DYNAMICS_BUDGET},scope=Object.assign(Object.create(null),params);
  const fail=m=>{throw located('nonlinearSystem',Error(m));};
  const read=expr=>evaluateDemonstrationExpression(compile(expr),scope,budget);
  let z=Float64Array.from(s.ids,id=>read(s.guess[id])),iterations=0;
  const residual=(v)=>{
    s.ids.forEach((id,i)=>{scope[id]=v[i];});
    return Float64Array.from(s.ids,id=>read(s.residuals[id]));
  };
  const norm=v=>v.every(finite)?Math.max(...v.map(Math.abs)):Infinity;
  let f=residual(z),error=norm(f),adColumns=0,finiteDifferenceColumns=0;
  if(!finite(error)||!z.every(v=>finite(v)&&Math.abs(v)<=1e12))fail('Nonfinite initial residual or guess');
  while(error>s.tolerance&&iterations<s.maxIterations){
    const jac=new Float64Array(n*n),delta=Float64Array.from(f,v=>-v);
    for(let j=0;j<n;j++){
      s.ids.forEach((id,i)=>{scope[id]=z[i];});
      const column=s.ids.map(id=>dualExpression(compile(s.residuals[id]),scope,s.ids[j],budget)[1]);
      if(column.every(finite)){for(let i=0;i<n;i++)jac[i*n+j]=column[i];adColumns++;continue;}
      finiteDifferenceColumns++;
      const h=1e-6*Math.max(1,Math.abs(z[j])),trial=z.slice();trial[j]+=h;
      let g=residual(trial),sign=1;
      if(!g.every(finite)){trial[j]=z[j]-h;g=residual(trial);sign=-1;}
      if(!g.every(finite))fail('Cannot estimate finite Jacobian');
      for(let i=0;i<n;i++)jac[i*n+j]=(g[i]-f[i])/(sign*h);
    }
    if(!solveSmallSystem(jac,delta,n))fail('Singular or ill-conditioned Newton Jacobian');
    let accepted=false;
    for(let k=0;k<=12;k++){
      const weight=2**(-k),trial=z.map((v,i)=>v+weight*delta[i]);
      if(!trial.every(v=>finite(v)&&Math.abs(v)<=1e12))continue;
      const g=residual(trial),e=norm(g);
      if(e<error){z=trial;f=g;error=e;accepted=true;break;}
    }
    if(!accepted)fail('Newton line search failed to reduce residual; change initial guess or scale equations');
    iterations++;yield;
  }
  if(error>s.tolerance)fail('Newton iteration limit exceeded; residual '+error);
  return {values:Object.fromEntries(s.ids.map((id,i)=>[id,z[i]])),error,iterations,adColumns,finiteDifferenceColumns};
}

export { nonlinearSpec, lowerNonlinearSystem, solveNonlinearSystem };
