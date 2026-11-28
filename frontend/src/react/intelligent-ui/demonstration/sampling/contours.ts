import { isDemonstrationBudgetError } from '@socrates/core/demonstrationLight';
import type { DemonstrationField, DemonstrationRuntime } from '@socrates/core/demonstration';
import { FIELD_WIDTH, fieldHeight, type Domain } from '../fieldCommon';

// Marching squares on a bounded, independently sampled grid. Return canvas
// coordinates in the same physical projection as the field; do not infer
// contours from colors or connect through singular/non-finite cells.
export function* sampleContours(
  view: DemonstrationField,
  runtime: DemonstrationRuntime,
  time: number,
  x: Domain,
  y: Domain,
  stride: number,
): Generator<void, { level: number; lines: number[] }[], void> {
  if (!view.contours?.length) return [];
  runtime.resetBudget();
  const levels = view.contours.map((level) => runtime.evaluate(level, time));
  if (levels.some((level) => !Number.isFinite(level))) throw Error('Contour levels must be finite');
  const spacing = Math.max(5, stride * 2);
  const nx = Math.max(2, Math.ceil((FIELD_WIDTH - 1) / spacing) + 1);
  const height = fieldHeight(view);
  const ny = Math.max(2, Math.ceil((height - 1) / spacing) + 1);
  const values = new Float64Array(nx * ny);
  for (let row = 0; row < ny; row++) {
    for (let col = 0; col < nx; col++) {
      try {
        values[row * nx + col] = runtime.evaluate(
          view.expression,
          time,
          x[0] + ((x[1] - x[0]) * col) / (nx - 1),
          y[1] - ((y[1] - y[0]) * row) / (ny - 1),
        );
      } catch (error) {
        if (isDemonstrationBudgetError(error)) throw error;
        values[row * nx + col] = Number.NaN;
      }
    }
    yield;
  }
  const dx = (FIELD_WIDTH - 1) / (nx - 1),
    dy = (height - 1) / (ny - 1);
  const output = levels.map((level) => ({ level, lines: [] as number[] }));
  const offsets = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  for (let row = 0; row < ny - 1; row++) {
    for (let col = 0; col < nx - 1; col++) {
      const v = [
        values[row * nx + col],
        values[row * nx + col + 1],
        values[(row + 1) * nx + col + 1],
        values[(row + 1) * nx + col],
      ];
      if (!v.every(Number.isFinite)) continue;
      for (const { level, lines } of output) {
        const edges: number[][] = [];
        for (let edge = 0; edge < 4; edge++) {
          const next = (edge + 1) % 4;
          if (v[edge] >= level === v[next] >= level) continue;
          const u = (level - v[edge]) / (v[next] - v[edge]);
          const [ax, ay] = offsets[edge],
            [bx, by] = offsets[next];
          edges.push([(col + ax + u * (bx - ax)) * dx, (row + ay + u * (by - ay)) * dy]);
        }
        if (edges.length === 2) lines.push(...edges[0], ...edges[1]);
        else if (edges.length === 4) {
          const center = (v[0] + v[1] + v[2] + v[3]) / 4;
          if (center >= level === v[0] >= level)
            lines.push(...edges[0], ...edges[1], ...edges[2], ...edges[3]);
          else lines.push(...edges[0], ...edges[3], ...edges[1], ...edges[2]);
        }
      }
    }
    yield;
  }
  return output;
}
