/** Bounded mathematical programs. No eval, generated JS, imports or DOM access. */
const SAFE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const RESERVED = new Set(['x','y','t','pi','e','constructor','prototype','__proto__']);
const unary = { sin:Math.sin, cos:Math.cos, tan:Math.tan, asin:Math.asin, acos:Math.acos, atan:Math.atan, sqrt:Math.sqrt, abs:Math.abs, exp:Math.exp, log:Math.log, log10:Math.log10, floor:Math.floor, ceil:Math.ceil, round:Math.round, sign:Math.sign, sinh:Math.sinh, cosh:Math.cosh, tanh:Math.tanh };
let airyTable;
function j1(x) { let s=0; for(let i=0;i<128;i++){const t=(i+.5)*Math.PI/128;s+=Math.cos(t-x*Math.sin(t));}return s/128; }
function airy(r) {
  airyTable ??= Float64Array.from({length:8193},(_,i)=>i===0?1:(2*j1(i/512)/ (i/512))**2);
  const u=Math.abs(r), i=u*512, lo=Math.floor(i);
  if(!Number.isFinite(u))return Number.NaN;
  if(lo>=airyTable.length-1){const phase=u-3*Math.PI/4;return 8/(Math.PI*u**3)*(Math.cos(phase)-3/(8*u)*Math.sin(phase))**2;}
  return airyTable[lo]+(airyTable[lo+1]-airyTable[lo])*(i-lo);
}
/* Core functions reserve their names: parameters, definitions and states may
   not reuse them, so `sin x` without parentheses is unambiguous. */
const functions = {
 ...unary, pow:Math.pow, min:Math.min, max:Math.max, atan2:Math.atan2, hypot:Math.hypot,
 clamp:(v,a,b)=>Math.max(a,Math.min(b,v)), sinc:x=>Math.abs(x)<1e-7?1-x*x/6:Math.sin(x)/x,
 // Normalized sin(nz)/(n sin z), with the removable singularities filled in.
 sinratio:(n,z)=>!Number.isInteger(n)||n<1||n>128?Number.NaN:Math.abs(Math.sin(z))<1e-8?Math.cos(n*z)/Math.cos(z):Math.sin(n*z)/(n*Math.sin(z)),
 besselJ1:j1, airy,
};
const arity = { pow:2, atan2:2, clamp:3, sinc:1, sinratio:2, besselJ1:1, airy:1 };
/* Extra functions and spellings models commonly write. They are recognised
   only in call position, so they never reserve an identifier that an
   existing program may already use as a parameter name. */
const extraFunctions = { log2:Math.log2, cbrt:Math.cbrt, trunc:Math.trunc, asinh:Math.asinh, acosh:Math.acosh, atanh:Math.atanh, sec:x=>1/Math.cos(x), csc:x=>1/Math.sin(x), cot:x=>Math.cos(x)/Math.sin(x), mod:(a,b)=>((a%b)+b)%b };
const extraArity = { mod:2 };
const aliases = { ln:'log', lg:'log10', arcsin:'asin', arccos:'acos', arctan:'atan', arctan2:'atan2', sgn:'sign', power:'pow' };
const SPECIAL = ['sum','if','iterate'];
const callable=name=>Object.hasOwn(functions,name)||Object.hasOwn(extraFunctions,name)||SPECIAL.includes(name)?name:Object.hasOwn(aliases,name)?aliases[name]:null;
const expectedArity=name=>name==='sum'||name==='iterate'?4:name==='if'?3:arity[name]??extraArity[name]??(Object.hasOwn(unary,name)||Object.hasOwn(extraFunctions,name)?1:null);
const precedence={ '||':1,'&&':2,'==':3,'!=':3,'<':4,'>':4,'<=':4,'>=':4,'+':5,'-':5,'*':6,'/':6,'%':6,'^':8 };
// Implicit multiplication (2x, 2(x+1), 2 pi r) binds tighter than * and /,
// so 1/2m reads as 1/(2m), but looser than ^ and unary minus.
const IMPLICIT=7;
/** Loop limits for sum() and iterate(); the operation budget still bounds total work. */
export const DEMONSTRATION_LOOP_LIMIT=1000;
const BUDGET=4000000,DYNAMICS_BUDGET=12000000;

/* ---------- Expression normalization ---------- */
const SUPERSCRIPT={'⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9','⁻':'-','⁺':'+','ⁿ':'n','ˣ':'x','ᵗ':'t'};
const GREEK={'α':'alpha','β':'beta','γ':'gamma','δ':'delta','ε':'epsilon','ϵ':'epsilon','ζ':'zeta','η':'eta','θ':'theta','ϑ':'theta','ι':'iota','κ':'kappa','λ':'lambda','μ':'mu','ν':'nu','ξ':'xi','ρ':'rho','σ':'sigma','ς':'sigma','τ':'tau','υ':'upsilon','φ':'phi','ϕ':'phi','χ':'chi','ψ':'psi','ω':'omega','Γ':'Gamma','Δ':'Delta','Θ':'Theta','Λ':'Lambda','Ξ':'Xi','Σ':'Sigma','Φ':'Phi','Ψ':'Psi','Ω':'Omega'};
const GREEK_PATTERN=new RegExp(`[${Object.keys(GREEK).join('')}π]`,'g');
const letter=char=>Boolean(char)&&/[A-Za-z]/.test(char);
const alnum=char=>Boolean(char)&&/[A-Za-z0-9_]/.test(char);
function transliterate(text,spaced){
 return text.replace(GREEK_PATTERN,(char,offset,whole)=>{
  const name=char==='π'?'pi':GREEK[char];if(!spaced)return name;
  const before=whole[offset-1],after=whole[offset+1];
  // ωt → omega t and kθ → k theta, but θ0 stays the identifier theta0.
  return (letter(before)?' ':'')+name+((char==='π'?alnum(after):letter(after))?' ':'');
 });
}
/**
 * Rewrite the notation models commonly emit into the evaluator's ASCII
 * grammar: unicode operators and superscripts, full-width characters, Greek
 * letters, π, °, √, `**`, `Math.*` names and a leading `y =`/`f(x) =`.
 * It never adds capabilities; the result still goes through the parser.
 * Idempotent: normalizing an already normalized expression changes nothing.
 */
