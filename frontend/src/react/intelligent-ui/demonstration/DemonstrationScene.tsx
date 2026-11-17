import { useId, type ReactNode } from 'react';
import { demonstrationDomain, type DemonstrationObject, type DemonstrationRuntime, type DemonstrationScene, type DemonstrationValue } from '@socrates/core';
import { MathText } from '../../rn/useInlineMath';
import { SvgMathText } from '../../rn/SvgMathText';
import { i18n } from '../../legacy/gateway';
import { demoColors } from './DemonstrationPlot';
import { DemoIssue } from './DemonstrationIssue';

type Point = [number, number];
const WIDTH = 640, HEIGHT = 340, PAD = 36;
const tick = (value: number) => Number(value.toPrecision(3)).toString();

/** A fixed number of coils keeps geometry bounded even at coincident endpoints. */
function springPath(from: Point, to: Point): string {
  const dx = to[0] - from[0], dy = to[1] - from[1], length = Math.hypot(dx, dy);
  if (length < .01) return `M${from[0]} ${from[1]}`;
  const amplitude = Math.min(7, length / 12);
  const points: Point[] = [from];
  for (let i = 0; i <= 24; i++) {
    const fraction = .1 + .8 * i / 24;
    const offset = i === 0 || i === 24 ? 0 : (i % 2 ? amplitude : -amplitude);
    points.push([from[0] + dx * fraction - dy / length * offset, from[1] + dy * fraction + dx / length * offset]);
  }
  points.push(to);
  return points.map(([x, y], index) => `${index ? 'L' : 'M'}${x} ${y}`).join(' ');
}

function drawSceneObject({ object, read, project, scale }: {
  object: DemonstrationObject;
  read: (value: DemonstrationValue) => number;
  project: (point: [DemonstrationValue, DemonstrationValue]) => Point;
  scale: number;
}) {
  const color = demoColors[object.color || 'ink'];
  let drawing: ReactNode;
  let labelAt: Point;
  const size = (value: DemonstrationValue) => {
    const result = read(value);
    if (result <= 0) throw Error('Object size must be positive');
    const pixels = result * scale;
    if (!Number.isFinite(pixels)) throw Error('Object size exceeds the display range');
    return pixels;
  };
  if (object.kind === 'path') {
    const points = object.points.map(project);
    drawing = <path d={points.map(([x, y], index) => `${index ? 'L' : 'M'}${x} ${y}`).join(' ') + (object.closed ? ' Z' : '')}
      fill={object.closed ? color : 'none'} fillOpacity={.08} stroke={color} strokeWidth={1.8} strokeDasharray={object.dashed ? '5 4' : undefined} />;
    labelAt = [points[0][0], points[0][1] - 10];
  } else if (object.kind === 'body' || object.kind === 'block') {
    const [cx, cy] = project(object.center);
    if (object.kind === 'body') {
      const radius = size(object.radius);
      drawing = <circle cx={cx} cy={cy} r={radius} fill={color} fillOpacity={.16} stroke={color} strokeWidth={1.8} />;
      labelAt = [cx, cy - radius - 8];
    } else {
      const width = size(object.width), height = size(object.height), angle = read(object.angle ?? 0);
      drawing = <rect x={cx - width / 2} y={cy - height / 2} width={width} height={height}
        transform={`rotate(${-angle * 180 / Math.PI} ${cx} ${cy})`} fill={color} fillOpacity={.16} stroke={color} strokeWidth={1.8} />;
      labelAt = [cx, cy - Math.hypot(width, height) / 2 - 8];
    }
  } else {
    const from = project(object.from), to = project(object.to);
    const dx = to[0] - from[0], dy = to[1] - from[1], angle = Math.atan2(dy, dx);
    const head = Math.min(9, Math.hypot(dx, dy) / 3);
    drawing = <>
      <path d={object.kind === 'spring' ? springPath(from, to) : `M${from[0]} ${from[1]}L${to[0]} ${to[1]}`}
        fill="none" stroke={color} strokeWidth={object.kind === 'rod' ? 3 : 1.8} />
      {object.kind === 'vector' && head > .01 ? <path d={`M${to[0] - head * Math.cos(angle - .45)} ${to[1] - head * Math.sin(angle - .45)}L${to[0]} ${to[1]}L${to[0] - head * Math.cos(angle + .45)} ${to[1] - head * Math.sin(angle + .45)}`}
        fill="none" stroke={color} strokeWidth={1.8} /> : null}
    </>;
    labelAt = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 - 10];
  }
  return <g data-scene-object={object.kind}>
    {drawing}
    {object.label ? <SvgMathText className="demo-marker-label" x={labelAt[0]} y={labelAt[1]} anchor="middle" text={object.label} /> : null}
  </g>;
}

