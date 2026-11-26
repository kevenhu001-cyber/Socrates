/** Bounded mathematical programs. No eval, generated JS, imports or DOM access. */
const SAFE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const RESERVED = new Set(['x', 'y', 't', 'pi', 'e', 'constructor', 'prototype', '__proto__']);
const unary = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  log: Math.log,
  log10: Math.log10,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sign: Math.sign,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
};
let airyTable;
const quadratureAngles = Float64Array.from({ length: 128 }, (_, i) => ((i + 0.5) * Math.PI) / 128);
const quadratureSines = quadratureAngles.map(Math.sin);
function j1(x) {
  let s = 0;
  for (let i = 0; i < quadratureAngles.length; i++) {
    s += Math.cos(quadratureAngles[i] - x * quadratureSines[i]);
  }
  return s / quadratureAngles.length;
}
function airy(r) {
  airyTable ??= Float64Array.from({ length: 8193 }, (_, i) =>
    i === 0 ? 1 : ((2 * j1(i / 512)) / (i / 512)) ** 2,
  );
  const u = Math.abs(r),
    i = u * 512,
    lo = Math.floor(i);
  if (!Number.isFinite(u)) return Number.NaN;
  if (lo >= airyTable.length - 1) {
    const phase = u - (3 * Math.PI) / 4;
    return (8 / (Math.PI * u ** 3)) * (Math.cos(phase) - (3 / (8 * u)) * Math.sin(phase)) ** 2;
  }
  return airyTable[lo] + (airyTable[lo + 1] - airyTable[lo]) * (i - lo);
}
/* Core functions reserve their names: parameters, definitions and states may
   not reuse them, so `sin x` without parentheses is unambiguous. */
const functions = {
  ...unary,
  pow: Math.pow,
  min: Math.min,
  max: Math.max,
  atan2: Math.atan2,
  hypot: Math.hypot,
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  sinc: (x) => (Math.abs(x) < 1e-7 ? 1 - (x * x) / 6 : Math.sin(x) / x),
  // Normalized sin(nz)/(n sin z), with the removable singularities filled in.
  sinratio: (n, z) =>
    !Number.isInteger(n) || n < 1 || n > 128
      ? Number.NaN
      : Math.abs(Math.sin(z)) < 1e-8
        ? Math.cos(n * z) / Math.cos(z)
        : Math.sin(n * z) / (n * Math.sin(z)),
  besselJ1: j1,
  airy,
};
const arity = { pow: 2, atan2: 2, clamp: 3, sinc: 1, sinratio: 2, besselJ1: 1, airy: 1 };
/* Extra functions and spellings models commonly write. They are recognised
   only in call position, so they never reserve an identifier that an
   existing program may already use as a parameter name. */
function solveSmallSystem(matrix, rhs, n) {
  for (let i = 0; i < n; i++) {
    let scale = 0;
    for (let j = 0; j < n; j++) scale = Math.max(scale, Math.abs(matrix[i * n + j]));
    if (!(scale > 0) || !Number.isFinite(scale)) return false;
    for (let j = 0; j < n; j++) matrix[i * n + j] /= scale;
    rhs[i] /= scale;
  }
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let i = k + 1; i < n; i++)
      if (Math.abs(matrix[i * n + k]) > Math.abs(matrix[pivot * n + k])) pivot = i;
    if (!(Math.abs(matrix[pivot * n + k]) > 1e-12)) return false;
    if (pivot !== k) {
      for (let j = k; j < n; j++) {
        const value = matrix[k * n + j];
        matrix[k * n + j] = matrix[pivot * n + j];
        matrix[pivot * n + j] = value;
      }
      const value = rhs[k];
      rhs[k] = rhs[pivot];
      rhs[pivot] = value;
    }
    for (let i = k + 1; i < n; i++) {
      const factor = matrix[i * n + k] / matrix[k * n + k];
      for (let j = k + 1; j < n; j++) matrix[i * n + j] -= factor * matrix[k * n + j];
      rhs[i] -= factor * rhs[k];
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    for (let j = i + 1; j < n; j++) rhs[i] -= matrix[i * n + j] * rhs[j];
    rhs[i] /= matrix[i * n + i];
  }
  return rhs.every(Number.isFinite);
}
const extraFunctions = {
  log2: Math.log2,
  cbrt: Math.cbrt,
  trunc: Math.trunc,
  asinh: Math.asinh,
  acosh: Math.acosh,
  atanh: Math.atanh,
  sec: (x) => 1 / Math.cos(x),
  csc: (x) => 1 / Math.sin(x),
  cot: (x) => Math.cos(x) / Math.sin(x),
  mod: (a, b) => ((a % b) + b) % b,
  expm1: Math.expm1,
  log1p: Math.log1p,
  heaviside: (x) => (x >= 0 ? 1 : 0),
  dot2: (a, b, c, d) => a * c + b * d,
  dot3: (a, b, c, d, e, f) => a * d + b * e + c * f,
  solveN: (index, n, ...args) => {
    if (!Number.isInteger(n) || n < 1 || n > 6 || !Number.isInteger(index) ||
        index < 1 || index > n || args.length !== n * n + n) return Number.NaN;
    const rhs = Float64Array.from(args.slice(n * n));
    return solveSmallSystem(Float64Array.from(args.slice(0, n * n)), rhs, n)
      ? rhs[index - 1] : Number.NaN;
  },
  cross3: (i, a, b, c, d, e, f) => i === 1 ? b*f-c*e : i === 2 ? c*d-a*f : i === 3 ? a*e-b*d : Number.NaN,
  solve3: (index, ...args) => {
    if (!Number.isInteger(index) || index < 1 || index > 3) return Number.NaN;
    const rhs = Float64Array.from(args.slice(9));
    return solveSmallSystem(Float64Array.from(args.slice(0, 9)), rhs, 3)
      ? rhs[index - 1] : Number.NaN;
  },
  // A scaled 2x2 solve for coupled accelerations and linear constraints.
  solve2: (index, a, b, c, d, r, s) => {
    const p = Math.max(Math.abs(a), Math.abs(b));
    const q = Math.max(Math.abs(c), Math.abs(d));
    if (!(p > 0 && q > 0) || (index !== 1 && index !== 2)) return Number.NaN;
    a /= p; b /= p; r /= p;
    c /= q; d /= q; s /= q;
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-12) return Number.NaN;
    return index === 1 ? (d * r - b * s) / det : (a * s - c * r) / det;
  },
};
const extraArity = { mod: 2, dot2: 4, dot3: 6, solve2: 7, solve3: 13, cross3: 7 };
const aliases = {
  ln: 'log',
  lg: 'log10',
  arcsin: 'asin',
  arccos: 'acos',
  arctan: 'atan',
  arctan2: 'atan2',
  sgn: 'sign',
  power: 'pow',
};
const SPECIAL = ['sum', 'if', 'iterate'];
const callable = (name) =>
  Object.hasOwn(functions, name) || Object.hasOwn(extraFunctions, name) || SPECIAL.includes(name)
    ? name
    : Object.hasOwn(aliases, name)
      ? aliases[name]
      : null;
const expectedArity = (name) =>
  name === 'sum' || name === 'iterate'
    ? 4
    : name === 'if'
      ? 3
      : (arity[name] ??
        extraArity[name] ??
        (Object.hasOwn(unary, name) || Object.hasOwn(extraFunctions, name) ? 1 : null));
const precedence = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '>': 4,
  '<=': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
  '^': 8,
};
// Implicit multiplication (2x, 2(x+1), 2 pi r) binds tighter than * and /,
// so 1/2m reads as 1/(2m), but looser than ^ and unary minus.
const IMPLICIT = 7;
/** Loop limits for sum() and iterate(); the operation budget still bounds total work. */
export const DEMONSTRATION_LOOP_LIMIT = 1000;
const BUDGET = 4000000,
  DYNAMICS_BUDGET = 12000000;

/* ---------- Expression normalization ---------- */
const SUPERSCRIPT = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
  '⁻': '-',
  '⁺': '+',
  ⁿ: 'n',
  ˣ: 'x',
  ᵗ: 't',
};
const GREEK = {
  α: 'alpha',
  β: 'beta',
  γ: 'gamma',
  δ: 'delta',
  ε: 'epsilon',
  ϵ: 'epsilon',
  ζ: 'zeta',
  η: 'eta',
  θ: 'theta',
  ϑ: 'theta',
  ι: 'iota',
  κ: 'kappa',
  λ: 'lambda',
  μ: 'mu',
  ν: 'nu',
  ξ: 'xi',
  ρ: 'rho',
  σ: 'sigma',
  ς: 'sigma',
  τ: 'tau',
  υ: 'upsilon',
  φ: 'phi',
  ϕ: 'phi',
  χ: 'chi',
  ψ: 'psi',
  ω: 'omega',
  Γ: 'Gamma',
  Δ: 'Delta',
  Θ: 'Theta',
  Λ: 'Lambda',
  Ξ: 'Xi',
  Σ: 'Sigma',
  Φ: 'Phi',
  Ψ: 'Psi',
  Ω: 'Omega',
};
const GREEK_PATTERN = new RegExp(`[${Object.keys(GREEK).join('')}π]`, 'g');
const letter = (char) => Boolean(char) && /[A-Za-z]/.test(char);
const alnum = (char) => Boolean(char) && /[A-Za-z0-9_]/.test(char);
function transliterate(text, spaced) {
  return text.replace(GREEK_PATTERN, (char, offset, whole) => {
    const name = char === 'π' ? 'pi' : GREEK[char];
    if (!spaced) return name;
    const before = whole[offset - 1],
      after = whole[offset + 1];
    // ωt → omega t and kθ → k theta, but θ0 stays the identifier theta0.
    return (
      (letter(before) ? ' ' : '') +
      name +
      ((char === 'π' ? alnum(after) : letter(after)) ? ' ' : '')
    );
  });
}
/**
 * Rewrite the notation models commonly emit into the evaluator's ASCII
 * grammar: unicode operators and superscripts, full-width characters, Greek
 * letters, π, °, √, `**`, `Math.*` names and a leading `y =`/`f(x) =`.
 * It never adds capabilities; the result still goes through the parser.
 * Idempotent: normalizing an already normalized expression changes nothing.
 */
export function normalizeDemonstrationExpression(source) {
  if (typeof source !== 'string') return source;
  let text = source.replace(
    /[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿˣᵗ]+/g,
    (run) => `^(${[...run].map((char) => SUPERSCRIPT[char]).join('')})`,
  );
  text = text.normalize('NFKC');
  text = text
    .replace(/[×·⋅∙✕✖∗]/g, '*')
    .replace(/[÷∕]/g, '/')
    .replace(/[−–—‒﹣]/g, '-')
    .replace(/≤|⩽/g, '<=')
    .replace(/≥|⩾/g, '>=')
    .replace(/≠/g, '!=');
  text = transliterate(text, true);
  text = text
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/√\s*([A-Za-z0-9_.]+)/g, 'sqrt($1)')
    .replace(/∛\s*\(/g, 'cbrt(')
    .replace(/∛\s*([A-Za-z0-9_.]+)/g, 'cbrt($1)');
  text = text.replace(/°/g, '*(pi/180)');
  text = text
    .replace(/\bMath\.PI\b/g, 'pi')
    .replace(/\bMath\.E\b/g, 'e')
    .replace(/\bMath\.([A-Za-z]\w*)/g, '$1')
    .replace(/\bPI\b/g, 'pi');
  text = text.replace(/\*\*/g, '^').replace(/===/g, '==').replace(/!==/g, '!=');
  // "y = sin(x)" or "f(x) = x^2": keep the right-hand side.
  text = text.replace(/^\s*(?:y|[A-Za-z]\w*\s*\([^()]*\))\s*=(?!=)/, '');
  return text.replace(/;\s*$/, '').trim();
}
/** Bring an identifier written with Greek letters or full-width characters to ASCII. */
export function normalizeDemonstrationIdentifier(value) {
  if (typeof value !== 'string') return value;
  return transliterate(value.normalize('NFKC').trim(), false);
}

