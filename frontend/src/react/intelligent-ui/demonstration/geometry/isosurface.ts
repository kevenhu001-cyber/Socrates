import { demonstrationDomain, isDemonstrationBudgetError } from '@socrates/core/demonstrationLight';
import type { DemonstrationField, DemonstrationRuntime } from '@socrates/core/demonstration';
import type { Domain } from '../fieldCommon';
import type { Point3, SurfaceSample } from './types';
import { extractIsosurface } from './marchingTetrahedra';

export function* sampleIsosurface(
  view: DemonstrationField,
  runtime: DemonstrationRuntime,
  time: number,
  x: Domain,
  y: Domain,
  preview: boolean,
): Generator<void, SurfaceSample, void> {
  if (!view.zRange || view.isoLevel === undefined)
    throw new Error('Isosurface requires bounds and level');
  const z = demonstrationDomain(view.zRange, runtime, time),
    level = runtime.evaluate(view.isoLevel, time);
  if (!Number.isFinite(level)) throw new Error('Isosurface level must be finite');
  const ranges = [x, y, z],
    size = preview ? 11 : 17,
    values = new Float64Array(size ** 3);
  const at = (i: number, j: number, k: number) => (k * size + j) * size + i;
  for (let k = 0; k < size; k++)
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        try {
          const p = [i, j, k].map(
            (v, d) => ranges[d][0] + ((ranges[d][1] - ranges[d][0]) * v) / (size - 1),
          ) as Point3;
          values[at(i, j, k)] = runtime.evaluate(view.expression, time, ...p);
        } catch (error) {
          if (isDemonstrationBudgetError(error)) throw error;
          values[at(i, j, k)] = Number.NaN;
        }
      }
      yield;
    }
  const triangles = yield* extractIsosurface(values, size, level);
  if (!triangles.length)
    throw new Error('No isosurface intersects the sampled volume at this level');
  return { size: 0, values: [], x, y, z, triangles, isoLevel: level };
}
