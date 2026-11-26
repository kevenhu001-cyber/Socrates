import { demonstrationDomain, isDemonstrationBudgetError } from '@socrates/core/demonstration';
import type {
  DemonstrationField,
  DemonstrationRuntime,
  DemonstrationValue,
} from '@socrates/core/demonstration';

export const FIELD_WIDTH = 320;
export function fieldHeight(view: DemonstrationField) {
  return Math.round(view.height ?? 160);
}

export function fieldExpressions(view: DemonstrationField): DemonstrationValue[] {
  return [
    view.expression,
    ...view.x,
    ...view.y,
    view.gamma ?? 0.6,
    view.exposure ?? 1,
    ...(view.vector ?? []),
    ...(view.colorRange ?? []),
    ...(view.zRange ?? []),
    ...(view.isoLevel===undefined?[]:[view.isoLevel]),
    ...(view.slicePlane ? [view.slicePlane.at] : []),
    ...(view.curve3d ?? []),
    ...(view.vector3d ?? []),
    ...(view.parameterRange ?? []),
    ...(view.uRange ?? []),...(view.vRange ?? []),...(view.surface3d ?? []),
    ...(view.markers ?? []).flatMap(m=>[m.x,m.y]),
    ...(view.curveHistory ? ['t'] : []),
    ...(view.contours ?? []),
    ...(view.vectorScale === undefined ? [] : [view.vectorScale]),
  ];
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function setting(
  runtime: DemonstrationRuntime,
  expression: DemonstrationValue,
  time: number,
  fallback: number,
) {
  try {
    const value = runtime.evaluate(expression, time);
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

type Domain = [number, number];

function writeColor(
  pixels: Uint8ClampedArray,
  offset: number,
  value: number,
  palette: DemonstrationField['palette'],
  gamma: number,
  exposure: number,
  tint: number[],
) {
  if (palette === 'signed') {
    const weight = Math.tanh(Math.abs(value) * exposure);
    pixels[offset] = (0.025 + weight * (value >= 0 ? 1 : 0.22)) * 255;
    pixels[offset + 1] = (0.035 + weight * (value >= 0 ? 0.67 : 0.59)) * 255;
    pixels[offset + 2] = (0.06 + weight * (value >= 0 ? 0.27 : 1)) * 255;
  } else if (palette === 'heat') {
    const scaled = Math.max(0, Math.min(1, value * exposure)) * 3;
    pixels[offset] = Math.min(1, scaled) * 255;
    pixels[offset + 1] = Math.max(0, Math.min(1, scaled - 1)) * 255;
    pixels[offset + 2] = Math.max(0, scaled - 2) * 255;
  } else {
    const scaled = Math.max(0, Math.min(1, value * exposure)) ** gamma;
    pixels[offset] = 255 * scaled * tint[0];
    pixels[offset + 1] = 255 * scaled * tint[1];
    pixels[offset + 2] = 255 * scaled * tint[2];
  }
  pixels[offset + 3] = 255;
}

function* sampleGridRow(
  y: number,
  worldY: number,
  width: number,
  stride: number,
  xs: number[],
  variesX: boolean,
  view: DemonstrationField,
  runtime: DemonstrationRuntime,
  time: number,
  pixels: Uint8ClampedArray,
  words: Uint32Array,
  gamma: number,
  exposure: number,
  tint: [number, number, number],
  colorRange: Domain | undefined,
  onError: (error: unknown) => void,
  onValid: () => void,
) {
  for (let x = 0; x < width; x += stride) {
    const offset = y * width + x;
    if (x === 0 || variesX) {
      try {
        const value = runtime.evaluate(view.expression, time, xs[x], worldY);
        if (!Number.isFinite(value)) throw Error('Non-finite field sample');
        const scaled = colorRange ? (value - colorRange[0]) / (colorRange[1] - colorRange[0]) : value;
        writeColor(pixels, offset * 4, scaled, view.palette, gamma, colorRange ? 1 : exposure, tint);
        onValid();
      } catch (error) {
        if (isDemonstrationBudgetError(error)) throw error;
        onError(error);
        words[offset] = 0;
      }
    }
    const color = words[variesX ? offset : y * width];
    words.fill(color, offset, y * width + Math.min(width, x + stride));
    if (x % 32 === 0) yield;
  }
}

function fillStrideRows(
  y: number,
  height: number,
  stride: number,
  width: number,
  variesY: boolean,
  words: Uint32Array,
) {
  const startRow = y + (y === 0 || variesY ? 1 : 0);
  const endRow = Math.min(height, y + stride);
  for (let row = startRow; row < endRow; row++) {
    const source = variesY ? y * width : 0;
    words.copyWithin(row * width, source, source + width);
  }
}

function* sampleGrid(
  view: DemonstrationField,
  runtime: DemonstrationRuntime,
  time: number,
  xDomain: Domain,
  yDomain: Domain,
  stride: number,
  colorRange?: Domain,
) {
  runtime.resetBudget();
  const gamma = Math.max(0.1, Math.min(3, setting(runtime, view.gamma ?? 0.6, time, 0.6)));
  const exposure = Math.max(0.01, Math.min(20, setting(runtime, view.exposure ?? 1, time, 1)));
  const tint = view.tint ?? [1, 0.96, 0.82];
  const width = FIELD_WIDTH,
    height = fieldHeight(view);
  const pixels = new Uint8ClampedArray(width * height * 4);
  const words = new Uint32Array(pixels.buffer);
  const dependencies = runtime.dependencies(view.expression);
  const variesX = (dependencies & 1) !== 0,
    variesY = (dependencies & 2) !== 0;
  const xs = Array.from(
    { length: width },
    (_, x) => xDomain[0] + (x / (width - 1)) * (xDomain[1] - xDomain[0]),
  );
  let valid = false;
  let firstError = '';
  for (let y = 0; y < height; y += stride) {
    const worldY = yDomain[1] - (y / (height - 1)) * (yDomain[1] - yDomain[0]);
    if (y === 0 || variesY) {
      yield* sampleGridRow(
        y,
        worldY,
        width,
        stride,
        xs,
        variesX,
        view,
        runtime,
        time,
        pixels,
        words,
        gamma,
        exposure,
        tint,
        colorRange,
        (error) => {
          firstError ||= errorMessage(error);
        },
        () => {
          valid = true;
        },
      );
    }
    fillStrideRows(y, height, stride, width, variesY, words);
    yield;
  }
  if (!valid) throw Error(firstError);
  return pixels;
}

function* sampleVectors(
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
function* sampleStreamlines(view:DemonstrationField,runtime:DemonstrationRuntime,time:number,x:Domain,y:Domain,preview:boolean){
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

// Marching squares on a bounded, independently sampled grid. Return canvas
// coordinates in the same physical projection as the field; do not infer
// contours from colors or connect through singular/non-finite cells.
function* sampleContours(
  view: DemonstrationField,
  runtime: DemonstrationRuntime,
  time: number,
  x: Domain,
  y: Domain,
  stride: number,
): Generator<void, { level: number; lines: number[] }[], void> {
  if (!view.contours?.length) return [];
  runtime.resetBudget();
  const levels = view.contours.map((level) => runtime.evaluate(level, time));
  if (levels.some((level) => !Number.isFinite(level))) throw Error('Contour levels must be finite');
  const spacing = Math.max(5, stride * 2);
  const nx = Math.max(2, Math.ceil((FIELD_WIDTH - 1) / spacing) + 1);
  const height = fieldHeight(view);
  const ny = Math.max(2, Math.ceil((height - 1) / spacing) + 1);
  const values = new Float64Array(nx * ny);
  for (let row = 0; row < ny; row++) {
    for (let col = 0; col < nx; col++) {
      try {
        values[row * nx + col] = runtime.evaluate(view.expression, time,
          x[0] + (x[1] - x[0]) * col / (nx - 1),
          y[1] - (y[1] - y[0]) * row / (ny - 1));
      } catch (error) {
        if (isDemonstrationBudgetError(error)) throw error;
        values[row * nx + col] = Number.NaN;
      }
    }
    yield;
  }
  const dx = (FIELD_WIDTH - 1) / (nx - 1), dy = (height - 1) / (ny - 1);
  const output = levels.map((level) => ({ level, lines: [] as number[] }));
  const offsets = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (let row = 0; row < ny - 1; row++) {
    for (let col = 0; col < nx - 1; col++) {
      const v = [values[row * nx + col], values[row * nx + col + 1],
        values[(row + 1) * nx + col + 1], values[(row + 1) * nx + col]];
      if (!v.every(Number.isFinite)) continue;
      for (const { level, lines } of output) {
        const edges: number[][] = [];
        for (let edge = 0; edge < 4; edge++) {
          const next = (edge + 1) % 4;
          if ((v[edge] >= level) === (v[next] >= level)) continue;
          const u = (level - v[edge]) / (v[next] - v[edge]);
          const [ax, ay] = offsets[edge], [bx, by] = offsets[next];
          edges.push([(col + ax + u * (bx - ax)) * dx, (row + ay + u * (by - ay)) * dy]);
        }
        if (edges.length === 2) lines.push(...edges[0], ...edges[1]);
        else if (edges.length === 4) {
          const center = (v[0] + v[1] + v[2] + v[3]) / 4;
          if ((center >= level) === (v[0] >= level))
            lines.push(...edges[0], ...edges[1], ...edges[2], ...edges[3]);
          else lines.push(...edges[0], ...edges[3], ...edges[1], ...edges[2]);
        }
      }
    }
    yield;
  }
  return output;
}

type Point3 = [number,number,number];
export interface SurfaceSample {
  size: number;
  values: number[];
  vertices?: (Point3 | null)[];
  triangles?: [Point3,Point3,Point3][];
  isoLevel?: number;
  curve?: (Point3 | null)[];
  arrows3d?: {from:Point3;to:Point3;magnitude:number}[];
  reference?: number;
  x: Domain;
  y: Domain;
  z: Domain;
}
function* sampleSurface(view: DemonstrationField, runtime: DemonstrationRuntime,
  time: number, x: Domain, y: Domain, size: number): Generator<void, SurfaceSample, void> {
  runtime.resetBudget();
  if (!view.zRange) throw Error('Surface requires z bounds');
  const z = view.zRange.map((v) => runtime.evaluate(v, time)) as Domain;
  if (!z.every(Number.isFinite) || z[1] <= z[0]) throw Error('Surface z bounds must increase');
  const values: number[] = [];
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      try {
        const value = runtime.evaluate(view.expression, time,
          x[0] + (x[1]-x[0])*i/(size-1), y[0] + (y[1]-y[0])*j/(size-1));
        values.push(Number.isFinite(value) && value >= z[0] && value <= z[1] ? value : Number.NaN);
      } catch (error) {
        if (isDemonstrationBudgetError(error)) throw error;
        values.push(Number.NaN);
      }
    }
    yield;
  }
  if (!values.some(Number.isFinite)) throw Error('No finite surface samples in z range');
  return {size, values, x, y, z};
}


function* sampleIsosurface(view:DemonstrationField,runtime:DemonstrationRuntime,time:number,x:Domain,y:Domain,preview:boolean):Generator<void,SurfaceSample,void>{
  if(!view.zRange||view.isoLevel===undefined)throw Error('Isosurface requires bounds and level');
  const z=demonstrationDomain(view.zRange,runtime,time),level=runtime.evaluate(view.isoLevel,time);
  if(!Number.isFinite(level))throw Error('Isosurface level must be finite');
  const ranges=[x,y,z],size=preview?11:17,values=new Float64Array(size**3);
  const at=(i:number,j:number,k:number)=>(k*size+j)*size+i;
  for(let k=0;k<size;k++)for(let j=0;j<size;j++){
    for(let i=0;i<size;i++){
      try{const p=[i,j,k].map((v,d)=>ranges[d][0]+(ranges[d][1]-ranges[d][0])*v/(size-1)) as Point3;
        values[at(i,j,k)]=runtime.evaluate(view.expression,time,...p);
      }catch(error){if(isDemonstrationBudgetError(error))throw error;values[at(i,j,k)]=Number.NaN;}
    }
    yield;
  }
  const corners=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
  // The same body diagonal in every cube yields compatible face diagonals.
  const tetrahedra=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
  const triangles:[Point3,Point3,Point3][]=[];
  const add=(a:Point3,b:Point3,c:Point3)=>{
    const u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]);
    if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<1e-12)return;
    if(triangles.length>=6000)throw Error('Isosurface triangle budget exceeded; narrow bounds or simplify field');
    triangles.push([a,b,c]);
  };
  for(let k=0;k<size-1;k++)for(let j=0;j<size-1;j++){
    for(let i=0;i<size-1;i++){
      const v=corners.map(([a,b,c])=>values[at(i+a,j+b,k+c)]);
      if(!v.every(Number.isFinite)||v.every(q=>q>=level)||v.every(q=>q<level))continue;
      const p=corners.map(([a,b,c])=>[i+a,j+b,k+c].map(q=>2*q/(size-1)-1) as Point3);
      const cross=(a:number,b:number):Point3=>{
        const w=(level-v[a])/(v[b]-v[a]);return p[a].map((q,d)=>q+w*(p[b][d]-q)) as Point3;
      };
      for(const t of tetrahedra){
        const inside=t.filter(i=>v[i]>=level),outside=t.filter(i=>v[i]<level);
        if(!inside.length||!outside.length)continue;
        if(inside.length===1)add(cross(inside[0],outside[0]),cross(inside[0],outside[1]),cross(inside[0],outside[2]));
        else if(outside.length===1)add(cross(outside[0],inside[0]),cross(outside[0],inside[1]),cross(outside[0],inside[2]));
        else{
          const a=cross(inside[0],outside[0]),b=cross(inside[0],outside[1]),c=cross(inside[1],outside[0]),d=cross(inside[1],outside[1]);
          add(a,b,c);add(b,d,c);
        }
      }
    }
    yield;
  }
  if(!triangles.length)throw Error('No isosurface intersects the sampled volume at this level');
  return {size:0,values:[],x,y,z,triangles,isoLevel:level};
}

