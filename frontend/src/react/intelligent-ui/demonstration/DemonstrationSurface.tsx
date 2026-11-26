import { useState, useId, useMemo } from 'react';
import { NativeControl } from '../../ui/NativeControl';
import { Label } from '../../ui/shadcn/label';
import type { SurfaceSample } from './sampleField';
import { i18n } from '../../../ui/legacyI18n.ts';

export function DemoSurface({ sample, label, style = 'wireframe' }: { sample?: SurfaceSample; label?: string; style?: 'wireframe' | 'shaded' }) {
  const [azimuth, setAzimuth] = useState(35);
  const [elevation, setElevation] = useState(30);
  const id = useId();
  const a = azimuth * Math.PI / 180, e = elevation * Math.PI / 180;
  const project = (x: number, y: number, z: number) => [
    260 + 82 * (x*Math.cos(a)-y*Math.sin(a)),
    135 + 82 * ((x*Math.sin(a)+y*Math.cos(a))*Math.sin(e)-z*Math.cos(e)),
  ];
  const faces = useMemo(() => {
    if (!sample || style !== 'shaded') return [];
    const {size,values,z}=sample;
    const points=sample.vertices??values.map((v,k):[number,number,number]|null=>Number.isFinite(v)?[2*(k%size)/(size-1)-1,2*Math.floor(k/size)/(size-1)-1,2*(v-z[0])/(z[1]-z[0])-1]:null);
    const vertices=points.map(point=>{
      if(!point)return null;
      const [x,y,h]=point;
      const horizontal=x*Math.sin(a)+y*Math.cos(a);
      return {point:[260+82*(x*Math.cos(a)-y*Math.sin(a)),135+82*(horizontal*Math.sin(e)-h*Math.cos(e))],
        depth:horizontal*Math.cos(e)+h*Math.sin(e),height:(h+1)/2};
    });
    const result:{key:number;points:string;depth:number;fill:string}[]=[];
    for(let j=0;j<size-1;j++)for(let i=0;i<size-1;i++){
      const k=j*size+i;
      const corners=[vertices[k],vertices[k+1],vertices[k+1+size],vertices[k+size]];
      if(corners.some(v=>v===null))continue;
      const valid=corners.filter(v=>v!==null);
      const h=valid.reduce((sum,v)=>sum+v.height,0)/4;
      result.push({key:k,points:valid.map(v=>v.point.map(n=>n.toFixed(2)).join(',')).join(' '),
        depth:valid.reduce((sum,v)=>sum+v.depth,0)/4,fill:`hsl(${220*(1-h)},70%,50%)`});
    }
    return result.sort((a,b)=>a.depth-b.depth);
  },[sample,style,a,e]);
  const isoFaces=useMemo(()=>{
    if(!sample?.triangles)return [];
    return sample.triangles.map((tri,key)=>{
      const points=tri.map(([x,y,z])=>{const h=x*Math.sin(a)+y*Math.cos(a);
        return {x:260+82*(x*Math.cos(a)-y*Math.sin(a)),y:135+82*(h*Math.sin(e)-z*Math.cos(e)),d:h*Math.cos(e)+z*Math.sin(e)};});
      const h=tri.reduce((sum,p)=>sum+(p[2]+1)/2,0)/3;
      return {key,points:points.map(p=>p.x.toFixed(2)+','+p.y.toFixed(2)).join(' '),depth:points.reduce((s,p)=>s+p.d,0)/3,fill:`hsl(${220*(1-h)},70%,50%)`};
    }).sort((a,b)=>a.depth-b.depth);
  },[sample,a,e]);
  const path = (row: boolean, index: number) => {
    if (!sample) return '';
    let d = '', pen = false;
    for (let k=0;k<sample.size;k++) {
      const i = row ? k : index, j = row ? index : k;
      const vertexIndex=j*sample.size+i,z=sample.values[vertexIndex];
      const vertex=sample.vertices?sample.vertices[vertexIndex]:Number.isFinite(z)?[2*i/(sample.size-1)-1,2*j/(sample.size-1)-1,2*(z-sample.z[0])/(sample.z[1]-sample.z[0])-1] as [number,number,number]:null;
      if(!vertex){pen=false;continue;}
      const point=project(...vertex);
      d += `${pen?'L':'M'}${point[0].toFixed(2)},${point[1].toFixed(2)}`;
      pen=true;
    }
    return d;
  };
  const curvePath=sample?.curve?.reduce((state,point)=>{
    if(!point)return {d:state.d,pen:false};
    const xy=project(...point);
    return {d:state.d+`${state.pen?'L':'M'}${xy.join(',')}`,pen:true};
  },{d:'',pen:false}).d;
  const arrow=(from:[number,number,number],to:[number,number,number])=>{
    const p=project(...from),q=project(...to),dx=q[0]-p[0],dy=q[1]-p[1],length=Math.hypot(dx,dy);
    if(length<.1)return '';
    const h=Math.min(5,length*.4),ux=dx/length,uy=dy/length;
    return `M${p.join(',')}L${q.join(',')}l${-h*ux-h*.5*uy},${-h*uy+h*.5*ux}M${q.join(',')}l${-h*ux+h*.5*uy},${-h*uy-h*.5*ux}`;
  };
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
    <div className="demo-controls">
      <div className="demo-control"><Label htmlFor={id+'-az'}>{i18n('intui.demo.azimuth','Azimuth')}</Label><NativeControl id={id+'-az'} type="range" min="-180" max="180" value={azimuth} onChange={(event)=>setAzimuth(Number(event.target.value))}/><output>{azimuth}°</output></div>
      <div className="demo-control"><Label htmlFor={id+'-el'}>{i18n('intui.demo.elevation','Elevation')}</Label><NativeControl id={id+'-el'} type="range" min="5" max="85" value={elevation} onChange={(event)=>setElevation(Number(event.target.value))}/><output>{elevation}°</output></div>
    </div>
  </>;
}
