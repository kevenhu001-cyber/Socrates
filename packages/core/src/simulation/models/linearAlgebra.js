import { record, finite, located } from '../foundation.js';
import { name } from '../expression/functions.js';

// Bounded structured vector/matrix expressions. Scalar projections of named
// arrays use ordinary definition identifiers, so all existing views work.
function lowerLinearAlgebra(program) {
  if (program.linearAlgebra === undefined) return program;
  const fail = (message) => {
    throw located('linearAlgebra', Error(message));
  };
  if (
    !Array.isArray(program.linearAlgebra) ||
    program.linearAlgebra.length < 1 ||
    program.linearAlgebra.length > 12 ||
    (program.definitions !== undefined && !record(program.definitions)) ||
    (program.parameters !== undefined && !Array.isArray(program.parameters))
  )
    fail('Use 1–12 ordered algebra entries');
  const definitions = { ...program.definitions },
    arrays = new Map(),
    ids = new Set();
  const used = new Set([
    ...(program.parameters ?? []).map((p) => p?.id),
    ...Object.keys(definitions),
    ...Object.keys(program.dynamics?.initial ?? {}),
    ...Object.keys(program.dynamics?.algebraic?.guess ?? {}),
  ]);
  const scalar = (v) => finite(v) || (typeof v === 'string' && v.length > 0 && v.length <= 1600);
  const emit = (id, expr) => {
    if (!name(id) || used.has(id) || ids.has(id))
      fail('Duplicate or invalid generated identifier: ' + id);
    if (Object.keys(definitions).length >= 24)
      fail('Algebra components and definitions share the 24-definition limit');
    definitions[id] = expr;
    used.add(id);
    return id;
  };
  const ref = (id) => {
    if (!arrays.has(id)) fail('Array must refer to an earlier vector or matrix: ' + id);
    return arrays.get(id);
  };
  const equal = (a, b) =>
    a.length === b.length && a[0].length === b[0].length && a.vector === b.vector;
  const term = (a, b) => `(${a})*(${b})`;
  const sum = (terms) => terms.join('+') || '0';
  for (const e of program.linearAlgebra) {
    if (!record(e) || !name(e.id) || ids.has(e.id) || used.has(e.id))
      fail('Entry requires a distinct safe identifier');
    const { id, op } = e;
    let rows,
      vector = false,
      result;
    if (op === 'vector') {
      if (
        !Array.isArray(e.values) ||
        e.values.length < 1 ||
        e.values.length > 6 ||
        !e.values.every(scalar)
      )
        fail('Vector needs 1–6 scalar components');
      rows = e.values.map((v) => [v]);
      vector = true;
    } else if (op === 'matrix') {
      if (
        !Array.isArray(e.values) ||
        e.values.length < 1 ||
        e.values.length > 6 ||
        !Array.isArray(e.values[0]) ||
        e.values[0].length < 1 ||
        e.values[0].length > 6 ||
        !e.values.every(
          (r) => Array.isArray(r) && r.length === e.values[0].length && r.every(scalar),
        )
      )
        fail('Matrix needs rectangular 1–6 by 1–6 entries');
      rows = e.values;
    } else {
      const a = ref(e.a);
      vector = a.vector;
      if (op === 'scale') {
        if (!scalar(e.factor)) fail('Scale needs a scalar factor');
        rows = a.map((r) => r.map((v) => term(e.factor, v)));
      } else if (op === 'transpose') {
        rows = a[0].map((_, j) => a.map((r) => r[j]));
        vector = false;
      } else if (op === 'norm') {
        if (!a.vector) fail('Norm needs a vector');
        result = `sqrt(${sum(a.map((r) => term(r[0], r[0])))})`;
      } else {
        const b = ref(e.b);
        if (op === 'add' || op === 'sub') {
          if (!equal(a, b)) fail('Array shapes must match');
          rows = a.map((r, i) => r.map((v, j) => `(${v})${op === 'add' ? '+' : '-'}(${b[i][j]})`));
        } else if (op === 'dot') {
          if (!a.vector || !b.vector || !equal(a, b))
            fail('Dot product needs equal-length vectors');
          result = sum(a.map((r, i) => term(r[0], b[i][0])));
        } else if (op === 'cross') {
          if (!a.vector || !b.vector || a.length !== 3 || b.length !== 3)
            fail('Cross product needs two 3-vectors');
          rows = [0, 1, 2].map((i) => [
            `${term(a[(i + 1) % 3][0], b[(i + 2) % 3][0])}-${term(a[(i + 2) % 3][0], b[(i + 1) % 3][0])}`,
          ]);
        } else if (op === 'matmul') {
          if (a.vector || a[0].length !== b.length)
            fail('Incompatible matrix multiplication dimensions');
          rows = a.map((r) => b[0].map((_, j) => sum(r.map((v, k) => term(v, b[k][j])))));
          vector = b.vector;
        } else fail('Unknown linear algebra operation');
      }
    }
    if (result !== undefined) {
      emit(id, result);
      ids.add(id);
      continue;
    }
    ids.add(id);
    const components = rows.map((r, i) =>
      r.map((v, j) => emit(vector ? `${id}_${i + 1}` : `${id}_${i + 1}_${j + 1}`, v)),
    );
    components.vector = vector;
    arrays.set(id, components);
  }
  const { linearAlgebra: _linearAlgebra, ...rest } = program;
  return { ...rest, definitions };
}

export { lowerLinearAlgebra };
