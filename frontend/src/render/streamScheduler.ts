/* Coalescing repaint scheduler for streaming assistant responses.
 *
 * Network deltas arrive far faster than the screen can usefully repaint —
 * fast models emit dozens of tiny chunks per frame. Painting once per chunk
 * starves the composer's keystroke handler with back-to-back reflows. This
 * scheduler accumulates deltas into a single buffer and flushes at the
 * perceptual cadence from `getStreamRenderInterval(acc.length)`, gated by
 * `requestAnimationFrame` so at most one coalesced DOM write happens per due
 * frame. The `now` and `raf` seams are injected so the flush cadence can be
 * driven deterministically in tests without a real clock or frame loop.
 */

import { getStreamRenderInterval } from './streaming.js';

export interface StreamScheduler {
  push(delta: string): void;     // coalesce a network delta
  flushNow(): void;              // force a paint (turn end)
  dispose(): void;
}

export function createStreamScheduler(
  paint: (fullText: string) => void,
  now: () => number = () => Date.now(),
  raf: (cb: () => void) => void = (cb) => requestAnimationFrame(cb),
): StreamScheduler {
  let acc = '';
  let lastPaint = 0;
  let scheduled = false;

  function tick() {
    scheduled = false;
    const interval = getStreamRenderInterval(acc.length);
    if (now() - lastPaint >= interval) {
      lastPaint = now();
      paint(acc);                 // one coalesced DOM write per due tick
    } else {
      schedule();                 // not due yet; re-check next frame
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    raf(tick);
  }

  return {
    push(delta: string) { acc += delta; schedule(); },
    flushNow() { lastPaint = now(); paint(acc); },
    dispose() { scheduled = false; },
  };
}
