import { useEffect, useRef, useState } from 'react';
import { demonstrationDomain, isDemonstrationBudgetError } from '@socrates/core';
import type { DemonstrationField, DemonstrationRuntime } from '@socrates/core';
import { i18n } from '../../legacy/gateway';
import { DemoIssue } from './DemonstrationIssue';

type Domain = [number, number];
type FieldStats = { failed: number; evaluated: number; firstError: string };

const message = (error: unknown) => error instanceof Error ? error.message : String(error);

function settingValue(runtime: DemonstrationRuntime, expression: string | number | undefined, time: number, fallback: number): number {
  if (expression === undefined) return fallback;
  try {
    const value = runtime.evaluate(expression, time);
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function fieldColor(value: number, palette: string | undefined, gamma: number, exposure: number, tint: number[]): number[] {
  if (palette === 'signed') {
    const weight = Math.tanh(Math.abs(value) * exposure);
    const hue = value >= 0 ? [1, .67, .27] : [.22, .59, 1];
    return hue.map((channel, index) => ([.025, .035, .06][index] + weight * channel) * 255);
  }
  if (palette === 'heat') {
    const scaled = Math.max(0, Math.min(1, value * exposure));
    return [Math.min(1, scaled * 3), Math.max(0, Math.min(1, scaled * 3 - 1)), Math.max(0, scaled * 3 - 2)]
      .map((channel) => channel * 255);
  }
  const scaled = Math.max(0, Math.min(1, value * exposure)) ** gamma;
  return tint.map((channel) => 255 * scaled * channel);
}

function paintBlock(pixels: ImageData, width: number, height: number, x: number, y: number, stride: number, color: number[]): void {
  for (let row = y; row < Math.min(height, y + stride); row++) {
    for (let column = x; column < Math.min(width, x + stride); column++) {
      const offset = (row * width + column) * 4;
      for (let channel = 0; channel < 3; channel++) pixels.data[offset + channel] = color[channel];
      pixels.data[offset + 3] = 255;
    }
  }
}

function sampleValue(
  runtime: DemonstrationRuntime,
  expression: string | number,
  time: number,
  x: number,
  y: number,
  stats: FieldStats,
): number {
  stats.evaluated++;
  try {
    return runtime.evaluate(expression, time, x, y);
  } catch (error) {
    if (isDemonstrationBudgetError(error)) throw error;
    stats.failed++;
    stats.firstError ||= message(error);
    return 0;
  }
}

function renderGrid(
  pixels: ImageData,
  view: DemonstrationField,
  runtime: DemonstrationRuntime,
  time: number,
  xDomain: Domain,
  yDomain: Domain,
  width: number,
  height: number,
  stride: number,
  gamma: number,
  exposure: number,
  tint: number[],
): FieldStats {
  const stats: FieldStats = { failed: 0, evaluated: 0, firstError: '' };
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const worldX = xDomain[0] + x / (width - 1) * (xDomain[1] - xDomain[0]);
      const worldY = yDomain[1] - y / (height - 1) * (yDomain[1] - yDomain[0]);
      const value = sampleValue(runtime, view.expression, time, worldX, worldY, stats);
      paintBlock(pixels, width, height, x, y, stride, fieldColor(value, view.palette, gamma, exposure, tint));
    }
  }
  return stats;
}

function renderFieldPixels(
  context: CanvasRenderingContext2D,
  pixels: ImageData,
  view: DemonstrationField,
  runtime: DemonstrationRuntime,
  time: number,
  xDomain: Domain,
  yDomain: Domain,
  width: number,
  height: number,
  gamma: number,
  exposure: number,
  tint: number[],
): void {
  let stats: FieldStats | undefined;
  for (const stride of [1, 2, 4, 8]) {
    runtime.resetBudget();
    try {
      stats = renderGrid(pixels, view, runtime, time, xDomain, yDomain, width, height, stride, gamma, exposure, tint);
      break;
    } catch (error) {
      if (stride === 8 || !isDemonstrationBudgetError(error)) throw error;
    }
  }
  if (stats?.failed && stats.failed >= stats.evaluated) throw Error(stats.firstError);
  context.putImageData(pixels, 0, 0);
}

