/* Web playback player — the rAF seam around the pure core clock.
 *
 * This replaces the old coalescing streamScheduler. Instead of accumulating
 * network deltas and painting the WHOLE arrived text at a throttled cadence,
 * the player decouples the two streams:
 *
 *   push(delta)  — upstream writes into the buffer only (advances totalLen)
 *   rAF tick     — the core PlaybackClock advances a visual cursor at an
 *                  adaptive rate; when it moves, onFrame() paints the VISIBLE
 *                  PREFIX `full.slice(0, playedLen)` — a smoothly growing
 *                  string even when upstream bursts or stalls.
 *
 * The `now` and `raf` seams are injected so the frame loop can be driven
 * deterministically in tests, mirroring streamScheduler.ts. A generation
 * guard drops frames queued before dispose(), so a turn torn down by a
 * session switch never paints into the new container.
 */

import {
  createPlaybackClock,
  type PlaybackClock,
  type PlaybackConfig,
  type PlaybackState,
} from '@socrates/core';

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
}

export function createStreamPlayer(options: StreamPlayerOptions): StreamPlayer {
  const now = options.now || (() => performance.now());
  const raf = options.raf || ((cb: () => void) => { requestAnimationFrame(cb); });
  const onFrame = options.onFrame;
  const onDone = options.onDone;
  const onStateChange = options.onStateChange;

  let full = '';
  const clock: PlaybackClock = createPlaybackClock(options.config, now());
  let scheduled = false;
  let generation = 0;
  let doneFired = false;
  let lastState: PlaybackState = 'idle';

  function emitStateMaybe(state: PlaybackState): void {
    if (state !== lastState) {
      lastState = state;
      try { onStateChange?.(state); } catch (_) { /* listener threw */ }
    }
  }

  function tick(captured: number) {
    return () => {
      /* A frame queued before dispose() is stale; drop it. Pushes after
         dispose() schedule with the fresh generation. */
      if (captured !== generation) return;
      scheduled = false;
      const r = clock.tick(now());
      if (r.revealed > 0) {
        onFrame(full.slice(0, r.playedLen), {
          state: r.state,
          revealed: r.revealed,
          totalLen: clock.totalLen(),
        });
      }
      emitStateMaybe(r.state);
      if (clock.isDone()) {
        if (!doneFired) {
          doneFired = true;
          try { onDone?.(); } catch (_) { /* listener threw */ }
        }
        return; // clock is terminal; stop the loop
      }
      /* Keep ticking while there is buffered text to play OR while a stall
         could still be reported (buffer empty but not yet starved). Once
         starved with an empty buffer, stop until the next push() revives
         the loop — no busy-spin during a long upstream stall. */
      if (clock.playedLen() < clock.totalLen()) {
        schedule();
      } else if (r.state !== 'starved') {
        schedule();
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
      full += delta;
      clock.push(full.length);
      schedule();
    },
    beginDrain(): void {
      clock.beginDrain();
      schedule();
    },
    flushNow(): void {
      /* End-of-turn safety: make everything visible and paint synchronously,
         bypassing the adaptive rate. Used by abort/teardown paths that must
         not animate. */
      clock.beginDrain();
      // Advance the clock far enough to consume the whole buffer at once.
      const played = clock.playedLen();
      const total = clock.totalLen();
      if (total > played) {
        onFrame(full.slice(0, total), {
          state: 'done',
          revealed: total - played,
          totalLen: total,
        });
      }
      // Reflect terminal state; drop any pending frame.
      generation += 1;
      scheduled = false;
      emitStateMaybe('done');
      if (!doneFired) {
        doneFired = true;
        try { onDone?.(); } catch (_) { /* listener threw */ }
      }
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
      generation += 1;
      scheduled = false;
    },
  };
}
