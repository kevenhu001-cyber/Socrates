import type { SurfaceSample, Point3 } from './types';

type Project = (x: number, y: number, z: number) => number[];
export function createProjection(a: number, e: number): Project {
  const project = (x: number, y: number, z: number) => [
    260 + 82 * (x * Math.cos(a) - y * Math.sin(a)),
    135 + 82 * ((x * Math.sin(a) + y * Math.cos(a)) * Math.sin(e) - z * Math.cos(e)),
  ];
  return project;
}
export function projectSurfaceFaces(
  sample: SurfaceSample | undefined,
  style: 'wireframe' | 'shaded',
  a: number,
  e: number,
) {
  if (!sample || style !== 'shaded') return [];
  const { size, values, z } = sample;
  const points =
    sample.vertices ??
    values.map((v, k): [number, number, number] | null =>
      Number.isFinite(v)
        ? [
            (2 * (k % size)) / (size - 1) - 1,
            (2 * Math.floor(k / size)) / (size - 1) - 1,
            (2 * (v - z[0])) / (z[1] - z[0]) - 1,
          ]
        : null,
    );
  const vertices = points.map((point) => {
    if (!point) return null;
    const [x, y, h] = point;
    const horizontal = x * Math.sin(a) + y * Math.cos(a);
    return {
      point: [
        260 + 82 * (x * Math.cos(a) - y * Math.sin(a)),
        135 + 82 * (horizontal * Math.sin(e) - h * Math.cos(e)),
      ],
      depth: horizontal * Math.cos(e) + h * Math.sin(e),
      height: (h + 1) / 2,
    };
  });
  const result: { key: number; points: string; depth: number; fill: string }[] = [];
  for (let j = 0; j < size - 1; j++)
    for (let i = 0; i < size - 1; i++) {
      const k = j * size + i;
      const corners = [vertices[k], vertices[k + 1], vertices[k + 1 + size], vertices[k + size]];
      if (corners.includes(null)) continue;
      const valid = corners.filter((v) => v !== null);
      const h = valid.reduce((sum, v) => sum + v.height, 0) / 4;
      result.push({
        key: k,
        points: valid.map((v) => v.point.map((n) => n.toFixed(2)).join(',')).join(' '),
        depth: valid.reduce((sum, v) => sum + v.depth, 0) / 4,
        fill: `hsl(${220 * (1 - h)},70%,50%)`,
      });
    }
  return result.sort((a, b) => a.depth - b.depth);
}

export function projectIsoFaces(sample: SurfaceSample | undefined, a: number, e: number) {
  if (!sample?.triangles) return [];
  return sample.triangles
    .map((tri, key) => {
      const points = tri.map(([x, y, z]) => {
        const h = x * Math.sin(a) + y * Math.cos(a);
        return {
          x: 260 + 82 * (x * Math.cos(a) - y * Math.sin(a)),
          y: 135 + 82 * (h * Math.sin(e) - z * Math.cos(e)),
          d: h * Math.cos(e) + z * Math.sin(e),
        };
      });
      const h = tri.reduce((sum, p) => sum + (p[2] + 1) / 2, 0) / 3;
      return {
        key,
        points: points.map((p) => p.x.toFixed(2) + ',' + p.y.toFixed(2)).join(' '),
        depth: points.reduce((s, p) => s + p.d, 0) / 3,
        fill: `hsl(${220 * (1 - h)},70%,50%)`,
      };
    })
    .sort((a, b) => a.depth - b.depth);
}

export function surfacePath(
  sample: SurfaceSample | undefined,
  project: Project,
  row: boolean,
  index: number,
) {
  if (!sample) return '';
  let d = '',
    pen = false;
  for (let k = 0; k < sample.size; k++) {
    const i = row ? k : index,
      j = row ? index : k;
    const vertexIndex = j * sample.size + i,
      z = sample.values[vertexIndex];
    const vertex = sample.vertices
      ? sample.vertices[vertexIndex]
      : Number.isFinite(z)
        ? ([
            (2 * i) / (sample.size - 1) - 1,
            (2 * j) / (sample.size - 1) - 1,
            (2 * (z - sample.z[0])) / (sample.z[1] - sample.z[0]) - 1,
          ] as [number, number, number])
        : null;
    if (!vertex) {
      pen = false;
      continue;
    }
    const point = project(...vertex);
    d += `${pen ? 'L' : 'M'}${point[0].toFixed(2)},${point[1].toFixed(2)}`;
    pen = true;
  }
  return d;
}

export function spaceCurvePath(sample: SurfaceSample | undefined, project: Project) {
  return sample?.curve?.reduce(
    (state, point) => {
      if (!point) return { d: state.d, pen: false };
      const xy = project(...point);
      return { d: state.d + `${state.pen ? 'L' : 'M'}${xy.join(',')}`, pen: true };
    },
    { d: '', pen: false },
  ).d;
}

export function spaceArrow(project: Project, from: Point3, to: Point3) {
  const p = project(...from),
    q = project(...to),
    dx = q[0] - p[0],
    dy = q[1] - p[1],
    length = Math.hypot(dx, dy);
  if (length < 0.1) return '';
  const h = Math.min(5, length * 0.4),
    ux = dx / length,
    uy = dy / length;
  return `M${p.join(',')}L${q.join(',')}l${-h * ux - h * 0.5 * uy},${-h * uy + h * 0.5 * ux}M${q.join(',')}l${-h * ux + h * 0.5 * uy},${-h * uy - h * 0.5 * ux}`;
}