export function normalizeDemonstrationExpression(source){
 if(typeof source!=='string')return source;
 let text=source.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿˣᵗ]+/g,run=>`^(${[...run].map(char=>SUPERSCRIPT[char]).join('')})`);
 text=text.normalize('NFKC');
 text=text.replace(/[×·⋅∙✕✖∗]/g,'*').replace(/[÷∕]/g,'/').replace(/[−–—‒﹣]/g,'-')
  .replace(/≤|⩽/g,'<=').replace(/≥|⩾/g,'>=').replace(/≠/g,'!=');
 text=transliterate(text,true);
 text=text.replace(/√\s*\(/g,'sqrt(').replace(/√\s*([A-Za-z0-9_.]+)/g,'sqrt($1)').replace(/∛\s*\(/g,'cbrt(').replace(/∛\s*([A-Za-z0-9_.]+)/g,'cbrt($1)');
 text=text.replace(/°/g,'*(pi/180)');
 text=text.replace(/\bMath\.PI\b/g,'pi').replace(/\bMath\.E\b/g,'e').replace(/\bMath\.([A-Za-z]\w*)/g,'$1').replace(/\bPI\b/g,'pi');
 text=text.replace(/\*\*/g,'^').replace(/===/g,'==').replace(/!==/g,'!=');
 // "y = sin(x)" or "f(x) = x^2": keep the right-hand side.
 text=text.replace(/^\s*(?:y|[A-Za-z]\w*\s*\([^()]*\))\s*=(?!=)/,'');
 return text.replace(/;\s*$/,'').trim();
}
/** Bring an identifier written with Greek letters or full-width characters to ASCII. */
export function normalizeDemonstrationIdentifier(value){
 if(typeof value!=='string')return value;
 return transliterate(value.normalize('NFKC').trim(),false);
}

/* ---------- Parser ---------- */
export function parseDemonstrationExpression(input) {
 if(typeof input==='number'){if(Number.isFinite(input))return {kind:'number',value:input};throw Error('Numeric literal must be finite');}
 if(typeof input!=='string'||!input.trim())throw Error('Expression must be a number or a non-empty mathematical string');
 const source=normalizeDemonstrationExpression(input);
 if(!source||source.length>1600)throw Error('Expression must be 1–1600 mathematical characters');
 const tokens=[];let offset=0;
 while(offset<source.length){
  const match=/^\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z][A-Za-z0-9_]*)|(<=|>=|==|!=|&&|\|\||[+\-*/%^(),<>?:!]))/.exec(source.slice(offset));
  if(!match){if(source.slice(offset).trim()==='')break;throw Error(`Unsupported expression syntax near "${source.slice(offset).trim().slice(0,12)}"`);}
  if(match[1]&&!Number.isFinite(Number(match[1])))throw Error('Numeric literal must be finite');
  tokens.push(match[1]?{number:Number(match[1])}:match[2]?{name:match[2]}:{op:match[3]});offset+=match[0].length;
  if(tokens.length>320)throw Error('Expression token budget exceeded');
 }
 let index=0,depth=0;
 const consume=op=>{if(tokens[index]?.op!==op)throw Error(`Expected ${op}`);index++;};
 const startsValue=token=>Boolean(token)&&(token.number!==undefined||token.name!==undefined||token.op==='('||token.op==='-'||token.op==='+');
 function primary(){
  const token=tokens[index++];if(!token)throw Error('Incomplete expression');
  if(token.number!==undefined)return {kind:'number',value:token.number};
  if(token.op==='+'||token.op==='-'||token.op==='!')return {kind:'unary',op:token.op,arg:expression(7)};
  if(token.op==='('){const node=expression();consume(')');return node;}
  if(token.name!==undefined){
   const written=token.name;
   if(tokens[index]?.op==='('){
    const name=callable(written);
    index++;const args=[];
    if(tokens[index]?.op!==')')do{args.push(expression());if(tokens[index]?.op!==',')break;index++;}while(true);
    consume(')');
    if(!name){
     // Definitions already depend on x, y and t: f(x) means f. A(1-x) is A*(1-x).
     if(args.length&&args.every(arg=>arg.kind==='variable'&&['x','y','t'].includes(arg.name)))return {kind:'variable',name:written};
     if(args.length===1&&!['constructor','prototype','__proto__'].includes(written))return {kind:'binary',op:'*',left:{kind:'variable',name:written},right:args[0]};
     throw Error(`Unknown mathematical function: ${written}`);
    }
    const expected=expectedArity(name);
    if(expected===null?args.length===0||args.length>8:args.length!==expected)throw Error(`Wrong argument count: ${written} takes ${expected??'1–8'} argument${expected===1?'':'s'}`);
    if(['sum','iterate'].includes(name)&&(args[0]?.kind!=='variable'||!SAFE.test(args[0].name)||RESERVED.has(args[0].name)))throw Error('sum/iterate needs a safe local variable as its first argument');
    return {kind:'call',name,args};
   }
   // "sin x" and "sin 2x": a core one-argument function without parentheses.
   if(Object.hasOwn(unary,written)&&startsValue(tokens[index]))return {kind:'call',name:written,args:[expression(IMPLICIT)]};
   return {kind:'variable',name:written};
  }
  throw Error(`Expected a mathematical value${token.op?` before "${token.op}"`:''}`);
 }
 function expression(min=0){
  if(++depth>32)throw Error('Expression nesting budget exceeded');
  let node=primary();
  for(;;){
   const token=tokens[index];
   if(token?.op!==undefined&&Object.hasOwn(precedence,token.op)&&precedence[token.op]>=min){
    index++;const p=precedence[token.op];node={kind:'binary',op:token.op,left:node,right:expression(token.op==='^'?p:p+1)};continue;
   }
   if(token&&(token.name!==undefined||token.op==='(')&&IMPLICIT>=min){node={kind:'binary',op:'*',left:node,right:expression(IMPLICIT+1)};continue;}
   if(token?.op==='?'&&min===0){index++;const yes=expression();consume(':');const no=expression();node={kind:'call',name:'if',args:[node,yes,no]};continue;}
   break;
  }
  depth--;return node;
 }
 const ast=expression();
 if(index!==tokens.length){const token=tokens[index];throw Error(`Unexpected ${token.op?`"${token.op}"`:token.name??token.number} after a complete expression`);}
 return ast;
}

