/**
 * streamPlayer — the pure, platform-neutral playback clock that decouples the
 * network arrival stream from the visual playback stream.
 *
 * Upstream providers deliver deltas at an unstable rate: a burst dumps a large
 * block of text in one tick, then a stall leaves the stream silent for
 * seconds. Painting arrivals directly makes the UI mirror that jitter. This
 * clock instead tracks two cursors:
 *
 *   - `totalLen`  — how many characters have ARRIVED from upstream (fed by push)
 *   - `playedLen` — how many characters are VISIBLE (advanced by tick)
 *
 * `playedLen` chases `totalLen` at an adaptive characters-per-second rate that
 * rises with the buffer depth (`pending = totalLen - playedLen`): a deep buffer
 * plays faster to catch up, a shallow one plays near a comfortable reading
 * cadence, and both are clamped so a burst never re-manifests as a visual jump.
 *
 * This module is deliberately free of rAF, DOM, timers, and React — Web,
 * Android, and desktop clients drive it with their own frame loop and clock.
 * The Web wrapper lives at frontend/src/render/streamPlayer.ts.
 */

export type PlaybackState = 'idle' | 'playing' | 'starved' | 'draining' | 'done';

export interface PlaybackConfig {
  /** Baseline visual rate when the buffer is shallow (chars/second). */
  baseCps: number;
  /** Hard ceiling on the visual rate so a burst never snaps into view. */
  maxCps: number;
  /**
   * Buffer depth (pending chars) at which the rate reaches `maxCps`. Between 0
   * and this, the rate scales linearly from `baseCps` to `maxCps`.
   */
  catchUpPending: number;
  /**
   * Extra multiplier applied while draining (finish() was called and we are
   * flushing the remaining buffer before the one-shot final render). Keeps the
   * tail from feeling sluggish at end of turn without becoming an instant dump.
   */
  drainBoost: number;
  /**
   * Milliseconds with no new arrivals AND an empty buffer before the clock
   * reports `starved` (upstream stalled, nothing left to play). The cursor UI
   * turns this into a pulse / ellipsis; content is never fabricated.
   */
  starveAfterMs: number;
}

export const DEFAULT_PLAYBACK_CONFIG: PlaybackConfig = {
  /* Tuned toward chatgpt.com's reading cadence: a shallow buffer still reads
     briskly (~90 cps ≈ 3–4 CJK words per frame-second), and a deep burst
     catches up within ~1–2 s instead of trailing the network by several. */
  baseCps: 90,
  maxCps: 600,
  catchUpPending: 400,
  drainBoost: 2.2,
  starveAfterMs: 320,
};

export interface TickResult {
  /** Characters that should be visible after this tick. */
  playedLen: number;
  /** Characters revealed BY this tick (playedLen delta, >= 0). */
  revealed: number;
  /** Effective chars/second used this tick (0 when nothing to play). */
  cps: number;
  state: PlaybackState;
}

export interface PlaybackClock {
  /** Record the new total arrived length. Monotonic; shrinking is ignored. */
  push(totalLen: number): void;
  /** Advance the visual cursor to `nowMs`. Returns the post-tick snapshot. */
  tick(nowMs: number): TickResult;
  /** finish() was called upstream: flush the remaining buffer, then go done. */
  beginDrain(): void;
  /** True once draining has fully caught up (playedLen === totalLen). */
  isDone(): boolean;
  /** Current visible length without advancing. */
  playedLen(): number;
  /** Current arrived length. */
  totalLen(): number;
  state(): PlaybackState;
}

function clampConfig(config: Partial<PlaybackConfig> | undefined): PlaybackConfig {
  const c = { ...DEFAULT_PLAYBACK_CONFIG, ...(config || {}) };
  c.baseCps = Math.max(1, c.baseCps);
  c.maxCps = Math.max(c.baseCps, c.maxCps);
  c.catchUpPending = Math.max(1, c.catchUpPending);
  c.drainBoost = Math.max(1, c.drainBoost);
  c.starveAfterMs = Math.max(0, c.starveAfterMs);
  return c;
}

/**
 * Adaptive rate: baseCps when the buffer is empty, ramping linearly to maxCps
 * as pending reaches catchUpPending, then held at maxCps. Monotonic in
 * `pending` and always within [baseCps, maxCps] (before the drain boost).
 */
export function computeCps(pending: number, config: PlaybackConfig, draining: boolean): number {
  const p = Math.max(0, pending);
  const ratio = Math.min(1, p / config.catchUpPending);
  let cps = config.baseCps + (config.maxCps - config.baseCps) * ratio;
  if (draining) cps *= config.drainBoost;
  return cps;
}

/**
 * Create a playback clock. `startMs` seeds the internal timestamp so the first
 * tick measures a real delta rather than jumping from 0.
 */
export function createPlaybackClock(
  config?: Partial<PlaybackConfig>,
  startMs = 0,
): PlaybackClock {
  const cfg = clampConfig(config);
  let total = 0;
  let played = 0;
  /** Fractional carry so slow rates over short frames still make progress. */
  let carry = 0;
  let lastTickMs = startMs;
  /** Timestamp of the last time the buffer was non-empty or grew. */
  let lastActiveMs = startMs;
  let draining = false;
  let started = false;

  function pending(): number {
    return total - played;
  }

  function currentState(nowMs: number): PlaybackState {
    if (draining) return played >= total ? 'done' : 'draining';
    if (!started && total === 0) return 'idle';
    if (pending() > 0) return 'playing';
    /* Buffer empty and not draining: playing until the starve window elapses,
       then starved (upstream stalled with nothing left to show). */
    if (nowMs - lastActiveMs >= cfg.starveAfterMs) return 'starved';
    return 'playing';
  }

  return {
    push(totalLen: number): void {
      const next = Math.max(total, Math.floor(totalLen) || 0);
      if (next > total) {
        total = next;
        started = true;
      }
    },
    tick(nowMs: number): TickResult {
      const dtMs = Math.max(0, nowMs - lastTickMs);
      lastTickMs = nowMs;
      const before = played;
      if (pending() > 0) {
        const cps = computeCps(pending(), cfg, draining);
        carry += (cps * dtMs) / 1000;
        const step = Math.floor(carry);
        if (step > 0) {
          played = Math.min(total, played + step);
          carry -= step;
        }
        /* Never carry fractional progress past a fully-consumed buffer. */
        if (played >= total) carry = 0;
        lastActiveMs = nowMs;
      } else {
        /* Nothing buffered: no fractional carry should leak into the next
           burst as an instantaneous jump. */
        carry = 0;
      }
      const state = currentState(nowMs);
      const cps = pending() > 0 ? computeCps(total - before, cfg, draining) : 0;
      return { playedLen: played, revealed: played - before, cps, state };
    },
    beginDrain(): void {
      draining = true;
    },
    isDone(): boolean {
      return draining && played >= total;
    },
    playedLen(): number {
      return played;
    },
    totalLen(): number {
      return total;
    },
    state(): PlaybackState {
      return currentState(lastTickMs);
    },
  };
}
