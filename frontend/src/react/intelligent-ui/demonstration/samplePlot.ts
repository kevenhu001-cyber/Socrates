import { demonstrationDomain, isDemonstrationBudgetError } from '@socrates/core/demonstrationLight';
import type {
  DemonstrationPlot,
  DemonstrationTrajectory,
  DemonstrationValue,
  DemonstrationRuntime,
} from '@socrates/core/demonstration';
import { errorMessage } from './fieldCommon';
import {
  plotProjection,
  pathFor,
  type Domain,
  type Point,
  type AxisScale,
} from './geometry/plotProjection';
export {
  WIDTH,
  HEIGHT,
  LEFT,
  RIGHT,
  TOP,
  BOTTOM,
  plotProjection,
  type AxisScale,
} from './geometry/plotProjection';

export type PlotView = DemonstrationPlot | DemonstrationTrajectory;
function axisValue(domain: Domain, fraction: number, scale: AxisScale = 'linear') {
  return scale === 'log'
    ? Math.exp(Math.log(domain[0]) + fraction * (Math.log(domain[1]) - Math.log(domain[0])))
    : domain[0] + fraction * (domain[1] - domain[0]);
}
function positiveDomain(domain: Domain, scale: AxisScale, axis: string) {
  if (scale === 'log' && domain[0] <= 0)
    throw new Error(`Logarithmic ${axis} axis needs positive bounds`);
}
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
  xScale?: AxisScale;
  yScale?: AxisScale;
  playhead?: number;
  eventTimes?: number[];
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
function* sampleCurvePoints(
  view: PlotView,
  curve: { expression: DemonstrationValue; label?: string },
  time: number,
  samples: number,
  xDomain: [number, number],
  read: (expression: DemonstrationValue, t: number, x: number) => number,
): Generator<void, { points: Point[]; finite: number; firstError: string }, void> {
  const points: Point[] = [];
  let finite = 0,
    firstError = '';
  for (let i = 0; i <= samples; i++) {
    try {
      const history = view.kind === 'plot' && view.history;
      const left = Math.max(0, xDomain[0]);
      const right = Math.min(time, xDomain[1]);
      if (history && right < left) continue;
      const scale = view.kind === 'plot' ? view.xScale : undefined;
      const t =
        view.kind === 'trajectory'
          ? (time * i) / samples
          : history
            ? axisValue([left, right], i / samples, scale)
            : time;
      const x =
        view.kind === 'trajectory'
          ? read(view.horizontal, t, 0)
          : history
            ? t
            : axisValue(xDomain, i / samples, scale);
      const y = read(curve.expression, t, x);
      if (
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        !(view.kind === 'plot' && view.yScale === 'log' && y <= 0)
      ) {
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
  return { points, finite, firstError };
}

function samplePlotMarkers(
  view: PlotView,
  time: number,
  read: (expression: DemonstrationValue, t: number, x: number) => number,
  issues: Issue[],
): Point[] {
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
  return markers;
}

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
  const xScale = view.kind === 'plot' ? (view.xScale ?? 'linear') : 'linear';
  const yScale = view.kind === 'plot' ? (view.yScale ?? 'linear') : 'linear';
  positiveDomain(xDomain, xScale, 'x');
  const slice =
    view.kind === 'plot' && view.sliceY !== undefined ? runtime.evaluate(view.sliceY, time) : 0;
  if (!Number.isFinite(slice)) throw new Error('Slice coordinate must be finite');
  const read = (expression: DemonstrationValue, t: number, x: number) =>
    runtime.evaluate(expression, t, x, slice);
  const sources =
    view.kind === 'plot'
      ? view.curves.map((curve) => ({
          expression: curve.expression,
          label: curve.label,
          samples: curve.samples,
        }))
      : [{ expression: view.vertical, label: view.label, samples: undefined }];
  const curves: Point[][] = [];
  for (const [index, curve] of sources.entries()) {
    const reusable =
      view.kind === 'plot' &&
      !view.history &&
      ![...view.x, ...(view.sliceY === undefined ? [] : [view.sliceY]), curve.expression].some(
        (expression) => runtime.dependencies(expression) & 4,
      );
    const intervals = curve.samples !== undefined ? curve.samples - 1 : samples;
    const key = `${index}:${intervals}`;
    let sampled = reusable ? cache.get(key) : undefined;
    if (!sampled) {
      const { points, finite, firstError } = yield* sampleCurvePoints(
        view,
        curve,
        time,
        intervals,
        xDomain,
        read,
      );
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
  const markers = samplePlotMarkers(view, time, read, issues);
  positiveDomain(yDomain, yScale, 'y');
  const { sx, sy } = plotProjection(xDomain, yDomain, xScale, yScale);
  return {
    xDomain,
    yDomain,
    xScale,
    yScale,
    paths: curves.map((points, index) =>
      pathFor(
        points,
        sx,
        sy,
        view.kind === 'plot' ? view.curves[index].interpolation : undefined,
        sy(Math.max(yDomain[0], Math.min(yDomain[1], 0))),
      ),
    ),
    markers,
    issues,
    ...(view.kind === 'plot' && view.history
      ? {
          playhead: time,
          eventTimes: (runtime.eventTimes ?? []).filter(
            (t) => t <= time && t >= xDomain[0] && t <= xDomain[1],
          ),
        }
      : {}),
  };
}

/** Expensive programs retry at a lower sampling density within the same finite budget. */
export type PlotCache = Map<string, { points: Point[]; issue?: Issue }>;

export function plotExpressions(view: PlotView) {
  return view.kind === 'plot'
    ? [
        ...view.x,
        ...view.y,
        ...(view.history ? ['t'] : []),
        ...(view.sliceY === undefined ? [] : [view.sliceY]),
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
  throw new Error('Unreachable');
}
