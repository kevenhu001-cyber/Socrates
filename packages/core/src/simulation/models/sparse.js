import { record, finite, located } from '../foundation.js';
import { parseDemonstrationExpression } from '../expression/parser.js';
import { expressionNames } from '../expression/evaluate.js';

// Symmetric sparse systems use upper-triangle coordinate entries, compiled
// to CSR and solved with Jacobi-preconditioned conjugate gradients.
function sparseSystemSpec(program) {
  const s = program.sparseSystem;
  if (s === undefined) return null;
  const fail = (message) => {
    throw located('sparseSystem', new Error(message));
  };
  if (
    !record(s) ||
    !Number.isInteger(s.size) ||
    s.size < 1 ||
    s.size > 1024 ||
    !Array.isArray(s.entries) ||
    s.entries.length < 1 ||
    s.entries.length > 8192 ||
    !Array.isArray(s.rhs) ||
    s.rhs.length !== s.size
  )
    fail('Sparse system needs 1–1024 unknowns, 1–8192 coordinate entries and matching rhs');
  if (program.dynamics !== undefined || program.duration !== undefined)
    fail('Sparse system is a standalone stationary model');
  if (program.parameters !== undefined && !Array.isArray(program.parameters))
    fail('Invalid parameters');
  if (program.definitions !== undefined && !record(program.definitions))
    fail('Invalid definitions');
  const scope = new Set((program.parameters ?? []).map((p) => p?.id));
  const reserved = new Set(['sparseValue', 'sparseResidual', 'sparseIterations']);
  if ([...scope, ...Object.keys(program.definitions ?? {})].some((id) => reserved.has(id)))
    fail('Sparse result names are reserved');
  const check = (v) => {
    try {
      expressionNames(parseDemonstrationExpression(v), scope);
    } catch (e) {
      fail(String(e));
    }
  };
  const method = s.method ?? 'pcg';
  if (!['pcg', 'bicgstab'].includes(method)) fail('Use pcg or bicgstab');
  const symmetric = method === 'pcg';
  const seen = new Set(),
    diag = new Set();
  for (const entry of s.entries) {
    if (!Array.isArray(entry) || entry.length !== 3)
      fail('Entry must be [row,column,value], zero-based; PCG uses upper triangle');
    const [i, j, v] = entry;
    if (
      !Number.isInteger(i) ||
      !Number.isInteger(j) ||
      i < 0 ||
      i >= s.size ||
      j < 0 ||
      j >= s.size ||
      (symmetric && j < i) ||
      seen.has(i * s.size + j)
    )
      fail('Duplicate or invalid sparse coordinate');
    seen.add(i * s.size + j);
    if (i === j) diag.add(i);
    check(v);
  }
  if (diag.size !== s.size) fail('Every row needs an explicit diagonal');
  s.rhs.forEach(check);
  const tolerance = s.tolerance ?? 1e-8,
    maxIterations = s.maxIterations ?? Math.min(1024, s.size * 2);
  if (
    !finite(tolerance) ||
    tolerance < 1e-12 ||
    tolerance > 1e-3 ||
    !Number.isInteger(maxIterations) ||
    maxIterations < 1 ||
    maxIterations > 1024 ||
    s.entries.length * 2 * maxIterations > 8000000
  )
    fail('Sparse tolerance or iteration budget out of range');
  return { ...s, tolerance, maxIterations, method, symmetric };
}

function lowerSparseSystem(program, s = sparseSystemSpec(program)) {
  if (!s) return program;
  return {
    ...program,
    definitions: {
      ...program.definitions,
      sparseValue: '0*x',
      sparseResidual: 0,
      sparseIterations: 0,
    },
  };
}

export { sparseSystemSpec, lowerSparseSystem };
