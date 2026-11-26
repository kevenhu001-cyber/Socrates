import type { DemonstrationField, DemonstrationRuntime } from '@socrates/core/demonstration';
import { isSpatialField } from './fieldCommon';
import { samplePlanarField } from './sampling/planar';
import { sampleSpatialField } from './geometry/spatial';

export { FIELD_WIDTH, fieldHeight, fieldExpressions, errorMessage } from './fieldCommon';
export type { SurfaceSample } from './geometry/types';

export function* sampleField(view:DemonstrationField,runtime:DemonstrationRuntime,time:number,preview:boolean){
  return yield* (isSpatialField(view)?sampleSpatialField(view,runtime,time,preview):samplePlanarField(view,runtime,time,preview));
}
export type FieldSample = ReturnType<typeof sampleField> extends Generator<void,infer T> ? T : never;