function* sampleSpace(view: DemonstrationField,runtime:DemonstrationRuntime,time:number,x:Domain,y:Domain,preview:boolean): Generator<void,SurfaceSample,void> {
  if(!view.zRange)throw Error('3D view requires z bounds');
  const z=demonstrationDomain(view.zRange,runtime,time);
  const ranges=[x,y,z];
  const normalize=(p:Point3):Point3=>p.map((v,i)=>2*(v-ranges[i][0])/(ranges[i][1]-ranges[i][0])-1) as Point3;
  const result:SurfaceSample={size:0,values:[],x,y,z};
  if(view.presentation==='parametricSurface'&&view.surface3d&&view.uRange&&view.vRange){
    const u=demonstrationDomain(view.uRange,runtime,time),v=demonstrationDomain(view.vRange,runtime,time);
    const size=preview?17:33,vertices:(Point3|null)[]=[];
    for(let j=0;j<size;j++){
      for(let i=0;i<size;i++){
        try{
          const p=view.surface3d.map(expr=>runtime.evaluate(expr,time,u[0]+(u[1]-u[0])*i/(size-1),v[0]+(v[1]-v[0])*j/(size-1))) as Point3;
          vertices.push(p.every((q,k)=>Number.isFinite(q)&&q>=ranges[k][0]-1e-10&&q<=ranges[k][1]+1e-10)?normalize(p):null);
        }catch(error){if(isDemonstrationBudgetError(error))throw error;vertices.push(null);}
      }
      yield;
    }
    if(!vertices.some(Boolean))throw Error('No finite parametric surface points within declared bounds');
    result.size=size;result.vertices=vertices;
  }else if(view.presentation==='curve3d'&&view.curve3d){
    const domain:Domain=view.curveHistory?[0,Math.max(0,time)]:demonstrationDomain(view.parameterRange!,runtime,time);
    const steps=preview?120:480,curve:(Point3|null)[]=[];
    for(let i=0;i<=steps;i++){
      const u=domain[0]+(domain[1]-domain[0])*i/steps;
      try{
        const point=view.curve3d.map(expr=>runtime.evaluate(expr,view.curveHistory?u:time,view.curveHistory?0:u)) as Point3;
        curve.push(point.every((v,k)=>Number.isFinite(v)&&v>=ranges[k][0]&&v<=ranges[k][1])?normalize(point):null);
      }catch(error){if(isDemonstrationBudgetError(error))throw error;curve.push(null);}
      if(i%32===0)yield;
    }
    if(!curve.some(Boolean))throw Error('No finite curve points in declared ranges');
    result.curve=curve;
  }else if(view.vector3d&&view.vectorScale!==undefined){
    const reference=runtime.evaluate(view.vectorScale,time);
    if(!Number.isFinite(reference)||reference<=0)throw Error('Vector reference magnitude must be positive');
    const size=preview?4:7,arrows:NonNullable<SurfaceSample['arrows3d']>=[];
    for(let k=0;k<size;k++)for(let j=0;j<size;j++){
      for(let i=0;i<size;i++){
        const point=[i,j,k].map((v,d)=>ranges[d][0]+(ranges[d][1]-ranges[d][0])*(v+.5)/size) as Point3;
        try{
          const vector=view.vector3d.map(expr=>runtime.evaluate(expr,time,...point)) as Point3;
          const magnitude=Math.hypot(...vector);
          if(!Number.isFinite(magnitude)||magnitude<=1e-12)continue;
          const scaled=vector.map((v,d)=>v/(ranges[d][1]-ranges[d][0]));
          const norm=Math.hypot(...scaled),length=0.28*Math.min(1,magnitude/reference);
          if(!Number.isFinite(norm)||norm<=0)continue;
          const from=normalize(point),to=from.map((v,d)=>v+scaled[d]/norm*length) as Point3;
          arrows.push({from,to,magnitude});
        }catch(error){if(isDemonstrationBudgetError(error))throw error;}
      }
      yield;
    }
    result.arrows3d=arrows;result.reference=reference;
  }
  return result;
}

