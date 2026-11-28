import { demonstrationDomain, isDemonstrationBudgetError } from '@socrates/core/demonstrationLight';
import type { DemonstrationField, DemonstrationRuntime } from '@socrates/core/demonstration';
import type { Domain } from '../fieldCommon';
import type { Point3, SurfaceSample } from './types';

export function* sampleSurface(
  view: DemonstrationField,
  runtime: DemonstrationRuntime,
  time: number,
  x: Domain,
  y: Domain,
  size: number,
): Generator<void, SurfaceSample, void> {
  runtime.resetBudget();
  if (!view.zRange) throw Error('Surface requires z bounds');
  const z = view.zRange.map((v) => runtime.evaluate(v, time)) as Domain;
  if (!z.every(Number.isFinite) || z[1] <= z[0]) throw Error('Surface z bounds must increase');
  const values: number[] = [];
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      try {
        const value = runtime.evaluate(
          view.expression,
          time,
          x[0] + ((x[1] - x[0]) * i) / (size - 1),
          y[0] + ((y[1] - y[0]) * j) / (size - 1),
        );
        values.push(Number.isFinite(value) && value >= z[0] && value <= z[1] ? value : Number.NaN);
      } catch (error) {
        if (isDemonstrationBudgetError(error)) throw error;
        values.push(Number.NaN);
      }
    }
    yield;
  }
  if (!values.some(Number.isFinite)) throw Error('No finite surface samples in z range');
  return { size, values, x, y, z };
}

export function* sampleSpace(
  view: DemonstrationField,
  runtime: DemonstrationRuntime,
  time: number,
  x: Domain,
  y: Domain,
  preview: boolean,
): Generator<void, SurfaceSample, void> {
  if (!view.zRange) throw Error('3D view requires z bounds');
  const z = demonstrationDomain(view.zRange, runtime, time);
  const ranges = [x, y, z];
  const normalize = (p: Point3): Point3 =>
    p.map((v, i) => (2 * (v - ranges[i][0])) / (ranges[i][1] - ranges[i][0]) - 1) as Point3;
  const result: SurfaceSample = { size: 0, values: [], x, y, z };
  if (view.presentation === 'parametricSurface' && view.surface3d && view.uRange && view.vRange) {
    const u = demonstrationDomain(view.uRange, runtime, time),
      v = demonstrationDomain(view.vRange, runtime, time);
    const size = preview ? 17 : 33,
      vertices: (Point3 | null)[] = [];
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        try {
          const p = view.surface3d.map((expr) =>
            runtime.evaluate(
              expr,
              time,
              u[0] + ((u[1] - u[0]) * i) / (size - 1),
              v[0] + ((v[1] - v[0]) * j) / (size - 1),
            ),
          ) as Point3;
          vertices.push(
            p.every(
              (q, k) =>
                Number.isFinite(q) && q >= ranges[k][0] - 1e-10 && q <= ranges[k][1] + 1e-10,
            )
              ? normalize(p)
              : null,
          );
        } catch (error) {
          if (isDemonstrationBudgetError(error)) throw error;
          vertices.push(null);
        }
      }
      yield;
    }
    if (!vertices.some(Boolean))
      throw Error('No finite parametric surface points within declared bounds');
    result.size = size;
    result.vertices = vertices;
  } else if (view.presentation === 'curve3d' && view.curve3d) {
    const domain: Domain = view.curveHistory
      ? [0, Math.max(0, time)]
      : demonstrationDomain(view.parameterRange!, runtime, time);
    const steps = preview ? 120 : 480,
      curve: (Point3 | null)[] = [];
    for (let i = 0; i <= steps; i++) {
      const u = domain[0] + ((domain[1] - domain[0]) * i) / steps;
      try {
        const point = view.curve3d.map((expr) =>
          runtime.evaluate(expr, view.curveHistory ? u : time, view.curveHistory ? 0 : u),
        ) as Point3;
        curve.push(
          point.every((v, k) => Number.isFinite(v) && v >= ranges[k][0] && v <= ranges[k][1])
            ? normalize(point)
            : null,
        );
      } catch (error) {
        if (isDemonstrationBudgetError(error)) throw error;
        curve.push(null);
      }
      if (i % 32 === 0) yield;
    }
    if (!curve.some(Boolean)) throw Error('No finite curve points in declared ranges');
    result.curve = curve;
  } else if (view.vector3d && view.vectorScale !== undefined) {
    const reference = runtime.evaluate(view.vectorScale, time);
    if (!Number.isFinite(reference) || reference <= 0)
      throw Error('Vector reference magnitude must be positive');
    const size = preview ? 4 : 7,
      arrows: NonNullable<SurfaceSample['arrows3d']> = [];
    for (let k = 0; k < size; k++)
      for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
          const point = [i, j, k].map(
            (v, d) => ranges[d][0] + ((ranges[d][1] - ranges[d][0]) * (v + 0.5)) / size,
          ) as Point3;
          try {
            const vector = view.vector3d.map((expr) =>
              runtime.evaluate(expr, time, ...point),
            ) as Point3;
            const magnitude = Math.hypot(...vector);
            if (!Number.isFinite(magnitude) || magnitude <= 1e-12) continue;
            const scaled = vector.map((v, d) => v / (ranges[d][1] - ranges[d][0]));
            const norm = Math.hypot(...scaled),
              length = 0.28 * Math.min(1, magnitude / reference);
            if (!Number.isFinite(norm) || norm <= 0) continue;
            const from = normalize(point),
              to = from.map((v, d) => v + (scaled[d] / norm) * length) as Point3;
            arrows.push({ from, to, magnitude });
          } catch (error) {
            if (isDemonstrationBudgetError(error)) throw error;
          }
        }
        yield;
      }
    result.arrows3d = arrows;
    result.reference = reference;
  }
  return result;
}
