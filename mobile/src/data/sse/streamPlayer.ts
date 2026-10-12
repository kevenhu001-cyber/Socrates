import {
  createPlaybackClock,
  type PlaybackConfig,
  type PlaybackState,
} from '@socrates/core';

const UI_PAINT_INTERVAL_MS = 32;

export interface MobileStreamFrame {
  state: PlaybackState;
  revealed: number;
  totalLen: number;
}

export interface MobileStreamPlayer {
  push(delta: string): void;
  /** Reveal arrived text now without completing the assistant turn. */
  revealBufferedNow(): void;
  beginDrain(): void;
  /** Make all arrived text visible synchronously for Stop/session teardown. */
  flushNow(): void;
  getState(): PlaybackState;
  playedLen(): number;
  totalLen(): number;
  dispose(): void;
}

export interface MobileStreamPlayerOptions {
  onFrame: (visibleText: string, frame: MobileStreamFrame) => void;
  onDone?: () => void;
  onStateChange?: (state: PlaybackState) => void;
  config?: Partial<PlaybackConfig>;
  now?: () => number;
  raf?: (callback: () => void) => void;
}

/**
 * Native frame-loop adapter around the shared platform-neutral PlaybackClock.
 * Network arrivals only append to the buffer; React receives monotonic visible
 * prefixes on animation frames. Natural completion drains; Stop flushes and
 * tears down synchronously so it never waits behind playback.
 */
export function createMobileStreamPlayer(options: MobileStreamPlayerOptions): MobileStreamPlayer {
  const now = options.now || (() => globalThis.performance?.now?.() ?? Date.now());
  const raf = options.raf || ((callback: () => void) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(callback);
    else setTimeout(callback, 16);
  });
  const clock = createPlaybackClock(options.config, now());
  let full = '';
  let scheduled = false;
  let generation = 0;
  let doneFired = false;
  let lastState: PlaybackState = 'idle';
  let lastPaintedLen = 0;
  let lastPaintAt = Number.NEGATIVE_INFINITY;

  const emitState = (state: PlaybackState) => {
    if (state === lastState) return;
    lastState = state;
    try { options.onStateChange?.(state); } catch { /* observer failures must not strand the stream */ }
  };
  const finishOnce = () => {
    if (doneFired) return;
    doneFired = true;
    try { options.onDone?.(); } catch { /* terminal observer failures are isolated */ }
  };
  const tick = (capturedGeneration: number) => () => {
    if (capturedGeneration !== generation) return;
    scheduled = false;
    const nowMs = now();
    const result = clock.tick(nowMs);
    const unpainted = result.playedLen - lastPaintedLen;
    const shouldPaint = nowMs - lastPaintAt >= UI_PAINT_INTERVAL_MS || clock.isDone();
    if (unpainted > 0 && shouldPaint) {
      lastPaintedLen = result.playedLen;
      lastPaintAt = nowMs;
      options.onFrame(full.slice(0, result.playedLen), {
        state: result.state,
        revealed: unpainted,
        totalLen: clock.totalLen(),
      });
    }
    emitState(result.state);
    if (clock.isDone()) {
      finishOnce();
      return;
    }
    if (clock.playedLen() < clock.totalLen() || result.state !== 'starved') schedule();
  };
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    raf(tick(generation));
  }

  return {
    push(delta) {
      if (!delta || doneFired) return;
      full += delta;
      clock.push(full.length);
      schedule();
    },
    revealBufferedNow() {
      if (doneFired) return;
      const result = clock.revealBuffered();
      generation += 1;
      scheduled = false;
      if (result.revealed > 0) {
        lastPaintedLen = result.playedLen;
        lastPaintAt = now();
        options.onFrame(full.slice(0, result.playedLen), {
          state: result.state,
          revealed: result.revealed,
          totalLen: clock.totalLen(),
        });
      }
      emitState(result.state);
    },
    beginDrain() {
      if (doneFired) return;
      clock.beginDrain();
      schedule();
    },
    flushNow() {
      if (doneFired) return;
      clock.beginDrain();
      const played = clock.playedLen();
      const total = clock.totalLen();
      if (total > played) {
        options.onFrame(full.slice(0, total), {
          state: 'done',
          revealed: total - played,
          totalLen: total,
        });
      }
      lastPaintedLen = total;
      lastPaintAt = now();
      generation += 1;
      scheduled = false;
      emitState('done');
      finishOnce();
    },
    getState: () => doneFired ? 'done' : clock.state(),
    playedLen: () => doneFired ? clock.totalLen() : clock.playedLen(),
    totalLen: () => clock.totalLen(),
    dispose() {
      generation += 1;
      scheduled = false;
    },
  };
}
