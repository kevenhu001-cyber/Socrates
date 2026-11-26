import type { Domain } from '../fieldCommon';

export type Point3 = [number,number,number];
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