/* ---------- Evaluator ---------- */
/** Scopes may be chained (sum/iterate locals, lazy definitions); never read Object.prototype. */
function lookup(scope,name){
 for(let current=scope;current&&current!==Object.prototype;current=Object.getPrototypeOf(current))if(Object.hasOwn(current,name))return current[name];
 throw Error(`Unknown variable: ${name}`);
}
const budgetError=()=>Error('Demonstration calculation budget exceeded');
/** True for the resource-limit error, which callers retry at a coarser resolution. */
export function isDemonstrationBudgetError(error){return error instanceof Error&&error.message.includes('budget exceeded');}
export function evaluateDemonstrationExpression(ast, scope, budget={remaining:2000000}) {
 if(--budget.remaining<0)throw budgetError();
 const run=node=>evaluateDemonstrationExpression(node,scope,budget);
 if(ast.kind==='number')return ast.value;
 if(ast.kind==='variable'){if(ast.name==='pi')return Math.PI;if(ast.name==='e')return Math.E;const value=lookup(scope,ast.name);return typeof value==='number'?value:Number(value);}
 if(ast.kind==='unary'){const value=run(ast.arg);return ast.op==='-'?-value:ast.op==='!'?+!value:+value;}
 if(ast.kind==='binary'){
  const a=run(ast.left);if(ast.op==='&&')return a?run(ast.right):0;if(ast.op==='||')return a||run(ast.right);const b=run(ast.right);
  switch(ast.op){case '+':return a+b;case '-':return a-b;case '*':return a*b;case '/':return a/b;case '%':return a%b;case '^':return a**b;case '<':return +(a<b);case '>':return +(a>b);case '<=':return +(a<=b);case '>=':return +(a>=b);case '==':return +(a===b);case '!=':return +(a!==b);}
  throw Error(`Unknown operator ${ast.op}`);
 }
 if(ast.name==='if')return run(ast.args[0])?run(ast.args[1]):run(ast.args[2]);
 if(ast.name==='sum'||ast.name==='iterate'){
  // The loop variable shadows the outer scope through the prototype chain, so
  // lazily evaluated definitions are computed once, not once per term.
  const key=ast.args[0].name,local=Object.create(scope);
  Object.defineProperty(local,key,{value:0,writable:true,enumerable:true,configurable:true});
  if(ast.name==='sum'){
   const start=Math.ceil(run(ast.args[1])),end=Math.floor(run(ast.args[2]));
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end))throw Error('sum bounds must be finite integers');
   if(end-start>=DEMONSTRATION_LOOP_LIMIT)throw Error(`sum supports at most ${DEMONSTRATION_LOOP_LIMIT} terms`);
   let result=0;for(let i=start;i<=end;i++){local[key]=i;result+=evaluateDemonstrationExpression(ast.args[3],local,budget);}return result;
  }
  let result=run(ast.args[1]);const raw=Math.floor(run(ast.args[2]));
  if(!Number.isFinite(raw))throw Error('iterate count must be a finite number');
  const count=Math.max(0,raw);if(count>DEMONSTRATION_LOOP_LIMIT)throw Error(`iterate supports 0–${DEMONSTRATION_LOOP_LIMIT} steps`);
  for(let i=0;i<count;i++){local[key]=result;result=evaluateDemonstrationExpression(ast.args[3],local,budget);}return result;
 }
 if(ast.name==='besselJ1'){budget.remaining-=127;if(budget.remaining<0)throw budgetError();}
 const fn=Object.hasOwn(functions,ast.name)?functions[ast.name]:Object.hasOwn(extraFunctions,ast.name)?extraFunctions[ast.name]:null;
 if(!fn)throw Error(`Unknown mathematical function: ${ast.name}`);
 return fn(...ast.args.map(run));
}
function expressionNames(ast,allowed,used){
 if(ast.kind==='variable'&&ast.name!=='pi'&&ast.name!=='e'){
  if(!allowed.has(ast.name)){
   const hint=[...allowed].find(name=>name.toLowerCase()===ast.name.toLowerCase());
   throw Error(`Unknown variable: ${ast.name}${hint?` (did you mean ${hint}?)`:''}`);
  }
  used?.add(ast.name);
 }
 if(ast.kind==='binary'){expressionNames(ast.left,allowed,used);expressionNames(ast.right,allowed,used);}
 if(ast.kind==='unary')expressionNames(ast.arg,allowed,used);
 if(ast.kind==='call'){
  if(['sum','iterate'].includes(ast.name)){expressionNames(ast.args[1],allowed,used);expressionNames(ast.args[2],allowed,used);expressionNames(ast.args[3],new Set([...allowed,ast.args[0].name]),used);}
  else ast.args.forEach(arg=>expressionNames(arg,allowed,used));
 }
}

