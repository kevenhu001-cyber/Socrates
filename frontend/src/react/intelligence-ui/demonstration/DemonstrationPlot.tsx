import { MathText } from '../../rn/useInlineMath';
import { SvgMathText } from '../../rn/SvgMathText';
import { demonstrationDomain, isDemonstrationBudgetError } from '@socrates/core';
import { i18n } from '../../legacy/gateway';
import { useId } from 'react';
import type { DemonstrationPlot, DemonstrationRuntime, DemonstrationTrajectory, DemonstrationValue } from '@socrates/core';
import { DemoIssue } from './DemonstrationIssue';
export const demoColors: Record<string, string> = { ink:'var(--ui-ink)', muted:'var(--ui-ink-tertiary)', blue:'var(--ui-demo-blue)', orange:'var(--ui-demo-orange)', red:'var(--ui-demo-red)', green:'var(--ui-demo-green)', violet:'var(--ui-demo-violet)' };

type View = DemonstrationPlot | DemonstrationTrajectory;
type Point = [number, number] | null;
type Domain = [number, number];
interface Issue { name: string; detail: string }
interface Sampled { xDomain: [number, number]; yDomain: [number, number]; curves: Point[][]; markers: Point[]; issues: Issue[] }

const message=(error:unknown)=>error instanceof Error?error.message:String(error);
const viewName=(view:View)=>view.label||view.yLabel||'';

/** Name a failing part of the view: its label when it has one, else its position. */
function named(label:string|undefined,fallbackKey:string,fallback:string,index:number){
 return label?label:i18n(fallbackKey,fallback).replace('{n}',String(index+1));
}

/** Fit the y-axis to the finite samples when the declared bounds cannot be evaluated. */
function fittedRange(curves:Point[][]):[number,number]{
 let min=Infinity,max=-Infinity;
 for(const points of curves)for(const point of points)if(point&&Math.abs(point[1])<=1e6){min=Math.min(min,point[1]);max=Math.max(max,point[1]);}
 if(!Number.isFinite(min)||!Number.isFinite(max))return [-1,1];
 if(min===max){const pad=min===0?1:Math.abs(min)*.1;return [min-pad,max+pad];}
 const pad=(max-min)*.05;return [min-pad,max+pad];
}

/**
 * Sample every curve independently. A sample that throws or is not finite is
 * a gap in the line, not a failure of the view; a curve with no finite samples
 * is reported by name while the other curves still draw.
 */
function sample(view:View,runtime:DemonstrationRuntime,time:number,samples:number):Sampled{
 runtime.resetBudget();
 const issues:Issue[]=[];
 const xDomain=demonstrationDomain(view.x,runtime,time);
 const read=(expression:DemonstrationValue,t:number,x:number)=>runtime.evaluate(expression,t,x);
 const sources=view.kind==='plot'?view.curves.map(curve=>({expression:curve.expression,label:curve.label})):[{expression:view.vertical,label:view.label}];
 const curves=sources.map((curve,index)=>{
  const points:Point[]=[];let finite=0,firstError='';
  for(let i=0;i<=samples;i++){
   try{
    const t=view.kind==='trajectory'?time*i/samples:time;
    const x=view.kind==='trajectory'?read(view.horizontal,t,0):xDomain[0]+(xDomain[1]-xDomain[0])*i/samples;
    const y=read(curve.expression,t,x);
    if(Number.isFinite(x)&&Number.isFinite(y)){points.push([x,y]);finite++;}else points.push(null);
   }catch(error){
    if(isDemonstrationBudgetError(error))throw error;
    firstError||=message(error);points.push(null);
   }
  }
  if(!finite)issues.push({name:view.kind==='plot'?named(curve.label,'intui.demo.curve','Curve {n}',index):named(viewName(view),'intui.demo.curve','Curve {n}',index),detail:firstError||'No finite values in this range'});
  return points;
 });
 const yDomain=demonstrationDomain(view.y,runtime,time,fittedRange(curves));
 const markers:Point[]=[];
 if(view.kind==='plot')view.markers?.forEach((marker,index)=>{
  try{
   const x=read(marker.x,time,0),y=read(marker.y,time,0);
   if(Number.isFinite(x)&&Number.isFinite(y))markers[index]=[x,y];
  }catch(error){
   if(isDemonstrationBudgetError(error))throw error;
   issues.push({name:named(marker.label,'intui.demo.marker','Marker {n}',index),detail:message(error)});
  }
 });
 if(view.kind==='trajectory'){
  try{const x=read(view.horizontal,time,0),y=read(view.vertical,time,0);if(Number.isFinite(x)&&Number.isFinite(y))markers[0]=[x,y];}catch(error){if(isDemonstrationBudgetError(error))throw error;}
 }
 return {xDomain,yDomain,curves,markers,issues};
}

