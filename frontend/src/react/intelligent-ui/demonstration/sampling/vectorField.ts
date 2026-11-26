import { isDemonstrationBudgetError } from '@socrates/core/demonstration';
import type { DemonstrationField, DemonstrationRuntime } from '@socrates/core/demonstration';
import { FIELD_WIDTH, fieldHeight, type Domain } from '../fieldCommon';

export function* sampleVectors(
  view: DemonstrationField,
  runtime: DemonstrationRuntime,
  time: number,
  xDomain: Domain,
  yDomain: Domain,
) {
  const arrows: number[] = [];
  if (!view.vector) return arrows;
  runtime.resetBudget();
  const reference = view.vectorScale === undefined ? undefined : runtime.evaluate(view.vectorScale, time);
  if (reference !== undefined && (!Number.isFinite(reference) || reference <= 0))
    throw Error('Vector scale must be positive and finite');
  const width = FIELD_WIDTH,
    height = fieldHeight(view);
  for (let y = 9; y < height; y += 16) {
    const worldY = yDomain[1] - (y / height) * (yDomain[1] - yDomain[0]);
    for (let x = 9; x < width; x += 16) {
      const worldX = xDomain[0] + (x / width) * (xDomain[1] - xDomain[0]);
      try {
        const vx = runtime.evaluate(view.vector[0], time, worldX, worldY);
        const vy = runtime.evaluate(view.vector[1], time, worldX, worldY);
        const magnitude = Math.hypot(vx, vy);
        if (Number.isFinite(magnitude) && magnitude >= 1e-9) {
          const length = reference === undefined ? 5 : 5 * Math.min(1, magnitude / reference);
          arrows.push(x, y, (vx / magnitude) * length, (-vy / magnitude) * length);
        }
      } catch (error) {
        if (isDemonstrationBudgetError(error)) return arrows;
      }
      yield;
    }
  }
  return arrows;
}


// Integrate instantaneous directions in normalized display coordinates.
export function* sampleStreamlines(view:DemonstrationField,runtime:DemonstrationRuntime,time:number,x:Domain,y:Domain,preview:boolean){
  const lines:number[][]=[];
  if(!view.streamlines||!view.vector)return lines;
  runtime.resetBudget();
  const vector=view.vector,dx=x[1]-x[0],dy=y[1]-y[0],height=fieldHeight(view);
  const direction=(u:number,v:number):[number,number]|null=>{
    if(u<0||u>1||v<0||v>1)return null;
    try{
      const vx=runtime.evaluate(vector[0],time,x[0]+u*dx,y[0]+v*dy)/dx,
        vy=runtime.evaluate(vector[1],time,x[0]+u*dx,y[0]+v*dy)/dy;
      const mag=Math.hypot(vx,vy);
      return Number.isFinite(mag)&&mag>1e-12?[vx/mag,vy/mag]:null;
    }catch(error){if(isDemonstrationBudgetError(error))throw error;return null;}
  };
  const grid=preview?3:5,limit=preview?40:80,h=.0125;
  for(let j=0;j<grid;j++)for(let i=0;i<grid;i++){
    const u=(i+.5)/grid,v=(j+.5)/grid;
    const halves:number[][][]=[];
    for(const sign of [-1,1]){
      let a=u,b=v;const points:number[][]=[];
      for(let k=0;k<limit;k++){
        const d=direction(a,b);if(!d)break;
        const mid=direction(a+sign*h*d[0]/2,b+sign*h*d[1]/2);if(!mid)break;
        a+=sign*h*mid[0];b+=sign*h*mid[1];
        if(a<0||a>1||b<0||b>1)break;
        points.push([a,b]);
        // Stop on a return to the seed, avoiding repeated closed loops.
        if(k>10&&Math.hypot(a-u,b-v)<h*.8)break;
      }
      halves.push(points);yield;
    }
    const points=[...halves[0].reverse(),[u,v],...halves[1]];
    if(points.length>1)lines.push(points.flatMap(([a,b])=>[a*(FIELD_WIDTH-1),(1-b)*(height-1)]));
  }
  return lines;
}
