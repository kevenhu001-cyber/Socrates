import { DYNAMICS_BUDGET, finite, located } from '../foundation.js';
import { evaluateDemonstrationExpression } from '../expression/evaluate.js';

function* prepareImplicitGrid(g,params,compile,warnings) {
  const {nx,ny,x,y,two,steps,dt,s}=g, size=nx*ny;
  const budget={remaining:DYNAMICS_BUDGET};
  const scope=Object.assign(Object.create(null),params,{x:0,y:0});
  const read=(expr,x,y)=>{
    scope.x=x;scope.y=y;
    const v=evaluateDemonstrationExpression(compile(expr),scope,budget);
    if(!finite(v)||Math.abs(v)>1e12)throw Error('Nonfinite or excessive grid input');
    return v;
  };
  const alpha=read(s.diffusivity,0,0);
  if(alpha<0)throw located('dynamics.spatial.diffusivity',Error('Diffusivity must be nonnegative'));
  const dx=(x[1]-x[0])/(nx-1),dy=two?(y[1]-y[0])/(ny-1):1;
  const rx=alpha*dt/(dx*dx),ry=two?alpha*dt/(dy*dy):0;
  if(!finite(rx)||!finite(ry)||rx>1e12||ry>1e12)throw Error('Diffusion coefficient or grid spacing exceeds numerical limits');
  let current=new Float64Array(size);
  const source=new Float64Array(size);
  const boundary=new Float64Array(size);
  const isBoundary=(i,j)=>i===0||i===nx-1||(two&&(j===0||j===ny-1));
  for(let j=0;j<ny;j++){
    for(let i=0;i<nx;i++){
      const k=j*nx+i, px=x[0]+i*dx,py=two?y[0]+j*dy:0;
      if(isBoundary(i,j)){
        boundary[k]=read(two?s.boundary:i===0?s.left:s.right,px,py);
        current[k]=boundary[k];
      }else{
        current[k]=read(s.initial,px,py);
        source[k]=read(s.source??0,px,py);
      }
    }
    yield;
  }
  // Prefactor constant tridiagonal matrices once; no dense matrix is formed.
  function factor(n,r){
    const inv=new Float64Array(n), upper=new Float64Array(n);
    for(let i=0;i<n;i++){
      inv[i]=1/(1+2*r+(i?r*upper[i-1]:0));
      upper[i]=-r*inv[i];
    }
    return {inv,upper,r};
  }
  const fx=factor(nx-2,rx),fy=two?factor(ny-2,ry):null;
  const work=new Float64Array(Math.max(nx,ny));
  function solve(f,n,get,set,left,right,extra){
    for(let i=0;i<n;i++){
      const rhs=get(i)+(extra?extra(i):0)+(i===0?f.r*left:0)+(i===n-1?f.r*right:0);
      work[i]=(rhs+(i?f.r*work[i-1]:0))*f.inv[i];
    }
    for(let i=n-1;i>=0;i--){
      if(i<n-1)work[i]-=f.upper[i]*work[i+1];
      set(i,work[i]);
    }
  }
  const frames=[current],means=[current.reduce((a,b)=>a+b,0)/size];
  try{
    for(let step=1;step<=steps;step++){
      const mid=current.slice();
      for(let j=two?1:0;j<(two?ny-1:1);j++){
        const off=j*nx;
        solve(fx,nx-2,i=>current[off+i+1],(i,v)=>{mid[off+i+1]=v;},
          boundary[off],boundary[off+nx-1],i=>dt*source[off+i+1]);
        if(j%8===0)yield;
      }
      const next=two?mid.slice():mid;
      if(two)for(let i=1;i<nx-1;i++){
        solve(fy,ny-2,j=>mid[(j+1)*nx+i],(j,v)=>{next[(j+1)*nx+i]=v;},
          boundary[i],boundary[(ny-1)*nx+i],null);
        if(i%8===0)yield;
      }
      if(!next.every(v=>finite(v)&&Math.abs(v)<=1e12))throw Error('Grid solution diverged');
      current=next;frames.push(next);means.push(next.reduce((a,b)=>a+b,0)/size);
      yield;
    }
  }catch(error){warnings.push({path:'dynamics.spatial',time:(frames.length-1)*dt,message:String(error)});}
  const duration=frames.length===steps+1?g.duration:(frames.length-1)*dt;
  const interval=t=>{
    const u=Math.max(0,Math.min(frames.length-1,(finite(t)?t:0)/dt));
    const a=Math.floor(u);return [a,Math.min(a+1,frames.length-1),u-a];
  };
  function value(t,px,py){
    if(px<x[0]||px>x[1]||(two&&(py<y[0]||py>y[1])))return Number.NaN;
    const u=Math.max(0,Math.min(nx-1,(px-x[0])/dx)),v=two?Math.max(0,Math.min(ny-1,(py-y[0])/dy)):0;
    const i=Math.min(nx-2,Math.floor(u)),j=two?Math.min(ny-2,Math.floor(v)):0, a=u-i,b=v-j;
    const spatial=f=>{
      const k=j*nx+i,low=f[k]*(1-a)+f[k+1]*a;
      return two?low*(1-b)+(f[k+nx]*(1-a)+f[k+nx+1]*a)*b:low;
    };
    const [lo,hi,f]=interval(t);
    return spatial(frames[lo])*(1-f)+spatial(frames[hi])*f;
  }
  return {duration,diagnostics:{acceptedSteps:frames.length-1,gridNodes:size,storedValues:size*frames.length,minStep:dt,maxStep:dt},value,mean(t){const [lo,hi,f]=interval(t);return means[lo]*(1-f)+means[hi]*f;}};
}

export { prepareImplicitGrid };
