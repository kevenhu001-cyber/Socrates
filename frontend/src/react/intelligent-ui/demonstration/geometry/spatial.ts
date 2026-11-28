import { demonstrationDomain } from '@socrates/core/demonstrationLight';
import type { DemonstrationField, DemonstrationRuntime } from '@socrates/core/demonstration';
import { sampleSurface, sampleSpace } from './surface';
import { sampleIsosurface } from './isosurface';

export function* sampleSpatialField(
  view: DemonstrationField,
  runtime: DemonstrationRuntime,
  time: number,
  preview: boolean,
) {
  runtime.resetBudget();
  const x = demonstrationDomain(view.x, runtime, time);
  const y = demonstrationDomain(view.y, runtime, time);
  if (view.presentation === 'isosurface') {
    const surface = yield* sampleIsosurface(view, runtime, time, x, y, preview);
    return {
      pixels: new ArrayBuffer(0),
      arrows: [],
      contours: [],
      colorRange: undefined,
      surface,
      slice: undefined,
      streamlines: [] as number[][],
      markers: [],
    };
  }
  if (
    view.presentation === 'curve3d' ||
    view.presentation === 'vectors3d' ||
    view.presentation === 'parametricSurface'
  ) {
    const surface = yield* sampleSpace(view, runtime, time, x, y, preview);
    return {
      pixels: new ArrayBuffer(0),
      arrows: [],
      contours: [],
      colorRange: undefined,
      surface,
      slice: undefined,
      streamlines: [] as number[][],
      markers: [],
    };
  }
  if (view.presentation === 'surface') {
    const surface = yield* sampleSurface(view, runtime, time, x, y, preview ? 17 : 33);
    return {
      pixels: new ArrayBuffer(0),
      arrows: [],
      contours: [],
      colorRange: undefined,
      surface,
      slice: undefined,
      streamlines: [] as number[][],
      markers: [],
    };
  }
  throw new Error('Unsupported spatial field presentation');
}
