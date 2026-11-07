import { i18n } from '../../legacy/gateway';
import { demonstrationDomain } from '@socrates/core';
import { useEffect, useRef } from 'react';
import type { DemonstrationField, DemonstrationRuntime } from '@socrates/core';
export function DemoField({view,runtime,time,onError}:{view:DemonstrationField;runtime:DemonstrationRuntime;time:number;onError:(message:string)=>void}){
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  try{
   runtime.resetBudget();
   const context=canvas.current?.getContext('2d');if(!context)throw Error('Canvas unavailable');
   const xDomain=demonstrationDomain(view.x,runtime,time),yDomain=demonstrationDomain(view.y,runtime,time);
   const width=320,height=Math.round(view.height??160),pixels=context.createImageData(width,height);
   const gamma=Math.max(.1,Math.min(3,runtime.evaluate(view.gamma??.6,time))),exposure=Math.max(.01,Math.min(20,runtime.evaluate(view.exposure??1,time)));
   const tint=view.tint??[1,.96,.82];
   // Retry expensive fields at a lower spatial resolution, retaining the
   // native canvas dimensions and the runtime's finite operation budget.
   for(const stride of [1,2,4,8]){
    runtime.resetBudget();
    try{
   for(let y=0;y<height;y+=stride)for(let x=0;x<width;x+=stride){
    const wx=xDomain[0]+x/(width-1)*(xDomain[1]-xDomain[0]),wy=yDomain[1]-y/(height-1)*(yDomain[1]-yDomain[0]);
    const raw=runtime.evaluate(view.expression,time,wx,wy),value=Number.isFinite(raw)?raw:0;
    let color:number[];
    if(view.palette==='signed'){const weight=Math.tanh(Math.abs(value)*exposure),hue=value>=0?[1,.67,.27]:[.22,.59,1];color=hue.map((c,i)=>([.025,.035,.06][i]+weight*c)*255);}
    else if(view.palette==='heat'){const v=Math.max(0,Math.min(1,value*exposure));color=[Math.min(1,v*3),Math.max(0,Math.min(1,v*3-1)),Math.max(0,v*3-2)].map(c=>c*255);}
    else{const v=Math.max(0,Math.min(1,value*exposure))**gamma;color=tint.map(c=>255*v*c);}
    for(let yy=y;yy<Math.min(height,y+stride);yy++)for(let xx=x;xx<Math.min(width,x+stride);xx++){
     const offset=(yy*width+xx)*4;for(let i=0;i<3;i++)pixels.data[offset+i]=color[i];pixels.data[offset+3]=255;
    }
   }
    break;
    }catch(error){
     if(stride===8||!(error instanceof Error)||!error.message.includes('budget exceeded'))throw error;
    }
   }
   context.putImageData(pixels,0,0);
   runtime.resetBudget();
   if(view.vector){context.strokeStyle='rgba(255,255,255,.72)';context.lineWidth=.7;for(let y=9;y<height;y+=16)for(let x=9;x<width;x+=16){const wx=xDomain[0]+x/width*(xDomain[1]-xDomain[0]),wy=yDomain[1]-y/height*(yDomain[1]-yDomain[0]);const vx=runtime.evaluate(view.vector[0],time,wx,wy),vy=runtime.evaluate(view.vector[1],time,wx,wy),m=Math.hypot(vx,vy);if(!Number.isFinite(m)||m<1e-9)continue;const dx=vx/m*5,dy=-vy/m*5;context.beginPath();context.moveTo(x-dx,y-dy);context.lineTo(x+dx,y+dy);context.lineTo(x+dx-dx*.5-dy*.4,y+dy-dy*.5+dx*.4);context.moveTo(x+dx,y+dy);context.lineTo(x+dx-dx*.5+dy*.4,y+dy-dy*.5-dx*.4);context.stroke();}}
  }catch(error){onError(error instanceof Error?error.message:'Unable to calculate field');}
 },[view,runtime,time,onError]);
 return <figure className="demo-field">{view.label?<figcaption>{view.label}</figcaption>:null}<canvas ref={canvas} width={320} height={Math.round(view.height??160)} role="img" aria-label={view.label||i18n('intui.surface','Interactive result')}/></figure>;
}
