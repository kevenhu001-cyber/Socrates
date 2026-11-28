export type Domain = [number, number];
export type Point = [number, number] | null;
export type AxisScale = 'linear' | 'log';

export const WIDTH = 520;
export const HEIGHT = 232;
// Leave room for a typeset vertical axis label outside the tick labels.
export const LEFT = 48;
export const RIGHT = 12;
export const TOP = 14;
export const BOTTOM = 38;

export function plotProjection(
  xDomain: Domain,
  yDomain: Domain,
  xScale: AxisScale = 'linear',
  yScale: AxisScale = 'linear',
) {
  const fraction = (v: number, d: Domain, scale: AxisScale) =>
    scale === 'log'
      ? (Math.log(v) - Math.log(d[0])) / (Math.log(d[1]) - Math.log(d[0]))
      : (v - d[0]) / (d[1] - d[0]);
  const sx = (x: number) => LEFT + fraction(x, xDomain, xScale) * (WIDTH - LEFT - RIGHT);
  const sy = (y: number) =>
    HEIGHT - BOTTOM - fraction(y, yDomain, yScale) * (HEIGHT - TOP - BOTTOM);
  return { sx, sy };
}

export function pathFor(
  points: Point[],
  sx: (value: number) => number,
  sy: (value: number) => number,
  interpolation?: 'linear' | 'step' | 'points' | 'stem',
  baseline = 0,
): string {
  let pen = false;
  let path = '';
  for (const point of points) {
    if (!point) {
      pen = false;
      continue;
    }
    const px = sx(point[0]),
      py = sy(point[1]);
    // Clip runaway values (asymptotes, overflow) to a gap instead of a spike.
    if (!Number.isFinite(px) || !Number.isFinite(py) || Math.abs(py) > 1e5 || Math.abs(px) > 1e5) {
      pen = false;
      continue;
    }
    if (interpolation === 'points' || interpolation === 'stem') {
      if (interpolation === 'stem')
        path += `M${px.toFixed(2)},${baseline.toFixed(2)}V${py.toFixed(2)}`;
      path += `M${(px - 1.8).toFixed(2)},${py.toFixed(2)}a1.8,1.8 0 1,0 3.6,0a1.8,1.8 0 1,0 -3.6,0`;
      continue;
    }
    path +=
      pen && interpolation === 'step'
        ? `H${px.toFixed(2)}V${py.toFixed(2)}`
        : `${pen ? 'L' : 'M'}${px.toFixed(2)},${py.toFixed(2)}`;
    pen = true;
  }
  return path;
}
