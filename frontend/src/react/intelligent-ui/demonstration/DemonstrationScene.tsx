import { memo, useId, type ReactNode } from 'react';
import { demonstrationDomain } from '@socrates/core/demonstrationLight';
import type {
  DemonstrationObject,
  DemonstrationScene,
  DemonstrationValue,
} from '@socrates/core/demonstration';
import { MathText } from '../../rn/useInlineMath';
import { SvgMathText } from '../../rn/SvgMathText';
import { i18n } from '../../../ui/legacyI18n.ts';
import { demoColors } from './DemonstrationPlot';
import type { SceneSample } from './sampleScene';
import { demoAxisLabel } from './mathLabels';
import { DemoIssue } from './DemonstrationIssue';

type Point = [number, number];
const WIDTH = 640,
  HEIGHT = 340,
  PAD = 36;
const tick = (value: number) => Number(value.toPrecision(3)).toString();

/** A fixed number of coils keeps geometry bounded even at coincident endpoints. */
function springPath(from: Point, to: Point): string {
  const dx = to[0] - from[0],
    dy = to[1] - from[1],
    length = Math.hypot(dx, dy);
  if (length < 0.01) return `M${from[0]} ${from[1]}`;
  const amplitude = Math.min(7, length / 12);
  const points: Point[] = [from];
  for (let i = 0; i <= 24; i++) {
    const fraction = 0.1 + (0.8 * i) / 24;
    const offset = i === 0 || i === 24 ? 0 : i % 2 ? amplitude : -amplitude;
    points.push([
      from[0] + dx * fraction - (dy / length) * offset,
      from[1] + dy * fraction + (dx / length) * offset,
    ]);
  }
  points.push(to);
  return points.map(([x, y], index) => `${index ? 'L' : 'M'}${x} ${y}`).join(' ');
}

