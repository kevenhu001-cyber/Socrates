/* Web playback player — the rAF seam around the pure core clock.
 *
 * This replaces the old coalescing scheduler. Instead of accumulating
 * network deltas and painting the WHOLE arrived text at a throttled cadence,
 * the player decouples the two streams:
 *
 *   push(delta)  — upstream writes into the buffer only (advances totalLen)
 *   first frame  — reveal the first arrived batch in full.
 *   later ticks  — the core PlaybackClock advances a visual cursor at an
 *                  adaptive rate; when it moves, onFrame() paints the VISIBLE
 *                  PREFIX `full.slice(0, playedLen)` — a smoothly growing
 *                  string even when upstream bursts or stalls.
 *
 * The `now` and `raf` seams are injected so the frame loop can be driven
 * deterministically in tests. A generation
 * guard drops frames queued before dispose(), so a turn torn down by a
 * session switch never paints into the new container.
 */

import {
  createPlaybackClock,
  DEFAULT_PLAYBACK_CONFIG,
  type PlaybackClock,
  type PlaybackConfig,
  type PlaybackState,
} from '@socrates/core/streamPlayer';
import { reportSwallow as reportEmptyCatch } from '../util/reportSwallow.ts';

export interface StreamPlayerFrame {
  state: PlaybackState;
  /** Characters revealed by this frame (playedLen delta). */
  revealed: number;
  /** Total arrived length at this frame. */
  totalLen: number;
}

export interface StreamPlayer {
  /** Coalesce a network delta into the buffer (advances totalLen only). */
  push(delta: string): void;
  /** finish(): flush the remaining buffer, then fire onDone once caught up. */
  beginDrain(): void;
  /** Force the full arrived text visible immediately and paint it now. */
  flushNow(): void;
  /** Current playback state without advancing. */
  getState(): PlaybackState;
  /** Visible prefix length. */
  playedLen(): number;
  /** Arrived length. */
  totalLen(): number;
  dispose(): void;
}

export interface StreamPlayerOptions {
  /** Paint the visible prefix. Called only on frames that revealed text. */
  onFrame: (visibleText: string, frame: StreamPlayerFrame) => void;
  /** Fired once, after beginDrain(), when playback has fully caught up. */
  onDone?: () => void;
  /** Fired when the playback state changes (e.g. playing → starved). */
  onStateChange?: (state: PlaybackState) => void;
  config?: Partial<PlaybackConfig>;
  now?: () => number;
  raf?: (cb: () => void) => void;
  /** Schedule a one-shot idle wake; returns a cancellation callback. */
  delay?: (cb: () => void, ms: number) => () => void;
  isHidden?: () => boolean;
  /** Subscribe to tab visibility; returns a teardown callback. */
  onVisibilityChange?: (cb: () => void) => () => void;
}

