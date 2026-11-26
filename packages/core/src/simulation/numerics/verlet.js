import { record, finite, located } from '../foundation.js';
import { name } from '../expression/functions.js';
import { parseDemonstrationExpression } from '../expression/parser.js';
import { expressionNames } from '../expression/evaluate.js';

// Separable autonomous mechanical systems q'=v, v'=a(q). The user
// supplies the physical acceleration; symplecticity assumes conservative
// forces and compatible canonical coordinates/masses.
function verletSpec(program){
  const d=program.dynamics;if(!record(d)||d.mechanics===undefined)return null;
  const s=d.mechanics,fail=m=>{throw located('dynamics.mechanics',Error(m));};
  if(d.method!=='verlet'||!record(s)||!Array.isArray(s.coordinates)||s.coordinates.length<1||s.coordinates.length>8||
    ['initial','derivatives','massMatrix','algebraic','events','rtol','atol','spatial','coupledFields','reactionNetwork','circuit','stateSpace'].some(k=>d[k]!==undefined))fail('Use standalone Verlet mechanics with 1–8 coordinate pairs');
  if(!finite(d.duration)||d.duration<=0||d.duration>300||!finite(d.step)||d.step<1e-6||d.step>1||Math.ceil(d.duration/d.step)>10000)fail('Verlet duration/step exceeds limits');
  const params=new Set((Array.isArray(program.parameters)?program.parameters:[]).map(p=>p?.id)),used=new Set([...params,...Object.keys(program.definitions??{})]),positions=[];
  const check=(v,scope)=>{try{expressionNames(parseDemonstrationExpression(v),scope);}catch(e){fail(String(e));}};
  for(const q of s.coordinates){
    if(!record(q)||!name(q.position)||!name(q.velocity)||q.position===q.velocity||used.has(q.position)||used.has(q.velocity))fail('Coordinate and velocity names must be distinct');
    used.add(q.position);used.add(q.velocity);positions.push(q.position);
    check(q.initialPosition,params);check(q.initialVelocity,params);
  }
  for(const q of s.coordinates)check(q.acceleration,new Set([...params,...positions]));
  return s;
}
function lowerVerlet(program){
  const s=verletSpec(program);if(!s)return program;
  const {mechanics:_m,...d}=program.dynamics,initial={},derivatives={};
  for(const q of s.coordinates){initial[q.position]=q.initialPosition;initial[q.velocity]=q.initialVelocity;derivatives[q.position]=q.velocity;derivatives[q.velocity]=q.acceleration;}
  return {...program,dynamics:{...d,method:'rk45',initial,derivatives}};
}
function* integrateVerlet(d,s,state,derivative,warnings){
  const count=Math.ceil(d.duration/d.step),h=d.duration/count,coords=s.coordinates,names=Object.keys(state),n=names.length;
  const frames=new Float64Array((count+1)*n);let completed=0;
  const store=(i,q)=>{for(let j=0;j<n;j++)frames[i*n+j]=q[names[j]];};
  store(0,state);
  const valid=v=>Object.values(v).every(q=>finite(q)&&Math.abs(q)<=1e12);
  let current=state;
  try{
    let a=derivative(current,0);
    for(let i=1;i<=count;i++){
      const next={...current};
      for(const q of coords){next[q.velocity]=current[q.velocity]+h*a[q.velocity]/2;next[q.position]=current[q.position]+h*next[q.velocity];}
      if(!valid(next))throw Error('Nonfinite Verlet predictor');
      const b=derivative(next,i*h);
      for(const q of coords)next[q.velocity]+=h*b[q.velocity]/2;
      if(!valid(next))throw Error('Nonfinite Verlet step');
      store(i,next);completed=i;current=next;a=b;if(i%32===0)yield;
    }
  }catch(error){warnings.push({path:'dynamics.mechanics',time:completed*h,message:String(error)});}
  const duration=completed===count?d.duration:completed*h;
  return {duration,eventTimes:[],diagnostics:{acceptedSteps:completed,rejectedSteps:0,events:0,minStep:h,maxStep:h,storedValues:frames.length},
    stateAt(t){const u=Math.max(0,Math.min(completed,(finite(t)?t:0)/h)),i=Math.floor(u),f=u-i,a=i*n,b=Math.min(i+1,completed)*n;
      return Object.fromEntries(names.map((k,j)=>[k,frames[a+j]+f*(frames[b+j]-frames[a+j])]));}};
}

export { verletSpec, lowerVerlet, integrateVerlet };