/** Mathematical coordinates stay isotropic: circles and physical angles retain their shape. */
export function DemoScene({ view, runtime, time }: { view: DemonstrationScene; runtime: DemonstrationRuntime; time: number }) {
  const id = useId();
  const issues: string[] = [];
  runtime.resetBudget();
  let content: ReactNode;
  try {
    const x = demonstrationDomain(view.x, runtime, time), y = demonstrationDomain(view.y, runtime, time);
    const scale = Math.min((WIDTH - 2 * PAD) / (x[1] - x[0]), (HEIGHT - 2 * PAD) / (y[1] - y[0]));
    if (!Number.isFinite(scale) || scale <= 0) throw Error('Scene axis range cannot be displayed');
    const left = (WIDTH - (x[1] - x[0]) * scale) / 2, bottom = (HEIGHT + (y[1] - y[0]) * scale) / 2;
    const read = (value: DemonstrationValue) => {
      const result = runtime.evaluate(value, time);
      if (!Number.isFinite(result) || Math.abs(result) > 1e6) throw Error('Scene values must be finite and within ±1e6');
      return result;
    };
    const project = (point: [DemonstrationValue, DemonstrationValue]): Point => {
      const projected: Point = [left + (read(point[0]) - x[0]) * scale, bottom - (read(point[1]) - y[0]) * scale];
      if (!projected.every(Number.isFinite)) throw Error('Object coordinates exceed the display range');
      return projected;
    };
    const top = bottom - (y[1] - y[0]) * scale, right = WIDTH - left;
    // Evaluate each object independently so an invalid component leaves the others visible.
    const objects = view.objects.map((object, index) => {
      try { return <g key={index}>{drawSceneObject({ object, read, project, scale })}</g>; }
      catch (error) { issues.push(`${object.label || `objects[${index}]`}: ${error instanceof Error ? error.message : String(error)}`); return null; }
    });
    content = <>
      <defs><clipPath id={id}><rect x={left} y={top} width={right - left} height={bottom - top} /></clipPath></defs>
      {[0, 1, 2, 3, 4].map((index) => {
        const fraction = index / 4, px = left + (right - left) * fraction, py = bottom - (bottom - top) * fraction;
        return <g key={index}>
          <path d={`M${px} ${top}V${bottom}M${left} ${py}H${right}`} stroke="var(--ui-hairline-strong)" fill="none" />
          <text fill="var(--ui-ink-tertiary)" className="demo-axis-label" x={px} y={bottom + 17} textAnchor="middle">{tick(x[0] + (x[1] - x[0]) * fraction)}</text>
          <text fill="var(--ui-ink-tertiary)" className="demo-axis-label" x={left - 7} y={py + 4} textAnchor="end">{tick(y[0] + (y[1] - y[0]) * fraction)}</text>
        </g>;
      })}
      <g clipPath={`url(#${id})`}>{objects}</g>
      <SvgMathText className="demo-axis-label" x={right} y={HEIGHT - 2} anchor="end" text={view.xLabel || ''} />
      <SvgMathText className="demo-axis-label" x={left} y={12} text={view.yLabel || ''} />
    </>;
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  const label = view.label || i18n('intui.demo.title', 'Interactive demonstration');
  return <figure className="demo-plot demo-scene">
    {view.label ? <figcaption><MathText text={view.label} /></figcaption> : null}
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label}>{content}</svg>
    {issues.length ? <div className="demo-note" role="status"><DemoIssue
      headline={i18n('intui.demo.invalidAt', 'Demonstration error in {path}').replace('{path}', label)} details={issues} /></div> : null}
  </figure>;
}