function subscribeDocumentVisibility(cb: () => void): (() => void) | undefined {
  if (typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', cb);
  return () => document.removeEventListener('visibilitychange', cb);
}

function disposeCallback(callback: (() => void) | null): null {
  callback?.();
  return null;
}

function publishStateChange(
  previous: PlaybackState,
  next: PlaybackState,
  onStateChange?: (state: PlaybackState) => void,
): PlaybackState {
  if (next === previous) return previous;
  try {
    onStateChange?.(next);
  } catch (_) {
    reportEmptyCatch(_, 'empty catch: render/streamPlayer.ts');
    /* listener threw */
  }
  return next;
}

function handleVisibilityChange(
  clearIdle: () => void,
  isHidden: () => boolean,
  paintHidden: () => void,
  isDone: () => boolean,
  schedule: () => void,
): void {
  clearIdle();
  if (isHidden()) paintHidden();
  else if (!isDone()) schedule();
}

function flushVisibleText(
  clock: PlaybackClock,
  full: string,
  onFrame: StreamPlayerOptions['onFrame'],
): void {
  const played = clock.playedLen();
  const total = clock.totalLen();
  clock.flushNow();
  if (total > played) {
    onFrame(full.slice(0, total), {
      state: 'done',
      revealed: total - played,
      totalLen: total,
    });
  }
}

function resolvePlayerDependencies(options: StreamPlayerOptions) {
  const now = options.now || (() => performance.now());
  const raf =
    options.raf ||
    ((cb: () => void) => {
      requestAnimationFrame(cb);
    });
  const isHidden =
    options.isHidden ||
    (() => typeof document !== 'undefined' && document.visibilityState === 'hidden');
  const delay =
    options.delay ||
    ((cb: () => void, ms: number) => {
      const timer = setTimeout(cb, ms);
      return () => clearTimeout(timer);
    });
  const starveAfterMs = Math.max(
    0,
    options.config?.starveAfterMs ?? DEFAULT_PLAYBACK_CONFIG.starveAfterMs,
  );
  const subscribeVisibility = options.onVisibilityChange || subscribeDocumentVisibility;
  return { now, raf, isHidden, delay, starveAfterMs, subscribeVisibility };
}

function notifyPlayerDone(onDone: StreamPlayerOptions['onDone'], doneFired: boolean): boolean {
  if (doneFired) return true;
  try {
    onDone?.();
  } catch (_) {
    reportEmptyCatch(_, 'empty catch: render/streamPlayer.ts'); /* listener threw */
  }
  return true;
}

function flushTerminalPlayer(
  clock: PlaybackClock,
  full: string,
  onFrame: StreamPlayerOptions['onFrame'],
  onStateChange: StreamPlayerOptions['onStateChange'],
  onDone: StreamPlayerOptions['onDone'],
  lastState: PlaybackState,
  doneFired: boolean,
): { nextState: PlaybackState; doneFired: boolean } {
  flushVisibleText(clock, full, onFrame);
  const nextState = publishStateChange(lastState, 'done', onStateChange);
  const nextDoneFired = notifyPlayerDone(onDone, doneFired);
  return { nextState, doneFired: nextDoneFired };
}

export function createStreamPlayer(options: StreamPlayerOptions): StreamPlayer {
  const { onFrame, onDone, onStateChange } = options;
  const { now, raf, isHidden, delay, starveAfterMs, subscribeVisibility } =
    resolvePlayerDependencies(options);
  let cancelIdle: (() => void) | null = null;
  let full = '';
  const clock: PlaybackClock = createPlaybackClock(options.config, now());
  let scheduled = false;
  let generation = 0;
  let doneFired = false;
  let lastState: PlaybackState = 'idle';
  let firstPaint = true;
  const handleVisibility = () =>
    handleVisibilityChange(
      () => {
        cancelIdle = disposeCallback(cancelIdle);
      },
      isHidden,
      paintHidden,
      () => clock.isDone(),
      schedule,
    );
  let unsubscribeVisibility: (() => void) | null = subscribeVisibility(handleVisibility) ?? null;
  function paintHidden(): void {
    generation += 1;
    scheduled = false;
    tick(generation)();
  }

  function tick(captured: number) {
    return () => {
      if (captured !== generation) return;
      scheduled = false;
      const r = firstPaint || isHidden() ? clock.revealNow(now()) : clock.tick(now());
      if (r.revealed > 0) firstPaint = false;
      if (r.revealed > 0) {
        onFrame(full.slice(0, r.playedLen), {
          state: r.state,
          revealed: r.revealed,
          totalLen: clock.totalLen(),
        });
      }
      lastState = publishStateChange(lastState, r.state, onStateChange);
      if (clock.isDone()) {
        unsubscribeVisibility = disposeCallback(unsubscribeVisibility);
        doneFired = notifyPlayerDone(onDone, doneFired);
        return; // clock is terminal; stop the loop
      }
      if (clock.playedLen() < clock.totalLen()) {
        schedule();
      } else if (r.state === 'playing') {
        cancelIdle = delay(() => {
          cancelIdle = null;
          if (captured === generation) schedule();
        }, starveAfterMs);
      }
    };
  }

  function schedule(): void {
    if (scheduled) return;
    scheduled = true;
    raf(tick(generation));
  }

  return {
    push(delta: string): void {
      if (!delta) return;
      if (!unsubscribeVisibility)
        unsubscribeVisibility = subscribeVisibility(handleVisibility) ?? null;
      cancelIdle = disposeCallback(cancelIdle);
      if (clock.playedLen() === clock.totalLen()) clock.tick(now());
      full += delta;
      clock.push(full.length, now());
      if (isHidden()) paintHidden();
      else schedule();
    },
    beginDrain(): void {
      cancelIdle = disposeCallback(cancelIdle);
      clock.beginDrain();
      if (isHidden()) paintHidden();
      else schedule();
    },
    flushNow(): void {
      cancelIdle = disposeCallback(cancelIdle);
      unsubscribeVisibility = disposeCallback(unsubscribeVisibility);
      const res = flushTerminalPlayer(
        clock,
        full,
        onFrame,
        onStateChange,
        onDone,
        lastState,
        doneFired,
      );
      lastState = res.nextState;
      doneFired = res.doneFired;
      generation += 1;
      scheduled = false;
    },
    getState(): PlaybackState {
      return clock.state();
    },
    playedLen(): number {
      return clock.playedLen();
    },
    totalLen(): number {
      return clock.totalLen();
    },
    dispose(): void {
      cancelIdle = disposeCallback(cancelIdle);
      unsubscribeVisibility = disposeCallback(unsubscribeVisibility);
      generation += 1;
      scheduled = false;
    },
  };
}
