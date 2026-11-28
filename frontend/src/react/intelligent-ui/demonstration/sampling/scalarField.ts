import { isDemonstrationBudgetError } from '@socrates/core/demonstrationLight';
import type { DemonstrationField, DemonstrationRuntime } from '@socrates/core/demonstration';
import { FIELD_WIDTH, fieldHeight, setting, errorMessage, type Domain } from '../fieldCommon';

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
        if (!Number.isFinite(value)) throw new Error('Non-finite field sample');
        const scaled = colorRange
          ? (value - colorRange[0]) / (colorRange[1] - colorRange[0])
          : value;
        writeColor(
          pixels,
          offset * 4,
          scaled,
          view.palette,
          gamma,
          colorRange ? 1 : exposure,
          tint,
        );
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

export function* sampleGrid(
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
  if (!valid) throw new Error(firstError);
  return pixels;
}
