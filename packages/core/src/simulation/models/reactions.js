import { record, finite, located, at } from '../foundation.js';
import { name } from '../expression/functions.js';
import { parseDemonstrationExpression } from '../expression/parser.js';
import { expressionNames } from '../expression/evaluate.js';

// Reaction networks compile stoichiometry once into the common ODE runtime.
// Species amounts/concentrations are expressed on a consistent fixed-volume
// basis. Declared elemental composition is optional, but when present every
// reaction must conserve each declared element.

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

function lowerReactionNetwork(program){
  const d=program.dynamics;
  if(!record(d)||d.reactionNetwork===undefined)return program;
  const s=d.reactionNetwork,fail=message=>{throw located('dynamics.reactionNetwork',Error(message));};
  if(!record(s)||!['rk45','sdirk2','ssa'].includes(d.method)||
      ['initial','derivatives','spatial','circuit','stateSpace','massMatrix','algebraic','events'].some(k=>d[k]!==undefined))
    fail('Reaction network replaces other dynamics descriptions; choose rk45, sdirk2 or ssa');
  const stochastic=d.method==='ssa';
  if(stochastic&&s.seed!==undefined&&(!Number.isInteger(s.seed)||s.seed<0||s.seed>0xffffffff))fail('SSA seed must be an unsigned 32-bit integer');
  if(!stochastic&&s.seed!==undefined)fail('Seed is only used by SSA');
  const species=s.species,reactions=s.reactions;
  if(!Array.isArray(species)||species.length<1||species.length>(d.method==='sdirk2'?8:16)||
      !Array.isArray(reactions)||reactions.length<1||reactions.length>16)
    fail('Use 1–16 species (8 stiff) and 1–16 reactions');
  const scalar=v=>finite(v)||(typeof v==='string'&&v.length>0&&v.length<=1600);
  const ids=new Set(),params=new Set((Array.isArray(program.parameters)?program.parameters:[]).map(p=>p?.id));
  const definitions={...program.definitions},initial={},terms=new Map();
  const composition=species.some(v=>v?.composition!==undefined),elements=new Set();
  for(const v of species){
    if(!record(v)||!name(v.id)||ids.has(v.id)||params.has(v.id)||Object.hasOwn(definitions,v.id)||
        !scalar(v.initial)||(finite(v.initial)&&v.initial<0))fail('Species need distinct identifiers and nonnegative initial values');
    try{expressionNames(parseDemonstrationExpression(v.initial),params);}catch(e){fail('Initial amounts must use constants and parameters only');}
    if(stochastic&&finite(v.initial)&&(!Number.isSafeInteger(v.initial)||v.initial>1e8))fail('SSA initial counts must be integers from 0 to 100,000,000');
    ids.add(v.id);initial[v.id]=v.initial;terms.set(v.id,[]);
    if(composition){
      if(!record(v.composition)||Object.keys(v.composition).length>12||
          Object.entries(v.composition).some(([e,n])=>!/^[A-Z][a-z]?$/.test(e)||!Number.isInteger(n)||n<0||n>200))
        fail('All species need composition maps with valid element symbols and nonnegative integer counts');
      Object.keys(v.composition).forEach(e=>elements.add(e));
    }
  }
  if(elements.size>12)fail('Use at most 12 conserved elements');
  const put=(id,value)=>{
    if(!name(id)||ids.has(id)||params.has(id)||Object.hasOwn(definitions,id)||Object.keys(definitions).length>=24)
      fail('Generated rate/element names collide or exceed 24 definitions: '+id);
    definitions[id]=value;
  };
  const stoich=m=>record(m)&&Object.entries(m).every(([id,n])=>ids.has(id)&&Number.isInteger(n)&&n>=1&&n<=8);
  const rateIds=new Set();
  for(const r of reactions){
    if(!record(r)||!name(r.id)||rateIds.has(r.id)||!stoich(r.reactants)||!stoich(r.products)||
      (r.rateConstant===undefined)===(r.rate===undefined))fail('Reaction needs unique id, reactants/products maps and exactly one rateConstant or rate');
    rateIds.add(r.id);
    const delta=id=>(r.products[id]??0)-(r.reactants[id]??0);
    if(!species.some(v=>delta(v.id)!==0))fail('Reaction must change at least one species');
    if(composition)for(const e of elements){
      if(species.reduce((a,v)=>a+delta(v.id)*(v.composition[e]??0),0)!==0)fail('Unbalanced reaction '+r.id+' for element '+e);
    }
    let flux;
    if(r.rateConstant!==undefined){
      if(!scalar(r.rateConstant)||(finite(r.rateConstant)&&r.rateConstant<0))fail('Rate constant must be nonnegative');
      try{expressionNames(parseDemonstrationExpression(r.rateConstant),params);}catch(e){fail('Rate constant must use parameters and constants only');}
      const choose=(id,n)=>Array.from({length:n},(_,i)=>`max(0,(${id}-${i}))/${i+1}`).join('*');
      flux=['requireNonnegative('+r.rateConstant+')',...Object.entries(r.reactants).map(([id,n])=>stochastic?choose(id,n):`max(0,${id})^${n}`)].join('*');
    }else{
      if(stochastic)fail('SSA accepts only mass-action rateConstant, not time-dependent or custom rates');
      if(!scalar(r.rate)||(finite(r.rate)&&r.rate<0))fail('Custom flux must be nonnegative');
      flux=`requireNonnegative(${r.rate})`;
    }
    const rate='rate_'+r.id;put(rate,flux);
    for(const id of ids){const n=delta(id);if(n)terms.get(id).push(`(${n})*${rate}`);}
  }
  for(const e of elements)put('total_'+e,species.filter(v=>v.composition[e]).map(v=>`${v.composition[e]}*${v.id}`).join('+')||'0');
  const {reactionNetwork:_reactionNetwork,...rest}=d;
  return {...program,definitions,dynamics:{...rest,method:stochastic?'rk45':d.method,initial,derivatives:Object.fromEntries([...terms].map(([id,v])=>[id,v.join('+')||0]))}};
}

export { integrateReactionSSA, lowerReactionNetwork };
