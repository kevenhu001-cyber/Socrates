import { finite, text } from '../foundation.js';
import { SAFE, RESERVED, unary, callable, expectedArity, name } from './functions.js';

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
const DEMONSTRATION_LOOP_LIMIT = 1000;
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
function normalizeDemonstrationExpression(source) {
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
function normalizeDemonstrationIdentifier(value) {
  if (typeof value !== 'string') return value;
  return transliterate(value.normalize('NFKC').trim(), false);
}

/* ---------- Parser ---------- */
function parseDemonstrationExpression(input) {
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
          ['sum', 'iterate','diff','integral'].includes(name) &&
          (args[0]?.kind !== 'variable' || !SAFE.test(args[0].name) || RESERVED.has(args[0].name))
        )
          throw Error('sum/iterate/diff/integral needs a safe local variable as its first argument');
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

export { DEMONSTRATION_LOOP_LIMIT, normalizeDemonstrationExpression, normalizeDemonstrationIdentifier, parseDemonstrationExpression };
