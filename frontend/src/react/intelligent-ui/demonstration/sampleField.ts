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

function* sampleGrid(
  view: DemonstrationField,
  runtime: DemonstrationRuntime,
  time: number,
  xDomain: Domain,
  yDomain: Domain,
  stride: number,
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
      for (let x = 0; x < width; x += stride) {
        const offset = y * width + x;
        if (x === 0 || variesX) {
          let value = 0;
          try {
            value = runtime.evaluate(view.expression, time, xs[x], worldY);
            valid = true;
          } catch (error) {
            if (isDemonstrationBudgetError(error)) throw error;
            firstError ||= errorMessage(error);
          }
          writeColor(pixels, offset * 4, value, view.palette, gamma, exposure, tint);
        }
        const color = words[variesX ? offset : y * width];
        words.fill(color, offset, y * width + Math.min(width, x + stride));
        if (x % 32 === 0) yield;
      }
    }
    for (let row = y + (y === 0 || variesY ? 1 : 0); row < Math.min(height, y + stride); row++) {
      const source = variesY ? y * width : 0;
      words.copyWithin(row * width, source, source + width);
    }
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
        if (Number.isFinite(magnitude) && magnitude >= 1e-9)
          arrows.push(x, y, (vx / magnitude) * 5, (-vy / magnitude) * 5);
      } catch (error) {
        if (isDemonstrationBudgetError(error)) return arrows;
      }
      yield;
    }
  }
  return arrows;
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
  for (const stride of preview ? [4, 8, 1, 2] : [1, 2, 4, 8]) {
    try {
      const pixels = yield* sampleGrid(view, runtime, time, x, y, stride);
      const arrows = yield* sampleVectors(view, runtime, time, x, y);
      return { pixels: pixels.buffer, arrows };
    } catch (error) {
      if (!isDemonstrationBudgetError(error)) throw error;
    }
  }
  throw Error('Demonstration calculation budget exceeded');
}
export type FieldSample =
  ReturnType<typeof sampleField> extends Generator<void, infer T> ? T : never;
