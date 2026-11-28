import type { Point3 } from './types';

/** Bounded marching tetrahedra on normalized regular-grid samples. */
export function* extractIsosurface(
  values: Float64Array,
  size: number,
  level: number,
): Generator<void, [Point3, Point3, Point3][], void> {
  if (
    !Number.isInteger(size) ||
    size < 2 ||
    size > 17 ||
    values.length !== size ** 3 ||
    !Number.isFinite(level)
  )
    throw Error('Isosurface requires a finite level and a cubic grid of 2–17 samples per axis');
  const at = (i: number, j: number, k: number) => (k * size + j) * size + i;
  const corners = [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 1],
  ];
  // The same body diagonal in every cube yields compatible face diagonals.
  const tetrahedra = [
    [0, 5, 1, 6],
    [0, 1, 2, 6],
    [0, 2, 3, 6],
    [0, 3, 7, 6],
    [0, 7, 4, 6],
    [0, 4, 5, 6],
  ];
  const triangles: [Point3, Point3, Point3][] = [];
  const add = (a: Point3, b: Point3, c: Point3) => {
    const u = b.map((v, i) => v - a[i]),
      v = c.map((v, i) => v - a[i]);
    if (
      Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) <
      1e-12
    )
      return;
    if (triangles.length >= 6000)
      throw Error('Isosurface triangle budget exceeded; narrow bounds or simplify field');
    triangles.push([a, b, c]);
  };
  for (let k = 0; k < size - 1; k++)
    for (let j = 0; j < size - 1; j++) {
      for (let i = 0; i < size - 1; i++) {
        const v = corners.map(([a, b, c]) => values[at(i + a, j + b, k + c)]);
        if (!v.every(Number.isFinite) || v.every((q) => q >= level) || v.every((q) => q < level))
          continue;
        const p = corners.map(
          ([a, b, c]) => [i + a, j + b, k + c].map((q) => (2 * q) / (size - 1) - 1) as Point3,
        );
        const cross = (a: number, b: number): Point3 => {
          const w = (level - v[a]) / (v[b] - v[a]);
          return p[a].map((q, d) => q + w * (p[b][d] - q)) as Point3;
        };
        for (const t of tetrahedra) {
          const inside = t.filter((i) => v[i] >= level),
            outside = t.filter((i) => v[i] < level);
          if (!inside.length || !outside.length) continue;
          if (inside.length === 1)
            add(
              cross(inside[0], outside[0]),
              cross(inside[0], outside[1]),
              cross(inside[0], outside[2]),
            );
          else if (outside.length === 1)
            add(
              cross(outside[0], inside[0]),
              cross(outside[0], inside[1]),
              cross(outside[0], inside[2]),
            );
          else {
            const a = cross(inside[0], outside[0]),
              b = cross(inside[0], outside[1]),
              c = cross(inside[1], outside[0]),
              d = cross(inside[1], outside[1]);
            add(a, b, c);
            add(b, d, c);
          }
        }
      }
      yield;
    }
  return triangles;
}