/** Expensive programs retry at a lower sampling density within the same finite budget. */
function sampleWithin(view:View,runtime:DemonstrationRuntime,time:number):Sampled{
 const densities=view.kind==='trajectory'?[1200,600,300,150]:[480,240,120,60];
 for(const samples of densities){
  try{return sample(view,runtime,time,samples);}
  catch(error){if(samples===densities[densities.length-1]||!isDemonstrationBudgetError(error))throw error;}
 }
 throw Error('Unreachable');
}

function issueHeadline(issues:Issue[]){
 const first=i18n('intui.demo.failedNamed','Could not compute “{name}”').replace('{name}',issues[0].name);
 return issues.length>1?`${first} (+${issues.length-1})`:first;
}

export function DemoPlot({ view, runtime, time }: { view: View; runtime: DemonstrationRuntime; time: number }) {
 const id=useId();
 let result:Sampled;
 try{result=sampleWithin(view,runtime,time);}
 catch(error){
  // Only an axis that cannot be evaluated or an exhausted budget reaches here.
  const name=viewName(view);
  const headline=name?i18n('intui.demo.failedNamed','Could not compute “{name}”').replace('{name}',name):i18n('intui.demo.failedView','This view could not be computed');
  return <figure className="demo-plot">{view.label?<figcaption><MathText text={view.label} /></figcaption>:null}<div className="demo-error" role="status"><DemoIssue headline={headline} details={[message(error)]}/></div></figure>;
 }
 return renderPlot(view,result,id);
}

const WIDTH = 520;
const HEIGHT = 232;
const LEFT = 38;
const RIGHT = 12;
const TOP = 14;
const BOTTOM = 38;

type ProjectedPoint = { x: number; y: number } | null;
type ProjectPoint = (point: Point | undefined) => ProjectedPoint;

function curveSpecs(view: View) {
 return view.kind === 'plot'
  ? view.curves
  : [{ expression: view.vertical, color: view.color, label: undefined, dashed: false }];
}

function formatTick(value: number): string {
 return Math.abs(value) < 1e-8 ? '0' : Number(value.toPrecision(3)).toString();
}

function ticks(min: number, max: number, target: number): number[] {
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
 return (point) => point && Number.isFinite(sx(point[0])) && Number.isFinite(sy(point[1]))
  ? { x: sx(point[0]), y: sy(point[1]) }
  : null;
}