/** Local schematic coordinates use from→to as the positive axis. */
function engineeringSymbol(kind: string, from: Point, to: Point, color: string): ReactNode {
  const dx = to[0] - from[0],
    dy = to[1] - from[1],
    length = Math.hypot(dx, dy);
  if (length < 0.01) throw Error('Symbol endpoints must be distinct');
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const mid = length / 2,
    r = Math.min(length * 0.23, 16),
    left = mid - r,
    right = mid + r;
  let d: string;
  switch (kind) {
    case 'bond':
    case 'doubleBond':
    case 'tripleBond': {
      const offsets = kind === 'bond' ? [0] : kind === 'doubleBond' ? [-2.5, 2.5] : [-4, 0, 4];
      d = offsets.map((y) => `M0 ${y}H${length}`).join(' ');
      break;
    }
    case 'reactionArrow':
    case 'reversibleArrow':
    case 'inhibition': {
      const h = Math.min(9, length / 4);
      d =
        kind === 'reactionArrow'
          ? `M0 0H${length}l${-h} ${-h * 0.45}M${length} 0l${-h} ${h * 0.45}`
          : kind === 'inhibition'
            ? `M0 0H${length}M${length} ${-h * 0.6}v${h * 1.2}`
            : `M0 -4H${length}l${-h} ${-h * 0.45}M${length} 4H0l${h} ${h * 0.45}`;
      break;
    }
    case 'resistor':
      d = `M0 0H${left}V${-r * 0.5}H${right}V${r * 0.5}H${left}V0M${right} 0H${length}`;
      break;
    case 'capacitor':
      d = `M0 0H${mid - r * 0.2}M${mid - r * 0.2} ${-r}V${r}M${mid + r * 0.2} ${-r}V${r}M${mid + r * 0.2} 0H${length}`;
      break;
    case 'inductor': {
      d = `M0 0H${left}`;
      const coil = (right - left) / 4;
      for (let i = 0; i < 4; i++) d += `a${coil / 2} ${r * 0.7} 0 0 1 ${coil} 0`;
      d += `H${length}`;
      break;
    }
    case 'voltageSource':
    case 'currentSource':
      return (
        <g
          transform={`translate(${from[0]} ${from[1]}) rotate(${angle})`}
          stroke={color}
          fill="none"
          strokeWidth="1.7"
        >
          <path d={`M0 0H${left}M${right} 0H${length}`} />
          <circle cx={mid} cy={0} r={r} />
          {kind === 'voltageSource' ? (
            <path
              d={`M${mid - r * 0.65} 0h${r * 0.45}m${-r * 0.225} ${-r * 0.225}v${r * 0.45}M${mid + r * 0.2} 0h${r * 0.45}`}
            />
          ) : (
            <path
              d={`M${mid - r * 0.6} 0H${mid + r * 0.6}l${-r * 0.35} ${-r * 0.3}m${r * 0.35} ${r * 0.3}l${-r * 0.35} ${r * 0.3}`}
            />
          )}
        </g>
      );
    case 'dimension':
      d = `M0 ${-r * 0.5}V${r * 0.5}M${length} ${-r * 0.5}V${r * 0.5}M0 0H${length}M${r * 0.5} ${-r * 0.25}L0 0l${r * 0.5} ${r * 0.25}M${length - r * 0.5} ${-r * 0.25}L${length} 0l${-r * 0.5} ${r * 0.25}`;
      break;
    case 'ground':
      d = `M0 0H${length * 0.55}M${length * 0.55} ${-r}V${r}M${length * 0.73} ${-r * 0.65}V${r * 0.65}M${length * 0.91} ${-r * 0.3}V${r * 0.3}`;
      break;
    case 'pin':
    case 'roller': {
      const b = length * 0.65;
      d = `M0 0L${b} ${-r}V${r}Z M${length} ${-r * 1.35}V${r * 1.35}`;
      return (
        <g
          transform={`translate(${from[0]} ${from[1]}) rotate(${angle})`}
          stroke={color}
          fill="none"
          strokeWidth="1.7"
        >
          <path d={d} />
          {kind === 'roller' &&
            [-0.55, 0.55].map((k) => (
              <circle
                key={k}
                cx={(b + length) / 2}
                cy={k * r}
                r={Math.min(r * 0.25, (length - b) / 2)}
              />
            ))}
        </g>
      );
    }
    default:
      return null;
  }
  return (
    <path
      transform={`translate(${from[0]} ${from[1]}) rotate(${angle})`}
      d={d}
      stroke={color}
      strokeWidth="1.7"
      strokeLinejoin="round"
      fill="none"
    />
  );
}

