import { MathText } from '../../rn/useInlineMath';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createDemonstrationRuntime, normalizeDemonstrationProgram, validateDemonstration, type DemonstrationProgram, type DemonstrationParameter } from '@socrates/core';
import { Button } from '../../ui/Button';
import { NativeControl } from '../../ui/NativeControl';
import { Label } from '../../ui/shadcn/label';
import { i18n } from '../../legacy/gateway';
import { BlockSkeleton } from '../BlockSkeleton';
import { DemoPlot } from './DemonstrationPlot';
import { DemoField } from './DemonstrationField';
import { DemoIssue } from './DemonstrationIssue';

const format=(value:number,digits=3)=>Number.isFinite(value)?Number(value.toFixed(digits)).toString():'—';
const errorPath=(error:unknown)=>error&&typeof error==='object'&&typeof (error as {path?:unknown}).path==='string'?(error as {path:string}).path:'';

/** Headline for a program that cannot run at all: name the part that failed. */
function failureHeadline(path:string){
 return path
  ?i18n('intui.demo.invalidAt','Demonstration error in {path}').replace('{path}',path)
  :i18n('intui.demo.unavailable','This demonstration could not complete its calculation.');
}

export function Demonstration({program:input,title,streaming=false}:{program:unknown;title?:string;streaming?:boolean}){
 const serialized=JSON.stringify(input)??'null';
 // One normalized program reaches validation, the runtime and the views, so a
 // program recovered from prose gets the same repairs as a tool call.
 const parsed=useMemo(()=>{
  try{
   const p=normalizeDemonstrationProgram(JSON.parse(serialized) as unknown);
   const result=validateDemonstration(p);
   return result.ok?{program:p as DemonstrationProgram,error:'',path:''}:{program:null,error:result.error,path:result.path??''};
  }catch{return {program:null,error:'Invalid demonstration',path:''};}
 },[serialized]);
 const program=parsed.program;
 const previousProgram=useRef<DemonstrationProgram|null>(null);
 const [values,setValues]=useState<Record<string,number>>({});
 const [time,setTime]=useState(0),[playing,setPlaying]=useState(false),[visible,setVisible]=useState(false),[reduced,setReduced]=useState(false);
 const host=useRef<HTMLElement>(null),id=useId();
 const calculation=useMemo(()=>{
  if(!program)return {runtime:null,error:parsed.error,path:parsed.path};
  try{return {runtime:createDemonstrationRuntime(program,values),error:'',path:''};}
  catch(error){return {runtime:null,error:error instanceof Error?error.message:'Calculation failed',path:errorPath(error)};}
 },[program,values,parsed.error,parsed.path]);
 const runtime=calculation.runtime,duration=runtime?.duration??0;
 // A view that cannot draw shows its own note; stop the clock so it does not retry every frame.
 const pause=useCallback(()=>setPlaying(false),[]);
 useEffect(()=>{
  const prior=previousProgram.current;previousProgram.current=program;
  const reset=prior?.resetKey!==program?.resetKey;
  setTime(0);
  // An AI-edited default is an intentional parameter update. Layout/definition
  // patches preserve the learner's other controls; resetKey restores defaults.
  setValues(previous=>Object.fromEntries((program?.parameters??[]).map(p=>{
   const old=prior?.parameters?.find(old=>old.id===p.id);
   const value=reset||!old||old.value!==p.value?p.value:previous[p.id];
   return [p.id,Number.isFinite(value)?Math.max(p.min,Math.min(p.max,value)):p.value];
  })));
 },[program]);
 useEffect(()=>{
  const media=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>{setReduced(media.matches);if(media.matches)setPlaying(false);};update();setPlaying(!media.matches&&duration>0);
  media.addEventListener('change',update);const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting));if(host.current)observer.observe(host.current);
  return()=>{media.removeEventListener('change',update);observer.disconnect();};
 },[duration]);
 useEffect(()=>{
  if(!playing||!visible||reduced||!duration)return;
  let frame=0,previous=performance.now();
  const tick=(now:number)=>{if(document.hidden){previous=now;frame=requestAnimationFrame(tick);return;}if(now-previous>=50){const dt=Math.min(.1,(now-previous)/1000);previous=now;setTime(t=>Math.min(duration,t+dt));}frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
 },[playing,visible,reduced,duration]);
 useEffect(()=>{if(time>=duration)setPlaying(false);},[time,duration]);
 const restore=()=>{setPlaying(false);setTime(0);setValues({});};
 if(!runtime||!program){
  // While the answer is still streaming an invalid program may simply be
  // unfinished: hold the block's place instead of reporting an error.
  if(streaming&&!program)return <section className="demonstration" aria-busy="true"><BlockSkeleton/></section>;
  return <section className="demonstration demo-error" role="status"><DemoIssue headline={failureHeadline(calculation.path)} details={[calculation.error]}/>{program?<Button size="sm" variant="outline" onClick={restore}>{i18n('intui.demo.reset','Restore defaults')}</Button>:null}</section>;
 }
 runtime.resetBudget();
 const metricValue=(expression:string|number)=>{try{return runtime.evaluate(expression,time);}catch{return Number.NaN;}};
 const update=(key:string,value:number)=>{setPlaying(false);setTime(0);setValues(previous=>({...previous,[key]:value}));};
 const parameter=(p:DemonstrationParameter)=><div className="demo-control" key={p.id}><Label htmlFor={`${id}-${p.id}`}><MathText text={p.label||p.id} /></Label><NativeControl id={`${id}-${p.id}`} type="range" min={p.min} max={p.max} step={p.step??(p.max-p.min)/100} value={runtime.parameters[p.id]} onChange={event=>update(p.id,Number(event.target.value))}/><output htmlFor={`${id}-${p.id}`}>{format(runtime.parameters[p.id])}{p.unit?<span> {p.unit}</span>:null}</output></div>;
 const warning=runtime.warnings[0];
 return <section className="demonstration" ref={host} aria-label={title||i18n('intui.demo.title','Interactive demonstration')} data-demonstration="1">
  {title?<header className="demo-heading">{title}</header>:null}
  {warning?<div className="demo-error" role="status"><DemoIssue headline={i18n('intui.demo.dynamicsStopped','The simulation stopped at t = {t} s').replace('{t}',format(warning.time,2))} details={runtime.warnings.map(item=>item.message)}/><Button size="sm" variant="outline" onClick={restore}>{i18n('intui.demo.reset','Restore defaults')}</Button></div>:null}
  <div className="demo-views">{program.views.map((view,index)=>{
   if(view.kind==='controls')return <div className="demo-controls" key={index}>{program.parameters?.filter(p=>!p.advanced).map(parameter)}</div>;
   if(view.kind==='field')return <DemoField key={index} view={view} runtime={runtime} time={time} onError={pause}/>;
   if(view.kind==='metrics')return <dl className="demo-metrics" key={index}>{view.values.map((value,i)=><div key={i}><dt><MathText text={value.label} /></dt><dd>{format(metricValue(value.expression),value.digits??3)}{value.unit?<span> {value.unit}</span>:null}</dd></div>)}</dl>;
   return <DemoPlot key={index} view={view} runtime={runtime} time={time}/>;
  })}</div>
  {!program.views.some(view=>view.kind==='controls')?<div className="demo-controls">{program.parameters?.filter(p=>!p.advanced).map(parameter)}</div>:null}
  {program.parameters?.some(p=>p.advanced)?<details className="demo-advanced"><summary>{i18n('intui.demo.parameters','More parameters')}</summary><div className="demo-controls">{program.parameters.filter(p=>p.advanced).map(parameter)}</div></details>:null}
  {program.presets?.length?<div className="demo-presets">{program.presets.map((preset,index)=><Button key={index} variant="outline" size="sm" onClick={()=>{setPlaying(false);setTime(0);setValues(previous=>({...previous,...preset.values}));}}><MathText text={preset.label} /></Button>)}</div>:null}
  {duration>0?<div className="demo-time"><Button size="sm" variant="ghost" disabled={reduced} aria-pressed={playing} onClick={()=>{if(time>=duration)setTime(0);setPlaying(value=>!value);}}>{playing?i18n('intui.simPause','Pause'):i18n('intui.simPlay','Play')}</Button><NativeControl type="range" min={0} max={duration} step="any" value={time} aria-label={i18n('intui.simTime','Time')} onChange={event=>{setPlaying(false);setTime(Number(event.target.value));}}/><output>{time.toFixed(2)} s</output></div>:null}
 </section>;
}
