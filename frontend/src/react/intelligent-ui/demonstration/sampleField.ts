import { demonstrationDomain, isDemonstrationBudgetError } from '@socrates/core/demonstration';
import type { DemonstrationField, DemonstrationRuntime } from '@socrates/core/demonstration';
import { FIELD_WIDTH, fieldHeight, type Domain } from './fieldCommon';
import { sampleGrid } from './sampling/scalarField';
import { sampleVectors, sampleStreamlines } from './sampling/vectorField';
import { sampleContours } from './sampling/contours';
import { sliceRuntime } from './sampling/slice';
import { sampleSurface, sampleSpace } from './geometry/surface';
import { sampleIsosurface } from './geometry/isosurface';

export { FIELD_WIDTH, fieldHeight, fieldExpressions, errorMessage } from './fieldCommon';
export type { SurfaceSample } from './geometry/types';

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