/* ---------- Program normalization ---------- */
const record=value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const ITEM_KEYS=new Set(['item','items']);
/** `{item: X}` / `{items: [...]}` (XML-encoded tool arguments) → an array. */
function asArray(value){
 if(Array.isArray(value))return value;
 if(!record(value))return value;
 const keys=Object.keys(value);
 if(keys.length!==1||!ITEM_KEYS.has(keys[0]))return value;
 const inner=value[keys[0]];return Array.isArray(inner)?inner:[inner];
}
/** Numeric positions accept 12 and "12"; anything else is left for the validator. */
function numberLike(value){
 if(typeof value==='string'){const trimmed=value.trim();if(trimmed&&Number.isFinite(Number(trimmed)))return Number(trimmed);}
 return value;
}
const booleanLike=value=>value==='true'?true:value==='false'?false:value;
/** Expressions accept numbers, numeric strings and mathematical strings. */
function expressionLike(value){
 if(typeof value==='string'){const number=numberLike(value);return typeof number==='number'?number:normalizeDemonstrationExpression(value);}
 return value;
}
const textLike=value=>typeof value==='number'?String(value):typeof value==='string'?value.slice(0,200):value;
const first=(object,keys)=>{for(const key of keys)if(object[key]!==undefined)return object[key];return undefined;};
/** `{a: 1}` stays a map; `[{name:"a", expression:1}]` becomes one. */
function namedMap(value,valueKeys){
 const list=asArray(value);
 if(!Array.isArray(list))return record(list)?Object.fromEntries(Object.entries(list).map(([key,item])=>[normalizeDemonstrationIdentifier(key),item])):list;
 const out={};
 for(const item of list){if(!record(item))return list;const key=first(item,['name','id','key','state']);if(typeof key!=='string')return list;out[normalizeDemonstrationIdentifier(key)]=first(item,valueKeys);}
 return out;
}
const mapValues=(value,fn)=>record(value)?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,fn(item)])):value;
/** Two-element numeric/expression range; {min,max} objects are accepted too. */
function rangeLike(value){
 let list=asArray(value);
 if(record(list)&&(list.min!==undefined||list.max!==undefined))list=[list.min,list.max];
 if(!Array.isArray(list))return value;
 list=list.map(expressionLike);
 if(list.length===2&&list.every(finite)){
  let [a,b]=list;if(a>b)[a,b]=[b,a];
  if(a===b){const pad=a===0?1:Math.abs(a)*.1;a-=pad;b+=pad;}
  list=[a,b];
 }
 return list;
}
const VIEW_KINDS={plot:'plot',graph:'plot',chart:'plot',line:'plot',curve:'plot',curves:'plot',function:'plot',field:'field',heatmap:'field',image:'field',raster:'field',map:'field',trajectory:'trajectory',phase:'trajectory',orbit:'trajectory',path:'trajectory',metrics:'metrics',metric:'metrics',readout:'metrics',readouts:'metrics',values:'metrics',controls:'controls',control:'controls',sliders:'controls',parameters:'controls'};
function normalizeParameter(raw){
 if(!record(raw))return raw;
 const p={...raw};
 const id=first(p,['id','name','key']);if(typeof id==='string')p.id=normalizeDemonstrationIdentifier(id);
 delete p.name;delete p.key;
 for(const key of ['label','unit'])if(p[key]!==undefined)p[key]=textLike(p[key]);
 let min=numberLike(p.min),max=numberLike(p.max),value=numberLike(first(p,['value','default','initial']));
 delete p.default;delete p.initial;
 if(finite(value)&&!finite(min)&&!finite(max)){min=value>0?0:value<0?2*value:-1;max=value>0?2*value:value<0?0:1;}
 if(finite(min)&&finite(max)){
  if(min>max)[min,max]=[max,min];
  if(min===max){const pad=min===0?1:Math.abs(min)*.5;min-=pad;max+=pad;}
  if(!finite(value))value=(min+max)/2;
  value=Math.max(min,Math.min(max,value));
 }
 p.min=min;p.max=max;p.value=value;
 const step=numberLike(p.step);
 if(step===undefined||step===null||!finite(step)||step<=0)delete p.step;else p.step=step;
 if(p.advanced!==undefined)p.advanced=booleanLike(p.advanced)===true;
 return p;
}
function normalizeView(raw){
 if(typeof raw==='string'&&VIEW_KINDS[raw.trim().toLowerCase()])return {kind:VIEW_KINDS[raw.trim().toLowerCase()]};
 if(!record(raw))return raw;
 const view={...raw};
 const kind=first(view,['kind','type']);
 if(typeof kind==='string'){const canonical=VIEW_KINDS[kind.trim().toLowerCase()];view.kind=canonical??kind;if(view.type===kind)delete view.type;}
 for(const key of ['label','xLabel','yLabel'])if(view[key]!==undefined)view[key]=textLike(view[key]);
 if(view.x===undefined&&view.xRange!==undefined){view.x=view.xRange;delete view.xRange;}
 if(view.y===undefined&&view.yRange!==undefined){view.y=view.yRange;delete view.yRange;}
 if(view.x===undefined&&view.domain!==undefined&&view.kind==='plot'){view.x=view.domain;delete view.domain;}
 if(view.kind!=='metrics'&&view.kind!=='controls'){
  if(view.x!==undefined)view.x=rangeLike(view.x);
  if(view.y!==undefined)view.y=rangeLike(view.y);
 }
 if(view.kind==='plot'){
  let curves=asArray(view.curves);
  if(curves===undefined&&view.expression!==undefined){curves=[{expression:view.expression}];delete view.expression;}
  if(typeof curves==='string'||typeof curves==='number'||record(curves))curves=[curves];
  if(Array.isArray(curves))view.curves=curves.map(curve=>{
   if(typeof curve==='string'||typeof curve==='number')return {expression:expressionLike(curve)};
   if(!record(curve))return curve;
   const out={...curve,expression:expressionLike(first(curve,['expression','expr','y','f','value','formula']))};
   for(const key of ['expr','y','f','value','formula'])delete out[key];
   if(out.label!==undefined)out.label=textLike(out.label);
   if(out.dashed!==undefined)out.dashed=booleanLike(out.dashed)===true;
   if(typeof out.color==='string')out.color=out.color.trim().toLowerCase();
   return out;
  });
  const markers=asArray(view.markers);
  if(Array.isArray(markers))view.markers=markers.map(marker=>record(marker)?{...marker,x:expressionLike(marker.x),y:expressionLike(marker.y),...(marker.label!==undefined?{label:textLike(marker.label)}:{})}:marker);
 }
 if(view.kind==='field'){
  if(view.expression!==undefined)view.expression=expressionLike(view.expression);
  for(const key of ['gamma','exposure'])if(view[key]!==undefined)view[key]=expressionLike(view[key]);
  const vector=asArray(view.vector);if(Array.isArray(vector))view.vector=vector.map(expressionLike);
  const tint=asArray(view.tint);if(Array.isArray(tint))view.tint=tint.map(numberLike).map(v=>finite(v)?Math.max(0,Math.min(1,v>1&&v<=255?v/255:v)):v);
  if(view.height!==undefined){const height=numberLike(view.height);view.height=finite(height)?Math.max(64,Math.min(320,Math.round(height))):height;}
  if(typeof view.palette==='string')view.palette=view.palette.trim().toLowerCase();
 }
 if(view.kind==='trajectory'){
  for(const key of ['horizontal','vertical'])if(view[key]!==undefined)view[key]=expressionLike(view[key]);
 }
 if(view.kind==='metrics'){
  let values=asArray(view.values);
  if(values===undefined&&view.metrics!==undefined){values=asArray(view.metrics);delete view.metrics;}
  if(record(values))values=[values];
  if(Array.isArray(values))view.values=values.map(metric=>{
   if(typeof metric==='string'||typeof metric==='number')return {label:'',expression:expressionLike(metric)};
   if(!record(metric))return metric;
   const out={...metric,expression:expressionLike(first(metric,['expression','expr','value','formula']))};
   delete out.expr;delete out.value;delete out.formula;
   if(out.label!==undefined)out.label=textLike(out.label);else out.label='';
   if(out.unit!==undefined)out.unit=textLike(out.unit);
   if(out.digits!==undefined){const digits=numberLike(out.digits);out.digits=finite(digits)?Math.max(0,Math.min(5,Math.round(digits))):digits;}
   return out;
  });
 }
 return view;
}
/**
 * Repair a model-authored program before the strict validator runs: XML
 * `{item: [...]}` collections, quoted numbers, reversed or empty ranges,
 * parameter defaults outside their range, common field aliases and unicode
 * notation in expressions. It only changes encodings; anything it cannot
 * repair still fails validation with a located message. Idempotent.
 */