function drawSceneObject({
  object,
  read,
  project,
  scale,
}: {
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
    drawing = (
      <path
        d={
          points.map(([x, y], index) => `${index ? 'L' : 'M'}${x} ${y}`).join(' ') +
          (object.closed ? ' Z' : '')
        }
        fill={object.closed ? color : 'none'}
        fillOpacity={0.08}
        stroke={color}
        strokeWidth={1.8}
        strokeDasharray={object.dashed ? '5 4' : undefined}
      />
    );
    labelAt = [points[0][0], points[0][1] - 10];
  } else if (
    object.kind === 'body' ||
    object.kind === 'block' ||
    object.kind === 'atom' ||
    object.kind === 'cell'
  ) {
    const [cx, cy] = project(object.center);
    if (object.kind === 'atom' || object.kind === 'cell') {
      const radius = size(object.radius);
      const elementColors: Record<string, string> = {
        H: '#9ca3af',
        C: '#64748b',
        N: '#3478da',
        O: '#d34d4d',
        S: '#c89b27',
        P: '#db8734',
        Cl: '#32945c',
      };
      const tint = object.kind === 'atom' ? (elementColors[object.element] ?? color) : color;
      drawing = (
        <g>
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill={tint}
            fillOpacity={object.kind === 'atom' ? 0.88 : 0.12}
            stroke={tint}
            strokeWidth="1.8"
          />
          {object.kind === 'atom' ? (
            <text
              x={cx}
              y={cy}
              dy=".35em"
              textAnchor="middle"
              fontSize={Math.min(15, radius * 0.85)}
              fill="#fff"
            >
              {object.element}
            </text>
          ) : (
            <circle
              cx={cx + radius * 0.15}
              cy={cy - radius * 0.1}
              r={radius * 0.28}
              stroke={tint}
              fill={tint}
              fillOpacity=".25"
              strokeWidth="1.2"
            />
          )}
        </g>
      );
      labelAt = [cx, cy - radius - 8];
    } else if (object.kind === 'body') {
      const radius = size(object.radius);
      drawing = (
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill={color}
          fillOpacity={0.16}
          stroke={color}
          strokeWidth={1.8}
        />
      );
      labelAt = [cx, cy - radius - 8];
    } else {
      const width = size(object.width),
        height = size(object.height),
        angle = read(object.angle ?? 0);
      drawing = (
        <rect
          x={cx - width / 2}
          y={cy - height / 2}
          width={width}
          height={height}
          transform={`rotate(${(-angle * 180) / Math.PI} ${cx} ${cy})`}
          fill={color}
          fillOpacity={0.16}
          stroke={color}
          strokeWidth={1.8}
        />
      );
      labelAt = [cx, cy - Math.hypot(width, height) / 2 - 8];
    }
  } else {
    const from = project(object.from),
      to = project(object.to);
    const dx = to[0] - from[0],
      dy = to[1] - from[1],
      angle = Math.atan2(dy, dx);
    const head = Math.min(9, Math.hypot(dx, dy) / 3);
    drawing = !['rod', 'spring', 'vector'].includes(object.kind) ? (
      engineeringSymbol(object.kind, from, to, color)
    ) : (
      <>
        <path
          d={
            object.kind === 'spring'
              ? springPath(from, to)
              : `M${from[0]} ${from[1]}L${to[0]} ${to[1]}`
          }
          fill="none"
          stroke={color}
          strokeWidth={object.kind === 'rod' ? 3 : 1.8}
        />
        {object.kind === 'vector' && head > 0.01 ? (
          <path
            d={`M${to[0] - head * Math.cos(angle - 0.45)} ${to[1] - head * Math.sin(angle - 0.45)}L${to[0]} ${to[1]}L${to[0] - head * Math.cos(angle + 0.45)} ${to[1] - head * Math.sin(angle + 0.45)}`}
            fill="none"
            stroke={color}
            strokeWidth={1.8}
          />
        ) : null}
      </>
    );
    labelAt = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 - 10];
  }
  return (
    <g data-scene-object={object.kind}>
      {drawing}
      {object.label ? (
        <SvgMathText
          className="demo-marker-label"
          x={labelAt[0]}
          y={labelAt[1]}
          anchor="middle"
          text={object.label}
        />
      ) : null}
    </g>
  );
}

function SceneGridTicks({
  left,
  right,
  top,
  bottom,
  x,
  y,
}: {
  left: number;
  right: number;
  top: number;
  bottom: number;
  x: [number, number];
  y: [number, number];
}) {
  return (
    <>
      {[0, 1, 2, 3, 4].map((index) => {
        const fraction = index / 4,
          px = left + (right - left) * fraction,
          py = bottom - (bottom - top) * fraction;
        return (
          <g key={index}>
            <path
              d={`M${px} ${top}V${bottom}M${left} ${py}H${right}`}
              stroke="var(--ui-hairline-strong)"
              fill="none"
            />
            <text
              fill="var(--ui-text-tertiary)"
              className="demo-axis-label"
              x={px}
              y={bottom + 17}
              textAnchor="middle"
            >
              {tick(x[0] + (x[1] - x[0]) * fraction)}
            </text>
            <text
              fill="var(--ui-text-tertiary)"
              className="demo-axis-label"
              x={left - 7}
              y={py + 4}
              textAnchor="end"
            >
              {tick(y[0] + (y[1] - y[0]) * fraction)}
            </text>
          </g>
        );
      })}
    </>
  );
}