function drawVectorArrow(context: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number): void {
  context.beginPath();
  context.moveTo(x - dx, y - dy);
  context.lineTo(x + dx, y + dy);
  context.lineTo(x + dx - dx * .5 - dy * .4, y + dy - dy * .5 + dx * .4);
  context.moveTo(x + dx, y + dy);
  context.lineTo(x + dx - dx * .5 + dy * .4, y + dy - dy * .5 - dx * .4);
  context.stroke();
}

function drawVectors(
  context: CanvasRenderingContext2D,
  view: DemonstrationField,
  runtime: DemonstrationRuntime,
  time: number,
  width: number,
  height: number,
  xDomain: Domain,
  yDomain: Domain,
): void {
  if (!view.vector) return;
  context.strokeStyle = 'rgba(255,255,255,.72)';
  context.lineWidth = .7;
  for (let y = 9; y < height; y += 16) {
    for (let x = 9; x < width; x += 16) {
      const worldX = xDomain[0] + x / width * (xDomain[1] - xDomain[0]);
      const worldY = yDomain[1] - y / height * (yDomain[1] - yDomain[0]);
      let vx = Number.NaN;
      let vy = Number.NaN;
      try {
        vx = runtime.evaluate(view.vector[0], time, worldX, worldY);
        vy = runtime.evaluate(view.vector[1], time, worldX, worldY);
      } catch (error) {
        if (isDemonstrationBudgetError(error)) break;
      }
      const magnitude = Math.hypot(vx, vy);
      if (!Number.isFinite(magnitude) || magnitude < 1e-9) continue;
      drawVectorArrow(context, x, y, vx / magnitude * 5, -vy / magnitude * 5);
    }
  }
}

function drawField(canvas: HTMLCanvasElement, view: DemonstrationField, runtime: DemonstrationRuntime, time: number): void {
  runtime.resetBudget();
  const context = canvas.getContext('2d');
  if (!context) throw Error('Canvas unavailable');
  const width = 320;
  const height = Math.round(view.height ?? 160);
  const pixels = context.createImageData(width, height);
  const xDomain = demonstrationDomain(view.x, runtime, time);
  const yDomain = demonstrationDomain(view.y, runtime, time);
  const gamma = Math.max(.1, Math.min(3, settingValue(runtime, view.gamma, time, .6)));
  const exposure = Math.max(.01, Math.min(20, settingValue(runtime, view.exposure, time, 1)));
  const tint = view.tint ?? [1, .96, .82];

  renderFieldPixels(context, pixels, view, runtime, time, xDomain, yDomain, width, height, gamma, exposure, tint);
  runtime.resetBudget();
  drawVectors(context, view, runtime, time, width, height, xDomain, yDomain);
}

export function DemoField({ view, runtime, time, onError }: {
  view: DemonstrationField;
  runtime: DemonstrationRuntime;
  time: number;
  onError: (message: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [problem, setProblem] = useState('');
  useEffect(() => {
    try {
      const element = canvas.current;
      if (!element) throw Error('Canvas unavailable');
      drawField(element, view, runtime, time);
      setProblem('');
    } catch (error) {
      const text = message(error) || 'Unable to calculate field';
      setProblem(text);
      onError(text);
    }
  }, [view, runtime, time, onError]);

  const headline = view.label
    ? i18n('intui.demo.failedNamed', 'Could not compute “{name}”').replace('{name}', view.label)
    : i18n('intui.demo.failedView', 'This view could not be computed');
  return <figure className="demo-field">
    {view.label ? <figcaption>{view.label}</figcaption> : null}
    <canvas ref={canvas} width={320} height={Math.round(view.height ?? 160)} role="img" aria-label={view.label || i18n('intui.surface', 'Interactive result')} />
    {problem ? <div className="demo-note" role="status"><DemoIssue headline={headline} details={[problem]} /></div> : null}
  </figure>;
}