export function normalizeDemonstrationProgram(input){
 let source=input;
 if(typeof source==='string'){try{source=JSON.parse(source);}catch{return input;}}
 if(!record(source))return input;
 // A whole node {type:"demonstration", program:{...}} passed as the program.
 if(source.views===undefined&&record(source.program))source=source.program;
 const out={...source};
 out.version=out.version===undefined?1:numberLike(out.version);
 if(typeof out.resetKey==='number')out.resetKey=String(out.resetKey);
 let parameters=asArray(out.parameters);
 if(record(parameters))parameters=Object.entries(parameters).map(([id,spec])=>record(spec)?{id,...spec}:{id,value:spec});
 if(Array.isArray(parameters))out.parameters=parameters.map(normalizeParameter);
 if(out.definitions!==undefined)out.definitions=mapValues(namedMap(out.definitions,['expression','expr','value','formula']),expressionLike);
 if(record(out.dynamics)){
  const dynamics={...out.dynamics};
  dynamics.initial=mapValues(namedMap(dynamics.initial,['value','initial','expression']),expressionLike);
  dynamics.derivatives=mapValues(namedMap(dynamics.derivatives,['expression','derivative','value','expr']),expressionLike);
  let duration=numberLike(dynamics.duration),step=numberLike(dynamics.step);
  if(finite(duration)&&duration>30)duration=30;
  if(finite(step))step=Math.max(.002,Math.min(.05,step));
  if(finite(duration)&&finite(step)&&duration>0&&Math.ceil(duration/step)>10000)step=Math.min(.05,duration/10000);
  dynamics.duration=duration;dynamics.step=step;
  out.dynamics=dynamics;
 }
 let views=asArray(out.views);
 if(record(views)&&(views.kind!==undefined||views.type!==undefined))views=[views];
 if(Array.isArray(views))out.views=views.map(normalizeView);
 if(out.duration!==undefined){const duration=numberLike(out.duration);out.duration=finite(duration)&&duration>30?30:duration;}
 const presets=asArray(out.presets);
 if(Array.isArray(presets))out.presets=presets.map(preset=>{
  if(!record(preset))return preset;
  const values=mapValues(namedMap(preset.values,['value']),numberLike);
  if(record(values)&&Array.isArray(out.parameters))for(const [key,value] of Object.entries(values)){
   const p=out.parameters.find(p=>record(p)&&p.id===key);
   if(p&&finite(value)&&finite(p.min)&&finite(p.max))values[key]=Math.max(p.min,Math.min(p.max,value));
  }
  return {...preset,...(preset.label!==undefined?{label:textLike(preset.label)}:{}),values};
 });
 return out;
}

