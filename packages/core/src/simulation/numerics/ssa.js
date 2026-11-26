import { finite, located } from '../foundation.js';

// Direct Gillespie SSA for bounded, stationary mass-action count models.
// The deterministic seed makes a parameter revision reproducible.
function* integrateReactionSSA(spec,dynamics,names,initial,readRate,warnings){
  let seed=(spec.seed??12345)>>>0;
  const random=()=>{
    seed=(seed+0x6D2B79F5)>>>0;
    let z=seed;z=Math.imul(z^(z>>>15),z|1);z^=z+Math.imul(z^(z>>>7),z|61);
    return (((z^(z>>>14))>>>0)+0.5)/4294967296;
  };
  const state=Float64Array.from(names,id=>initial[id]);
  if(!state.every(v=>Number.isSafeInteger(v)&&v>=0&&v<=1e8))
    throw located('dynamics.reactionNetwork',Error('SSA requires nonnegative integer initial counts at selected parameter values'));
  const channels=spec.reactions.map(r=>({
    k:readRate(r.rateConstant),reactants:Object.entries(r.reactants).map(([id,n])=>[names.indexOf(id),n]),
    delta:Float64Array.from(names,id=>(r.products[id]??0)-(r.reactants[id]??0)),
  }));
  if(channels.some(c=>!finite(c.k)||c.k<0))throw located('dynamics.reactionNetwork',Error('SSA rate constants must be finite and nonnegative'));
  const times=[0],states=[state.slice()],rates=new Float64Array(channels.length);
  let t=0,events=0,duration=dynamics.duration;
  try{
    while(t<duration){
      if(events>=10000)throw Error('SSA reaction event limit reached');
      let sum=0;
      for(let j=0;j<channels.length;j++){
        const c=channels[j];let a=c.k;
        for(const [i,n] of c.reactants){
          if(state[i]<n){a=0;break;}
          for(let k=0;k<n;k++)a*=((state[i]-k)/(k+1));
        }
        if(!finite(a)||a<0||a>1e12)throw Error('SSA propensity exceeds finite resource bounds');
        rates[j]=a;sum+=a;
      }
      if(sum===0)break;
      const next=t-Math.log(random())/sum;
      if(next>duration)break;
      if(!(next>t))throw Error('SSA time increment underflow');
      let choice=random()*sum,j=0;
      while(j<rates.length-1&&choice>=rates[j]){choice-=rates[j];j++;}
      const delta=channels[j].delta,updated=state.map((v,i)=>v+delta[i]);
      if(!updated.every(v=>Number.isSafeInteger(v)&&v>=0&&v<=1e8))throw Error('SSA count exceeds physical/resource bounds');
      state.set(updated);t=next;times.push(t);states.push(state.slice());events++;
      if(events%32===0)yield;
    }
  }catch(error){duration=t;warnings.push({path:'dynamics.reactionNetwork',time:t,message:String(error)});}
  return {duration,eventTimes:[],diagnostics:{method:'ssa',events},
    stateAt(time){const u=Math.max(0,Math.min(duration,finite(time)?time:0));let lo=0,hi=times.length-1;
      while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(times[mid]<=u)lo=mid;else hi=mid-1;}
      return Object.fromEntries(names.map((id,i)=>[id,states[lo][i]]));}};
}

export { integrateReactionSSA };
