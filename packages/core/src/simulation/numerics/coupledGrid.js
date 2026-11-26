import { DYNAMICS_BUDGET, record, finite, located } from '../foundation.js';
import { name } from '../expression/functions.js';
import { parseDemonstrationExpression } from '../expression/parser.js';
import { evaluateDemonstrationExpression, expressionNames } from '../expression/evaluate.js';

// Cell-centred multi-field reaction/diffusion: conservative finite-volume
// Laplacian, periodic or zero-normal-flux boundaries, explicit Heun.
function coupledGridSpec(program){
  const d=program.dynamics;
  if(!record(d)||d.coupledFields===undefined)return null;
  const s=d.coupledFields,fail=m=>{throw located('dynamics.coupledFields',Error(m));};
  if(!record(s)||d.method!=='grid-heun'||
      ['initial','derivatives','spatial','reactionNetwork','massMatrix','algebraic','events','circuit','stateSpace','rtol','atol'].some(k=>d[k]!==undefined))
    fail('Coupled fields require standalone grid-heun dynamics');
  const two=s.dimension===2,nx=s.nx,ny=two?s.ny:1,x=s.xDomain,y=two?s.yDomain:[0,1];
  const domain=a=>Array.isArray(a)&&a.length===2&&a.every(v=>finite(v)&&Math.abs(v)<=1e6)&&a[1]-a[0]>=1e-8;
  if(![1,2].includes(s.dimension)||!Number.isInteger(nx)||nx<3||nx>(two?33:257)||
      !Number.isInteger(ny)||(two&&(ny<3||ny>33))||!domain(x)||!domain(y)||
      !['periodic','noFlux'].includes(s.boundary))fail('Use 1D 3–257 or 2D 3–33 per axis, numeric domains and periodic/noFlux boundaries');
  if(!Array.isArray(s.fields)||s.fields.length<1||s.fields.length>4)fail('Use 1–4 fields');
  const steps=Math.ceil(d.duration/d.step),size=nx*ny*s.fields.length;
  if(!finite(d.duration)||d.duration<=0||d.duration>300||!finite(d.step)||d.step<1e-6||d.step>1||
      !Number.isInteger(steps)||steps>2000||size*(steps+1)>2000000)fail('Coupled history exceeds 2000 steps or 2 million stored scalar values');
  const params=new Set((Array.isArray(program.parameters)?program.parameters:[]).map(p=>p?.id));
  const names=new Set([...params,...Object.keys(program.definitions??{}),'x','y','t','gridClock','spaceZ']);
  const ids=[];
  for(const f of s.fields){
    if(!record(f)||!name(f.id)||names.has(f.id)||names.has('mean_'+f.id))fail('Invalid or duplicate field identifier');
    ids.push(f.id);names.add(f.id);names.add('mean_'+f.id);
  }
  const coord=new Set([...params,'x','y']),local=new Set([...coord,'t',...ids]);
  const check=(v,scope)=>{try{expressionNames(parseDemonstrationExpression(v),scope);}catch(e){fail(String(e));}};
  for(const f of s.fields){check(f.initial,coord);check(f.diffusivity,params);check(f.reaction??0,local);
    if(f.advection!==undefined){if(s.boundary!=='periodic'||!Array.isArray(f.advection)||f.advection.length!==(two?2:1))fail('Advection requires periodic boundaries and one velocity per axis');f.advection.forEach(v=>check(v,params));}
    if(finite(f.diffusivity)&&f.diffusivity<0)fail('Diffusivity must be nonnegative');}
  return {...s,two,nx,ny,x,y,steps,dt:d.duration/steps,duration:d.duration,ids};
}
function lowerCoupledGrid(program){
  const g=coupledGridSpec(program);if(!g)return program;
  const {coupledFields:_coupled,...rest}=program.dynamics;
  const defs={...program.definitions};
  for(const id of g.ids){defs[id]='0*x+0*y+0*t';defs['mean_'+id]='0*t';}
  return {...program,definitions:defs,dynamics:{...rest,method:'rk45',initial:{gridClock:0},derivatives:{gridClock:1}}};
}
function* prepareCoupledGrid(g,params,compile,warnings){
  const {nx,ny,two,x,y,steps,dt,ids}=g,n=ids.length,m=nx*ny,total=n*m;
  const dx=(x[1]-x[0])/nx,dy=two?(y[1]-y[0])/ny:1,periodic=g.boundary==='periodic';
  const budget={remaining:DYNAMICS_BUDGET},scope=Object.assign(Object.create(null),params);
  const read=ast=>evaluateDemonstrationExpression(ast,scope,budget);
  const initial=g.fields.map(f=>compile(f.initial)),reaction=g.fields.map(f=>compile(f.reaction??0));
  const alpha=g.fields.map(f=>read(compile(f.diffusivity)));
  const velocities=g.fields.map(f=>(f.advection??(two?[0,0]:[0])).map(v=>read(compile(v))));
  const fail=m=>{throw located('dynamics.coupledFields',Error(m));};
  if(alpha.some(v=>!finite(v)||v<0))fail('Diffusivity must be finite and nonnegative');
  const cfl=Math.max(...alpha)*dt*(1/dx**2+(two?1/dy**2:0));
  if(velocities.some(v=>!v.every(finite)))fail('Advection velocities must be finite');
  const transportCFL=Math.max(...alpha.map((a,i)=>dt*(2*a*(1/dx**2+(two?1/dy**2:0))+Math.abs(velocities[i][0])/dx+(two?Math.abs(velocities[i][1])/dy:0))));
  if(transportCFL>1+1e-12)fail('Explicit transport/diffusion CFL exceeds 1; reduce step or grid resolution');
  const left=new Int32Array(m),right=new Int32Array(m),up=new Int32Array(m),down=new Int32Array(m);
  const index=(i,j)=>j*nx+i;
  const bound=(i,n)=>periodic?(i+n)%n:Math.max(0,Math.min(n-1,i));
  let current=new Float64Array(total);
  for(let j=0;j<ny;j++){
    for(let i=0;i<nx;i++){
      const k=index(i,j);scope.x=x[0]+(i+.5)*dx;scope.y=two?y[0]+(j+.5)*dy:0;
      left[k]=index(bound(i-1,nx),j);right[k]=index(bound(i+1,nx),j);
      up[k]=index(i,bound(j+1,ny));down[k]=index(i,bound(j-1,ny));
      for(let f=0;f<n;f++)current[f*m+k]=read(initial[f]);
    }
    yield;
  }
  const valid=a=>a.every(v=>finite(v)&&Math.abs(v)<=1e12);
  if(!valid(current))fail('Nonfinite initial field');
  const frames=[current],means=[];
  const mean=a=>ids.map((_,f)=>{let sum=0;for(let k=0;k<m;k++)sum+=a[f*m+k];return sum/m;});
  means.push(mean(current));
  const k1=new Float64Array(total),k2=new Float64Array(total),stage=new Float64Array(total);
  function* rhs(a,t,out){
    scope.t=t;
    for(let j=0;j<ny;j++){
      scope.y=two?y[0]+(j+.5)*dy:0;
      for(let i=0;i<nx;i++){
        const k=index(i,j);scope.x=x[0]+(i+.5)*dx;
        for(let f=0;f<n;f++)scope[ids[f]]=a[f*m+k];
        for(let f=0;f<n;f++){
          const off=f*m,u=a[off+k],lap=(a[off+left[k]]-2*u+a[off+right[k]])/dx**2+
            (two?(a[off+up[k]]-2*u+a[off+down[k]])/dy**2:0);
          const [vx,vy=0]=velocities[f];
          const advX=vx>=0?vx*(u-a[off+left[k]])/dx:vx*(a[off+right[k]]-u)/dx;
          const advY=two?(vy>=0?vy*(u-a[off+down[k]])/dy:vy*(a[off+up[k]]-u)/dy):0;
          out[off+k]=alpha[f]*lap-advX-advY+read(reaction[f]);
        }
      }
      if(j%4===0)yield;
    }
  }
  try{
    for(let step=1;step<=steps;step++){
      yield* rhs(current,(step-1)*dt,k1);
      for(let k=0;k<total;k++)stage[k]=current[k]+dt*k1[k];
      if(!valid(stage))fail('Nonfinite explicit predictor; reduce step');
      yield* rhs(stage,step*dt,k2);
      const next=current.map((v,k)=>v+dt*.5*(k1[k]+k2[k]));
      if(!valid(next))fail('Coupled field diverged; reduce step');
      current=next;frames.push(next);means.push(mean(next));yield;
    }
  }catch(e){warnings.push({path:'dynamics.coupledFields',time:(frames.length-1)*dt,message:String(e)});}
  const duration=frames.length===steps+1?g.duration:(frames.length-1)*dt;
  const interval=t=>{let u=Math.max(0,Math.min(frames.length-1,(finite(t)?t:0)/dt)),i=Math.floor(u);return [i,Math.min(i+1,frames.length-1),u-i];};
  function value(id,t,px,py){
    const f=ids.indexOf(id);
    if(f<0||px<x[0]||px>x[1]||(two&&(py<y[0]||py>y[1])))return Number.NaN;
    const u=(px-x[0])/dx-.5,v=two?(py-y[0])/dy-.5:0,i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j;
    const sample=frame=>{
      const read=(i,j)=>frame[f*m+index(bound(i,nx),bound(j,ny))];
      const low=read(i,j)*(1-a)+read(i+1,j)*a;
      return two?low*(1-b)+(read(i,j+1)*(1-a)+read(i+1,j+1)*a)*b:low;
    };
    const [lo,hi,w]=interval(t);return sample(frames[lo])*(1-w)+sample(frames[hi])*w;
  }
  return {duration,ids,value,mean(id,t){const [lo,hi,w]=interval(t),f=ids.indexOf(id);return means[lo][f]*(1-w)+means[hi][f]*w;},
    diagnostics:{acceptedSteps:frames.length-1,gridNodes:m,storedValues:total*frames.length,minStep:dt,maxStep:dt,diffusionCFL:cfl,transportCFL}};
}

export { coupledGridSpec, lowerCoupledGrid, prepareCoupledGrid };