/* ---------- Validation ---------- */
const name=value=>typeof value==='string'&&SAFE.test(value)&&!RESERVED.has(value)&&!Object.hasOwn(functions,value);
const range=value=>Array.isArray(value)&&value.length===2&&value.every(v=>finite(v)&&Math.abs(v)<=1e6||typeof v==='string')&&(!value.every(finite)||value[0]<value[1]);
const text=value=>value===undefined||typeof value==='string'&&value.length<=200;
/** An error that remembers which part of the program it belongs to. */
function located(path,error){
 const message=error instanceof Error?error.message:String(error);
 const result=Error(`${path}: ${message}`);result.path=path;result.detail=message;return result;
}
const at=(path,fn)=>{try{return fn();}catch(error){if(error instanceof Error&&error.path)throw error;throw located(path,error);}};
/** Validate identifiers, syntax, dependencies and finite resource limits before storage. */
export function validateDemonstration(input) {
 try {
  if(!record(input)&&typeof input!=='string')throw Error('Demonstration requires a program object: {version:1, parameters, definitions, views}');
  const program=normalizeDemonstrationProgram(input);
  if(!record(program))throw Error('Demonstration requires a program object: {version:1, parameters, definitions, views}');
  if(program.version!==1)throw located('version',Error('Demonstration requires version 1 inside program'));
  if(program.resetKey!==undefined&&(typeof program.resetKey!=='string'||program.resetKey.length>80))throw located('resetKey',Error('resetKey must be a string of at most 80 characters'));
  if(JSON.stringify(program).length>40000)throw Error('Demonstration is too large');
  const params=program.parameters??[],definitions=program.definitions??{},dynamics=program.dynamics;
  if(!Array.isArray(params)||params.length>12)throw located('parameters',Error('Use a list of at most 12 parameters'));
  if(!record(definitions)||Object.keys(definitions).length>24)throw located('definitions',Error('Use a map of at most 24 definitions'));
  const allowed=new Set(['x','y','t','pi','e']);
  params.forEach((p,i)=>at(`parameters.${record(p)&&typeof p.id==='string'?p.id:`[${i}]`}`,()=>{
   if(!record(p))throw Error('Parameter must be an object');
   if(!name(p.id))throw Error(`id must be an ASCII identifier that is not x, y, t, pi, e or a function name`);
   if(allowed.has(p.id))throw Error('Duplicate or reserved parameter id');
   if(!text(p.label)||!text(p.unit))throw Error('label and unit must be text of at most 200 characters');
   if(![p.min,p.max,p.value].every(finite))throw Error('min, max and value must be numbers');
   if(p.min>=p.max||p.value<p.min||p.value>p.max)throw Error('Needs min < max and value inside [min, max]');
   if(p.step!==undefined&&(!finite(p.step)||p.step<=0))throw Error('step must be a positive number');
   allowed.add(p.id);
  }));
  const check=(expression,scope=allowed,used)=>{const ast=parseDemonstrationExpression(expression);expressionNames(ast,scope,used);return ast;};
  if(dynamics!==undefined){
   at('dynamics',()=>{
    if(!record(dynamics)||!record(dynamics.initial)||!record(dynamics.derivatives))throw Error('Dynamics needs initial and derivatives maps');
    if(!finite(dynamics.duration)||dynamics.duration<=0||dynamics.duration>30||!finite(dynamics.step)||dynamics.step<.002||dynamics.step>.05||Math.ceil(dynamics.duration/dynamics.step)>10000)throw Error('Dynamics needs duration ≤30 s, step 0.002–0.05 s and ≤10000 steps');
   });
   const keys=Object.keys(dynamics.initial);
   if(!keys.length||keys.length>6)throw located('dynamics.initial',Error('Dynamics supports 1–6 states'));
   for(const key of keys){
    at(`dynamics.initial.${key}`,()=>{if(!name(key)||allowed.has(key))throw Error('Invalid state name, or it collides with a parameter');check(dynamics.initial[key]);});
    if(dynamics.derivatives[key]===undefined)throw located(`dynamics.derivatives.${key}`,Error('Every state needs a derivative'));
   }
   for(const key of Object.keys(dynamics.derivatives))if(!keys.includes(key))throw located(`dynamics.derivatives.${key}`,Error('Derivative has no matching initial state'));
   keys.forEach(key=>allowed.add(key));
  }
  // Definitions may appear in any order; reject only genuine cycles.
  const defKeys=Object.keys(definitions);
  for(const key of defKeys)at(`definitions.${key}`,()=>{if(!name(key))throw Error('Definition name must be an ASCII identifier that is not x, y, t, pi, e or a function name');if(allowed.has(key))throw Error('Definition name collides with a parameter or state');});
  defKeys.forEach(key=>allowed.add(key));
  const dependencies=new Map();
  for(const [key,value] of Object.entries(definitions)){const used=new Set();at(`definitions.${key}`,()=>check(value,allowed,used));dependencies.set(key,[...used].filter(item=>dependencies.has(item)||defKeys.includes(item)));}
  const state=new Map();
  const visit=(key,trail)=>{
   if(state.get(key)===2)return;
   if(state.get(key)===1)throw located(`definitions.${key}`,Error(`Definitions form a cycle: ${[...trail.slice(trail.indexOf(key)),key].join(' → ')}`));
   state.set(key,1);for(const next of dependencies.get(key)??[])visit(next,[...trail,key]);state.set(key,2);
  };
  defKeys.forEach(key=>visit(key,[]));
  if(dynamics)for(const key of Object.keys(dynamics.initial))at(`dynamics.derivatives.${key}`,()=>check(dynamics.derivatives[key]));
  const views=program.views;
  if(!Array.isArray(views)||!views.length||views.length>8)throw located('views',Error('Demonstration requires 1–8 views'));
  let fields=0,curves=0,controls=0;
  views.forEach((view,i)=>{
   const path=`views[${i}]`;
   at(path,()=>{if(!record(view)||!text(view.label)||!text(view.xLabel)||!text(view.yLabel))throw Error('View must be an object with text labels of at most 200 characters');});
   if(view.kind==='controls'){controls++;return;}
   if(view.kind==='metrics'){
    if(!Array.isArray(view.values)||view.values.length>6||!view.values.length)throw located(`${path}.values`,Error('Use 1–6 metrics'));
    view.values.forEach((m,j)=>at(`${path}.values[${j}]`,()=>{if(!record(m)||!text(m.label)||!text(m.unit)||m.digits!==undefined&&(!Number.isInteger(m.digits)||m.digits<0||m.digits>5))throw Error('Metric needs label, expression, optional unit and digits 0–5');check(m.expression);}));
    return;
   }
   if(!['plot','field','trajectory'].includes(view.kind))throw located(`${path}.kind`,Error(`Unknown demonstration view kind "${String(view.kind).slice(0,40)}"; use controls, plot, field, trajectory or metrics`));
   for(const axis of ['x','y'])at(`${path}.${axis}`,()=>{if(!range(view[axis]))throw Error('Needs an increasing [min, max] range within ±1e6');view[axis].forEach(v=>check(v));});
   if(view.kind==='field'){
    fields++;at(`${path}.expression`,()=>check(view.expression));
    for(const key of ['gamma','exposure'])if(view[key]!==undefined)at(`${path}.${key}`,()=>check(view[key]));
    if(view.vector!==undefined)at(`${path}.vector`,()=>{if(!Array.isArray(view.vector)||view.vector.length!==2)throw Error('Field vector needs two expressions');view.vector.forEach(v=>check(v));});
    if(view.height!==undefined&&(!finite(view.height)||view.height<64||view.height>320))throw located(`${path}.height`,Error('Field height must be 64–320'));
    if(view.palette!==undefined&&!['light','signed','heat'].includes(view.palette))throw located(`${path}.palette`,Error('Unknown field palette; use light, signed or heat'));
    if(view.tint!==undefined&&(!Array.isArray(view.tint)||view.tint.length!==3||view.tint.some(v=>!finite(v)||v<0||v>1)))throw located(`${path}.tint`,Error('Field tint is three 0–1 color channels'));
   }else if(view.kind==='plot'){
    if(!Array.isArray(view.curves)||!view.curves.length||view.curves.length>6)throw located(`${path}.curves`,Error('Use 1–6 curves per plot'));
    view.curves.forEach((c,j)=>at(`${path}.curves[${j}]`,()=>{if(!record(c)||!text(c.label))throw Error('Curve needs an expression and an optional text label');check(c.expression);curves++;}));
    if(view.markers!==undefined){
     if(!Array.isArray(view.markers)||view.markers.length>8)throw located(`${path}.markers`,Error('Use at most 8 markers'));
     view.markers.forEach((m,j)=>at(`${path}.markers[${j}]`,()=>{if(!record(m)||!text(m.label))throw Error('Marker needs x, y and an optional text label');check(m.x);check(m.y);}));
    }
   }else{
    if(!dynamics)throw located(path,Error('Trajectory requires dynamics'));
    at(`${path}.horizontal`,()=>check(view.horizontal));at(`${path}.vertical`,()=>check(view.vertical));
   }
  });
  if(fields>2||curves>12||controls>1)throw located('views',Error('Use at most two field views, twelve curves and one controls slot'));
  if(program.duration!==undefined&&(!finite(program.duration)||program.duration<=0||program.duration>30))throw located('duration',Error('Duration must be 0–30 s'));
  if(program.presets!==undefined){
   if(!Array.isArray(program.presets)||program.presets.length>4)throw located('presets',Error('Use at most four presets'));
   program.presets.forEach((preset,i)=>at(`presets[${i}]`,()=>{
    if(!record(preset)||!text(preset.label)||!record(preset.values))throw Error('Preset needs a label and a values map');
    for(const [key,value] of Object.entries(preset.values)){const p=params.find(p=>p.id===key);if(!p)throw Error(`Unknown parameter ${key}`);if(!finite(value)||value<p.min||value>p.max)throw Error(`Value for ${key} must be a number inside its range`);}
   }));
  }
  return {ok:true};
 }catch(error){
  const message=error instanceof Error?error.message:'Invalid demonstration';
  return error instanceof Error&&error.path?{ok:false,error:message,path:error.path}:{ok:false,error:message};
 }
}

