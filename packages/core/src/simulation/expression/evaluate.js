import { budgetError, finite, at } from '../foundation.js';
import { unary, functions, extraFunctions, name } from './functions.js';
import { DEMONSTRATION_LOOP_LIMIT } from './parser.js';

/* ---------- Evaluator ---------- */
/** Scopes may be chained (sum/iterate locals, lazy definitions); never read Object.prototype. */
const resolveDefinition = Symbol('resolveDefinition');
const sparseReader = Symbol('sparseReader');
function lookup(scope, name) {
  for (
    let current = scope;
    current && current !== Object.prototype;
    current = Object.getPrototypeOf(current)
  ) {
    if (Object.hasOwn(current, name)) return current[name];
    if (Object.hasOwn(current, resolveDefinition)) {
      const definition = current[resolveDefinition](name);
      if (definition !== undefined) return definition;
    }
  }
  throw Error(`Unknown variable: ${name}`);
}
/** Forward-mode directional AD for smooth, explicitly authored scalar ASTs.
 * Unsupported or nondifferentiable operations return NaN tangent; callers
 * either report that limitation or use a documented finite-difference fallback.
 */
function dualExpression(ast,scope,variable,budget){
  if(--budget.remaining<0)throw budgetError();
  const run=node=>dualExpression(node,scope,variable,budget);
  if(ast.kind==='number')return [ast.value,0];
  if(ast.kind==='variable'){
    const v=ast.name==='pi'?Math.PI:ast.name==='e'?Math.E:Number(lookup(scope,ast.name));
    return [v,ast.name===variable?1:0];
  }
  if(ast.kind==='unary'){
    const [v,d]=run(ast.arg);
    return ast.op==='-'?[-v,-d]:ast.op==='+'?[v,d]:[+!v,Number.NaN];
  }
  const power=(a,da,b,db)=>{
    const v=a**b;
    if(db===0)return [v,b===0?0:da===0?0:b*a**(b-1)*da];
    return [v,a>0?v*(db*Math.log(a)+b*da/a):Number.NaN];
  };
  if(ast.kind==='binary'){
    if(['&&','||','<','>','<=','>=','==','!=','%'].includes(ast.op))
      return [evaluateDemonstrationExpression(ast,scope,budget),Number.NaN];
    const [a,da]=run(ast.left),[b,db]=run(ast.right);
    switch(ast.op){
      case '+':return [a+b,da+db];
      case '-':return [a-b,da-db];
      case '*':return [a*b,da*b+a*db];
      case '/':return [a/b,(da*b-a*db)/(b*b)];
      case '^':return power(a,da,b,db);
    }
  }
  if(ast.kind==='call'){
    const fn=ast.name;
    if(fn==='if')return [evaluateDemonstrationExpression(ast,scope,budget),Number.NaN];
    if(!['sin','cos','tan','asin','acos','atan','sqrt','abs','exp','expm1','log','log1p','log10','log2','sinh','cosh','tanh','cbrt','pow','hypot','atan2'].includes(fn))
      return [evaluateDemonstrationExpression(ast,scope,budget),Number.NaN];
    const args=ast.args.map(run),[a,da]=args[0],b=args[1]?.[0],db=args[1]?.[1];
    if(fn==='pow')return power(a,da,b,db);
    if(fn==='hypot'){
      const v=Math.hypot(...args.map(p=>p[0]));
      return [v,v===0?Number.NaN:args.reduce((s,[q,d])=>s+q*d,0)/v];
    }
    if(fn==='atan2')return [Math.atan2(a,b),(b*da-a*db)/(a*a+b*b)];
    const v=(functions[fn]??extraFunctions[fn])(a);
    const factor={sin:()=>Math.cos(a),cos:()=>-Math.sin(a),tan:()=>1/Math.cos(a)**2,
      asin:()=>1/Math.sqrt(1-a*a),acos:()=>-1/Math.sqrt(1-a*a),atan:()=>1/(1+a*a),
      sqrt:()=>a>0?.5/Math.sqrt(a):Number.NaN,abs:()=>a===0?Number.NaN:Math.sign(a),
      exp:()=>v,expm1:()=>Math.exp(a),log:()=>1/a,log1p:()=>1/(1+a),
      log10:()=>1/(a*Math.LN10),log2:()=>1/(a*Math.LN2),sinh:()=>Math.cosh(a),
      cosh:()=>Math.sinh(a),tanh:()=>1-v*v,cbrt:()=>a===0?Number.NaN:1/(3*v*v)}[fn]();
    return [v,da===0?0:da*factor];
  }
  return [Number.NaN,Number.NaN];
}

