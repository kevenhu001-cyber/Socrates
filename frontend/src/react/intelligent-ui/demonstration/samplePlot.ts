import { demonstrationDomain, isDemonstrationBudgetError } from '@socrates/core/demonstration';
import type {
  DemonstrationPlot,
  DemonstrationTrajectory,
  DemonstrationValue,
  DemonstrationRuntime,
} from '@socrates/core/demonstration';
import { errorMessage } from './sampleField';

export type PlotView = DemonstrationPlot | DemonstrationTrajectory;
type Point = [number, number] | null;
type Domain = [number, number];
export interface Issue {
  part: 'curve' | 'marker';
  index: number;
  label?: string;
  detail: string;
}
export interface PlotSample {
  xDomain: [number, number];
  yDomain: [number, number];
  paths: string[];
  markers: Point[];
  issues: Issue[];
}

/** Fit the y-axis to the finite samples when the declared bounds cannot be evaluated. */
function fittedRange(curves: Point[][]): [number, number] {
  let min = Infinity,
    max = -Infinity;
  for (const points of curves)
    for (const point of points)
      if (point && Math.abs(point[1]) <= 1e6) {
        min = Math.min(min, point[1]);
        max = Math.max(max, point[1]);
      }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [-1, 1];
  if (min === max) {
    const pad = min === 0 ? 1 : Math.abs(min) * 0.1;
    return [min - pad, max + pad];
  }
  const pad = (max - min) * 0.05;
  return [min - pad, max + pad];
}

/**
 * Sample every curve independently. A sample that throws or is not finite is
 * a gap in the line, not a failure of the view; a curve with no finite samples
 * is reported by name while the other curves still draw.
 */
function* sample(
  view: PlotView,
  runtime: DemonstrationRuntime,
  time: number,
  samples: number,
  cache: PlotCache,
): Generator<void, PlotSample, void> {
  runtime.resetBudget();
  const issues: Issue[] = [];
  const xDomain = demonstrationDomain(view.x, runtime, time);
  const read = (expression: DemonstrationValue, t: number, x: number) =>
    runtime.evaluate(expression, t, x);
  const sources =
    view.kind === 'plot'
      ? view.curves.map((curve) => ({ expression: curve.expression, label: curve.label }))
      : [{ expression: view.vertical, label: view.label }];
  const curves: Point[][] = [];
  for (const [index, curve] of sources.entries()) {
    const reusable =
      view.kind === 'plot' &&
      ![...view.x, curve.expression].some((expression) => runtime.dependencies(expression) & 4);
    const key = `${index}:${samples}`;
    let sampled = reusable ? cache.get(key) : undefined;
    if (!sampled) {
      const points: Point[] = [];
      let finite = 0,
        firstError = '';
      for (let i = 0; i <= samples; i++) {
        try {
          const t = view.kind === 'trajectory' ? (time * i) / samples : time;
          const x =
            view.kind === 'trajectory'
              ? read(view.horizontal, t, 0)
              : xDomain[0] + ((xDomain[1] - xDomain[0]) * i) / samples;
          const y = read(curve.expression, t, x);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            points.push([x, y]);
            finite++;
          } else points.push(null);
        } catch (error) {
          if (isDemonstrationBudgetError(error)) throw error;
          firstError ||= errorMessage(error);
          points.push(null);
        }
        if (i % 32 === 0) yield;
      }
      sampled = {
        points,
        issue: finite
          ? undefined
          : {
              part: 'curve',
              index,
              label: curve.label ?? (view.kind === 'trajectory' ? view.yLabel : undefined),
              detail: firstError || 'No finite values in this range',
            },
      };
      if (reusable) cache.set(key, sampled);
    }
    curves.push(sampled.points);
    if (sampled.issue) issues.push(sampled.issue);
  }
  const yDomain = demonstrationDomain(view.y, runtime, time, fittedRange(curves));
  const markers: Point[] = [];
  if (view.kind === 'plot')
    view.markers?.forEach((marker, index) => {
      try {
        const x = read(marker.x, time, 0),
          y = read(marker.y, time, 0);
        if (Number.isFinite(x) && Number.isFinite(y)) markers[index] = [x, y];
      } catch (error) {
        if (isDemonstrationBudgetError(error)) throw error;
        issues.push({
          part: 'marker',
          index,
          label: marker.label,
          detail: errorMessage(error),
        });
      }
    });
  if (view.kind === 'trajectory') {
    try {
      const x = read(view.horizontal, time, 0),
        y = read(view.vertical, time, 0);
      if (Number.isFinite(x) && Number.isFinite(y)) markers[0] = [x, y];
    } catch (error) {
      if (isDemonstrationBudgetError(error)) throw error;
    }
  }
  const { sx, sy } = plotProjection(xDomain, yDomain);
  return {
    xDomain,
    yDomain,
    paths: curves.map((points) => pathFor(points, sx, sy)),
    markers,
    issues,
  };
}

/** Expensive programs retry at a lower sampling density within the same finite budget. */
export type PlotCache = Map<string, { points: Point[]; issue?: Issue }>;

export function plotExpressions(view: PlotView) {
  return view.kind === 'plot'
    ? [
        ...view.x,
        ...view.y,
        ...view.curves.map((curve) => curve.expression),
        ...(view.markers ?? []).flatMap((marker) => [marker.x, marker.y]),
      ]
    : [...view.x, ...view.y, view.horizontal, view.vertical];
}

export function* samplePlot(
  view: PlotView,
  runtime: DemonstrationRuntime,
  time: number,
  preview: boolean,
  cache: PlotCache,
): Generator<void, PlotSample, void> {
  const densities =
    view.kind === 'trajectory'
      ? preview
        ? [300, 150, 1200, 600]
        : [1200, 600, 300, 150]
      : preview
        ? [120, 60, 480, 240]
        : [480, 240, 120, 60];
  for (const samples of densities) {
    try {
      return yield* sample(view, runtime, time, samples, cache);
    } catch (error) {
      if (samples === densities[densities.length - 1] || !isDemonstrationBudgetError(error))
        throw error;
    }
  }
  throw Error('Unreachable');
}

export const WIDTH = 520;
export const HEIGHT = 232;
// Leave room for a typeset vertical axis label outside the tick labels.
export const LEFT = 48;
export const RIGHT = 12;
export const TOP = 14;
export const BOTTOM = 38;

export function plotProjection(xDomain: Domain, yDomain: Domain) {
  const sx = (x: number) =>
    LEFT + ((x - xDomain[0]) / (xDomain[1] - xDomain[0])) * (WIDTH - LEFT - RIGHT);
  const sy = (y: number) =>
    HEIGHT - BOTTOM - ((y - yDomain[0]) / (yDomain[1] - yDomain[0])) * (HEIGHT - TOP - BOTTOM);
  return { sx, sy };
}

function pathFor(
  points: Point[],
  sx: (value: number) => number,
  sy: (value: number) => number,
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
    path += `${pen ? 'L' : 'M'}${px.toFixed(2)},${py.toFixed(2)}`;
    pen = true;
  }
  return path;
}
