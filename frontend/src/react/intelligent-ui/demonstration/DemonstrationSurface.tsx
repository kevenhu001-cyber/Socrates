import { useState, useId } from 'react';
import type { SurfaceSample } from './sampleField';
import { i18n } from '../../../ui/legacyI18n.ts';

export function DemoSurface({ sample, label }: { sample?: SurfaceSample; label?: string }) {
  const [azimuth, setAzimuth] = useState(35);
  const [elevation, setElevation] = useState(30);
  const id = useId();
  const a = azimuth * Math.PI / 180, e = elevation * Math.PI / 180;
  const project = (x: number, y: number, z: number) => [
    260 + 82 * (x*Math.cos(a)-y*Math.sin(a)),
    135 + 82 * ((x*Math.sin(a)+y*Math.cos(a))*Math.sin(e)-z*Math.cos(e)),
  ];
  const path = (row: boolean, index: number) => {
    if (!sample) return '';
    let d = '', pen = false;
    for (let k=0;k<sample.size;k++) {
      const i = row ? k : index, j = row ? index : k;
      const z = sample.values[j*sample.size+i];
      if (!Number.isFinite(z)) { pen=false; continue; }
      const point = project(2*i/(sample.size-1)-1, 2*j/(sample.size-1)-1,
        2*(z-sample.z[0])/(sample.z[1]-sample.z[0])-1);
      d += `${pen?'L':'M'}${point[0].toFixed(2)},${point[1].toFixed(2)}`;
      pen=true;
    }
    return d;
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
        {sample && Array.from({length:sample.size},(_,i)=><g key={i} stroke="var(--ui-demo-blue)" strokeWidth=".85" fill="none">
          <path d={path(true,i)}/><path d={path(false,i)}/>
        </g>)}
      </g>
    </svg>
    {sample && <div className="demo-legend"><span>x: {sample.x.join(' – ')}</span><span>y: {sample.y.join(' – ')}</span><span>z: {sample.z.join(' – ')}</span></div>}
    <div className="demo-controls">
      <div className="demo-control"><label htmlFor={id+'-az'}>{i18n('intui.demo.azimuth','Azimuth')}</label><input id={id+'-az'} type="range" min="-180" max="180" value={azimuth} onChange={(event)=>setAzimuth(Number(event.target.value))}/><output>{azimuth}°</output></div>
      <div className="demo-control"><label htmlFor={id+'-el'}>{i18n('intui.demo.elevation','Elevation')}</label><input id={id+'-el'} type="range" min="5" max="85" value={elevation} onChange={(event)=>setElevation(Number(event.target.value))}/><output>{elevation}°</output></div>
    </div>
  </>;
}
