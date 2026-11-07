import { demonstrationDomain, isDemonstrationBudgetError } from '@socrates/core';
import { i18n } from '../../legacy/gateway';
import { useId } from 'react';
import type { DemonstrationPlot, DemonstrationRuntime, DemonstrationTrajectory, DemonstrationValue } from '@socrates/core';
import { DemoIssue } from './DemonstrationIssue';
export const demoColors: Record<string, string> = { ink:'var(--ui-ink)', muted:'var(--ui-ink-tertiary)', blue:'var(--ui-demo-blue)', orange:'var(--ui-demo-orange)', red:'var(--ui-demo-red)', green:'var(--ui-demo-green)', violet:'var(--ui-demo-violet)' };

type View = DemonstrationPlot | DemonstrationTrajectory;
type Point = [number, number] | null;
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
  return <figure className="demo-plot">{view.label?<figcaption>{view.label}</figcaption>:null}<div className="demo-error" role="status"><DemoIssue headline={headline} details={[message(error)]}/></div></figure>;
 }
 return renderPlot(view,result,id);
}

function renderPlot(view: View, result: Sampled, id: string) {
 const width=520,height=232,left=38,right=12,top=14,bottom=38;
 const {xDomain,yDomain}=result;
 const sx=(x:number)=>left+(x-xDomain[0])/(xDomain[1]-xDomain[0])*(width-left-right);
 const sy=(y:number)=>height-bottom-(y-yDomain[0])/(yDomain[1]-yDomain[0])*(height-top-bottom);
 const curves=view.kind==='plot'?view.curves:[{expression:view.vertical,color:view.color,label:undefined,dashed:false}];
 const paths=result.curves.map(points=>{
  let pen=false,path='';
  for(const point of points){
   if(!point){pen=false;continue;}
   const px=sx(point[0]),py=sy(point[1]);
   // Clip runaway values (asymptotes, overflow) to a gap instead of a spike.
   if(!Number.isFinite(px)||!Number.isFinite(py)||Math.abs(py)>1e5||Math.abs(px)>1e5){pen=false;continue;}
   path+=`${pen?'L':'M'}${px.toFixed(2)},${py.toFixed(2)}`;pen=true;
  }
  return path;
 });
 const format=(v:number)=>Math.abs(v)<1e-8?'0':Number(v.toPrecision(3)).toString();
 const ticks=(min:number,max:number,target:number)=>{const raw=(max-min)/target;if(!(raw>0)||!Number.isFinite(raw))return [];const base=10**Math.floor(Math.log10(raw)),n=raw/base,step=(n<1.5?1:n<3?2:n<7?5:10)*base;const first=Math.ceil(min/step)*step;return Array.from({length:Math.min(20,Math.max(0,Math.floor((max-first)/step)+1))},(_,i)=>first+i*step);};
 const xAxis=sy(Math.max(yDomain[0],Math.min(yDomain[1],0)));
 const point=(p:Point|undefined)=>p&&Number.isFinite(sx(p[0]))&&Number.isFinite(sy(p[1]))?{x:sx(p[0]),y:sy(p[1])}:null;
 const head=view.kind==='trajectory'?point(result.markers[0]):null;
 return <figure className="demo-plot">
  {view.label?<figcaption>{view.label}</figcaption>:null}
  <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={view.label||view.yLabel||view.xLabel||i18n('intui.surface','Interactive result')}>
   <defs><clipPath id={id}><rect x={left} y={top} width={width-left-right} height={height-top-bottom}/></clipPath></defs>
   {ticks(yDomain[0],yDomain[1],3).map(y=><g key={`y${y}`} className="demo-axis"><line x1={left} x2={width-right} y1={sy(y)} y2={sy(y)} strokeDasharray="2 5"/><text x={left-8} y={sy(y)+3} textAnchor="end">{format(y)}</text></g>)}
   <g className="demo-axis"><line x1={left} x2={width-right} y1={xAxis} y2={xAxis}/>{ticks(xDomain[0],xDomain[1],6).map(x=><g key={x}><line x1={sx(x)} x2={sx(x)} y1={height-bottom} y2={height-bottom+4}/><text x={sx(x)} y={height-bottom+17} textAnchor="middle">{format(x)}</text></g>)}</g>
   <g clipPath={`url(#${id})`}>{curves.map((curve,i)=><path key={i} d={paths[i]} fill="none" stroke={demoColors[curve.color||'ink']||demoColors.ink} strokeWidth={curve.dashed?1.3:1.8} strokeDasharray={curve.dashed?'5 4':undefined} vectorEffect="non-scaling-stroke"/>)}
    {view.kind==='plot'?view.markers?.map((marker,i)=>{const p=point(result.markers[i]);return p?<g key={i}><circle cx={p.x} cy={p.y} r="3.5" fill={demoColors[marker.color||'red']||demoColors.red}/>{marker.label?<text className="demo-marker-label" x={p.x+7} y={p.y-7}>{marker.label}</text>:null}</g>:null;}):head?<circle cx={head.x} cy={head.y} r="3.5" fill={demoColors[view.color||'blue']||demoColors.blue}/>:null}
   </g>
   <text className="demo-axis-label" x={width-right} y={height-2} textAnchor="end">{view.xLabel}</text>
   <text className="demo-axis-label" x={left} y={10}>{view.yLabel}</text>
  </svg>
  {view.kind==='plot'&&view.curves.some(c=>c.label)?<div className="demo-legend">{view.curves.map((curve,i)=>curve.label?<span key={i}><svg viewBox="0 0 22 8" aria-hidden="true"><path d="M0 4H22" stroke={demoColors[curve.color||'ink']||demoColors.ink} strokeWidth="1.7" strokeDasharray={curve.dashed?'4 3':undefined}/></svg>{curve.label}</span>:null)}</div>:null}
  {result.issues.length?<div className="demo-note" role="status"><DemoIssue headline={issueHeadline(result.issues)} details={result.issues.map(issue=>`${issue.name}: ${issue.detail}`)}/></div>:null}
 </figure>;
}
