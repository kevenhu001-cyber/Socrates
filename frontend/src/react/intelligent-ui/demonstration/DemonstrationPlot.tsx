import { MathText } from '../../rn/useInlineMath';
import { SvgMathText } from '../../rn/SvgMathText';
import { i18n } from '../../../ui/legacyI18n.ts';
import { memo, useId } from 'react';
import {
  type PlotView as View,
  type PlotSample as Sampled,
  type Issue,
} from './samplePlot';
import { WIDTH, HEIGHT, LEFT, RIGHT, TOP, BOTTOM, plotProjection, type AxisScale } from './geometry/plotProjection';
import { demoAxisLabel } from './mathLabels';
import { DemoIssue } from './DemonstrationIssue';
export const demoColors: Record<string, string> = {
  ink: 'var(--ui-ink)',
  muted: 'var(--ui-text-tertiary)',
  blue: 'var(--ui-demo-blue)',
  orange: 'var(--ui-demo-orange)',
  red: 'var(--ui-demo-red)',
  green: 'var(--ui-demo-green)',
  violet: 'var(--ui-demo-violet)',
};

function issueHeadline(issues: Issue[]) {
  const first = i18n('intui.demo.failedNamed', 'Could not compute “{name}”').replace(
    '{name}',
    issueName(issues[0]),
  );
  return issues.length > 1 ? `${first} (+${issues.length - 1})` : first;
}

function issueName(issue: Issue) {
  if (issue.label) return issue.label;
  const label =
    issue.part === 'curve'
      ? i18n('intui.demo.curve', 'Curve {n}')
      : i18n('intui.demo.marker', 'Marker {n}');
  return label.replace('{n}', String(issue.index + 1));
}

export const DemoPlot = memo(function DemoPlot({
  view,
  sample,
  problem,
}: {
  view: View;
  sample?: Sampled;
  problem?: string;
}) {
  const id = useId();
  if (problem) {
    const name = view.label || view.yLabel;
    const headline = name
      ? i18n('intui.demo.failedNamed', 'Could not compute “{name}”').replace('{name}', name)
      : i18n('intui.demo.failedView', 'This view could not be computed');
    return (
      <figure className="demo-plot">
        {view.label ? (
          <figcaption>
            <MathText text={view.label} />
          </figcaption>
        ) : null}
        <div className="demo-error" role="status">
          <DemoIssue headline={headline} details={[problem]} />
        </div>
      </figure>
    );
  }
  return sample ? (
    renderPlot(view, sample, id)
  ) : (
    <figure className="demo-plot" aria-busy="true">
      <PlotCaption view={view} />
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true" />
    </figure>
  );
});

type Domain = [number, number];
type Point = [number, number] | null;
type ProjectedPoint = { x: number; y: number } | null;
type ProjectPoint = (point: Point | undefined) => ProjectedPoint;

function curveSpecs(view: View) {
  return view.kind === 'plot'
    ? view.curves
    : [{ expression: view.vertical, color: view.color, label: undefined, dashed: false }];
}

/* One tick vocabulary across every plot: a sampled or simulated curve produces
   arbitrary floats, so read as a comparison number rather than a full float.
   Mirrors the chart cards' axis formatter (render/visualizationOptions.ts). */
function formatTick(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0';
  const magnitude = Math.abs(value);
  if (magnitude >= 1e5 || magnitude < 1e-3) return value.toExponential(1).replace('e+', 'e');
  return String(Number(value.toFixed(4)));
}

function ticks(min: number, max: number, target: number, scale: AxisScale = 'linear'): number[] {
  if (scale === 'log') {
    const lo = Math.log10(min), hi = Math.log10(max);
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return [];
    const step = Math.max(1, Math.ceil((hi - lo) / target));
    const first = Math.ceil(lo / step) * step;
    const major = Array.from({ length: Math.min(20, Math.max(0, Math.floor((hi - first) / step) + 1)) },
      (_, index) => 10 ** (first + index * step));
    return major.length >= 2 ? major : Array.from({length: 3}, (_, i) => 10 ** (lo + (hi - lo) * i / 2));
  }
  const raw = (max - min) / target;
  if (!(raw > 0) || !Number.isFinite(raw)) return [];
  const base = 10 ** Math.floor(Math.log10(raw));
  const factor = raw / base;
  const multiplier = factor < 1.5 ? 1 : factor < 3 ? 2 : factor < 7 ? 5 : 10;
  const step = multiplier * base;
  const first = Math.ceil(min / step) * step;
  const count = Math.min(20, Math.max(0, Math.floor((max - first) / step) + 1));
  return Array.from({ length: count }, (_, index) => first + index * step);
}

function projectPoint(sx: (value: number) => number, sy: (value: number) => number): ProjectPoint {
  return (point) =>
    point && Number.isFinite(sx(point[0])) && Number.isFinite(sy(point[1]))
      ? { x: sx(point[0]), y: sy(point[1]) }
      : null;
}

function YAxis({ domain, sy, scale }: { domain: Domain; sy: (value: number) => number; scale?: AxisScale }) {
  return (
    <>
      {ticks(domain[0], domain[1], 3, scale).map((value) => (
        <g key={`y${value}`} className="demo-axis">
          <line x1={LEFT} x2={WIDTH - RIGHT} y1={sy(value)} y2={sy(value)} strokeDasharray="2 5" />
          <text x={LEFT - 8} y={sy(value) + 3} textAnchor="end">
            {formatTick(value)}
          </text>
        </g>
      ))}
    </>
  );
}