/* ---------- Parser ---------- */
export function parseDemonstrationExpression(input) {
  if (typeof input === 'number') {
    if (Number.isFinite(input)) return { kind: 'number', value: input };
    throw Error('Numeric literal must be finite');
  }
  if (typeof input !== 'string' || !input.trim())
    throw Error('Expression must be a number or a non-empty mathematical string');
  const source = normalizeDemonstrationExpression(input);
  if (!source || source.length > 1600)
    throw Error('Expression must be 1–1600 mathematical characters');
  const tokens = [];
  let offset = 0;
  while (offset < source.length) {
    const match =
      /^\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z][A-Za-z0-9_]*)|(<=|>=|==|!=|&&|\|\||[+\-*/%^(),<>?:!]))/.exec(
        source.slice(offset),
      );
    if (!match) {
      if (source.slice(offset).trim() === '') break;
      throw Error(
        `Unsupported expression syntax near "${source.slice(offset).trim().slice(0, 12)}"`,
      );
    }
    if (match[1] && !Number.isFinite(Number(match[1])))
      throw Error('Numeric literal must be finite');
    tokens.push(
      match[1] ? { number: Number(match[1]) } : match[2] ? { name: match[2] } : { op: match[3] },
    );
    offset += match[0].length;
    if (tokens.length > 320) throw Error('Expression token budget exceeded');
  }
  let index = 0,
    depth = 0;
  const consume = (op) => {
    if (tokens[index]?.op !== op) throw Error(`Expected ${op}`);
    index++;
  };
  const startsValue = (token) =>
    Boolean(token) &&
    (token.number !== undefined ||
      token.name !== undefined ||
      token.op === '(' ||
      token.op === '-' ||
      token.op === '+');
  function primary() {
    const token = tokens[index++];
    if (!token) throw Error('Incomplete expression');
    if (token.number !== undefined) return { kind: 'number', value: token.number };
    if (token.op === '+' || token.op === '-' || token.op === '!')
      return { kind: 'unary', op: token.op, arg: expression(7) };
    if (token.op === '(') {
      const node = expression();
      consume(')');
      return node;
    }
    if (token.name !== undefined) {
      const written = token.name;
      if (tokens[index]?.op === '(') {
        const name = callable(written);
        index++;
        const args = [];
        if (tokens[index]?.op !== ')')
          do {
            args.push(expression());
            if (tokens[index]?.op !== ',') break;
            index++;
          } while (true);
        consume(')');
        if (!name) {
          // Definitions already depend on x, y and t: f(x) means f. A(1-x) is A*(1-x).
          if (
            args.length &&
            args.every((arg) => arg.kind === 'variable' && ['x', 'y', 't'].includes(arg.name))
          )
            return { kind: 'variable', name: written };
          if (args.length === 1 && !['constructor', 'prototype', '__proto__'].includes(written))
            return {
              kind: 'binary',
              op: '*',
              left: { kind: 'variable', name: written },
              right: args[0],
            };
          throw Error(`Unknown mathematical function: ${written}`);
        }
        const expected = expectedArity(name);
        if (name === 'solveN' ? (args.length < 4 || args.length > 44) : expected === null ? args.length === 0 || args.length > 8 : args.length !== expected)
          throw Error(
            `Wrong argument count: ${written} takes ${expected ?? '1–8'} argument${expected === 1 ? '' : 's'}`,
          );
        if (
          ['sum', 'iterate'].includes(name) &&
          (args[0]?.kind !== 'variable' || !SAFE.test(args[0].name) || RESERVED.has(args[0].name))
        )
          throw Error('sum/iterate needs a safe local variable as its first argument');
        return { kind: 'call', name, args };
      }
      // "sin x" and "sin 2x": a core one-argument function without parentheses.
      if (Object.hasOwn(unary, written) && startsValue(tokens[index]))
        return { kind: 'call', name: written, args: [expression(IMPLICIT)] };
      return { kind: 'variable', name: written };
    }
    throw Error(`Expected a mathematical value${token.op ? ` before "${token.op}"` : ''}`);
  }
  function expression(min = 0) {
    if (++depth > 32) throw Error('Expression nesting budget exceeded');
    let node = primary();
    for (;;) {
      const token = tokens[index];
      if (
        token?.op !== undefined &&
        Object.hasOwn(precedence, token.op) &&
        precedence[token.op] >= min
      ) {
        index++;
        const p = precedence[token.op];
        node = {
          kind: 'binary',
          op: token.op,
          left: node,
          right: expression(token.op === '^' ? p : p + 1),
        };
        continue;
      }
      if (token && (token.name !== undefined || token.op === '(') && IMPLICIT >= min) {
        node = { kind: 'binary', op: '*', left: node, right: expression(IMPLICIT + 1) };
        continue;
      }
      if (token?.op === '?' && min === 0) {
        index++;
        const yes = expression();
        consume(':');
        const no = expression();
        node = { kind: 'call', name: 'if', args: [node, yes, no] };
        continue;
      }
      break;
    }
    depth--;
    return node;
  }
  const ast = expression();
  if (index !== tokens.length) {
    const token = tokens[index];
    throw Error(
      `Unexpected ${token.op ? `"${token.op}"` : (token.name ?? token.number)} after a complete expression`,
    );
  }
  return ast;
}

/* ---------- Evaluator ---------- */
/** Scopes may be chained (sum/iterate locals, lazy definitions); never read Object.prototype. */
const resolveDefinition = Symbol('resolveDefinition');
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
const budgetError = () => Error('Demonstration calculation budget exceeded');
/** True for the resource-limit error, which callers retry at a coarser resolution. */
export function isDemonstrationBudgetError(error) {
  return error instanceof Error && error.message.includes('budget exceeded');
}
export function evaluateDemonstrationExpression(ast, scope, budget = { remaining: 2000000 }) {
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
  if (ast.name === 'if') return run(ast.args[0]) ? run(ast.args[1]) : run(ast.args[2]);
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
        result += evaluateDemonstrationExpression(ast.args[3], local, budget);
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
      result = evaluateDemonstrationExpression(ast.args[3], local, budget);
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
    if (['sum', 'iterate'].includes(ast.name)) {
      expressionNames(ast.args[1], allowed, used);
      expressionNames(ast.args[2], allowed, used);
      expressionNames(ast.args[3], new Set([...allowed, ast.args[0].name]), used);
    } else ast.args.forEach((arg) => expressionNames(arg, allowed, used));
  }
}

/* ---------- Program normalization ---------- */
const record = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const ITEM_KEYS = new Set(['item', 'items']);
/** `{item: X}` / `{items: [...]}` (XML-encoded tool arguments) → an array. */
function asArray(value) {
  if (Array.isArray(value)) return value;
  if (!record(value)) return value;
  const keys = Object.keys(value);
  if (keys.length !== 1 || !ITEM_KEYS.has(keys[0])) return value;
  const inner = value[keys[0]];
  return Array.isArray(inner) ? inner : [inner];
}
/** Numeric positions accept 12 and "12"; anything else is left for the validator. */
function numberLike(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed && Number.isFinite(Number(trimmed))) return Number(trimmed);
  }
  return value;
}
const booleanLike = (value) => (value === 'true' ? true : value === 'false' ? false : value);
/** Expressions accept numbers, numeric strings and mathematical strings. */
function expressionLike(value) {
  if (typeof value === 'string') {
    const number = numberLike(value);
    return typeof number === 'number' ? number : normalizeDemonstrationExpression(value);
  }
  return value;
}
const textLike = (value) =>
  typeof value === 'number'
    ? String(value)
    : typeof value === 'string'
      ? value.slice(0, 200)
      : value;
const first = (object, keys) => {
  for (const key of keys) if (object[key] !== undefined) return object[key];
  return undefined;
};
/** `{a: 1}` stays a map; `[{name:"a", expression:1}]` becomes one. */
function namedMap(value, valueKeys) {
  const list = asArray(value);
  if (!Array.isArray(list))
    return record(list)
      ? Object.fromEntries(
          Object.entries(list).map(([key, item]) => [normalizeDemonstrationIdentifier(key), item]),
        )
      : list;
  const out = {};
  for (const item of list) {
    if (!record(item)) return list;
    const key = first(item, ['name', 'id', 'key', 'state']);
    if (typeof key !== 'string') return list;
    out[normalizeDemonstrationIdentifier(key)] = first(item, valueKeys);
  }
  return out;
}
const mapValues = (value, fn) =>
  record(value)
    ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fn(item)]))
    : value;
