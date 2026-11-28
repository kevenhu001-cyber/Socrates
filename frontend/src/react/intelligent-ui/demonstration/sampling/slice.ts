import type { DemonstrationField, DemonstrationRuntime } from '@socrates/core/demonstration';
import type { Point3 } from '../geometry/types';

export function sliceRuntime(
  view: DemonstrationField,
  runtime: DemonstrationRuntime,
  time: number,
) {
  if (!view.slicePlane) return { runtime, slice: undefined };
  const { axis, at } = view.slicePlane,
    position = runtime.evaluate(at, time);
  if (!Number.isFinite(position)) throw Error('Slice coordinate must be finite');
  const map = (u: number, v: number): Point3 =>
    axis === 'x' ? [position, u, v] : axis === 'y' ? [u, position, v] : [u, v, position];
  const projected: DemonstrationRuntime = {
    ...runtime,
    evaluate(expression, t = 0, x?, y?, z?) {
      return x === undefined || y === undefined
        ? runtime.evaluate(expression, t, x, y, z)
        : runtime.evaluate(expression, t, ...map(x, y));
    },
    dependencies(expression) {
      const mask = runtime.dependencies(expression);
      return (
        (mask & 4) |
        (axis === 'x'
          ? (mask & 2 ? 1 : 0) | (mask & 8 ? 2 : 0)
          : axis === 'y'
            ? (mask & 1) | (mask & 8 ? 2 : 0)
            : mask & 3)
      );
    },
  };
  return { runtime: projected, slice: { axis, position } };
}