function XAxis({
  xDomain,
  yDomain,
  sy,
  sx,
  scale,
}: {
  xDomain: Domain;
  scale?: AxisScale;
  yDomain: Domain;
  sy: (value: number) => number;
  sx: (value: number) => number;
}) {
  const axis = sy(Math.max(yDomain[0], Math.min(yDomain[1], 0)));
  return (
    <g className="demo-axis">
      <line x1={LEFT} x2={WIDTH - RIGHT} y1={axis} y2={axis} />
      {ticks(xDomain[0], xDomain[1], 6, scale).map((value) => (
        <g key={value}>
          <line x1={sx(value)} x2={sx(value)} y1={HEIGHT - BOTTOM} y2={HEIGHT - BOTTOM + 4} />
          <text x={sx(value)} y={HEIGHT - BOTTOM + 17} textAnchor="middle">
            {formatTick(value)}
          </text>
        </g>
      ))}
    </g>
  );
}

function CurvePaths({ curves, paths }: { curves: ReturnType<typeof curveSpecs>; paths: string[] }) {
  return (
    <>
      {curves.map((curve, index) => (
        <path
          key={index}
          d={paths[index]}
          fill="none"
          stroke={demoColors[curve.color || 'ink'] || demoColors.ink}
          strokeWidth={curve.dashed ? 1.3 : 1.8}
          strokeDasharray={curve.dashed ? '5 4' : undefined}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </>
  );
}

function PlotMarkers({
  view,
  result,
  project,
}: {
  view: View;
  result: Sampled;
  project: ProjectPoint;
}) {
  if (view.kind === 'plot')
    return (
      <>
        {view.markers?.map((marker, index) => {
          const point = project(result.markers[index]);
          if (!point) return null;
          return (
            <g key={index}>
              <circle
                cx={point.x}
                cy={point.y}
                r="3.5"
                fill={demoColors[marker.color || 'red'] || demoColors.red}
              />
              {marker.label ? (
                <SvgMathText
                  className="demo-marker-label"
                  x={point.x + 7}
                  y={point.y - 7}
                  text={marker.label}
                />
              ) : null}
            </g>
          );
        })}
      </>
    );
  const head = project(result.markers[0]);
  return head ? (
    <circle
      cx={head.x}
      cy={head.y}
      r="3.5"
      fill={demoColors[view.color || 'blue'] || demoColors.blue}
    />
  ) : null;
}

function PlotCaption({ view }: { view: View }) {
  return view.label ? (
    <figcaption>
      <MathText text={view.label} />
    </figcaption>
  ) : null;
}

function PlotLegend({ view }: { view: View }) {
  if (view.kind !== 'plot' || !view.curves.some((curve) => curve.label)) return null;
  return (
    <div className="demo-legend">
      {view.curves.map((curve, index) =>
        curve.label ? (
          <span key={index}>
            <svg viewBox="0 0 22 8" aria-hidden="true">
              <path
                d="M0 4H22"
                stroke={demoColors[curve.color || 'ink'] || demoColors.ink}
                strokeWidth="1.7"
                strokeDasharray={curve.dashed ? '4 3' : undefined}
              />
            </svg>
            <MathText text={curve.label} />
          </span>
        ) : null,
      )}
    </div>
  );
}

function PlotIssues({ issues }: { issues: Issue[] }) {
  return issues.length ? (
    <div className="demo-note" role="status">
      <DemoIssue
        headline={issueHeadline(issues)}
        details={issues.map((issue) => `${issueName(issue)}: ${issue.detail}`)}
      />
    </div>
  ) : null;
}

function renderPlot(view: View, result: Sampled, id: string) {
  const { xDomain, yDomain } = result;
  const { sx, sy } = plotProjection(xDomain, yDomain, result.xScale, result.yScale);
  const curves = curveSpecs(view);
  const project = projectPoint(sx, sy);
  const label =
    view.label || view.yLabel || view.xLabel || i18n('intui.surface', 'Interactive result');
  return (
    <figure className="demo-plot">
      <PlotCaption view={view} />
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label}>
        <defs>
          <clipPath id={id}>
            <rect x={LEFT} y={TOP} width={WIDTH - LEFT - RIGHT} height={HEIGHT - TOP - BOTTOM} />
          </clipPath>
        </defs>
        <YAxis domain={yDomain} sy={sy} scale={result.yScale} />
        <XAxis xDomain={xDomain} yDomain={yDomain} sy={sy} sx={sx} scale={result.xScale} />
        <g clipPath={`url(#${id})`}>
          {result.eventTimes?.map((time, index) => (
            <line key={index} x1={sx(time)} x2={sx(time)} y1={TOP} y2={HEIGHT - BOTTOM}
              stroke={demoColors.orange} strokeWidth="1" strokeDasharray="3 4" opacity=".65" />
          ))}
          {result.playhead !== undefined && Number.isFinite(sx(result.playhead)) && (
            <line x1={sx(result.playhead)} x2={sx(result.playhead)} y1={TOP} y2={HEIGHT - BOTTOM}
              stroke={demoColors.muted} strokeWidth="1" strokeDasharray="4 3" />
          )}
          <CurvePaths curves={curves} paths={result.paths} />
          <PlotMarkers view={view} result={result} project={project} />
        </g>
        <SvgMathText
          className="demo-axis-label"
          x={LEFT + (WIDTH - LEFT - RIGHT) / 2}
          y={HEIGHT - 2}
          anchor="middle"
          text={demoAxisLabel(view.xLabel)}
        />
        <SvgMathText
          className="demo-axis-label"
          x={12}
          y={TOP + (HEIGHT - TOP - BOTTOM) / 2}
          anchor="middle"
          rotate={-90}
          text={demoAxisLabel(view.yLabel)}
        />
      </svg>
      <PlotLegend view={view} />
      <PlotIssues issues={result.issues} />
    </figure>
  );
}