function buildSceneObjects(
  objects: DemonstrationScene['objects'],
  read: (value: DemonstrationValue) => number,
  project: (point: [DemonstrationValue, DemonstrationValue]) => Point,
  scale: number,
  issues: string[],
) {
  return objects.map((object, index) => {
    try {
      return <g key={index}>{drawSceneObject({ object, read, project, scale })}</g>;
    } catch (error) {
      issues.push(
        `${object.label || `objects[${index}]`}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  });
}

/** Mathematical coordinates stay isotropic: circles and physical angles retain their shape. */
export const DemoScene = memo(function DemoScene({
  view,
  sample,
}: {
  view: DemonstrationScene;
  sample?: SceneSample;
}) {
  const id = useId();
  const issues: string[] = [];
  const evaluate = (expression: DemonstrationValue) => {
    const value = sample?.get(expression);
    if (typeof value === 'string') throw Error(value);
    return value ?? Number.NaN;
  };
  let content: ReactNode;
  if (sample)
    try {
      const x = demonstrationDomain(view.x, { evaluate }),
        y = demonstrationDomain(view.y, { evaluate });
      const scale = Math.min((WIDTH - 2 * PAD) / (x[1] - x[0]), (HEIGHT - 2 * PAD) / (y[1] - y[0]));
      if (!Number.isFinite(scale) || scale <= 0)
        throw Error('Scene axis range cannot be displayed');
      const left = (WIDTH - (x[1] - x[0]) * scale) / 2,
        bottom = (HEIGHT + (y[1] - y[0]) * scale) / 2;
      const read = (value: DemonstrationValue) => {
        const result = evaluate(value);
        if (!Number.isFinite(result) || Math.abs(result) > 1e6)
          throw Error('Scene values must be finite and within ±1e6');
        return result;
      };
      const project = (point: [DemonstrationValue, DemonstrationValue]): Point => {
        const projected: Point = [
          left + (read(point[0]) - x[0]) * scale,
          bottom - (read(point[1]) - y[0]) * scale,
        ];
        if (!projected.every(Number.isFinite))
          throw Error('Object coordinates exceed the display range');
        return projected;
      };
      const top = bottom - (y[1] - y[0]) * scale,
        right = WIDTH - left;
      // Evaluate each object independently so an invalid component leaves the others visible.
      const objects = buildSceneObjects(view.objects, read, project, scale, issues);
      content = (
        <>
          <defs>
            <clipPath id={id}>
              <rect x={left} y={top} width={right - left} height={bottom - top} />
            </clipPath>
          </defs>
          <SceneGridTicks left={left} right={right} top={top} bottom={bottom} x={x} y={y} />
          <g clipPath={`url(#${id})`}>{objects}</g>
          <SvgMathText
            className="demo-axis-label"
            x={right}
            y={HEIGHT - 2}
            anchor="end"
            text={demoAxisLabel(view.xLabel)}
          />
          <SvgMathText
            className="demo-axis-label"
            x={left}
            y={12}
            text={demoAxisLabel(view.yLabel)}
          />
        </>
      );
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  const label = view.label || i18n('intui.demo.title', 'Interactive demonstration');
  return (
    <figure className="demo-plot demo-scene">
      {view.label ? (
        <figcaption>
          <MathText text={view.label} />
        </figcaption>
      ) : null}
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label}>
        {content}
      </svg>
      {issues.length ? (
        <div className="demo-note" role="status">
          <DemoIssue
            headline={i18n('intui.demo.invalidAt', 'Demonstration error in {path}').replace(
              '{path}',
              label,
            )}
            details={issues}
          />
        </div>
      ) : null}
    </figure>
  );
});
