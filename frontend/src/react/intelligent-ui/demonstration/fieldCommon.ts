import type { DemonstrationField, DemonstrationRuntime } from '@socrates/core/demonstration';
import type { DemonstrationValue } from '@socrates/core/demonstration';

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
    ...(view.isoLevel === undefined ? [] : [view.isoLevel]),
    ...(view.slicePlane ? [view.slicePlane.at] : []),
    ...(view.curve3d ?? []),
    ...(view.vector3d ?? []),
    ...(view.parameterRange ?? []),
    ...(view.uRange ?? []),
    ...(view.vRange ?? []),
    ...(view.surface3d ?? []),
    ...(view.markers ?? []).flatMap((m) => [m.x, m.y]),
    ...(view.curveHistory ? ['t'] : []),
    ...(view.contours ?? []),
    ...(view.vectorScale === undefined ? [] : [view.vectorScale]),
  ];
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function setting(
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

export type Domain = [number, number];

export function isSpatialField(view: DemonstrationField): boolean {
  return ['surface', 'curve3d', 'vectors3d', 'parametricSurface', 'isosurface'].includes(
    view.presentation ?? '',
  );
}
