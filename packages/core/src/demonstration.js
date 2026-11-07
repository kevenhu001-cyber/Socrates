/** Bounded mathematical programs. No eval, generated JS, imports or DOM access. */
const SAFE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const RESERVED = new Set(['x','y','t','pi','e','constructor','prototype','__proto__']);
const unary = { sin:Math.sin, cos:Math.cos, tan:Math.tan, asin:Math.asin, acos:Math.acos, atan:Math.atan, sqrt:Math.sqrt, abs:Math.abs, exp:Math.exp, log:Math.log, log10:Math.log10, floor:Math.floor, ceil:Math.ceil, round:Math.round, sign:Math.sign, sinh:Math.sinh, cosh:Math.cosh, tanh:Math.tanh };
let airyTable;
function j1(x) { let s=0; for(let i=0;i<128;i++){const t=(i+.5)*Math.PI/128;s+=Math.cos(t-x*Math.sin(t));}return s/128; }
function airy(r) {
  airyTable ??= Float64Array.from({length:8193},(_,i)=>i===0?1:(2*j1(i/512)/ (i/512))**2);
  const u=Math.abs(r), i=u*512, lo=Math.floor(i);
  if(lo>=airyTable.length-1){const phase=u-3*Math.PI/4;return 8/(Math.PI*u**3)*(Math.cos(phase)-3/(8*u)*Math.sin(phase))**2;}
  return airyTable[lo]+(airyTable[lo+1]-airyTable[lo])*(i-lo);
}
const functions = {
 ...unary, pow:Math.pow, min:Math.min, max:Math.max, atan2:Math.atan2, hypot:Math.hypot,
 clamp:(v,a,b)=>Math.max(a,Math.min(b,v)), sinc:x=>Math.abs(x)<1e-7?1-x*x/6:Math.sin(x)/x,
 // Normalized sin(nz)/(n sin z), with the removable singularities filled in.
 sinratio:(n,z)=>!Number.isInteger(n)||n<1||n>128?Number.NaN:Math.abs(Math.sin(z))<1e-8?Math.cos(n*z)/Math.cos(z):Math.sin(n*z)/(n*Math.sin(z)),
 besselJ1:j1, airy,
};
const arity = { pow:2, atan2:2, clamp:3, sinc:1, sinratio:2, besselJ1:1, airy:1 };
const precedence={ '||':1,'&&':2,'==':3,'!=':3,'<':4,'>':4,'<=':4,'>=':4,'+':5,'-':5,'*':6,'/':6,'%':6,'^':8 };
export function parseDemonstrationExpression(source) {
 if(typeof source==='number'&&Number.isFinite(source))return {kind:'number',value:source};
 if(typeof source!=='string'||!source.trim()||source.length>1600)throw Error('Expression must be a number or 1–1600 mathematical characters');
 const tokens=[];let offset=0;
 while(offset<source.length){const match=/^\s*(?:(\d*\.?\d+(?:[eE][+-]?\d+)?)|([A-Za-z][A-Za-z0-9_]*)|(<=|>=|==|!=|&&|\|\||[+\-*/%^(),<>]))/.exec(source.slice(offset));if(!match){if(source.slice(offset).trim()==='')break;throw Error('Unsupported expression syntax');}if(match[1]&&!Number.isFinite(Number(match[1])))throw Error('Numeric literal must be finite');tokens.push(match[1]?{number:Number(match[1])}:match[2]?{name:match[2]}:{op:match[3]});offset+=match[0].length;if(tokens.length>320)throw Error('Expression token budget exceeded');}
 let index=0,depth=0;
 const consume=op=>{if(tokens[index]?.op!==op)throw Error(`Expected ${op}`);index++;};
 function expression(min=0){if(++depth>32)throw Error('Expression nesting budget exceeded');let node;const token=tokens[index++];if(!token)throw Error('Incomplete expression');
  if(token.number!==undefined)node={kind:'number',value:token.number};
  else if(token.op==='+'||token.op==='-')node={kind:'unary',op:token.op,arg:expression(7)};
  else if(token.op==='('){node=expression();consume(')');}
  else if(token.name){
   if(tokens[index]?.op==='('){index++;const args=[];if(tokens[index]?.op!==')')do{args.push(expression());if(tokens[index]?.op!==',')break;index++;}while(true);consume(')');
    const name=token.name;if(!Object.hasOwn(functions,name)&&!['sum','if','iterate'].includes(name))throw Error(`Unknown mathematical function: ${name}`);
    if((name==='sum'&&args.length!==4)||(name==='iterate'&&args.length!==4)||(name==='if'&&args.length!==3)||((arity[name]??(Object.hasOwn(unary,name)?1:0))&&args.length!==(arity[name]??1))||args.length>8||args.length===0)throw Error(`Wrong argument count: ${name}`);
    if(['sum','iterate'].includes(name)&&(args[0]?.kind!=='variable'||!SAFE.test(args[0].name)||RESERVED.has(args[0].name)))throw Error('sum/iterate needs a safe local variable as its first argument');
    node={kind:'call',name,args};
   }else node={kind:'variable',name:token.name};
  }else throw Error('Expected a mathematical value');
  while(precedence[tokens[index]?.op]>=min){const op=tokens[index++].op,p=precedence[op];node={kind:'binary',op,left:node,right:expression(op==='^'?p:p+1)};}
  depth--;return node;
 }
 const ast=expression();if(index!==tokens.length)throw Error('Unexpected trailing expression');return ast;
}
export function evaluateDemonstrationExpression(ast, scope, budget={remaining:2000000}) {
 if(--budget.remaining<0)throw Error('Demonstration calculation budget exceeded');
 const run=node=>evaluateDemonstrationExpression(node,scope,budget);
 if(ast.kind==='number')return ast.value;
 if(ast.kind==='variable'){if(ast.name==='pi')return Math.PI;if(ast.name==='e')return Math.E;if(!Object.hasOwn(scope,ast.name))throw Error(`Unknown variable: ${ast.name}`);return scope[ast.name];}
 if(ast.kind==='unary')return ast.op==='-'?-run(ast.arg):run(ast.arg);
 if(ast.kind==='binary'){
  const a=run(ast.left);if(ast.op==='&&')return a?run(ast.right):0;if(ast.op==='||')return a||run(ast.right);const b=run(ast.right);
  switch(ast.op){case '+':return a+b;case '-':return a-b;case '*':return a*b;case '/':return a/b;case '%':return a%b;case '^':return a**b;case '<':return +(a<b);case '>':return +(a>b);case '<=':return +(a<=b);case '>=':return +(a>=b);case '==':return +(a===b);case '!=':return +(a!==b);}
 }
 if(ast.name==='if')return run(ast.args[0])?run(ast.args[1]):run(ast.args[2]);
 if(ast.name==='sum'||ast.name==='iterate'){
  const key=ast.args[0].name,local={...scope};let result=0;
  if(ast.name==='sum') {const start=Math.ceil(run(ast.args[1])),end=Math.floor(run(ast.args[2]));if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end-start>127)throw Error('sum supports at most 128 terms');for(let i=start;i<=end;i++){local[key]=i;result+=evaluateDemonstrationExpression(ast.args[3],local,budget);}return result;}
  result=run(ast.args[1]);const count=Math.floor(run(ast.args[2]));if(!Number.isFinite(count)||count<0||count>128)throw Error('iterate supports 0–128 steps');for(let i=0;i<count;i++){local[key]=result;result=evaluateDemonstrationExpression(ast.args[3],local,budget);}return result;
 }
 if(ast.name==='besselJ1'){budget.remaining-=127;if(budget.remaining<0)throw Error('Demonstration calculation budget exceeded');}
 return functions[ast.name](...ast.args.map(run));
}
function expressionNames(ast,allowed){
 if(ast.kind==='variable'&&!allowed.has(ast.name))throw Error(`Unknown variable: ${ast.name}`);
 if(ast.kind==='binary'){expressionNames(ast.left,allowed);expressionNames(ast.right,allowed);}
 if(ast.kind==='unary')expressionNames(ast.arg,allowed);
 if(ast.kind==='call'){
  if(['sum','iterate'].includes(ast.name)){expressionNames(ast.args[1],allowed);expressionNames(ast.args[2],allowed);expressionNames(ast.args[3],new Set([...allowed,ast.args[0].name]));}
  else ast.args.forEach(arg=>expressionNames(arg,allowed));
 }
}
const record=value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const name=value=>typeof value==='string'&&SAFE.test(value)&&!RESERVED.has(value)&&!Object.hasOwn(functions,value);
const range=value=>Array.isArray(value)&&value.length===2&&value.every(v=>finite(v)&&Math.abs(v)<=1e6||typeof v==='string')&&(!value.every(finite)||value[0]<value[1]);
const text=value=>value===undefined||typeof value==='string'&&value.length<=200;
/** Validate identifiers, syntax, dependencies and finite resource limits before storage. */
export function validateDemonstration(program) {
 try {
  if(!record(program))throw Error('Demonstration requires a program object: {version:1, parameters, definitions, views}');
  if(program.version!==1)throw Error('Demonstration requires version 1 inside program');
  if(program.resetKey!==undefined&&(typeof program.resetKey!=='string'||program.resetKey.length>80))throw Error('resetKey must be a string of at most 80 characters');
  if(JSON.stringify(program).length>40000)throw Error('Demonstration is too large');
  const params=program.parameters??[],definitions=program.definitions??{},dynamics=program.dynamics;
  if(!Array.isArray(params)||params.length>12||!record(definitions)||Object.keys(definitions).length>24)throw Error('Use at most 12 parameters and 24 definitions');
  const allowed=new Set(['x','y','t','pi','e']);
  for(const p of params){if(!record(p)||!name(p.id)||allowed.has(p.id)||!text(p.label)||!text(p.unit)||![p.min,p.max,p.value].every(finite)||p.min>=p.max||p.value<p.min||p.value>p.max||p.step!==undefined&&(!finite(p.step)||p.step<=0))throw Error('Invalid demonstration parameter');allowed.add(p.id);}
  const check=(expression,scope=allowed)=>{const ast=parseDemonstrationExpression(expression);expressionNames(ast,scope);return ast;};
  if(dynamics){
   if(!record(dynamics)||!record(dynamics.initial)||!record(dynamics.derivatives)||!finite(dynamics.duration)||dynamics.duration<=0||dynamics.duration>30||!finite(dynamics.step)||dynamics.step<.002||dynamics.step>.05||Math.ceil(dynamics.duration/dynamics.step)>10000)throw Error('Dynamics needs duration ≤30 s, step 0.002–0.05 s and ≤10000 steps');
   const keys=Object.keys(dynamics.initial);if(!keys.length||keys.length>6||Object.keys(dynamics.derivatives).length!==keys.length)throw Error('Dynamics supports 1–6 matching initial states and derivatives');
   for(const key of keys){if(!name(key)||allowed.has(key))throw Error('Invalid dynamics state');check(dynamics.initial[key]);}
   keys.forEach(key=>allowed.add(key));
  }
  for(const [key,value] of Object.entries(definitions)){if(!name(key)||allowed.has(key))throw Error('Invalid or duplicate definition');check(value);allowed.add(key);}
  if(dynamics)for(const key of Object.keys(dynamics.initial))check(dynamics.derivatives[key]);
  const views=program.views;if(!Array.isArray(views)||!views.length||views.length>8)throw Error('Demonstration requires 1–8 views');let fields=0,curves=0,controls=0;
  for(const view of views){
   if(!record(view)||!text(view.label)||!text(view.xLabel)||!text(view.yLabel))throw Error('Invalid view labels');
   if(view.kind==='controls'){controls++;continue;}
   if(view.kind==='metrics'){if(!Array.isArray(view.values)||view.values.length>6||!view.values.length)throw Error('Use 1–6 metrics');for(const m of view.values){if(!record(m)||!text(m.label)||!text(m.unit)||m.digits!==undefined&&(!Number.isInteger(m.digits)||m.digits<0||m.digits>5))throw Error('Invalid metric');check(m.expression);}continue;}
   if(!range(view.x)||!range(view.y))throw Error('Every plot/field/trajectory requires increasing x/y ranges');
   view.x.forEach(v=>check(v));view.y.forEach(v=>check(v));
   if(view.kind==='field'){fields++;check(view.expression);if(view.gamma!==undefined)check(view.gamma);if(view.exposure!==undefined)check(view.exposure);if(view.vector!==undefined){if(!Array.isArray(view.vector)||view.vector.length!==2)throw Error('Field vector needs two expressions');view.vector.forEach(v=>check(v));}if(view.height!==undefined&&(!finite(view.height)||view.height<64||view.height>320))throw Error('Field height must be 64–320');if(view.palette!==undefined&&!['light','signed','heat'].includes(view.palette))throw Error('Unknown field palette');if(view.tint!==undefined&&(!Array.isArray(view.tint)||view.tint.length!==3||view.tint.some(v=>!finite(v)||v<0||v>1)))throw Error('Field tint is three 0–1 color channels');}
   else if(view.kind==='plot'){if(!Array.isArray(view.curves)||!view.curves.length||view.curves.length>6)throw Error('Use 1–6 curves per plot');for(const c of view.curves){if(!record(c)||!text(c.label))throw Error('Invalid curve');check(c.expression);curves++;}if(view.markers!==undefined){if(!Array.isArray(view.markers)||view.markers.length>8)throw Error('Use at most 8 markers');for(const m of view.markers){if(!record(m)||!text(m.label))throw Error('Invalid marker');check(m.x);check(m.y);}}}
   else if(view.kind==='trajectory'){if(!dynamics)throw Error('Trajectory requires dynamics');check(view.horizontal);check(view.vertical);}
   else throw Error('Unknown demonstration view kind');
  }
  if(fields>2||curves>12||controls>1)throw Error('Use at most two field views, twelve curves and one controls slot');
  if(program.duration!==undefined&&(!finite(program.duration)||program.duration<=0||program.duration>30))throw Error('Duration must be 0–30 s');
  if(program.presets!==undefined){if(!Array.isArray(program.presets)||program.presets.length>4)throw Error('Use at most four presets');for(const preset of program.presets){if(!record(preset)||!text(preset.label)||!record(preset.values))throw Error('Invalid preset');for(const [key,value] of Object.entries(preset.values)){const p=params.find(p=>p.id===key);if(!p||!finite(value)||value<p.min||value>p.max)throw Error('Invalid preset value');}}}
  return {ok:true};
 }catch(error){return {ok:false,error:error instanceof Error?error.message:'Invalid demonstration'};}
}
/** Compile once and prepare generic RK4 dynamics once per parameter set. */
export function createDemonstrationRuntime(program,values={}) {
 const validation=validateDemonstration(program);if(!validation.ok)throw Error(validation.error);
 const compiled=new Map(),budget={remaining:4000000};
 const compile=expression=>{const key=String(expression);if(!compiled.has(key))compiled.set(key,parseDemonstrationExpression(expression));return compiled.get(key);};
 const params=Object.fromEntries((program.parameters??[]).map(p=>[p.id,finite(values[p.id])?Math.max(p.min,Math.min(p.max,values[p.id])):p.value]));
 const evalRaw=(expression,scope)=>evaluateDemonstrationExpression(compile(expression),scope,budget);
 const definitions=Object.entries(program.definitions??{});
 const scopeAt=(t=0,x=0,y=0,state={})=>{const scope={...params,x,y,t,...state};for(const [key,expression]of definitions)scope[key]=evalRaw(expression,scope);return scope;};
 let trajectory=[];const dynamics=program.dynamics,duration=dynamics?.duration??program.duration??0;
 if(dynamics){
  const names=Object.keys(dynamics.initial),step=dynamics.duration/Math.ceil(dynamics.duration/dynamics.step);
  let state=Object.fromEntries(names.map(key=>[key,evalRaw(dynamics.initial[key],{...params,x:0,y:0,t:0})]));
  const derivative=(s,t)=>{const scope=scopeAt(t,0,0,s);return Object.fromEntries(names.map(key=>[key,evalRaw(dynamics.derivatives[key],scope)]));};
  const add=(s,k,factor)=>Object.fromEntries(names.map(key=>[key,s[key]+factor*k[key]]));
  trajectory=[{t:0,state}];
  for(let i=1;i<=Math.ceil(dynamics.duration/step);i++){
   const t=(i-1)*step,k1=derivative(state,t),k2=derivative(add(state,k1,step/2),t+step/2),k3=derivative(add(state,k2,step/2),t+step/2),k4=derivative(add(state,k3,step),t+step);
   state=Object.fromEntries(names.map(key=>[key,state[key]+step/6*(k1[key]+2*k2[key]+2*k3[key]+k4[key])]));
   if(Object.values(state).some(v=>!finite(v)||Math.abs(v)>1e12))throw Error('Dynamics diverged; reduce the time step or revise the equations');
   trajectory.push({t:i*step,state});
  }
 }
 const stateAt=t=>{if(!trajectory.length)return {};const index=Math.max(0,Math.min(trajectory.length-1,t/duration*(trajectory.length-1))),i=Math.floor(index),f=index-i,a=trajectory[i].state,b=trajectory[Math.min(i+1,trajectory.length-1)].state;return Object.fromEntries(Object.keys(a).map(key=>[key,a[key]+(b[key]-a[key])*f]));};
 return {duration,parameters:params,resetBudget(){budget.remaining=4000000;}, evaluate(expression,t=0,x=0,y=0){return evalRaw(expression,scopeAt(t,x,y,stateAt(t)));}, stateAt};
}

/** Axis bounds can follow parameter/state-dependent expressions. */
export function demonstrationDomain(bounds,runtime,time=0){
 const values=bounds.map(value=>runtime.evaluate(value,time));
 if(values.some(value=>!Number.isFinite(value)||Math.abs(value)>1e6)||values[0]>=values[1])throw Error('Axis bounds must be finite and increasing');
 return values;
}
