import { useMemo } from 'react';
import type { SurfaceSample } from './geometry/types';
import { i18n } from '../../../ui/legacyI18n.ts';
import { createProjection, projectSurfaceFaces, projectIsoFaces, surfacePath, spaceCurvePath, spaceArrow } from './geometry/projection';
import { useSurfaceCamera, CameraControls } from './interaction/camera';

export function DemoSurface({ sample, label, style = 'wireframe' }: { sample?: SurfaceSample; label?: string; style?: 'wireframe' | 'shaded' }) {
  const camera=useSurfaceCamera();
  const a=camera.azimuth*Math.PI/180,e=camera.elevation*Math.PI/180;
  const project=useMemo(()=>createProjection(a,e),[a,e]);
  const faces=useMemo(()=>projectSurfaceFaces(sample,style,a,e),[sample,style,a,e]);
  const isoFaces=useMemo(()=>projectIsoFaces(sample,a,e),[sample,a,e]);
  const path=(row:boolean,index:number)=>surfacePath(sample,project,row,index);
  const curvePath=spaceCurvePath(sample,project);
  const arrow=(from:[number,number,number],to:[number,number,number])=>spaceArrow(project,from,to);
  const axis = (end: number[], name: string) => {
    const from = project(-1,-1,-1), to = project(end[0],end[1],end[2]);
    return <g key={name}><path d={`M${from.join(',')}L${to.join(',')}`} stroke="currentColor" fill="none" opacity=".7"/>
      <text x={to[0]} y={to[1]-6} textAnchor="middle" fill="currentColor" fontSize="12">{name}</text></g>;
  };
  return <>
    <svg viewBox="0 0 520 340" width="100%" role="img" aria-label={label || i18n('intui.demo.surface3d','3D surface')}>
      <g transform="translate(0,30)">
        {axis([1,-1,-1],'x')}{axis([-1,1,-1],'y')}{axis([-1,-1,1],'z')}
        {curvePath && <path data-space-curve="1" d={curvePath} stroke="var(--ui-demo-blue)" strokeWidth="1.8" fill="none"/>}
        {sample?.arrows3d && <g data-space-vectors="1">{sample.arrows3d.map((v,i)=><path key={i} d={arrow(v.from,v.to)} stroke={`hsl(${220*(1-Math.min(1,v.magnitude/(sample.reference||1)))},70%,50%)`} strokeWidth="1.1" fill="none"/>)}</g>}
        {sample?.triangles && <g data-isosurface="1">{isoFaces.map(face=><polygon key={face.key} points={face.points} fill={style==='shaded'?face.fill:'none'} stroke={style==='shaded'?face.fill:'var(--ui-demo-blue)'} strokeWidth=".5"/>)}</g>}
        {style === 'shaded' && <g data-surface-style="shaded">{faces.map(face=><polygon key={face.key} points={face.points} fill={face.fill} stroke={face.fill} strokeWidth=".45"/>)}</g>}
        {style === 'wireframe' && sample && Array.from({length:sample.size},(_,i)=><g key={i} stroke="var(--ui-demo-blue)" strokeWidth=".85" fill="none">
          <path d={path(true,i)}/><path d={path(false,i)}/>
        </g>)}
      </g>
    </svg>
    {style === 'shaded' && sample && <div className="demo-legend"><svg className="demo-color-scale" viewBox="0 0 120 10" aria-hidden="true">{Array.from({length:60},(_,i)=><rect key={i} x={i*2} width="2" height="10" fill={`hsl(${220*(1-i/59)},70%,50%)`}/>)}</svg><span>z: {sample.z.join(' – ')}</span></div>}
    {sample?.isoLevel!==undefined && <div className="demo-legend"><span>{i18n('intui.demo.isoLevel','Isosurface level')}: {Number(sample.isoLevel.toPrecision(5))}</span></div>}
    {sample?.reference !== undefined && <div className="demo-legend"><span>|F|: 0 – {sample.reference}</span></div>}
    {sample && <div className="demo-legend"><span>x: {sample.x.join(' – ')}</span><span>y: {sample.y.join(' – ')}</span><span>z: {sample.z.join(' – ')}</span></div>}
    <CameraControls {...camera}/>
  </>;
}