/* ---------- Runtime ---------- */
/** Compile once and prepare generic RK4 dynamics once per parameter set. */
export function createDemonstrationRuntime(input,values={}) {
 const program=normalizeDemonstrationProgram(input);
 const validation=validateDemonstration(program);
 if(!validation.ok){const error=Error(validation.error);if(validation.path)error.path=validation.path;throw error;}
 const compiled=new Map(),budget={remaining:BUDGET},warnings=[];
 const compile=expression=>{const key=typeof expression==='number'?`#${expression}`:String(expression);if(!compiled.has(key))compiled.set(key,parseDemonstrationExpression(expression));return compiled.get(key);};
 const params=Object.fromEntries((program.parameters??[]).map(p=>{const value=numberLike(values?.[p.id]);return [p.id,finite(value)?Math.max(p.min,Math.min(p.max,value)):p.value];}));
 const definitions=Object.entries(program.definitions??{});
 const scopeAt=(t,x,y,state,evaluate)=>{
  const scope=Object.assign(Object.create(null),params);
  scope.x=x;scope.y=y;scope.t=t;Object.assign(scope,state);
  // Definitions are evaluated once per sample, only when referenced. A field
  // must not calculate unrelated metrics/curves for every raster pixel.
  for(const [key,expression] of definitions){
   let busy=false;
   Object.defineProperty(scope,key,{enumerable:true,configurable:true,get(){
    if(busy)throw Error(`Definition ${key} refers to itself`);
    busy=true;let value;try{value=evaluate(expression,scope);}finally{busy=false;}
    Object.defineProperty(scope,key,{value,enumerable:true,configurable:true});return value;
   }});
  }
  return scope;
 };
 const evalRaw=(expression,scope)=>evaluateDemonstrationExpression(compile(expression),scope,budget);
 let trajectory=[],step=0;const dynamics=program.dynamics;let duration=dynamics?.duration??program.duration??0;
 if(dynamics){
  const names=Object.keys(dynamics.initial),count=Math.ceil(dynamics.duration/dynamics.step);step=dynamics.duration/count;
  // Integration has its own budget, so a long ODE does not starve the views.
  const dynamicsBudget={remaining:DYNAMICS_BUDGET};
  const evalDynamics=(expression,scope)=>evaluateDemonstrationExpression(compile(expression),scope,dynamicsBudget);
  const base=Object.assign(Object.create(null),params,{x:0,y:0,t:0});
  const state=Object.fromEntries(names.map(key=>{
   const value=at(`dynamics.initial.${key}`,()=>evalDynamics(dynamics.initial[key],base));
   if(!finite(value))throw located(`dynamics.initial.${key}`,Error('Initial state is not a finite number for these parameter values'));
   return [key,value];
  }));
  trajectory=[{t:0,state}];
  const derivative=(s,t)=>{const scope=scopeAt(t,0,0,s,evalDynamics);return Object.fromEntries(names.map(key=>[key,evalDynamics(dynamics.derivatives[key],scope)]));};
  const add=(s,k,factor)=>Object.fromEntries(names.map(key=>[key,s[key]+factor*k[key]]));
  let current=state;
  try{
   for(let i=1;i<=count;i++){
    const t=(i-1)*step,k1=derivative(current,t),k2=derivative(add(current,k1,step/2),t+step/2),k3=derivative(add(current,k2,step/2),t+step/2),k4=derivative(add(current,k3,step),t+step);
    const next=Object.fromEntries(names.map(key=>[key,current[key]+step/6*(k1[key]+2*k2[key]+2*k3[key]+k4[key])]));
    const bad=names.find(key=>!finite(next[key])||Math.abs(next[key])>1e12);
    if(bad){warnings.push({path:`dynamics.derivatives.${bad}`,time:t,message:`Dynamics diverged at t = ${Number(t.toFixed(3))} s (state ${bad}); reduce the time step or revise the equations`});break;}
    current=next;trajectory.push({t:i*step,state:current});
   }
  }catch(error){
   const t=(trajectory.length-1)*step;
   warnings.push({path:error instanceof Error&&error.path?error.path:'dynamics',time:t,message:`Dynamics stopped at t = ${Number(t.toFixed(3))} s: ${error instanceof Error?error.message:String(error)}`});
  }
  // Keep the valid part of the history; animations stop where it ends.
  const reached=(trajectory.length-1)*step;
  if(reached<dynamics.duration)duration=reached;
 }
 const stateAt=time=>{
  if(!trajectory.length)return {};
  const index=Math.max(0,Math.min(trajectory.length-1,(Number.isFinite(time)?time:0)/step)),i=Math.floor(index),f=index-i;
  const a=trajectory[i].state,b=trajectory[Math.min(i+1,trajectory.length-1)].state;
  return Object.fromEntries(Object.keys(a).map(key=>[key,a[key]+(b[key]-a[key])*f]));
 };
 return {
  duration,parameters:params,warnings,
  resetBudget(){budget.remaining=BUDGET;},
  evaluate(expression,t=0,x=0,y=0){return evalRaw(expression,scopeAt(t,x,y,stateAt(t),evalRaw));},
  stateAt,
 };
}

/** Axis bounds can follow parameter/state-dependent expressions. Reversed
 * bounds are swapped and equal bounds widened; a non-finite bound uses the
 * fallback when one is given (for example a range fitted to the samples). */
export function demonstrationDomain(bounds,runtime,time=0,fallback){
 let problem='';
 const values=bounds.map(value=>{try{return runtime.evaluate(value,time);}catch(error){problem||=error instanceof Error?error.message:String(error);return Number.NaN;}});
 if(values.some(value=>!Number.isFinite(value)||Math.abs(value)>1e6)){
  if(fallback)return fallback;
  throw Error(`Axis bounds must be finite and within ±1e6${problem?` (${problem})`:''}`);
 }
 let [a,b]=values;
 if(a>b)[a,b]=[b,a];
 if(a===b){const pad=a===0?1:Math.abs(a)*.1;a-=pad;b+=pad;}
 return [a,b];
}