// Small CSP-safe arithmetic instruction tape. No generated JS, no eval.
// Keep lazy logic, special functions and budgeted loops on the interpreter.
// One scratch stack per compiled AST; reentrant evaluation falls back safely.
const expressionTapes=new WeakMap();
const tapeOps={'+':2,'-':3,'*':4,'/':5,'%':6,'^':7,'<':8,'>':9,'<=':10,'>=':11,'==':12,'!=':13};
function prepareExpressionTape(ast){
  const ops=[],args=[];
  const push=(op,arg=0)=>{ops.push(op);args.push(arg);};
  function visit(node){
    if(node.kind==='number'){push(0,node.value);return true;}
    if(node.kind==='variable'){
      if(node.name==='pi'||node.name==='e')push(0,node.name==='pi'?Math.PI:Math.E);
      else push(1,node.name);
      return true;
    }
    if(node.kind==='unary'&&['+','-','!'].includes(node.op)&&visit(node.arg)){push(node.op==='-'?14:node.op==='!'?15:16);return true;}
    if(node.kind==='binary'&&Object.hasOwn(tapeOps,node.op)&&visit(node.left)&&visit(node.right)){push(tapeOps[node.op]);return true;}
    if(node.kind==='call'&&node.args.length===1&&Object.hasOwn(unary,node.name)&&visit(node.args[0])){push(17,unary[node.name]);return true;}
    return false;
  }
  if(visit(ast)&&ops.length>=5)expressionTapes.set(ast,{ops:Uint8Array.from(ops),args,stack:new Float64Array(ops.length),busy:false});
  // Hot inner expressions in bounded loops have their own reusable tape.
  if(ast.kind==='call'&&['sum','iterate','integral'].includes(ast.name))prepareExpressionTape(ast.args[3]);
}
function evaluatePreparedExpression(ast,scope,budget){
  const tape=expressionTapes.get(ast);
  if(!tape||tape.busy)return evaluateDemonstrationExpression(ast,scope,budget);
  budget.remaining-=tape.ops.length;
  if(budget.remaining<0)throw budgetError();
  const {ops,args,stack}=tape;
  let sp=0;tape.busy=true;
  try{
    for(let i=0;i<ops.length;i++){
      const op=ops[i];
      if(op===0){stack[sp++]=args[i];continue;}
      if(op===1){stack[sp++]=Number(lookup(scope,args[i]));continue;}
      if(op===14){stack[sp-1]=-stack[sp-1];continue;}
      if(op===15){stack[sp-1]=+!stack[sp-1];continue;}
      if(op===16)continue;
      if(op===17){stack[sp-1]=args[i](stack[sp-1]);continue;}
      const b=stack[--sp],a=stack[sp-1];
      switch(op){
        case 2:stack[sp-1]=a+b;break;case 3:stack[sp-1]=a-b;break;
        case 4:stack[sp-1]=a*b;break;case 5:stack[sp-1]=a/b;break;
        case 6:stack[sp-1]=a%b;break;case 7:stack[sp-1]=a**b;break;
        case 8:stack[sp-1]=+(a<b);break;case 9:stack[sp-1]=+(a>b);break;
        case 10:stack[sp-1]=+(a<=b);break;case 11:stack[sp-1]=+(a>=b);break;
        case 12:stack[sp-1]=+(a===b);break;case 13:stack[sp-1]=+(a!==b);break;
      }
    }
    return stack[0];
  }finally{tape.busy=false;}
}
function evaluateDemonstrationExpression(ast, scope, budget = { remaining: 2000000 }) {
  if (--budget.remaining < 0) throw budgetError();
  const run = (node) => evaluateDemonstrationExpression(node, scope, budget);
  if (ast.kind === 'number') return ast.value;
  if (ast.kind === 'variable') {
    if (ast.name === 'pi') return Math.PI;
    if (ast.name === 'e') return Math.E;
    const value = lookup(scope, ast.name);
    return typeof value === 'number' ? value : Number(value);
  }
  if (ast.kind === 'unary') {
    const value = run(ast.arg);
    return ast.op === '-' ? -value : ast.op === '!' ? +!value : +value;
  }
  if (ast.kind === 'binary') {
    const a = run(ast.left);
    if (ast.op === '&&') return a ? run(ast.right) : 0;
    if (ast.op === '||') return a || run(ast.right);
    const b = run(ast.right);
    switch (ast.op) {
      case '+':
        return a + b;
      case '-':
        return a - b;
      case '*':
        return a * b;
      case '/':
        return a / b;
      case '%':
        return a % b;
      case '^':
        return a ** b;
      case '<':
        return +(a < b);
      case '>':
        return +(a > b);
      case '<=':
        return +(a <= b);
      case '>=':
        return +(a >= b);
      case '==':
        return +(a === b);
      case '!=':
        return +(a !== b);
    }
    throw Error(`Unknown operator ${ast.op}`);
  }
  if (ast.name === 'sparseAt') {
    if (!scope[sparseReader]) throw Error('sparseAt requires a sparse system');
    return scope[sparseReader](run(ast.args[0]));
  }
  if (ast.name === 'if') return run(ast.args[0]) ? run(ast.args[1]) : run(ast.args[2]);
  if(ast.name==='diff'||ast.name==='integral'){
    const key=ast.args[0].name,local=Object.create(scope),start=run(ast.args[1]);
    if(!finite(start))throw Error('Calculus bounds must be finite');
    Object.defineProperty(local,key,{value:start,writable:true,enumerable:true});
    if(ast.name==='diff'){
      const [value,slope]=dualExpression(ast.args[2],local,key,budget);
      if(!finite(value)||!finite(slope))throw Error('Derivative undefined or unsupported; use smooth explicit expression');
      return slope;
    }
    const end=run(ast.args[2]),n=128,h=(end-start)/n;
    if(!finite(end)||!finite(h))throw Error('Integral bounds must be finite');
    if(start===end)return 0;
    let total=0;
    for(let i=0;i<=n;i++){
      local[key]=i===n?end:start+i*h;
      const v=evaluatePreparedExpression(ast.args[3],local,budget);
      if(!finite(v))throw Error('Nonfinite quadrature sample');
      total+=(i===0||i===n?1:i%2?4:2)*v;
    }
    return total*h/3;
  }
  if (ast.name === 'sum' || ast.name === 'iterate') {
    // The loop variable shadows the outer scope through the prototype chain, so
    // lazily evaluated definitions are computed once, not once per term.
    const key = ast.args[0].name,
      local = Object.create(scope);
    Object.defineProperty(local, key, {
      value: 0,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    if (ast.name === 'sum') {
      const start = Math.ceil(run(ast.args[1])),
        end = Math.floor(run(ast.args[2]));
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end))
        throw Error('sum bounds must be finite integers');
      if (end - start >= DEMONSTRATION_LOOP_LIMIT)
        throw Error(`sum supports at most ${DEMONSTRATION_LOOP_LIMIT} terms`);
      let result = 0;
      for (let i = start; i <= end; i++) {
        local[key] = i;
        result += evaluatePreparedExpression(ast.args[3], local, budget);
      }
      return result;
    }
    let result = run(ast.args[1]);
    const raw = Math.floor(run(ast.args[2]));
    if (!Number.isFinite(raw)) throw Error('iterate count must be a finite number');
    const count = Math.max(0, raw);
    if (count > DEMONSTRATION_LOOP_LIMIT)
      throw Error(`iterate supports 0–${DEMONSTRATION_LOOP_LIMIT} steps`);
    for (let i = 0; i < count; i++) {
      local[key] = result;
      result = evaluatePreparedExpression(ast.args[3], local, budget);
    }
    return result;
  }
  if (ast.name === 'solveN') {
    const n = run(ast.args[1]);
    if (!Number.isInteger(n) || n < 1 || n > 6 || ast.args.length !== n*n+n+2) throw Error('solveN expects index, n, n*n coefficients and n RHS values');
    budget.remaining -= n ** 3;
    if (budget.remaining < 0) throw budgetError();
    return extraFunctions.solveN(run(ast.args[0]), n, ...ast.args.slice(2).map(run));
  }
  if (ast.name === 'solve3') {
    budget.remaining -= 27;
    if (budget.remaining < 0) throw budgetError();
  }
  if (ast.name === 'besselJ1') {
    budget.remaining -= 127;
    if (budget.remaining < 0) throw budgetError();
  }
  const fn = Object.hasOwn(functions, ast.name)
    ? functions[ast.name]
    : Object.hasOwn(extraFunctions, ast.name)
      ? extraFunctions[ast.name]
      : null;
  if (!fn) throw Error(`Unknown mathematical function: ${ast.name}`);
  return fn(...ast.args.map(run));
}
function expressionNames(ast, allowed, used) {
  if (ast.kind === 'variable' && ast.name !== 'pi' && ast.name !== 'e') {
    if (!allowed.has(ast.name)) {
      const hint = [...allowed].find((name) => name.toLowerCase() === ast.name.toLowerCase());
      throw Error(`Unknown variable: ${ast.name}${hint ? ` (did you mean ${hint}?)` : ''}`);
    }
    used?.add(ast.name);
  }
  if (ast.kind === 'binary') {
    expressionNames(ast.left, allowed, used);
    expressionNames(ast.right, allowed, used);
  }
  if (ast.kind === 'unary') expressionNames(ast.arg, allowed, used);
  if (ast.kind === 'call') {
    if (ast.name === 'sparseAt' && !allowed.has('sparseValue')) throw Error('sparseAt requires a sparse system');
    if(ast.name==='diff'){
      expressionNames(ast.args[1],allowed,used);
      expressionNames(ast.args[2],new Set([...allowed,ast.args[0].name]),used);
    }else if (['sum', 'iterate','integral'].includes(ast.name)) {
      expressionNames(ast.args[1], allowed, used);
      expressionNames(ast.args[2], allowed, used);
      expressionNames(ast.args[3], new Set([...allowed, ast.args[0].name]), used);
    } else ast.args.forEach((arg) => expressionNames(arg, allowed, used));
  }
}

export { resolveDefinition, sparseReader, dualExpression, prepareExpressionTape, evaluatePreparedExpression, evaluateDemonstrationExpression, expressionNames };