function pathFor(points: Point[], sx: (value: number) => number, sy: (value: number) => number): string {
 let pen = false;
 let path = '';
 for (const point of points) {
  if (!point) { pen = false; continue; }
  const px = sx(point[0]), py = sy(point[1]);
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

function YAxis({ domain, sy }: { domain: Domain; sy: (value: number) => number }) {
 return <>{ticks(domain[0], domain[1], 3).map((value) => <g key={`y${value}`} className="demo-axis">
  <line x1={LEFT} x2={WIDTH - RIGHT} y1={sy(value)} y2={sy(value)} strokeDasharray="2 5" />
  <text x={LEFT - 8} y={sy(value) + 3} textAnchor="end">{formatTick(value)}</text>
 </g>)}</>;
}

function XAxis({ xDomain, yDomain, sy, sx }: { xDomain: Domain; yDomain: Domain; sy: (value: number) => number; sx: (value: number) => number }) {
 const axis = sy(Math.max(yDomain[0], Math.min(yDomain[1], 0)));
 return <g className="demo-axis">
  <line x1={LEFT} x2={WIDTH - RIGHT} y1={axis} y2={axis} />
  {ticks(xDomain[0], xDomain[1], 6).map((value) => <g key={value}>
   <line x1={sx(value)} x2={sx(value)} y1={HEIGHT - BOTTOM} y2={HEIGHT - BOTTOM + 4} />
   <text x={sx(value)} y={HEIGHT - BOTTOM + 17} textAnchor="middle">{formatTick(value)}</text>
  </g>)}
 </g>;
}

function CurvePaths({ curves, paths }: { curves: ReturnType<typeof curveSpecs>; paths: string[] }) {
 return <>{curves.map((curve, index) => <path
  key={index}
  d={paths[index]}
  fill="none"
  stroke={demoColors[curve.color || 'ink'] || demoColors.ink}
  strokeWidth={curve.dashed ? 1.3 : 1.8}
  strokeDasharray={curve.dashed ? '5 4' : undefined}
  vectorEffect="non-scaling-stroke"
 />)}</>;
}

function PlotMarkers({ view, result, project }: { view: View; result: Sampled; project: ProjectPoint }) {
 if (view.kind === 'plot') return <>{view.markers?.map((marker, index) => {
  const point = project(result.markers[index]);
  if (!point) return null;
  return <g key={index}>
   <circle cx={point.x} cy={point.y} r="3.5" fill={demoColors[marker.color || 'red'] || demoColors.red} />
   {marker.label ? <SvgMathText className="demo-marker-label" x={point.x + 7} y={point.y - 7} text={marker.label} /> : null}
  </g>;
 })}</>;
 const head = project(result.markers[0]);
 return head ? <circle cx={head.x} cy={head.y} r="3.5" fill={demoColors[view.color || 'blue'] || demoColors.blue} /> : null;
}

function PlotCaption({ view }: { view: View }) {
 return view.label ? <figcaption><MathText text={view.label} /></figcaption> : null;
}

function PlotLegend({ view }: { view: View }) {
 if (view.kind !== 'plot' || !view.curves.some((curve) => curve.label)) return null;
 return <div className="demo-legend">{view.curves.map((curve, index) => curve.label ? <span key={index}>
  <svg viewBox="0 0 22 8" aria-hidden="true"><path d="M0 4H22" stroke={demoColors[curve.color || 'ink'] || demoColors.ink} strokeWidth="1.7" strokeDasharray={curve.dashed ? '4 3' : undefined} /></svg>
  <MathText text={curve.label} />
 </span> : null)}</div>;
}

function PlotIssues({ issues }: { issues: Issue[] }) {
 return issues.length ? <div className="demo-note" role="status">
  <DemoIssue headline={issueHeadline(issues)} details={issues.map((issue) => `${issue.name}: ${issue.detail}`)} />
 </div> : null;
}

function renderPlot(view: View, result: Sampled, id: string) {
 const { xDomain, yDomain } = result;
 const sx = (x: number) => LEFT + (x - xDomain[0]) / (xDomain[1] - xDomain[0]) * (WIDTH - LEFT - RIGHT);
 const sy = (y: number) => HEIGHT - BOTTOM - (y - yDomain[0]) / (yDomain[1] - yDomain[0]) * (HEIGHT - TOP - BOTTOM);
 const curves = curveSpecs(view);
 const paths = result.curves.map((points) => pathFor(points, sx, sy));
 const project = projectPoint(sx, sy);
 const label = view.label || view.yLabel || view.xLabel || i18n('intui.surface', 'Interactive result');
 return <figure className="demo-plot">
  <PlotCaption view={view} />
  <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label}>
   <defs><clipPath id={id}><rect x={LEFT} y={TOP} width={WIDTH - LEFT - RIGHT} height={HEIGHT - TOP - BOTTOM} /></clipPath></defs>
   <YAxis domain={yDomain} sy={sy} />
   <XAxis xDomain={xDomain} yDomain={yDomain} sy={sy} sx={sx} />
   <g clipPath={`url(#${id})`}>
    <CurvePaths curves={curves} paths={paths} />
    <PlotMarkers view={view} result={result} project={project} />
   </g>
   <SvgMathText className="demo-axis-label" x={WIDTH - RIGHT} y={HEIGHT - 2} anchor="end" text={view.xLabel || ''} />
   <SvgMathText className="demo-axis-label" x={LEFT} y={10} text={view.yLabel || ''} />
  </svg>
  <PlotLegend view={view} />
  <PlotIssues issues={result.issues} />
 </figure>;
}
