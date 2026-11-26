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

export interface SurfaceSample {
  size: number;
  values: number[];
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

export function* sampleField(
  view: DemonstrationField,
  runtime: DemonstrationRuntime,
  time: number,
  preview: boolean,
) {
  runtime.resetBudget();
  const x = demonstrationDomain(view.x, runtime, time);
  const y = demonstrationDomain(view.y, runtime, time);
  if (view.presentation === 'surface') {
    const surface = yield* sampleSurface(view, runtime, time, x, y, preview ? 17 : 33);
    return { pixels: new ArrayBuffer(0), arrows: [], contours: [], colorRange: undefined, surface };
  }
  const colorRange = view.colorRange?.map((v) => runtime.evaluate(v, time)) as Domain | undefined;
  if (colorRange && (!colorRange.every(Number.isFinite) || colorRange[0] >= colorRange[1]))
    throw Error('Color range must be finite and increasing');
  for (const stride of preview ? [4, 8, 1, 2] : [1, 2, 4, 8]) {
    try {
      const pixels = yield* sampleGrid(view, runtime, time, x, y, stride, colorRange);
      const arrows = yield* sampleVectors(view, runtime, time, x, y);
      const contours = yield* sampleContours(view, runtime, time, x, y, stride);
      return { pixels: pixels.buffer, arrows, contours, colorRange, surface: undefined };
    } catch (error) {
      if (!isDemonstrationBudgetError(error)) throw error;
    }
  }
  throw Error('Demonstration calculation budget exceeded');
}
export type FieldSample =
  ReturnType<typeof sampleField> extends Generator<void, infer T> ? T : never;