function sliceRuntime(view:DemonstrationField,runtime:DemonstrationRuntime,time:number){
  if(!view.slicePlane)return {runtime,slice:undefined};
  const {axis,at}=view.slicePlane,position=runtime.evaluate(at,time);
  if(!Number.isFinite(position))throw Error('Slice coordinate must be finite');
  const map=(u:number,v:number):Point3=>axis==='x'?[position,u,v]:axis==='y'?[u,position,v]:[u,v,position];
  const projected:DemonstrationRuntime={...runtime,evaluate(expression,t=0,x?,y?,z?){
    return x===undefined||y===undefined?runtime.evaluate(expression,t,x,y,z):runtime.evaluate(expression,t,...map(x,y));
  },dependencies(expression){const mask=runtime.dependencies(expression);return (mask&4)|(axis==='x'?((mask&2)?1:0)|((mask&8)?2:0):axis==='y'?(mask&1)|((mask&8)?2:0):mask&3);}};
  return {runtime:projected,slice:{axis,position}};
}

export function* sampleField(
  view: DemonstrationField,
  runtime: DemonstrationRuntime,
  time: number,
  preview: boolean,
) {
  runtime.resetBudget();
  const x = demonstrationDomain(view.x, runtime, time);
  const y = demonstrationDomain(view.y, runtime, time);
  if(view.presentation==='isosurface'){
    const surface=yield* sampleIsosurface(view,runtime,time,x,y,preview);
    return {pixels:new ArrayBuffer(0),arrows:[],contours:[],colorRange:undefined,surface,slice:undefined,streamlines:[] as number[][],markers:[]};
  }
  if (view.presentation === 'curve3d' || view.presentation === 'vectors3d' || view.presentation==='parametricSurface') {
    const surface=yield* sampleSpace(view,runtime,time,x,y,preview);
    return {pixels:new ArrayBuffer(0),arrows:[],contours:[],colorRange:undefined,surface,slice:undefined,streamlines:[] as number[][],markers:[] };
  }
  if (view.presentation === 'surface') {
    const surface = yield* sampleSurface(view, runtime, time, x, y, preview ? 17 : 33);
    return { pixels: new ArrayBuffer(0), arrows: [], contours: [], colorRange: undefined, surface,slice:undefined,streamlines:[] as number[][],markers:[] };
  }
  const {runtime:projected,slice}=sliceRuntime(view,runtime,time);
  const colorRange = view.colorRange?.map((v) => runtime.evaluate(v, time)) as Domain | undefined;
  if (colorRange && (!colorRange.every(Number.isFinite) || colorRange[0] >= colorRange[1]))
    throw Error('Color range must be finite and increasing');
  for (const stride of preview ? [4, 8, 1, 2] : [1, 2, 4, 8]) {
    try {
      const pixels = yield* sampleGrid(view, projected, time, x, y, stride, colorRange);
      const arrows = yield* sampleVectors(view, runtime, time, x, y);
      const contours = yield* sampleContours(view, projected, time, x, y, stride);
      const streamlines=yield* sampleStreamlines(view,runtime,time,x,y,preview||stride>1);
      const markers=(view.markers??[]).flatMap(m=>{
        try{const px=runtime.evaluate(m.x,time),py=runtime.evaluate(m.y,time);
          if(!Number.isFinite(px)||!Number.isFinite(py)||px<x[0]||px>x[1]||py<y[0]||py>y[1])return [];
          return [{x:px,y:py,px:(px-x[0])/(x[1]-x[0])*(FIELD_WIDTH-1),py:(y[1]-py)/(y[1]-y[0])*(fieldHeight(view)-1),label:m.label}];
        }catch(error){if(isDemonstrationBudgetError(error))throw error;return [];}
      });
      return { pixels: pixels.buffer, arrows, contours, colorRange, surface: undefined,slice,streamlines,markers };
    } catch (error) {
      if (!isDemonstrationBudgetError(error)) throw error;
    }
  }
  throw Error('Demonstration calculation budget exceeded');
}
export type FieldSample =
  ReturnType<typeof sampleField> extends Generator<void, infer T> ? T : never;
