import { finite } from '../foundation.js';

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

export { integrateVerlet };
