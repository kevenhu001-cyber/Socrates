import { solveSmallSystem } from '../numerics/dense.js';

const SAFE = /^[A-Za-z]\w{0,39}$/;
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
const extraFunctions = {
  sparseAt: () => Number.NaN,
  requireNonnegative: (v) => (v >= 0 ? v : Number.NaN),
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
    if (
      !Number.isInteger(n) ||
      n < 1 ||
      n > 6 ||
      !Number.isInteger(index) ||
      index < 1 ||
      index > n ||
      args.length !== n * n + n
    )
      return Number.NaN;
    const rhs = Float64Array.from(args.slice(n * n));
    return solveSmallSystem(Float64Array.from(args.slice(0, n * n)), rhs, n)
      ? rhs[index - 1]
      : Number.NaN;
  },
  cross3: (i, a, b, c, d, e, f) =>
    i === 1 ? b * f - c * e : i === 2 ? c * d - a * f : i === 3 ? a * e - b * d : Number.NaN,
  solve3: (index, ...args) => {
    if (!Number.isInteger(index) || index < 1 || index > 3) return Number.NaN;
    const rhs = Float64Array.from(args.slice(9));
    return solveSmallSystem(Float64Array.from(args.slice(0, 9)), rhs, 3)
      ? rhs[index - 1]
      : Number.NaN;
  },
  // A scaled 2x2 solve for coupled accelerations and linear constraints.
  solve2: (index, a, b, c, d, r, s) => {
    const p = Math.max(Math.abs(a), Math.abs(b));
    const q = Math.max(Math.abs(c), Math.abs(d));
    if (!(p > 0 && q > 0) || (index !== 1 && index !== 2)) return Number.NaN;
    a /= p;
    b /= p;
    r /= p;
    c /= q;
    d /= q;
    s /= q;
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
const SPECIAL = ['sum', 'if', 'iterate', 'diff', 'integral'];
const callable = (name) =>
  Object.hasOwn(functions, name) || Object.hasOwn(extraFunctions, name) || SPECIAL.includes(name)
    ? name
    : Object.hasOwn(aliases, name)
      ? aliases[name]
      : null;
const expectedArity = (name) =>
  name === 'sum' || name === 'iterate' || name === 'integral'
    ? 4
    : name === 'if' || name === 'diff'
      ? 3
      : (arity[name] ??
        extraArity[name] ??
        (Object.hasOwn(unary, name) || Object.hasOwn(extraFunctions, name) ? 1 : null));
const name = (value) =>
  typeof value === 'string' &&
  SAFE.test(value) &&
  !RESERVED.has(value) &&
  !Object.hasOwn(functions, value);

export { SAFE, RESERVED, unary, functions, extraFunctions, SPECIAL, callable, expectedArity, name };
