import { demonstrationDomain } from '@socrates/core';
import { i18n } from '../../legacy/gateway';
import { useId } from 'react';
import type { DemonstrationPlot, DemonstrationRuntime, DemonstrationTrajectory, DemonstrationValue } from '@socrates/core';
export const demoColors: Record<string, string> = { ink:'var(--ui-ink)', muted:'var(--ui-ink-tertiary)', blue:'var(--ui-demo-blue)', orange:'var(--ui-demo-orange)', red:'var(--ui-demo-red)', green:'var(--ui-demo-green)', violet:'var(--ui-demo-violet)' };
export function DemoPlot({ view, runtime, time }: { view: DemonstrationPlot | DemonstrationTrajectory; runtime: DemonstrationRuntime; time: number }) {
 const id=useId();
 try { return renderPlot(view,runtime,time,id); } catch { return <p role="status">{i18n('intui.demo.unavailable','This demonstration could not complete its calculation.')}</p>; }
}
function renderPlot(view: DemonstrationPlot | DemonstrationTrajectory, runtime: DemonstrationRuntime, time: number, id: string) {
 const width=520,height=232,left=38,right=12,top=14,bottom=38;
 const xDomain=demonstrationDomain(view.x,runtime,time),yDomain=demonstrationDomain(view.y,runtime,time);
 const sx=(x:number)=>left+(x-xDomain[0])/(xDomain[1]-xDomain[0])*(width-left-right);
 const sy=(y:number)=>height-bottom-(y-yDomain[0])/(yDomain[1]-yDomain[0])*(height-top-bottom);
 const read=(expression:DemonstrationValue,t=time,x=0)=>runtime.evaluate(expression,t,x);
 const curves=view.kind==='plot'?view.curves:[{expression:view.vertical,color:view.color,label:undefined,dashed:false}];
 const samples=view.kind==='trajectory'?1200:480;
 const paths=curves.map(curve=>{
  let pen=false;let path='';
  for(let i=0;i<=samples;i++){
   const t=view.kind==='trajectory'?time*i/samples:time,x=view.kind==='trajectory'?read(view.horizontal,t):xDomain[0]+(xDomain[1]-xDomain[0])*i/samples;
   const y=read(curve.expression,t,x),px=sx(x),py=sy(y);
   if(!Number.isFinite(px)||!Number.isFinite(py)||Math.abs(py)>1e5||Math.abs(px)>1e5){pen=false;continue;}
   path+=`${pen?'L':'M'}${px.toFixed(2)},${py.toFixed(2)}`;pen=true;
  }
  return path;
 });
 const format=(v:number)=>Math.abs(v)<1e-8?'0':Number(v.toPrecision(3)).toString();
 const ticks=(min:number,max:number,target:number)=>{const raw=(max-min)/target,base=10**Math.floor(Math.log10(raw)),n=raw/base,step=(n<1.5?1:n<3?2:n<7?5:10)*base;const first=Math.ceil(min/step)*step;return Array.from({length:Math.min(20,Math.max(0,Math.floor((max-first)/step)+1))},(_,i)=>first+i*step);};
 const xAxis=sy(Math.max(yDomain[0],Math.min(yDomain[1],0)));
 return <figure className="demo-plot">
  {view.label?<figcaption>{view.label}</figcaption>:null}
  <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={view.label||view.yLabel||view.xLabel||i18n('intui.surface','Interactive result')}>
   <defs><clipPath id={id}><rect x={left} y={top} width={width-left-right} height={height-top-bottom}/></clipPath></defs>
   {ticks(yDomain[0],yDomain[1],3).map(y=><g key={`y${y}`} className="demo-axis"><line x1={left} x2={width-right} y1={sy(y)} y2={sy(y)} strokeDasharray="2 5"/><text x={left-8} y={sy(y)+3} textAnchor="end">{format(y)}</text></g>)}
   <g className="demo-axis"><line x1={left} x2={width-right} y1={xAxis} y2={xAxis}/>{ticks(xDomain[0],xDomain[1],6).map(x=><g key={x}><line x1={sx(x)} x2={sx(x)} y1={height-bottom} y2={height-bottom+4}/><text x={sx(x)} y={height-bottom+17} textAnchor="middle">{format(x)}</text></g>)}</g>
   <g clipPath={`url(#${id})`}>{curves.map((curve,i)=><path key={i} d={paths[i]} fill="none" stroke={demoColors[curve.color||'ink']||demoColors.ink} strokeWidth={curve.dashed?1.3:1.8} strokeDasharray={curve.dashed?'5 4':undefined} vectorEffect="non-scaling-stroke"/>)}
    {view.kind==='plot'?view.markers?.map((marker,i)=>{const x=sx(read(marker.x)),y=sy(read(marker.y));return Number.isFinite(x)&&Number.isFinite(y)?<g key={i}><circle cx={x} cy={y} r="3.5" fill={demoColors[marker.color||'red']||demoColors.red}/>{marker.label?<text className="demo-marker-label" x={x+7} y={y-7}>{marker.label}</text>:null}</g>:null;}):<circle cx={sx(read(view.horizontal))} cy={sy(read(view.vertical))} r="3.5" fill={demoColors[view.color||'blue']||demoColors.blue}/>}
   </g>
   <text className="demo-axis-label" x={width-right} y={height-2} textAnchor="end">{view.xLabel}</text>
   <text className="demo-axis-label" x={left} y={10}>{view.yLabel}</text>
  </svg>
  {view.kind==='plot'&&view.curves.some(c=>c.label)?<div className="demo-legend">{view.curves.map((curve,i)=>curve.label?<span key={i}><svg viewBox="0 0 22 8" aria-hidden="true"><path d="M0 4H22" stroke={demoColors[curve.color||'ink']||demoColors.ink} strokeWidth="1.7" strokeDasharray={curve.dashed?'4 3':undefined}/></svg>{curve.label}</span>:null)}</div>:null}
 </figure>;
}