/** Two-element numeric/expression range; {min,max} objects are accepted too. */
function rangeLike(value) {
  let list = asArray(value);
  if (record(list) && (list.min !== undefined || list.max !== undefined))
    list = [list.min, list.max];
  if (!Array.isArray(list)) return value;
  list = list.map(expressionLike);
  if (list.length === 2 && list.every(finite)) {
    let [a, b] = list;
    if (a > b) [a, b] = [b, a];
    if (a === b) {
      const pad = a === 0 ? 1 : Math.abs(a) * 0.1;
      a -= pad;
      b += pad;
    }
    list = [a, b];
  }
  return list;
}
const VIEW_KINDS = {
  scene: 'scene',
  plot: 'plot',
  graph: 'plot',
  chart: 'plot',
  line: 'plot',
  curve: 'plot',
  curves: 'plot',
  function: 'plot',
  field: 'field',
  heatmap: 'field',
  image: 'field',
  raster: 'field',
  map: 'field',
  trajectory: 'trajectory',
  phase: 'trajectory',
  orbit: 'trajectory',
  path: 'trajectory',
  metrics: 'metrics',
  metric: 'metrics',
  readout: 'metrics',
  readouts: 'metrics',
  values: 'metrics',
  controls: 'controls',
  control: 'controls',
  sliders: 'controls',
  parameters: 'controls',
};
function normalizeParameter(raw) {
  if (!record(raw)) return raw;
  const p = { ...raw };
  const id = first(p, ['id', 'name', 'key']);
  if (typeof id === 'string') p.id = normalizeDemonstrationIdentifier(id);
  delete p.name;
  delete p.key;
  for (const key of ['label', 'unit']) if (p[key] !== undefined) p[key] = textLike(p[key]);
  if (
    (p.label === undefined || p.label === null || p.label === '') &&
    typeof p.id === 'string' &&
    p.id
  )
    p.label = p.id;
  let min = numberLike(p.min),
    max = numberLike(p.max),
    value = numberLike(first(p, ['value', 'default', 'initial']));
  delete p.default;
  delete p.initial;
  if (finite(value) && !finite(min) && !finite(max)) {
    min = value > 0 ? 0 : value < 0 ? 2 * value : -1;
    max = value > 0 ? 2 * value : value < 0 ? 0 : 1;
  }
  if (finite(min) && finite(max)) {
    if (min > max) [min, max] = [max, min];
    if (min === max) {
      const pad = min === 0 ? 1 : Math.abs(min) * 0.5;
      min -= pad;
      max += pad;
    }
    if (!finite(value)) value = (min + max) / 2;
    value = Math.max(min, Math.min(max, value));
  }
  p.min = min;
  p.max = max;
  p.value = value;
  const step = numberLike(p.step);
  if (step === undefined || step === null || !finite(step) || step <= 0) delete p.step;
  else p.step = step;
  if (p.advanced !== undefined) p.advanced = booleanLike(p.advanced) === true;
  return p;
}
function normalizeView(raw) {
  if (typeof raw === 'string' && VIEW_KINDS[raw.trim().toLowerCase()])
    return { kind: VIEW_KINDS[raw.trim().toLowerCase()] };
  if (!record(raw)) return raw;
  const view = { ...raw };
  const kind = first(view, ['kind', 'type']);
  if (typeof kind === 'string') {
    const canonical = VIEW_KINDS[kind.trim().toLowerCase()];
    view.kind = canonical ?? kind;
    if (view.type === kind) delete view.type;
  }
  for (const key of ['label', 'xLabel', 'yLabel'])
    if (view[key] !== undefined) view[key] = textLike(view[key]);
  if (view.x === undefined && view.xRange !== undefined) {
    view.x = view.xRange;
    delete view.xRange;
  }
  if (view.y === undefined && view.yRange !== undefined) {
    view.y = view.yRange;
    delete view.yRange;
  }
  if (view.x === undefined && view.domain !== undefined && view.kind === 'plot') {
    view.x = view.domain;
    delete view.domain;
  }
  if (view.kind !== 'metrics' && view.kind !== 'controls') {
    if (view.x !== undefined) view.x = rangeLike(view.x);
    if (view.y !== undefined) view.y = rangeLike(view.y);
  }
  if (view.kind === 'plot') {
    if (view.sliceY !== undefined) view.sliceY = expressionLike(view.sliceY);
    let curves = asArray(view.curves);
    if (curves === undefined && view.expression !== undefined) {
      curves = [{ expression: view.expression }];
      delete view.expression;
    }
    if (typeof curves === 'string' || typeof curves === 'number' || record(curves))
      curves = [curves];
    if (Array.isArray(curves))
      view.curves = curves.map((curve) => {
        if (typeof curve === 'string' || typeof curve === 'number')
          return { expression: expressionLike(curve) };
        if (!record(curve)) return curve;
        const out = {
          ...curve,
          expression: expressionLike(
            first(curve, ['expression', 'expr', 'y', 'f', 'value', 'formula']),
          ),
        };
        for (const key of ['expr', 'y', 'f', 'value', 'formula']) delete out[key];
        if (out.label !== undefined) out.label = textLike(out.label);
        if (out.dashed !== undefined) out.dashed = booleanLike(out.dashed) === true;
        if (typeof out.color === 'string') out.color = out.color.trim().toLowerCase();
        return out;
      });
    const markers = asArray(view.markers);
    if (Array.isArray(markers))
      view.markers = markers.map((marker) =>
        record(marker)
          ? {
              ...marker,
              x: expressionLike(marker.x),
              y: expressionLike(marker.y),
              ...(marker.label !== undefined ? { label: textLike(marker.label) } : {}),
            }
          : marker,
      );
  }
  if (view.kind === 'scene') {
    const objects = asArray(view.objects);
    if (Array.isArray(objects))
      view.objects = objects.map((object) => {
        if (!record(object)) return object;
        const out = { ...object };
        for (const key of ['center', 'from', 'to']) {
          const point = asArray(out[key]);
          if (Array.isArray(point)) out[key] = point.map(expressionLike);
        }
        const points = asArray(out.points);
        if (Array.isArray(points))
          out.points = points.map((point) => {
            const pair = asArray(point);
            return Array.isArray(pair) ? pair.map(expressionLike) : pair;
          });
        for (const key of ['radius', 'width', 'height', 'angle'])
          if (out[key] !== undefined) out[key] = expressionLike(out[key]);
        if (out.label !== undefined) out.label = textLike(out.label);
        return out;
      });
  }
  if (view.kind === 'field') {
    if (view.expression !== undefined) view.expression = expressionLike(view.expression);
    for (const key of ['gamma', 'exposure', 'vectorScale'])
      if (view[key] !== undefined) view[key] = expressionLike(view[key]);
    if (view.colorRange !== undefined) view.colorRange = rangeLike(view.colorRange);
    if (view.zRange !== undefined) view.zRange = rangeLike(view.zRange);
    if (Array.isArray(view.contours)) view.contours = view.contours.map(expressionLike);
    const vector = asArray(view.vector);
    if (Array.isArray(vector)) view.vector = vector.map(expressionLike);
    const tint = asArray(view.tint);
    if (Array.isArray(tint))
      view.tint = tint
        .map(numberLike)
        .map((v) => (finite(v) ? Math.max(0, Math.min(1, v > 1 && v <= 255 ? v / 255 : v)) : v));
    if (view.height !== undefined) {
      const height = numberLike(view.height);
      view.height = finite(height) ? Math.max(64, Math.min(320, Math.round(height))) : height;
    }
    if (typeof view.palette === 'string') view.palette = view.palette.trim().toLowerCase();
  }
  if (view.kind === 'trajectory') {
    for (const key of ['horizontal', 'vertical'])
      if (view[key] !== undefined) view[key] = expressionLike(view[key]);
  }
  if (view.kind === 'metrics') {
    let values = asArray(view.values);
    if (values === undefined && view.metrics !== undefined) {
      values = asArray(view.metrics);
      delete view.metrics;
    }
    if (record(values)) values = [values];
    if (Array.isArray(values))
      view.values = values.map((metric) => {
        if (typeof metric === 'string' || typeof metric === 'number')
          return { label: '', expression: expressionLike(metric) };
        if (!record(metric)) return metric;
        const out = {
          ...metric,
          expression: expressionLike(first(metric, ['expression', 'expr', 'value', 'formula'])),
        };
        delete out.expr;
        delete out.value;
        delete out.formula;
        if (out.label !== undefined) out.label = textLike(out.label);
        else out.label = '';
        if (out.unit !== undefined) out.unit = textLike(out.unit);
        if (out.digits !== undefined) {
          const digits = numberLike(out.digits);
          out.digits = finite(digits) ? Math.max(0, Math.min(5, Math.round(digits))) : digits;
        }
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
export function normalizeDemonstrationProgram(input) {
  let source = input;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      return input;
    }
  }
  if (!record(source)) return input;
  // A whole node {type:"demonstration", program:{...}} passed as the program.
  if (source.views === undefined && record(source.program)) source = source.program;
  const out = { ...source };
  out.version = out.version === undefined ? 1 : numberLike(out.version);
  if (typeof out.resetKey === 'number') out.resetKey = String(out.resetKey);
  let parameters = asArray(out.parameters);
  if (record(parameters))
    parameters = Object.entries(parameters).map(([id, spec]) =>
      record(spec) ? { id, ...spec } : { id, value: spec },
    );
  if (Array.isArray(parameters)) out.parameters = parameters.map(normalizeParameter);
  if (out.definitions !== undefined)
    out.definitions = mapValues(
      namedMap(out.definitions, ['expression', 'expr', 'value', 'formula']),
      expressionLike,
    );
  if (record(out.dynamics)) {
    const dynamics = { ...out.dynamics };
    dynamics.initial = mapValues(
      namedMap(dynamics.initial, ['value', 'initial', 'expression']),
      expressionLike,
    );
    dynamics.derivatives = mapValues(
      namedMap(dynamics.derivatives, ['expression', 'derivative', 'value', 'expr']),
      expressionLike,
    );
    let duration = numberLike(dynamics.duration),
      step = numberLike(dynamics.step);
    if (!['rk45', 'sdirk2', 'grid-implicit'].includes(dynamics.method)) {
      if (finite(duration) && duration > 30) duration = 30;
      if (finite(step)) step = Math.max(0.002, Math.min(0.05, step));
      if (finite(duration) && finite(step) && duration > 0 && Math.ceil(duration / step) > 10000)
        step = Math.min(0.05, duration / 10000);
    }
    for (const key of ['rtol', 'atol']) {
      if (dynamics[key] !== undefined) dynamics[key] = numberLike(dynamics[key]);
    }
    if (record(dynamics.algebraic)) {
      dynamics.algebraic = { ...dynamics.algebraic, guess: mapValues(dynamics.algebraic.guess, expressionLike), residuals: mapValues(dynamics.algebraic.residuals, expressionLike) };
      if (dynamics.algebraic.tolerance !== undefined) dynamics.algebraic.tolerance = numberLike(dynamics.algebraic.tolerance);
    }
    if (Array.isArray(dynamics.massMatrix))
      dynamics.massMatrix = dynamics.massMatrix.map((row) => Array.isArray(row) ? row.map(expressionLike) : row);
    if (Array.isArray(dynamics.events))
      dynamics.events = dynamics.events.map((event) =>
        record(event)
          ? { ...event, expression: expressionLike(event.expression),
              ...(record(event.reset) ? { reset: mapValues(event.reset, expressionLike) } : {}) }
          : event,
      );
    dynamics.duration = duration;
    dynamics.step = step;
    out.dynamics = dynamics;
  }
  let views = asArray(out.views);
  if (record(views) && (views.kind !== undefined || views.type !== undefined)) views = [views];
  if (Array.isArray(views)) out.views = views.map(normalizeView);
  if (out.duration !== undefined) {
    const duration = numberLike(out.duration);
    out.duration = finite(duration) && duration > 30 ? 30 : duration;
  }
  const presets = asArray(out.presets);
  if (Array.isArray(presets))
    out.presets = presets.map((preset) => {
      if (!record(preset)) return preset;
      const values = mapValues(namedMap(preset.values, ['value']), expressionLike);
      if (record(values) && Array.isArray(out.parameters))
        for (const [key, value] of Object.entries(values)) {
          const p = out.parameters.find((p) => record(p) && p.id === key);
          if (p && finite(value) && finite(p.min) && finite(p.max))
            values[key] = Math.max(p.min, Math.min(p.max, value));
        }
      return {
        ...preset,
        ...(preset.label !== undefined ? { label: textLike(preset.label) } : {}),
        values,
      };
    });
  return out;
}

/* ---------- Shape preflight ---------- */
const VIEW_KIND_SET = new Set(['controls', 'plot', 'field', 'trajectory', 'scene', 'metrics']);
const SHAPE_ISSUE_LIMIT = 8;
const shapeIssue = (path, message) => ({ path, message });
const formatShapeIssue = (issue) => `${issue.path}: ${issue.message}`;
/** Parameter completeness and range checks that can be reported together. */
function parameterShapeIssues(parameters) {
  if (parameters === undefined) return [];
  if (!Array.isArray(parameters))
    return [shapeIssue('parameters', 'use a list of at most 12 entries')];
  const issues = [];
  if (parameters.length > 12) issues.push(shapeIssue('parameters', 'use at most 12 entries'));
  parameters.forEach((parameter, index) => {
    const path = `parameters[${index}]`;
    if (!record(parameter)) {
      issues.push(shapeIssue(path, 'must be an object'));
      return;
    }
    for (const key of ['id', 'value', 'min', 'max'])
      if (parameter[key] === undefined || parameter[key] === null || parameter[key] === '')
        issues.push(shapeIssue(`${path}.${key}`, 'is required'));
    if (finite(parameter.min) && finite(parameter.max) && parameter.min >= parameter.max)
      issues.push(shapeIssue(path, 'min must be < max'));
    if (
      finite(parameter.value) &&
      finite(parameter.min) &&
      finite(parameter.max) &&
      (parameter.value < parameter.min || parameter.value > parameter.max)
    )
      issues.push(shapeIssue(`${path}.value`, 'must be inside [min,max]'));
  });
  return issues;
}
/** Required fields per view kind, independent of expression syntax. */
function viewShapeIssues(view, index, hasDynamics) {
  const path = `views[${index}]`;
  if (!record(view)) return [shapeIssue(path, 'must be an object')];
  const kind = typeof view.kind === 'string' ? view.kind : '';
  if (!VIEW_KIND_SET.has(kind))
    return [shapeIssue(`${path}.kind`, 'use controls, plot, field, trajectory, scene or metrics')];
  if (kind === 'controls') return [];
  if (kind === 'metrics') {
    if (!Array.isArray(view.values) || view.values.length < 1 || view.values.length > 6)
      return [shapeIssue(`${path}.values`, 'use 1-6 values')];
    return [];
  }
  const issues = [];
  for (const axis of ['x', 'y'])
    if (!Array.isArray(view[axis]) || view[axis].length !== 2)
      issues.push(shapeIssue(`${path}.${axis}`, 'needs a two-element [min,max] range'));
  if (kind === 'scene') {
    if (!Array.isArray(view.objects) || view.objects.length < 1 || view.objects.length > 32)
      issues.push(shapeIssue(`${path}.objects`, 'use 1-32 scene objects'));
  } else if (kind === 'plot') {
    if (!Array.isArray(view.curves) || view.curves.length < 1 || view.curves.length > 6)
      issues.push(shapeIssue(`${path}.curves`, 'use 1-6 curves'));
  } else if (kind === 'field') {
    if (view.expression === undefined || view.expression === null || view.expression === '')
      issues.push(shapeIssue(`${path}.expression`, 'needs a mathematical expression'));
  } else if (kind === 'trajectory') {
    if (!hasDynamics) issues.push(shapeIssue(path, 'trajectory requires program.dynamics'));
    for (const key of ['horizontal', 'vertical'])
      if (view[key] === undefined || view[key] === null || view[key] === '')
        issues.push(shapeIssue(`${path}.${key}`, 'needs a mathematical expression'));
  }
  return issues;
}
/**
 * Collect every structural omission before the first semantic check. The old
 * validator stopped at the first error, so a plot missing x, y and curves
 * consumed three turns and was withdrawn before the model could fix it; one
 * corrected call should be enough.
 */
function demonstrationShapeIssues(program) {
  const issues = [];
  if (program.parameters !== undefined) issues.push(...parameterShapeIssues(program.parameters));
  if (program.definitions !== undefined) {
    if (!record(program.definitions))
      issues.push(shapeIssue('definitions', 'use an object of name to expression'));
    else if (Object.keys(program.definitions).length > 24)
      issues.push(shapeIssue('definitions', 'use at most 24 entries'));
  }
  if (program.dynamics !== undefined && !record(program.dynamics))
    issues.push(shapeIssue('dynamics', 'must be an object'));
  if (
    program.duration !== undefined &&
    (!finite(program.duration) || program.duration <= 0 || program.duration > 30)
  )
    issues.push(shapeIssue('duration', 'must be a number between 0 and 30'));
  const views = program.views;
  if (!Array.isArray(views)) {
    issues.push(shapeIssue('views', 'use 1-8 views'));
    return issues;
  }
  if (views.length < 1 || views.length > 8) issues.push(shapeIssue('views', 'use 1-8 views'));
  const hasDynamics = record(program.dynamics);
  let controls = 0,
    fields = 0,
    curves = 0;
  views.forEach((view, index) => {
    issues.push(...viewShapeIssues(view, index, hasDynamics));
    if (!record(view)) return;
    if (view.kind === 'controls') controls++;
    if (view.kind === 'field') fields++;
    if (Array.isArray(view.curves)) curves += view.curves.length;
  });
  if (controls > 1)
    issues.push(shapeIssue('views', `use at most one controls view (found ${controls})`));
  if (fields > 2) issues.push(shapeIssue('views', `use at most two field views (found ${fields})`));
  if (curves > 12)
    issues.push(shapeIssue('views', `use at most twelve curves in total (found ${curves})`));
  return issues;
}


// A deliberately bounded method-of-lines frontend for 1D diffusion/reaction.
// Lower to the same state variables, expression validation and Worker solver;
// no parallel simulation protocol or arbitrary user code.

// Uniform Cartesian method of lines for the 2D scalar diffusion equation.
// Boundary expressions are evaluated at each node, not at the plotting point.
function lowerSpatial2D(program, dynamics, spec) {
  const invalid = (message) => { throw located('dynamics.spatial', Error(message)); };
  const { nx, ny, xDomain, yDomain, diffusivity, initial, boundary, source = 0,
    equation = 'diffusion' } = spec;
  const domainOK = (d) => Array.isArray(d) && d.length === 2 &&
    d.every((v) => finite(v) && Math.abs(v) <= 1e6) && d[1] > d[0];
  if (dynamics.method !== 'rk45' || equation !== 'diffusion' ||
      dynamics.initial !== undefined || dynamics.derivatives !== undefined || dynamics.massMatrix !== undefined)
    invalid('2D diffusion uses RK45 and replaces initial/derivatives maps');
  if (![nx, ny].every((n) => Number.isInteger(n) && n >= 3 && n <= 7) ||
      !domainOK(xDomain) || !domainOK(yDomain))
    invalid('2D diffusion needs 3–7 nodes per axis and finite increasing domains');
  if (![diffusivity, initial, boundary, source].every((v) =>
    finite(v) || (typeof v === 'string' && v.length > 0 && v.length <= 400)))
    invalid('2D initial, boundary, diffusivity and source need bounded expressions');
  if (finite(diffusivity) && diffusivity < 0) invalid('Diffusivity cannot be negative');
  if ((program.parameters !== undefined && !Array.isArray(program.parameters)) ||
      (program.definitions !== undefined && !record(program.definitions)))
    invalid('Parameters and definitions must have their normal program shapes');
  const dx = (xDomain[1] - xDomain[0]) / (nx - 1);
  const dy = (yDomain[1] - yDomain[0]) / (ny - 1);
  if (dx < 1e-9 || dy < 1e-9) invalid('Grid spacing is too small');
  const id = (i, j) => `gridR${j}C${i}`;
  const rowId = (j) => `gridRow${j}`;
  const used = [...(program.parameters ?? []).map((p) => p?.id), ...Object.keys(program.definitions ?? {})];
  if (used.some((name) => typeof name === 'string' && /^grid(?:R|Value)/.test(name)))
    invalid('gridR*, gridRow* and gridValue are reserved in 2D models');
  const edge = (i, j) => i === 0 || i === nx - 1 || j === 0 || j === ny - 1;
  const local = (value, i, j, allowU) => String(normalizeDemonstrationExpression(value))
    .replace(/(?<![A-Za-z_])x(?![A-Za-z0-9_])/g, `(${xDomain[0] + i * dx})`)
    .replace(/(?<![A-Za-z_])y(?![A-Za-z0-9_])/g, `(${yDomain[0] + j * dy})`)
    .replace(/(?<![A-Za-z_])u(?![A-Za-z0-9_])/g, allowU ? id(i, j) : 'u');
  const value = (i, j) => edge(i, j) ? `(${local(boundary, i, j, false)})` : id(i, j);
  const initialStates = {}, derivatives = {};
  const definitions = { ...program.definitions };
  for (let j = 1; j < ny - 1; j++)
    for (let i = 1; i < nx - 1; i++) {
      const q = id(i, j), a = local(diffusivity, i, j, true);
      const laplace = `(${value(i-1,j)}-2*${q}+${value(i+1,j)})/(${dx})^2+(${value(i,j-1)}-2*${q}+${value(i,j+1)})/(${dy})^2`;
      initialStates[q] = local(initial, i, j, false);
      derivatives[q] = `if((${a})>=0,(${a})*(${laplace})+(${local(source,i,j,true)}),sqrt(-1))`;
    }
  for (let j = 0; j < ny; j++)
    definitions[rowId(j)] = Array.from({ length: nx }, (_, i) =>
      `${value(i,j)}*max(0,1-abs((x-(${xDomain[0]}))/(${dx})-${i}))`).join('+');
  definitions.gridValue = `if(x>=${xDomain[0]}&&x<=${xDomain[1]}&&y>=${yDomain[0]}&&y<=${yDomain[1]},${Array.from({length:ny}, (_,j) =>
    `${rowId(j)}*max(0,1-abs((y-(${yDomain[0]}))/(${dy})-${j}))`).join('+')},sqrt(-1))`;
  const { spatial: _spatial, ...rest } = dynamics;
  return { ...program, definitions, dynamics: { ...rest, initial: initialStates, derivatives } };
}


// Compile a small linear RLC network into ODE states and algebraic MNA
// expressions. Currents are positive p -> n. Capacitor voltage and inductor
// current are independent states; ideal sources are algebraic constraints.

// Matrix state-space models lower into the existing scalar runtime, preserving
// a single solver and making individual states/outputs available to all views.
function lowerStateSpace(program) {
  const dynamics = program.dynamics;
  if (!record(dynamics) || dynamics.stateSpace === undefined) return program;
  const spec = dynamics.stateSpace;
  const invalid = (message) => { throw located('dynamics.stateSpace', Error(message)); };
  if (!record(spec) || !['rk45','sdirk2'].includes(dynamics.method) ||
      dynamics.initial !== undefined || dynamics.derivatives !== undefined ||
      dynamics.spatial !== undefined || dynamics.circuit !== undefined || dynamics.massMatrix !== undefined)
    invalid('State space requires an adaptive solver and replaces other dynamics models');
  const { states, initial, A, B, inputs, C, D, outputs } = spec;
  const n = states?.length, m = inputs?.length, k = outputs?.length;
  const validNames = (ids, max) => Array.isArray(ids) && ids.length >= 1 && ids.length <= max &&
    ids.every(name) && new Set(ids).size === ids.length;
  const validValue = (v) => finite(v) || (typeof v === 'string' && v.length > 0 && v.length <= 100);
  const matrix = (v, rows, cols) => Array.isArray(v) && v.length === rows &&
    v.every(row => Array.isArray(row) && row.length === cols && row.every(validValue));
  if (!validNames(states, dynamics.method === 'sdirk2' ? 8 : 16) ||
      !Array.isArray(initial) || initial.length !== n || !initial.every(validValue) ||
      !Array.isArray(inputs) || m < 1 || m > 4 || !inputs.every(validValue) ||
      !validNames(outputs, 8) || states.some(id => outputs.includes(id)) ||
      !matrix(A,n,n) || !matrix(B,n,m) || !matrix(C,k,n) || !matrix(D,k,m))
    invalid('Need compatible A,B,C,D matrices, 1–16 states (8 stiff), 1–4 inputs and 1–8 outputs');
  const definitions = { ...program.definitions };
  if (outputs.some(id => Object.hasOwn(definitions,id))) invalid('Output name collides with a definition');
  // A and C may depend on parameters/time, but not the states or outputs:
  // a state-space model is linear in its states and input signals.
  const scope = new Set(['t', ...(Array.isArray(program.parameters) ? program.parameters.map(p=>p?.id) : [])]);
  for (const value of [...A.flat(),...B.flat(),...C.flat(),...D.flat(),...inputs]) {
    try { expressionNames(parseDemonstrationExpression(value),scope); }
    catch { invalid('Matrix coefficients and inputs must use only parameters, constants and time'); }
  }
  const formula = (row, vector) => row.flatMap((v,i)=>v===0?[]:[`(${v})*(${vector[i]})`]);
  const combine = (a,b) => [...a,...b].join('+') || '0';
  const derivatives = Object.fromEntries(states.map((id,i)=>[id,combine(formula(A[i],states),formula(B[i],inputs))]));
  outputs.forEach((id,i)=>{ definitions[id]=combine(formula(C[i],states),formula(D[i],inputs)); });
  const {stateSpace: _stateSpace,...rest}=dynamics;
  return {...program,definitions,dynamics:{...rest,initial:Object.fromEntries(states.map((id,i)=>[id,initial[i]])),derivatives}};
}

function lowerCircuitProgram(program) {
  const dynamics = program.dynamics;
  if (!record(dynamics) || dynamics.circuit === undefined) return program;
  const spec = dynamics.circuit;
  const invalid = (message) => { throw located('dynamics.circuit', Error(message)); };
  if (!record(spec) || !['rk45', 'sdirk2'].includes(dynamics.method) ||
      dynamics.spatial !== undefined || dynamics.initial !== undefined ||
      dynamics.derivatives !== undefined || dynamics.massMatrix !== undefined)
    invalid('Circuit needs an adaptive solver and replaces initial/derivatives maps');
  const { nodes, elements } = spec;
  if (!Array.isArray(nodes) || nodes.length < 1 || nodes.length > 5 ||
      new Set(nodes).size !== nodes.length || !nodes.every((id) => typeof id === 'string' && SAFE.test(id)) ||
      !Array.isArray(elements) || elements.length < 1 || elements.length > 10)
    invalid('Use 1–5 unique non-ground nodes and 1–10 elements');
  const ids = new Set();
  for (const e of elements) {
    if (!record(e) || !['R','L','C','V','I'].includes(e.kind) || typeof e.id !== 'string' ||
        !SAFE.test(e.id) || ids.has(e.id) || !['0', ...nodes].includes(e.p) ||
        !['0', ...nodes].includes(e.n) || e.p === e.n)
      invalid('Elements require unique safe ids, R/L/C/V/I kind and different declared p/n nodes');
    ids.add(e.id);
    if (!finite(e.value) && (typeof e.value !== 'string' || !e.value.length || e.value.length > 100))
      invalid('Element values must be finite numbers or short expressions');
    if (['R','L','C'].includes(e.kind) && finite(e.value) && e.value <= 0)
      invalid('R, L and C values must be positive');
    if (['C','L'].includes(e.kind) && e.initial !== undefined &&
        !finite(e.initial) && typeof e.initial !== 'string')
      invalid('Initial capacitor voltage or inductor current must be an expression');
  }
  const branches = elements.filter((e) => e.kind === 'V' || e.kind === 'C');
  const states = elements.filter((e) => e.kind === 'L' || e.kind === 'C');
  const n = nodes.length + branches.length;
  if (n > 6 || states.length < 1 || states.length > 8)
    invalid('MNA supports at most six algebraic unknowns and 1–8 reactive states');
  if ((program.parameters !== undefined && !Array.isArray(program.parameters)) ||
      (program.definitions !== undefined && !record(program.definitions)))
    invalid('Parameters and definitions must have their normal program shapes');
  const parameterScope = new Set((program.parameters ?? []).map((p) => p?.id));
  for (const e of elements.filter((e) => ['C','L'].includes(e.kind))) {
    try { expressionNames(parseDemonstrationExpression(e.value), parameterScope); }
    catch { invalid('Capacitance and inductance must be constants or parameter expressions'); }
  }
  const valueId = (e) => `mnaVal_${e.id}`;
  const stateId = (e) => `mnaState_${e.id}`;
  const voltageId = (id) => `voltage_${id}`;
  const currentId = (e) => `current_${e.id}`;
  const generated = [...nodes.map(voltageId), ...elements.map(currentId), ...elements.map(valueId), ...states.map(stateId)];
  const used = [...(program.parameters ?? []).map((p) => p?.id), ...Object.keys(program.definitions ?? {})];
  if (generated.some((id) => id.length > 40 || used.includes(id))) invalid('Circuit-generated names collide or exceed identifier length');
  const definitions = { ...program.definitions }, initial = {}, derivatives = {};
  const M = Array.from({length:n}, () => Array.from({length:n}, () => []));
  const b = Array.from({length:n}, () => []);
  const nodeIndex = (id) => id === '0' ? -1 : nodes.indexOf(id);
  const v = (id) => id === '0' ? '0' : voltageId(id);
  const stamp = (i,j,term) => { if (i >= 0 && j >= 0) M[i][j].push(term); };
  const inject = (i,term) => { if (i >= 0) b[i].push(term); };
  const sum = (terms) => terms.length ? terms.join('+') : '0';
  for (const e of elements) {
    const i = nodeIndex(e.p), j = nodeIndex(e.n);
    const raw = normalizeDemonstrationExpression(e.value);
    const positive = ['R','L','C'].includes(e.kind);
    definitions[valueId(e)] = positive ? `if((${raw})>0,(${raw}),sqrt(-1))` : raw;
    const ev = valueId(e), q = stateId(e), u = `(${v(e.p)}-${v(e.n)})`;
    if (e.kind === 'R') {
      const g = `1/${ev}`;
      stamp(i,i,g); stamp(j,j,g); stamp(i,j,`(-${g})`); stamp(j,i,`(-${g})`);
      definitions[currentId(e)] = `${u}/${ev}`;
    } else if (e.kind === 'I' || e.kind === 'L') {
      const k = e.kind === 'I' ? ev : q;
      inject(i,`(-${k})`); inject(j,k);
      definitions[currentId(e)] = k;
      if (e.kind === 'L') {
        initial[q] = e.initial ?? 0;
        derivatives[q] = `${u}/${ev}`;
      }
    } else {
      const k = nodes.length + branches.indexOf(e);
      stamp(i,k,'1'); stamp(j,k,'-1'); stamp(k,i,'1'); stamp(k,j,'-1');
      inject(k,e.kind === 'V' ? ev : q);
      if (e.kind === 'C') {
        initial[q] = e.initial ?? 0;
        derivatives[q] = `${currentId(e)}/${ev}`;
      }
    }
  }
  const args = [...M.flatMap((row) => row.map(sum)), ...b.map(sum)].join(',');
  nodes.forEach((id,i) => { definitions[voltageId(id)] = `solveN(${i+1},${n},${args})`; });
  branches.forEach((e,i) => { definitions[currentId(e)] = `solveN(${nodes.length+i+1},${n},${args})`; });
  const { circuit: _circuit, ...rest } = dynamics;
  return { ...program, definitions, dynamics: { ...rest, initial, derivatives } };
}


// Matrix-free rectangular diffusion. A first-order split backward Euler
// discretization requires only independent tridiagonal row/column solves.
function implicitGridSpec(program) {
  const d=program.dynamics;
  if (!record(d) || d.method !== 'grid-implicit') return null;
  const s=d.spatial;
  const fail=message=>{throw located('dynamics.spatial',Error(message));};
  if (!record(s) || (s.equation ?? 'diffusion') !== 'diffusion' ||
      ![undefined,1,2].includes(s.dimension) ||
      ['initial','derivatives','massMatrix','algebraic','events','circuit','stateSpace','rtol','atol'].some(k=>d[k]!==undefined))
    fail('grid-implicit is for standalone linear diffusion with fixed Dirichlet boundaries');
  const two=s.dimension===2, nx=two?s.nx:s.nodes, ny=two?s.ny:1;
  const x=two?s.xDomain:s.domain, y=two?s.yDomain:[0,1];
  const domain=d=>Array.isArray(d)&&d.length===2&&d.every(v=>finite(v)&&Math.abs(v)<=1e6)&&d[1]-d[0]>=1e-8;
  if (!Number.isInteger(nx)||nx<3||nx>(two?65:257)||!Number.isInteger(ny)||(two&&(ny<3||ny>65))||!domain(x)||!domain(y))
    fail('Use 3–257 nodes in 1D or 3–65 per axis in 2D, with increasing numeric domains');
  const steps=Math.ceil(d.duration/d.step);
  if (!finite(d.duration)||d.duration<=0||d.duration>300||!finite(d.step)||d.step<1e-6||d.step>1||
      !Number.isInteger(steps)||steps>2000||nx*ny*(steps+1)>2000000)
    fail('Grid history exceeds 2000 steps or 2,000,000 stored values; increase step or reduce resolution');
  if ((program.parameters!==undefined&&!Array.isArray(program.parameters))||
      (program.definitions!==undefined&&!record(program.definitions))) fail('Invalid parameters or definitions');
  const params=(program.parameters??[]).map(p=>p?.id);
  if ([...params,...Object.keys(program.definitions??{})].some(id=>['gridValue','gridMean','gridClock'].includes(id)))
    fail('gridValue, gridMean and gridClock are reserved');
  const check=(v,scope)=>{
    try {expressionNames(parseDemonstrationExpression(v),new Set(scope));}
    catch(error){fail(error instanceof Error?error.message:String(error));}
  };
  check(s.diffusivity,params);
  if(finite(s.diffusivity)&&s.diffusivity<0)fail('Diffusivity must be nonnegative');
  const coordinates=[...params,'x',...(two?['y']:[])];
  for(const v of [s.initial,s.source??0,...(two?[s.boundary]:[s.left,s.right])])check(v,coordinates);
  return {two,nx,ny,x,y,steps,dt:d.duration/steps,s,duration:d.duration};
}

// Bounded structured vector/matrix expressions. Scalar projections of named
// arrays use ordinary definition identifiers, so all existing views work.
function lowerLinearAlgebra(program) {
  if (program.linearAlgebra === undefined) return program;
  const fail=message=>{throw located('linearAlgebra',Error(message));};
  if (!Array.isArray(program.linearAlgebra)||program.linearAlgebra.length<1||program.linearAlgebra.length>12||
      (program.definitions!==undefined&&!record(program.definitions))||
      (program.parameters!==undefined&&!Array.isArray(program.parameters)))fail('Use 1–12 ordered algebra entries');
  const definitions={...program.definitions}, arrays=new Map(), ids=new Set();
  const used=new Set([...(program.parameters??[]).map(p=>p?.id),...Object.keys(definitions),
    ...Object.keys(program.dynamics?.initial??{}),...Object.keys(program.dynamics?.algebraic?.guess??{})]);
  const scalar=v=>finite(v)||(typeof v==='string'&&v.length>0&&v.length<=1600);
  const emit=(id,expr)=>{
    if(!name(id)||used.has(id)||ids.has(id))fail('Duplicate or invalid generated identifier: '+id);
    if(Object.keys(definitions).length>=24)fail('Algebra components and definitions share the 24-definition limit');
    definitions[id]=expr;used.add(id);return id;
  };
  const ref=id=>{if(!arrays.has(id))fail('Array must refer to an earlier vector or matrix: '+id);return arrays.get(id);};
  const equal=(a,b)=>a.length===b.length&&a[0].length===b[0].length&&a.vector===b.vector;
  const term=(a,b)=>`(${a})*(${b})`;
  const sum=terms=>terms.join('+')||'0';
  for(const e of program.linearAlgebra){
    if(!record(e)||!name(e.id)||ids.has(e.id)||used.has(e.id))fail('Entry requires a distinct safe identifier');
    const {id,op}=e;
    let rows,vector=false,result;
    if(op==='vector'){
      if(!Array.isArray(e.values)||e.values.length<1||e.values.length>6||!e.values.every(scalar))fail('Vector needs 1–6 scalar components');
      rows=e.values.map(v=>[v]);vector=true;
    }else if(op==='matrix'){
      if(!Array.isArray(e.values)||e.values.length<1||e.values.length>6||
          !Array.isArray(e.values[0])||e.values[0].length<1||e.values[0].length>6||
          !e.values.every(r=>Array.isArray(r)&&r.length===e.values[0].length&&r.every(scalar)))fail('Matrix needs rectangular 1–6 by 1–6 entries');
      rows=e.values;
    }else{
      const a=ref(e.a);
      vector=a.vector;
      if(op==='scale'){
        if(!scalar(e.factor))fail('Scale needs a scalar factor');
        rows=a.map(r=>r.map(v=>term(e.factor,v)));
      }else if(op==='transpose'){
        rows=a[0].map((_,j)=>a.map(r=>r[j]));vector=false;
      }else if(op==='norm'){
        if(!a.vector)fail('Norm needs a vector');
        result=`sqrt(${sum(a.map(r=>term(r[0],r[0])))})`;
      }else{
        const b=ref(e.b);
        if(op==='add'||op==='sub'){
          if(!equal(a,b))fail('Array shapes must match');
          rows=a.map((r,i)=>r.map((v,j)=>`(${v})${op==='add'?'+':'-'}(${b[i][j]})`));
        }else if(op==='dot'){
          if(!a.vector||!b.vector||!equal(a,b))fail('Dot product needs equal-length vectors');
          result=sum(a.map((r,i)=>term(r[0],b[i][0])));
        }else if(op==='cross'){
          if(!a.vector||!b.vector||a.length!==3||b.length!==3)fail('Cross product needs two 3-vectors');
          rows=[0,1,2].map(i=>[`${term(a[(i+1)%3][0],b[(i+2)%3][0])}-${term(a[(i+2)%3][0],b[(i+1)%3][0])}`]);
        }else if(op==='matmul'){
          if(a.vector||a[0].length!==b.length)fail('Incompatible matrix multiplication dimensions');
          rows=a.map(r=>b[0].map((_,j)=>sum(r.map((v,k)=>term(v,b[k][j])))));
          vector=b.vector;
        }else fail('Unknown linear algebra operation');
      }
    }
    if(result!==undefined){emit(id,result);ids.add(id);continue;}
    ids.add(id);
    const components=rows.map((r,i)=>r.map((v,j)=>emit(vector?`${id}_${i+1}`:`${id}_${i+1}_${j+1}`,v)));
    components.vector=vector;arrays.set(id,components);
  }
  const {linearAlgebra:_linearAlgebra,...rest}=program;
  return {...rest,definitions};
}

function lowerImplicitGrid(program) {
  const grid=implicitGridSpec(program);
  if(!grid)return program;
  const {spatial:_spatial,...rest}=program.dynamics;
  // Validation uses symbolic placeholders only. At runtime gridValue and
  // gridMean are resolved by the numerical grid, never by these expressions.
  return {...program,definitions:{...program.definitions,gridValue:'0*x+0*y+0*t',gridMean:'0*t'},
    dynamics:{...rest,method:'rk45',initial:{gridClock:0},derivatives:{gridClock:1}}};
}
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
  return {duration,value,mean(t){const [lo,hi,f]=interval(t);return means[lo]*(1-f)+means[hi]*f;}};
}

function lowerSpatialProgram(program) {
  const dynamics = program.dynamics;
  if (!record(dynamics) || dynamics.spatial === undefined) return program;
  const spec = dynamics.spatial;
  if (record(spec) && spec.dimension === 2) return lowerSpatial2D(program, dynamics, spec);
  const invalid = (message) => { throw located('dynamics.spatial', Error(message)); };
  if (!record(spec) || (spec.dimension !== undefined && spec.dimension !== 1) || dynamics.method !== 'rk45' ||
      dynamics.initial !== undefined || dynamics.derivatives !== undefined)
    invalid('Spatial diffusion requires RK45 and replaces initial/derivatives maps');
  const { nodes, domain, diffusivity, initial, left, right, source = 0,
    equation = 'diffusion', speed, initialVelocity = 0, damping = 0 } = spec;
  if (!['diffusion', 'wave'].includes(equation)) invalid('Use diffusion or wave');
  const wave = equation === 'wave';
  if (!Number.isInteger(nodes) || nodes < 3 || nodes > (wave ? 18 : 24) ||
      !Array.isArray(domain) || domain.length !== 2 ||
      !domain.every((v) => finite(v) && Math.abs(v) <= 1e6) || domain[0] >= domain[1])
    invalid('Use 3–24 nodes and a finite increasing numeric domain');
  for (const value of [wave ? speed : diffusivity, initial, left, right, source,
    ...(wave ? [initialVelocity, damping] : [])])
    if (!finite(value) && (typeof value !== 'string' || !value.length || value.length > 1600))
      invalid('Diffusivity, initial profile, left/right boundary and source must be mathematical expressions');
  if (!wave && finite(diffusivity) && diffusivity < 0) invalid('Diffusivity cannot be negative');
  if (wave && finite(speed) && speed <= 0) invalid('Wave speed must be positive');
  if (wave && finite(damping) && damping < 0) invalid('Damping must be nonnegative');
  if (dynamics.massMatrix !== undefined) invalid('Spatial models cannot also declare a mass matrix');
  const dx = (domain[1] - domain[0]) / (nodes - 1);
  if (!finite(dx) || dx < 1e-9) invalid('Grid spacing is too small');
  const stateName = (i) => `grid${i}`;
  const velocityName = (i) => `gridV${i}`;
  const parts = Array.from({ length: Math.ceil(nodes / 4) }, (_, i) => `gridPart${i}`);
  const generated = [...Array.from({ length: nodes }, (_, i) => stateName(i)),
    ...(wave ? Array.from({ length: nodes - 2 }, (_, i) => velocityName(i + 1)) : []),
    ...parts, 'gridValue'];
  if ((program.parameters !== undefined && !Array.isArray(program.parameters)) ||
      (program.definitions !== undefined && !record(program.definitions)))
    invalid('Parameters and definitions must have their normal program shapes');
  const used = new Set([...(program.parameters ?? []).map((p) => p?.id), ...Object.keys(program.definitions ?? {})]);
  if (generated.some((id) => used.has(id))) invalid('grid names are reserved inside spatial models');
  const definitions = { ...program.definitions };
  const initialStates = {}, derivatives = {};
  // Explicit variable tokens only; the parser will validate every lowered expression.
  const local = (expression, i, allowU) => String(normalizeDemonstrationExpression(expression))
    .replace(/(?<![A-Za-z_])x(?![A-Za-z0-9_])/g, `(${domain[0] + i * dx})`)
    .replace(/(?<![A-Za-z_])u(?![A-Za-z0-9_])/g, allowU ? stateName(i) : 'u');
  definitions.grid0 = local(left, 0, false);
  definitions[stateName(nodes - 1)] = local(right, nodes - 1, false);
  for (let i = 1; i < nodes - 1; i++) {
    initialStates[stateName(i)] = local(initial, i, false);
    const laplace = `(${stateName(i-1)}-2*${stateName(i)}+${stateName(i+1)})/(${dx})^2`;
    if (wave) {
      const c = local(speed, i, true), damp = local(damping, i, true);
      initialStates[velocityName(i)] = local(initialVelocity, i, false);
      derivatives[stateName(i)] = velocityName(i);
      derivatives[velocityName(i)] = `if((${c})>0&&(${damp})>=0,(${c})^2*(${laplace})-(${damp})*${velocityName(i)}+(${local(source, i, true)}),sqrt(-1))`;
    } else {
      const alpha = local(diffusivity, i, true);
      derivatives[stateName(i)] = `if((${alpha})>=0,(${alpha})*(${laplace})+(${local(source, i, true)}),sqrt(-1))`;
    }
  }
  for (let part = 0; part < parts.length; part++) {
    const terms = [];
    for (let i = part * 4; i < Math.min(nodes, (part + 1) * 4); i++)
      terms.push(`${stateName(i)}*max(0,1-abs((x-(${domain[0]}))/(${dx})-${i}))`);
    definitions[parts[part]] = terms.join('+');
  }
  definitions.gridValue = `if(x>=${domain[0]}&&x<=${domain[1]},${parts.join('+')},sqrt(-1))`;
  const { spatial: _spatial, ...rest } = dynamics;
  return { ...program, definitions, dynamics: { ...rest, initial: initialStates, derivatives } };
}

/* ---------- Validation ---------- */
const name = (value) =>
  typeof value === 'string' &&
  SAFE.test(value) &&
  !RESERVED.has(value) &&
  !Object.hasOwn(functions, value);
const range = (value) =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((v) => (finite(v) && Math.abs(v) <= 1e6) || typeof v === 'string') &&
  (!value.every(finite) || value[0] < value[1]);
const text = (value) => value === undefined || (typeof value === 'string' && value.length <= 200);
/** An error that remembers which part of the program it belongs to. */
function located(path, error) {
  const message = error instanceof Error ? error.message : String(error);
  const result = Error(`${path}: ${message}`);
  result.path = path;
  result.detail = message;
  return result;
}
const at = (path, fn) => {
  try {
    return fn();
  } catch (error) {
    if (error instanceof Error && error.path) throw error;
    throw located(path, error);
  }
};
/** Validate identifiers, syntax, dependencies and finite resource limits before storage. */
export function validateDemonstration(input) {
  try {
    if (!record(input) && typeof input !== 'string')
      throw Error(
        'Demonstration requires a program object: {version:1, parameters, definitions, views}',
      );
    let program = normalizeDemonstrationProgram(input);
    if (!record(program))
      throw Error(
        'Demonstration requires a program object: {version:1, parameters, definitions, views}',
      );
    if (program.version !== 1)
      throw located('version', Error('Demonstration requires version 1 inside program'));
    if (
      program.resetKey !== undefined &&
      (typeof program.resetKey !== 'string' || program.resetKey.length > 80)
    )
      throw located('resetKey', Error('resetKey must be a string of at most 80 characters'));
    if (JSON.stringify(program).length > 40000) throw Error('Demonstration is too large');
    program = lowerSpatialProgram(lowerCircuitProgram(lowerStateSpace(lowerImplicitGrid(lowerLinearAlgebra(program)))));
    const shape = demonstrationShapeIssues(program);
    if (shape.length) {
      const issues = shape.slice(0, SHAPE_ISSUE_LIMIT);
      return {
        ok: false,
        error: issues.map(formatShapeIssue).join('; '),
        path: issues[0].path,
        issues,
      };
    }
    const params = program.parameters ?? [],
      definitions = program.definitions ?? {},
      dynamics = program.dynamics;
    if (!Array.isArray(params) || params.length > 12)
      throw located('parameters', Error('Use a list of at most 12 parameters'));
    if (!record(definitions) || Object.keys(definitions).length > 24)
      throw located('definitions', Error('Use a map of at most 24 definitions'));
    const allowed = new Set(['x', 'y', 't', 'pi', 'e']);
    params.forEach((p, i) =>
      at(`parameters.${record(p) && typeof p.id === 'string' ? p.id : `[${i}]`}`, () => {
        if (!record(p)) throw Error('Parameter must be an object');
        if (!name(p.id))
          throw Error(
            `id must be an ASCII identifier that is not x, y, t, pi, e or a function name`,
          );
        if (allowed.has(p.id)) throw Error('Duplicate or reserved parameter id');
        if (!text(p.label) || !text(p.unit))
          throw Error('label and unit must be text of at most 200 characters');
        if (![p.min, p.max, p.value].every(finite))
          throw Error('min, max and value must be numbers');
        if (p.min >= p.max || p.value < p.min || p.value > p.max)
          throw Error('Needs min < max and value inside [min, max]');
        if (p.step !== undefined && (!finite(p.step) || p.step <= 0))
          throw Error('step must be a positive number');
        allowed.add(p.id);
      }),
    );
    const check = (expression, scope = allowed, used) => {
      const ast = parseDemonstrationExpression(expression);
      expressionNames(ast, scope, used);
      return ast;
    };
    if (dynamics !== undefined) {
      at('dynamics', () => {
        if (!record(dynamics) || !record(dynamics.initial) || !record(dynamics.derivatives))
          throw Error('Dynamics needs initial and derivatives maps');
        const adaptive = ['rk45', 'sdirk2'].includes(dynamics.method);
        if (dynamics.method !== undefined && !['rk4', 'rk45', 'sdirk2'].includes(dynamics.method))
          throw Error('Unknown dynamics method; use rk4, rk45 or sdirk2');
        if (
          !finite(dynamics.duration) || dynamics.duration <= 0 ||
          dynamics.duration > (adaptive ? 300 : 30) ||
          !finite(dynamics.step) || dynamics.step < (adaptive ? 1e-6 : 0.002) ||
          dynamics.step > (adaptive ? 1 : 0.05) ||
          Math.ceil(dynamics.duration / dynamics.step) > 10000
        )
          throw Error('Dynamics duration and maximum step exceed the solver resource limits');
        for (const key of ['rtol', 'atol']) {
          if (dynamics[key] !== undefined &&
              (!adaptive || !finite(dynamics[key]) || dynamics[key] < 1e-10 || dynamics[key] > 0.01))
            throw Error('Adaptive tolerances must be between 1e-10 and 0.01');
        }
        if (dynamics.events !== undefined &&
            (!adaptive || !Array.isArray(dynamics.events) || dynamics.events.length > 8))
          throw Error('Events require an adaptive solver and at most eight event definitions');
      });
      const keys = Object.keys(dynamics.initial);
      const maxStates = dynamics.method === 'sdirk2' ? 8 : dynamics.method === 'rk45' ? 32 : 6;
      if (!keys.length || keys.length > maxStates)
        throw located('dynamics.initial', Error(`Dynamics supports 1–${maxStates} states`));
      for (const key of keys) {
        at(`dynamics.initial.${key}`, () => {
          if (!name(key) || allowed.has(key))
            throw Error('Invalid state name, or it collides with a parameter');
          check(dynamics.initial[key]);
        });
        if (dynamics.derivatives[key] === undefined)
          throw located(`dynamics.derivatives.${key}`, Error('Every state needs a derivative'));
      }
      for (const key of Object.keys(dynamics.derivatives))
        if (!keys.includes(key))
          throw located(
            `dynamics.derivatives.${key}`,
            Error('Derivative has no matching initial state'),
          );
      if (dynamics.massMatrix !== undefined &&
          (!['rk45', 'sdirk2'].includes(dynamics.method) || keys.length > 8 ||
            !Array.isArray(dynamics.massMatrix) || dynamics.massMatrix.length !== keys.length ||
            dynamics.massMatrix.some((row) => !Array.isArray(row) || row.length !== keys.length)))
        throw located('dynamics.massMatrix', Error('A square mass matrix of 1–8 states requires an adaptive solver'));
      keys.forEach((key) => allowed.add(key));
      if (dynamics.algebraic !== undefined) {
        const a = dynamics.algebraic;
        if (!['rk45','sdirk2'].includes(dynamics.method) || !record(a) || !record(a.guess) || !record(a.residuals))
          throw located('dynamics.algebraic', Error('Algebraic constraints require an adaptive solver, guess and residuals maps'));
        const ids = Object.keys(a.guess);
        if (!ids.length || ids.length > 4 || Object.keys(a.residuals).length !== ids.length ||
            ids.some(id => !name(id) || allowed.has(id) || !Object.hasOwn(a.residuals,id)))
          throw located('dynamics.algebraic', Error('Use 1–4 distinct algebraic names with matching residual equations'));
        if (a.tolerance !== undefined && (!finite(a.tolerance) || a.tolerance < 1e-12 || a.tolerance > 1e-3))
          throw located('dynamics.algebraic.tolerance', Error('Residual tolerance must be 1e-12–1e-3'));
        const guessScope = new Set(['pi','e',...params.map(p=>p.id)]);
        for (const id of ids) at(`dynamics.algebraic.guess.${id}`, () => check(a.guess[id],guessScope));
        ids.forEach(id=>allowed.add(id));
      }
    }
    // Definitions may appear in any order; reject only genuine cycles.
    const defKeys = Object.keys(definitions);
    for (const key of defKeys)
      at(`definitions.${key}`, () => {
        if (!name(key))
          throw Error(
            'Definition name must be an ASCII identifier that is not x, y, t, pi, e or a function name',
          );
        if (allowed.has(key)) throw Error('Definition name collides with a parameter or state');
      });
    defKeys.forEach((key) => allowed.add(key));
    const dependencies = new Map();
    for (const [key, value] of Object.entries(definitions)) {
      const used = new Set();
      at(`definitions.${key}`, () => check(value, allowed, used));
      dependencies.set(
        key,
        [...used].filter((item) => dependencies.has(item) || defKeys.includes(item)),
      );
    }
    const state = new Map();
    const visit = (key, trail) => {
      if (state.get(key) === 2) return;
      if (state.get(key) === 1)
        throw located(
          `definitions.${key}`,
          Error(
            `Definitions form a cycle: ${[...trail.slice(trail.indexOf(key)), key].join(' → ')}`,
          ),
        );
      state.set(key, 1);
      for (const next of dependencies.get(key) ?? []) visit(next, [...trail, key]);
      state.set(key, 2);
    };
    defKeys.forEach((key) => visit(key, []));
    if (dynamics)
      for (const key of Object.keys(dynamics.initial))
        at(`dynamics.derivatives.${key}`, () => check(dynamics.derivatives[key]));
    for (const [key, value] of Object.entries(dynamics?.algebraic?.residuals ?? {}))
      at(`dynamics.algebraic.residuals.${key}`, () => check(value));
    for (const [i, row] of (dynamics?.massMatrix ?? []).entries())
      for (const [j, value] of row.entries())
        at(`dynamics.massMatrix[${i}][${j}]`, () => check(value));
    for (const [i, event] of (dynamics?.events ?? []).entries()) {
      at(`dynamics.events[${i}]`, () => {
        if (!record(event) || ![-1, 0, 1].includes(event.direction ?? 0) ||
            (event.terminal !== undefined && typeof event.terminal !== 'boolean'))
          throw Error('Event needs expression, direction -1/0/1 and optional boolean terminal');
        check(event.expression);
        if (event.reset !== undefined && !record(event.reset))
          throw Error('Event reset must be a map of state expressions');
        if (!event.terminal && !Object.keys(event.reset ?? {}).length)
          throw Error('Event must stop the simulation or reset at least one state');
        for (const [key, expression] of Object.entries(event.reset ?? {})) {
          if (!Object.hasOwn(dynamics.initial, key)) throw Error('Event reset must target a state');
          check(expression);
        }
      });
    }
    const views = program.views;
    if (!Array.isArray(views) || !views.length || views.length > 8)
      throw located('views', Error('Demonstration requires 1–8 views'));
    let fields = 0,
      curves = 0,
      controls = 0;
    views.forEach((view, i) => {
      const path = `views[${i}]`;
      at(path, () => {
        if (!record(view) || !text(view.label) || !text(view.xLabel) || !text(view.yLabel))
          throw Error('View must be an object with text labels of at most 200 characters');
      });
      for (const axis of ['x', 'y']) {
        const scale = view[`${axis}Scale`];
        if (scale !== undefined && (view.kind !== 'plot' || !['linear', 'log'].includes(scale)))
          throw located(`${path}.${axis}Scale`, Error('Use linear or log scales on plots only'));
        if (scale === 'log' && Array.isArray(view[axis]) && view[axis].some((v) => finite(v) && v <= 0))
          throw located(`${path}.${axis}`, Error('Logarithmic axis needs positive bounds'));
      }
      if (view.sliceY !== undefined) {
        if (view.kind !== 'plot' || view.history)
          throw located(`${path}.sliceY`, Error('Spatial slice is available on non-history plots only'));
        at(`${path}.sliceY`, () => check(view.sliceY));
      }
      if (view.history !== undefined &&
          (view.kind !== 'plot' || typeof view.history !== 'boolean' || (view.history && !dynamics)))
        throw located(`${path}.history`, Error('History requires a plot with dynamics'));
      if (view.kind === 'controls') {
        controls++;
        return;
      }
      if (view.kind === 'metrics') {
        if (!Array.isArray(view.values) || view.values.length > 6 || !view.values.length)
          throw located(`${path}.values`, Error('Use 1–6 metrics'));
        view.values.forEach((m, j) =>
          at(`${path}.values[${j}]`, () => {
            if (
              !record(m) ||
              !text(m.label) ||
              !text(m.unit) ||
              (m.digits !== undefined &&
                (!Number.isInteger(m.digits) || m.digits < 0 || m.digits > 5))
            )
              throw Error('Metric needs label, expression, optional unit and digits 0–5');
            check(m.expression);
          }),
        );
        return;
      }
      if (!['plot', 'field', 'trajectory', 'scene'].includes(view.kind))
        throw located(
          `${path}.kind`,
          Error(
            `Unknown demonstration view kind "${String(view.kind).slice(0, 40)}"; use controls, plot, field, trajectory, scene or metrics`,
          ),
        );
      for (const axis of ['x', 'y'])
        at(`${path}.${axis}`, () => {
          if (!range(view[axis])) throw Error('Needs an increasing [min, max] range within ±1e6');
          view[axis].forEach((v) => check(v));
        });
      if (view.kind === 'scene') {
        if (!Array.isArray(view.objects) || !view.objects.length || view.objects.length > 32)
          throw located(`${path}.objects`, Error('Use 1–32 scene objects'));
        view.objects.forEach((object, j) => {
          const objectPath = `${path}.objects[${j}]`;
          at(objectPath, () => {
            if (
              !record(object) ||
              !['body', 'block', 'rod', 'spring', 'vector', 'path', 'resistor', 'capacitor', 'inductor', 'voltageSource', 'currentSource', 'dimension', 'pin', 'roller', 'ground'].includes(object.kind)
            )
              throw Error('Unknown scene object kind; use a documented mechanical or electrical symbol');
            if (!text(object.label))
              throw Error('Object label must be text of at most 200 characters');
            if (
              object.color !== undefined &&
              !['ink', 'muted', 'blue', 'orange', 'red', 'green', 'violet'].includes(object.color)
            )
              throw Error('Use a documented scene color');
          });
          if (object.kind === 'path') {
            at(`${objectPath}.points`, () => {
              if (
                !Array.isArray(object.points) ||
                object.points.length < 2 ||
                object.points.length > 64
              )
                throw Error('Path needs 2–64 coordinate pairs');
              for (const point of object.points) {
                if (!Array.isArray(point) || point.length !== 2)
                  throw Error('Path points need two expressions');
                point.forEach((value) => check(value));
              }
              for (const key of ['closed', 'dashed'])
                if (object[key] !== undefined && typeof object[key] !== 'boolean')
                  throw Error('closed and dashed must be booleans');
            });
          }
          const pairs =
            object.kind === 'path'
              ? []
              : ['body', 'block'].includes(object.kind)
                ? ['center']
                : ['from', 'to'];
          for (const key of pairs)
            at(`${objectPath}.${key}`, () => {
              if (!Array.isArray(object[key]) || object[key].length !== 2)
                throw Error('Needs two coordinate expressions');
              object[key].forEach((value) => check(value));
            });
          const sizes =
            object.kind === 'body'
              ? ['radius']
              : object.kind === 'block'
                ? ['width', 'height']
                : [];
          for (const key of sizes)
            at(`${objectPath}.${key}`, () => {
              check(object[key]);
              if (typeof object[key] === 'number' && object[key] <= 0)
                throw Error('Size must be positive');
            });
          if (object.angle !== undefined) at(`${objectPath}.angle`, () => check(object.angle));
        });
      } else if (view.kind === 'field') {
        fields++;
        if (view.presentation !== undefined && !['map', 'surface'].includes(view.presentation))
          throw located(`${path}.presentation`, Error('Field presentation must be map or surface'));
        if (view.surfaceStyle !== undefined && (view.presentation !== 'surface' || !['wireframe','shaded'].includes(view.surfaceStyle)))
          throw located(`${path}.surfaceStyle`, Error('Surface style must be wireframe or shaded on a surface'));
        if (view.presentation === 'surface') {
          if (!range(view.zRange)) throw located(`${path}.zRange`, Error('Surface needs increasing z bounds'));
          view.zRange.forEach((v) => check(v));
          if (view.vector !== undefined || view.contours !== undefined || view.colorRange !== undefined)
            throw located(path, Error('Surface is a wireframe view; use a separate map for contours, vectors or color calibration'));
        } else if (view.zRange !== undefined) throw located(`${path}.zRange`, Error('zRange requires surface presentation'));
        at(`${path}.expression`, () => check(view.expression));
        for (const key of ['gamma', 'exposure', 'vectorScale'])
          if (view[key] !== undefined) at(`${path}.${key}`, () => check(view[key]));
        if (view.colorRange !== undefined) {
          if (view.palette !== 'heat' || !range(view.colorRange))
            throw located(`${path}.colorRange`, Error('Calibrated range requires heat palette and increasing bounds'));
          view.colorRange.forEach((value) => check(value));
        }
        if (!text(view.unit)) throw located(`${path}.unit`, Error('Unit must be text'));
        if (view.contours !== undefined) {
          if (!Array.isArray(view.contours) || view.contours.length < 1 || view.contours.length > 6)
            throw located(`${path}.contours`, Error('Use 1–6 contour levels'));
          view.contours.forEach((value) => check(value));
        }
        if (view.vectorScale !== undefined && (!view.vector || (finite(view.vectorScale) && view.vectorScale <= 0)))
          throw located(`${path}.vectorScale`, Error('Vector scale requires a vector and positive reference magnitude'));
        if (view.vector !== undefined)
          at(`${path}.vector`, () => {
            if (!Array.isArray(view.vector) || view.vector.length !== 2)
              throw Error('Field vector needs two expressions');
            view.vector.forEach((v) => check(v));
          });
        if (
          view.height !== undefined &&
          (!finite(view.height) || view.height < 64 || view.height > 320)
        )
          throw located(`${path}.height`, Error('Field height must be 64–320'));
        if (view.palette !== undefined && !['light', 'signed', 'heat'].includes(view.palette))
          throw located(
            `${path}.palette`,
            Error('Unknown field palette; use light, signed or heat'),
          );
        if (
          view.tint !== undefined &&
          (!Array.isArray(view.tint) ||
            view.tint.length !== 3 ||
            view.tint.some((v) => !finite(v) || v < 0 || v > 1))
        )
          throw located(`${path}.tint`, Error('Field tint is three 0–1 color channels'));
      } else if (view.kind === 'plot') {
        if (!Array.isArray(view.curves) || !view.curves.length || view.curves.length > 6)
          throw located(`${path}.curves`, Error('Use 1–6 curves per plot'));
        view.curves.forEach((c, j) =>
          at(`${path}.curves[${j}]`, () => {
            if (!record(c) || !text(c.label))
              throw Error('Curve needs an expression and an optional text label');
            check(c.expression);
            curves++;
          }),
        );
        if (view.markers !== undefined) {
          if (!Array.isArray(view.markers) || view.markers.length > 8)
            throw located(`${path}.markers`, Error('Use at most 8 markers'));
          view.markers.forEach((m, j) =>
            at(`${path}.markers[${j}]`, () => {
              if (!record(m) || !text(m.label))
                throw Error('Marker needs x, y and an optional text label');
              check(m.x);
              check(m.y);
            }),
          );
        }
      } else {
        if (!dynamics) throw located(path, Error('Trajectory requires dynamics'));
        at(`${path}.horizontal`, () => check(view.horizontal));
        at(`${path}.vertical`, () => check(view.vertical));
      }
    });
    if (fields > 2 || curves > 12 || controls > 1)
      throw located(
        'views',
        Error('Use at most two field views, twelve curves and one controls slot'),
      );
    if (
      program.duration !== undefined &&
      (!finite(program.duration) || program.duration <= 0 || program.duration > 30)
    )
      throw located('duration', Error('Duration must be 0–30 s'));
    if (program.presets !== undefined) {
      if (!Array.isArray(program.presets) || program.presets.length > 4)
        throw located('presets', Error('Use at most four presets'));
      program.presets.forEach((preset, i) =>
        at(`presets[${i}]`, () => {
          if (!record(preset) || !text(preset.label) || !record(preset.values))
            throw Error('Preset needs a label and a values map');
          for (const [key, value] of Object.entries(preset.values)) {
            const p = params.find((p) => p.id === key);
            if (!p) throw Error(`Unknown parameter ${key}`);
            check(value);
            if (typeof value === 'number' && (!finite(value) || value < p.min || value > p.max))
              throw Error(`Value for ${key} must be a number inside its range`);
          }
        }),
      );
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid demonstration';
    return error instanceof Error && error.path
      ? { ok: false, error: message, path: error.path }
      : { ok: false, error: message };
  }
}

/* ---------- Runtime ---------- */
/** Synchronous entry point for server and shared consumers. */
export function createDemonstrationRuntime(input, values = {}) {
  const steps = compileDemonstrationRuntime(input)(values);
  let next = steps.next();
  while (!next.done) next = steps.next();
  return next.value;
}

/** Share validation, expression compilation and dependency analysis across parameter changes. */
export function compileDemonstrationRuntime(input) {
  let program = normalizeDemonstrationProgram(input);
  const validation = validateDemonstration(program);
  if (!validation.ok) {
    const error = Error(validation.error);
    if (validation.path) error.path = validation.path;
    throw error;
  }
  const implicitGrid = implicitGridSpec(lowerLinearAlgebra(program));
  program = lowerSpatialProgram(lowerCircuitProgram(lowerStateSpace(lowerImplicitGrid(lowerLinearAlgebra(program)))));
  const compiled = new Map();
  const compile = (expression) => {
    const key = typeof expression === 'number' ? `#${expression}` : String(expression);
    if (!compiled.has(key)) compiled.set(key, parseDemonstrationExpression(expression));
    return compiled.get(key);
  };
  const definitions = new Map(Object.entries(program.definitions ?? {}));
  const stateNames = Object.keys(program.dynamics?.initial ?? {});
  const flags = new Map([['x', 1], ['y', 2], ['t', 4], ...stateNames.map((name) => [name, 4]), ...Object.keys(program.dynamics?.algebraic?.guess ?? {}).map(name=>[name,4])]);
  const expressionMasks = new Map();
  const definitionMasks = new Map();
  function dependencies(expression) {
    if (expressionMasks.has(expression)) return expressionMasks.get(expression);
    const mask = astMask(compile(expression), new Set());
    expressionMasks.set(expression, mask);
    return mask;
  }
  function astMask(ast, locals) {
    if (ast.kind === 'variable') {
      const name = ast.name;
      if (locals.has(name)) return 0;
      if (!definitions.has(name)) return flags.get(name) ?? 0;
      if (!definitionMasks.has(name))
        definitionMasks.set(name, dependencies(definitions.get(name)));
      return definitionMasks.get(name);
    }
    if (ast.kind === 'unary') return astMask(ast.arg, locals);
    if (ast.kind === 'binary') return astMask(ast.left, locals) | astMask(ast.right, locals);
    if (ast.kind !== 'call') return 0;
    if (ast.name === 'sum' || ast.name === 'iterate') {
      return (
        astMask(ast.args[1], locals) |
        astMask(ast.args[2], locals) |
        astMask(ast.args[3], new Set([...locals, ast.args[0].name]))
      );
    }
    return ast.args.reduce((mask, arg) => mask | astMask(arg, locals), 0);
  }

  return (values = {}) =>
    prepareRuntime(program, definitions, stateNames, compile, dependencies, values, implicitGrid);
}


// Dormand–Prince 5(4) embedded pair. Keep a bounded trajectory of accepted
// segments, separate from the rendering clock. All arithmetic is app-owned.
const DP_A = [
  [], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9],
  [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
  [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
];
const DP_C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
const DP_B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];


// L-stable two-stage SDIRK, order two. Newton solves use a finite-difference
// Jacobian and the existing row-scaled pivoted linear solver. Step doubling
// estimates local error without a dependency or generated code.
function createImplicitStepper(n, rhs, rtol, atol) {
  const gamma = 1 - 1 / Math.sqrt(2);
  const jac = new Float64Array(n * n), delta = new Float64Array(n);
  const norm = (v, a, b) => v.reduce((m, x, i) =>
    Math.max(m, Math.abs(x) / (atol + rtol * Math.max(Math.abs(a[i]), Math.abs(b[i])))), 0);
  function stage(base, time, hg) {
    const z = base.slice();
    for (let iteration = 0; iteration < 8; iteration++) {
      const f = rhs(z, time);
      for (let i = 0; i < n; i++) delta[i] = base[i] + hg * f[i] - z[i];
      if (norm(delta, base, z) <= 0.025) return { z, f };
      for (let j = 0; j < n; j++) {
        const shifted = z.slice();
        const eps = Math.sqrt(Number.EPSILON) * Math.max(1, Math.abs(z[j]));
        shifted[j] += eps;
        const fp = rhs(shifted, time);
        for (let i = 0; i < n; i++)
          jac[i * n + j] = (i === j ? 1 : 0) - hg * (fp[i] - f[i]) / (shifted[j] - z[j]);
      }
      if (!solveSmallSystem(jac, delta, n)) return null;
      for (let i = 0; i < n; i++) z[i] += delta[i];
      if (!z.every((v) => finite(v) && Math.abs(v) <= 1e12)) return null;
    }
    return null;
  }
  function step(a, t, h) {
    const first = stage(a, t + gamma * h, gamma * h);
    if (!first) return null;
    const base = a.map((v, i) => v + h * (1 - gamma) * first.f[i]);
    return stage(base, t + h, gamma * h);
  }
  return (a, t, h) => {
    const full = step(a, t, h);
    if (!full) return null;
    const half = step(a, t, h / 2);
    if (!half) return null;
    const end = step(half.z, t + h / 2, h / 2);
    if (!end) return null;
    const error = end.z.map((v, i) => (v - full.z[i]) / 3);
    return { next: end.z, err: norm(error, a, end.z), k0: rhs(a, t), k1: end.f };
  };
}

function* integrateAdaptive(dynamics, names, initial, derivative, eventValue, eventReset, warnings) {
  const n = names.length;
  const stages = Array.from({ length: 7 }, () => new Float64Array(n));
  const work = new Float64Array(n);
  const segments = [];
  let t = 0, h = Math.min(dynamics.step, dynamics.duration);
  let current = Float64Array.from(names, (name) => initial[name]);
  const toState = (v) => Object.fromEntries(names.map((name, i) => [name, v[i]]));
  const checked = (v) => {
    if (!v.every((x) => finite(x) && Math.abs(x) <= 1e12))
      throw Error('Non-finite or divergent state');
    return v;
  };
  const interpolate = (segment, time) => {
    const u = Math.max(0, Math.min(1, (time - segment.t) / segment.h));
    const u2 = u * u, u3 = u2 * u;
    return segment.a.map((x, i) =>
      (2 * u3 - 3 * u2 + 1) * x + (u3 - 2 * u2 + u) * segment.h * segment.k0[i] +
      (-2 * u3 + 3 * u2) * segment.b[i] + (u3 - u2) * segment.h * segment.k1[i],
    );
  };
  const events = dynamics.events ?? [];
  const readEvent = (event, time, value) => {
    const result = eventValue(event, time, toState(value));
    if (!finite(result)) throw Error('Event expression is not finite');
    return result;
  };
  let eventCount = 0;
  const eventTimes = [];
  const rtol = dynamics.rtol ?? 1e-6, atol = dynamics.atol ?? 1e-9;
  const stiff = dynamics.method === 'sdirk2';
  const rhsVector = (v, time) => { const k = derivative(toState(v), time); return checked(Float64Array.from(names, (name) => k[name])); };
  const implicit = stiff ? createImplicitStepper(n, rhsVector, rtol, atol) : null;
  try {
    for (let attempt = 0; t < dynamics.duration; attempt++) {
      if (attempt >= 10000) throw Error('Adaptive integration step budget exceeded');
      if (attempt % 16 === 0) yield;
      h = Math.min(h, dynamics.duration - t);
      if (t + h === t) throw Error('Adaptive step underflow');
      let next, err = 0, k0, k1;
      if (implicit) {
        const result = implicit(current, t, h);
        if (!result) { h *= 0.25; continue; }
        ({ next, err, k0, k1 } = result);
      } else {
      for (let stage = 0; stage < 7; stage++) {
        for (let i = 0; i < n; i++) {
          let value = current[i];
          for (let j = 0; j < stage; j++) value += h * DP_A[stage][j] * stages[j][i];
          work[i] = value;
        }
        checked(work);
        const k = derivative(toState(work), t + DP_C[stage] * h);
        for (let i = 0; i < n; i++) stages[stage][i] = k[names[i]];
        checked(stages[stage]);
      }
      next = work.slice();
      for (let i = 0; i < n; i++) {
        let low = current[i];
        for (let j = 0; j < 7; j++) low += h * DP_B4[j] * stages[j][i];
        err = Math.max(err, Math.abs(next[i] - low) / (atol + rtol * Math.max(Math.abs(current[i]), Math.abs(next[i]))));
      }
      k0 = stages[0].slice();
      k1 = stages[6].slice();
      }
      if (!finite(err)) throw Error('Non-finite integration error');
      const factor = err === 0 ? 5 : Math.max(0.2, Math.min(5, 0.9 * err ** (stiff ? -1 / 3 : -0.2)));
      if (err > 1) {
        h *= Math.min(0.9, factor);
        continue;
      }
      const segment = { t, h, end: t + h, a: current, b: next, k0, k1 };
      const hits = [];
      for (const event of events) {
        const direction = event.direction ?? 0;
        const crosses = (a, b) => (direction <= 0 && a > 0 && b <= 0) || (direction >= 0 && a < 0 && b >= 0);
        let lo = t, hi = t + h, a = readEvent(event, t, current);
        const mid = t + h / 2;
        const m = readEvent(event, mid, interpolate(segment, mid));
        const b = readEvent(event, hi, next);
        if (crosses(a, m)) hi = mid;
        else if (crosses(m, b)) { lo = mid; a = m; }
        else continue;
        for (let i = 0; i < 40 && hi - lo > Math.max(1e-12, h * 1e-9); i++) {
          const mid = (lo + hi) / 2;
          const m = readEvent(event, mid, interpolate(segment, mid));
          if ((m > 0) === (a > 0) && m !== 0) lo = mid;
          else hi = mid;
        }
        hits.push({ event, time: hi });
      }
      hits.sort((a, b) => a.time - b.time);
      const hit = hits[0];
      if (hit) {
        if (++eventCount > 128) throw Error('Event budget exceeded; possible chattering or repeated contact');
        const before = interpolate(segment, hit.time);
        const prior = toState(before);
        const reset = { ...prior };
        const assigned = new Set();
        const simultaneous = hits.filter((item) => Math.abs(item.time - hit.time) <= Math.max(1e-12, h * 1e-8));
        for (const { event } of simultaneous) {
          const result = eventReset(event, hit.time, prior);
          for (const key of Object.keys(event.reset ?? {})) {
            if (assigned.has(key)) throw Error('Simultaneous events reset the same state; combine their reset maps');
            assigned.add(key);
            reset[key] = result[key];
          }
        }
        const after = checked(Float64Array.from(names, (name) => reset[name]));
        segments.push({ ...segment, end: hit.time });
        t = hit.time;
        eventTimes.push(t);
        current = after;
        if (simultaneous.some(({ event }) => event.terminal)) break;
        // Move forward from a reset rather than replaying the remainder of a pre-event step.
        h = Math.min(dynamics.step, Math.max(h * 0.25, 1e-9));
      } else {
        segments.push(segment);
        current = next;
        t += h;
        h = Math.min(dynamics.step, h * factor);
      }
    }
  } catch (error) {
    warnings.push({ path: error instanceof Error && error.path ? error.path : 'dynamics', time: t, message: `Adaptive dynamics stopped at t = ${t}: ${error instanceof Error ? error.message : String(error)}` });
  }
  return {
    duration: t,
    eventTimes,
    stateAt(time) {
      const target = Math.max(0, Math.min(t, finite(time) ? time : 0));
      if (target === t) return toState(current);
      let lo = 0, hi = segments.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (segments[mid].end <= target) lo = mid + 1;
        else hi = mid;
      }
      return toState(segments.length ? interpolate(segments[lo], target) : current);
    },
  };
}

/** Yield between integration batches so a host can cancel them. */
function* prepareRuntime(program, definitions, stateNames, compile, dependencies, values, implicitGrid) {
  const budget = { remaining: BUDGET };
  const warnings = [];
  const params = Object.fromEntries(
    (program.parameters ?? []).map((p) => {
      const value = numberLike(values?.[p.id]);
      return [p.id, finite(value) ? Math.max(p.min, Math.min(p.max, value)) : p.value];
    }),
  );
  const base = Object.assign(Object.create(null), params);
  const constants = new Map();
  let grid;
  let previousTime;
  const timeValues = new Map();
  const scopeAt = (t, x, y, state, evaluate, reusableSample) => {
    const scope = Object.assign(Object.create(base), state, { x, y, t });
    if (!definitions.size) return scope;
    const sample = reusableSample ?? new Map();
    scope[resolveDefinition] = (name) => {
      if (grid && name === 'gridValue') return grid.value(scope.t,scope.x,scope.y);
      if (grid && name === 'gridMean') return grid.mean(scope.t);
      if (!definitions.has(name)) return undefined;
      const expression = definitions.get(name);
      const mask = dependencies(expression);
      const cache = mask === 0 ? constants : reusableSample && mask === 4 ? timeValues : sample;
      if (!cache.has(name)) cache.set(name, evaluate(expression, scope));
      return cache.get(name);
    };
    return scope;
  };
  const evalRaw = (expression, scope) =>
    evaluateDemonstrationExpression(compile(expression), scope, budget);
  let trajectory = [],
    step = 0;
  let adaptiveResult;
  const dynamics = program.dynamics;
  let duration = dynamics?.duration ?? program.duration ?? 0;
  const algebraic = dynamics?.algebraic;
  const algebraicIds = Object.keys(algebraic?.guess ?? {});
  const initialGuess = algebraicIds.map(id=>evalRaw(algebraic.guess[id],base));
  if (!initialGuess.every(finite)) throw located('dynamics.algebraic.guess', Error('Non-finite algebraic initial guess'));
  function consistentState(s,t,evaluate) {
    if (!algebraicIds.length) return s;
    const n = algebraicIds.length;
    const z = Float64Array.from(initialGuess);
    const jac = new Float64Array(n*n), delta = new Float64Array(n);
    const tolerance = algebraic.tolerance ?? 1e-8;
    const merged = (v)=>({...s,...Object.fromEntries(algebraicIds.map((id,i)=>[id,v[i]]))});
    const residual = (v)=>{
      const scope = scopeAt(t,0,0,merged(v),evaluate);
      return Float64Array.from(algebraicIds,id=>evaluate(algebraic.residuals[id],scope));
    };
    const norm = v=>v.every(finite)?Math.max(...v.map(Math.abs)):Infinity;
    for(let iteration=0;iteration<12;iteration++){
      const f=residual(z), error=norm(f);
      if(error<=tolerance)return merged(z);
      if(!finite(error))break;
      for(let j=0;j<n;j++){
        const shifted=z.slice();
        shifted[j]+=Math.sqrt(Number.EPSILON)*Math.max(1,Math.abs(z[j]));
        const fp=residual(shifted);
        for(let i=0;i<n;i++)jac[i*n+j]=(fp[i]-f[i])/(shifted[j]-z[j]);
      }
      for(let i=0;i<n;i++)delta[i]=-f[i];
      if(!solveSmallSystem(jac,delta,n))break;
      let improved=false;
      for(let scale=1;scale>=1/64;scale/=2){
        const next=z.map((v,i)=>v+scale*delta[i]);
        if(next.every(v=>finite(v)&&Math.abs(v)<=1e12)&&norm(residual(next))<error){
          z.set(next);improved=true;break;
        }
      }
      if(!improved)break;
    }
    if(norm(residual(z))<=tolerance)return merged(z);
    throw located('dynamics.algebraic',Error('Algebraic Newton solve did not converge; check constraints, scaling and initial guess'));
  }
  if (implicitGrid) {
    grid = yield* prepareImplicitGrid(implicitGrid,params,compile,warnings);
    duration = grid.duration;
  } else if (dynamics) {
    const names = stateNames,
      count = Math.ceil(dynamics.duration / dynamics.step);
    step = dynamics.duration / count;
    // Integration has its own budget, so a long ODE does not starve the views.
    const dynamicsBudget = { remaining: DYNAMICS_BUDGET };
    const evalDynamics = (expression, scope) =>
      evaluateDemonstrationExpression(compile(expression), scope, dynamicsBudget);
    const base = Object.assign(Object.create(null), params, { x: 0, y: 0, t: 0 });
    const state = Object.fromEntries(
      names.map((key) => {
        const value = at(`dynamics.initial.${key}`, () =>
          evalDynamics(dynamics.initial[key], base),
        );
        if (!finite(value))
          throw located(
            `dynamics.initial.${key}`,
            Error('Initial state is not a finite number for these parameter values'),
          );
        return [key, value];
      }),
    );
    trajectory = [{ t: 0, state }];
    const matrix = dynamics.massMatrix ? new Float64Array(names.length ** 2) : undefined;
    const rhs = matrix ? new Float64Array(names.length) : undefined;
    const derivative = (s, t) => {
      const scope = scopeAt(t, 0, 0, consistentState(s,t,evalDynamics), evalDynamics);
      if (matrix) {
        const n = names.length;
        dynamicsBudget.remaining -= n ** 3;
        if (dynamicsBudget.remaining < 0) throw budgetError();
        for (let i = 0; i < n; i++) {
          rhs[i] = evalDynamics(dynamics.derivatives[names[i]], scope);
          for (let j = 0; j < n; j++)
            matrix[i * n + j] = evalDynamics(dynamics.massMatrix[i][j], scope);
        }
        if (!solveSmallSystem(matrix, rhs, n))
          throw located('dynamics.massMatrix', Error('Mass matrix is singular or numerically ill-conditioned'));
        return Object.fromEntries(names.map((key, i) => [key, rhs[i]]));
      }
      return Object.fromEntries(
        names.map((key) => [key, evalDynamics(dynamics.derivatives[key], scope)]),
      );
    };
    const add = (s, k, factor) =>
      Object.fromEntries(names.map((key) => [key, s[key] + factor * k[key]]));
    if (['rk45', 'sdirk2'].includes(dynamics.method)) {
      const eventValue = (event, t, s) =>
        evalDynamics(event.expression, scopeAt(t, 0, 0, consistentState(s,t,evalDynamics), evalDynamics));
      const eventReset = (event, t, s) => {
        const scope = scopeAt(t, 0, 0, consistentState(s,t,evalDynamics), evalDynamics);
        return { ...s, ...Object.fromEntries(Object.entries(event.reset ?? {}).map(
          ([key, expression]) => [key, evalDynamics(expression, scope)],
        )) };
      };
      adaptiveResult = yield* integrateAdaptive(dynamics, names, state, derivative, eventValue, eventReset, warnings);
      duration = adaptiveResult.duration;
    } else {
    let current = state;
    try {
      for (let i = 1; i <= count; i++) {
        const t = (i - 1) * step,
          k1 = derivative(current, t),
          k2 = derivative(add(current, k1, step / 2), t + step / 2),
          k3 = derivative(add(current, k2, step / 2), t + step / 2),
          k4 = derivative(add(current, k3, step), t + step);
        const next = Object.fromEntries(
          names.map((key) => [
            key,
            current[key] + (step / 6) * (k1[key] + 2 * k2[key] + 2 * k3[key] + k4[key]),
          ]),
        );
        const bad = names.find((key) => !finite(next[key]) || Math.abs(next[key]) > 1e12);
        if (bad) {
          warnings.push({
            path: `dynamics.derivatives.${bad}`,
            time: t,
            message: `Dynamics diverged at t = ${Number(t.toFixed(3))} s (state ${bad}); reduce the time step or revise the equations`,
          });
          break;
        }
        current = next;
        trajectory.push({ t: i * step, state: current });
        if (i % 32 === 0) yield;
      }
    } catch (error) {
      const t = (trajectory.length - 1) * step;
      warnings.push({
        path: error instanceof Error && error.path ? error.path : 'dynamics',
        time: t,
        message: `Dynamics stopped at t = ${Number(t.toFixed(3))} s: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    // Keep the valid part of the history; animations stop where it ends.
    const reached = (trajectory.length - 1) * step;
    if (reached < dynamics.duration) duration = reached;
    }
  }
  const differentialStateAt = (time) => {
    if (grid) return {gridClock:Math.max(0,Math.min(duration,finite(time)?time:0))};
    if (adaptiveResult) return adaptiveResult.stateAt(time);
    if (!trajectory.length) return {};
    const index = Math.max(
        0,
        Math.min(trajectory.length - 1, (Number.isFinite(time) ? time : 0) / step),
      ),
      i = Math.floor(index),
      f = index - i;
    const a = trajectory[i].state,
      b = trajectory[Math.min(i + 1, trajectory.length - 1)].state;
    return Object.fromEntries(Object.keys(a).map((key) => [key, a[key] + (b[key] - a[key]) * f]));
  };
  const stateAt = (time) => consistentState(differentialStateAt(time), Math.max(0,Math.min(duration,finite(time)?time:0)), evalRaw);
  let sampleScope, sampleHasState;
  const sampleValues = new Map();
  const emptyState = Object.create(null);
  return {
    duration,
    eventTimes: adaptiveResult?.eventTimes ?? [],
    parameters: params,
    warnings,
    dependencies,
    resetBudget() {
      budget.remaining = BUDGET;
    },
    evaluate(expression, t = 0, x = 0, y = 0) {
      const needsState = (dependencies(expression) & 4) !== 0 && stateNames.length > 0;
      if (t !== previousTime) {
        previousTime = t;
        timeValues.clear();
        sampleScope = undefined;
      }
      if (!sampleScope || (needsState && !sampleHasState)) {
        sampleValues.clear();
        sampleHasState = needsState;
        sampleScope = scopeAt(t, x, y, needsState ? stateAt(t) : emptyState, evalRaw, sampleValues);
      } else if (x !== sampleScope.x || y !== sampleScope.y) {
        sampleValues.clear();
        sampleScope.x = x;
        sampleScope.y = y;
      }
      return evalRaw(expression, sampleScope);
    },
    stateAt,
  };
}

/** Axis bounds can follow parameter/state-dependent expressions. Reversed
 * bounds are swapped and equal bounds widened; a non-finite bound uses the
 * fallback when one is given (for example a range fitted to the samples). */
export function demonstrationDomain(bounds, runtime, time = 0, fallback) {
  let problem = '';
  const values = bounds.map((value) => {
    try {
      return runtime.evaluate(value, time);
    } catch (error) {
      problem ||= error instanceof Error ? error.message : String(error);
      return Number.NaN;
    }
  });
  if (values.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e6)) {
    if (fallback) return fallback;
    throw Error(`Axis bounds must be finite and within ±1e6${problem ? ` (${problem})` : ''}`);
  }
  let [a, b] = values;
  if (a > b) [a, b] = [b, a];
  if (a === b) {
    const pad = a === 0 ? 1 : Math.abs(a) * 0.1;
    a -= pad;
    b += pad;
  }
  return [a, b];
}
