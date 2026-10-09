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
 * `playedLen` chases `totalLen` at an adaptive characters-per-second rate.
 *
 * P_udp-smoothing — the original cadence derived the rate from buffer DEPTH
 * alone (`computeCps(pending)`). Depth is a lagging, indirect proxy for
 * upstream speed: a provider stall drains the buffer, which pinned the rate
 * at `baseCps`; the next burst refilled it past `catchUpPending` and slammed
 * the rate to `maxCps`. The reader saw exactly the upstream flicker we set out
 * to hide — fast/slow/fast. The clock now also measures the upstream ARRIVAL
 * rate (chars/second observed on push) and low-pass filters it into an EMA.
 * The visual rate tracks that smoothed arrival rate, so the reveal holds a
 * near-constant cadence and drifts instead of snapping. Buffer depth still
 * contributes, as a secondary term that only engages when the buffer actually
 * runs deep (real catch-up), so a burst is still capped.
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
  /**
   * EMA weight applied to each upstream arrival-rate sample. Lower = steadier
   * reveal and slower to track a genuine change of pace; higher = more
   * responsive but noisier. 0 disables the smoothed-arrival term entirely and
   * restores the pure buffer-depth cadence.
   */
  arrivalEmaAlpha: number;
  /** Ignore arrival samples shorter than this, so one frame cannot spike the EMA. */
  arrivalSampleMinMs: number;
  /** Lower/upper clamp on the smoothed arrival rate before it drives the clock. */
  minSmoothedCps: number;
  maxSmoothedCps: number;
}

export const DEFAULT_PLAYBACK_CONFIG: PlaybackConfig = {
  /* P_udp-smoothing — the visual rate now follows the SMOOTHED upstream
     arrival rate rather than raw buffer depth. `baseCps` / `maxCps` bound the
     smoothed rate so a fast provider still reveals at a readable, human
     cadence and a slow one can never crawl below the floor. Buffer depth
     contributes only through `catchUpPending`, as a secondary catch-up term.
     Transport-level clumping (Nagle, proxy buffering) is fixed at the socket
     layer (index.runtime.ts, nginx tcp_nodelay), so the clock only smooths
     real upstream burstiness. */
  baseCps: 140,
  maxCps: 800,
  catchUpPending: 250,
  drainBoost: 2.5,
  starveAfterMs: 280,
  /* Smoothing constants. alpha is the EMA weight for each arrival sample:
     lower = steadier output, slower to track a genuine change of pace.
     windowMs discards samples shorter than one frame so a single-frame
     delta cannot spike the estimate. */
  arrivalEmaAlpha: 0.12,
  arrivalSampleMinMs: 120,
  /* Clamp the smoothed arrival rate into this band before it drives the
     clock, so one pathological sample cannot pin the reveal rate. */
  minSmoothedCps: 24,
  maxSmoothedCps: 1600,
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
  c.arrivalEmaAlpha = Math.min(1, Math.max(0, c.arrivalEmaAlpha));
  c.arrivalSampleMinMs = Math.max(0, c.arrivalSampleMinMs);
  c.minSmoothedCps = Math.max(1, c.minSmoothedCps);
  c.maxSmoothedCps = Math.max(c.minSmoothedCps, c.maxSmoothedCps);
  return c;
}

/**
 * P_udp-smoothing — the reveal rate is now driven primarily by the SMOOTHED
 * upstream arrival rate, with buffer depth kept as a secondary catch-up term.
 *
 * Two terms, both bounded by [baseCps, maxCps]:
 *   - arrival term: when the smoothed arrival rate is known, follow it
 *     directly so the reveal tracks the provider's real pace without its
 *     instantaneous jitter.
 *   - depth term: only pushes toward maxCps once the buffer is genuinely deep,
 *     so a genuine backlog still drains and a burst is still capped.
 *
 * When no arrival sample has been taken yet (smoothed is null) the rate falls
 * back to the historical buffer-depth behaviour, so the very first frame
 * behaves exactly as before.
 */
export function computeCps(
  pending: number,
  config: PlaybackConfig,
  draining: boolean,
  smoothedArrivalCps?: number | null,
): number {
  const p = Math.max(0, pending);
  const depthRatio = Math.min(1, p / config.catchUpPending);
  let cps: number;
  if (smoothedArrivalCps == null) {
    cps = config.baseCps + (config.maxCps - config.baseCps) * depthRatio;
  } else {
    const s = Math.min(config.maxSmoothedCps, Math.max(config.minSmoothedCps, smoothedArrivalCps));
    /* Follow the smoothed arrival rate, then let a deep buffer add catch-up
       headroom on top of it (still clamped, so a burst cannot exceed maxCps). */
    const target = s + (config.maxCps - s) * depthRatio;
    cps = Math.min(config.maxCps, Math.max(config.baseCps, target));
  }
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
  /* P_udp-smoothing — low-pass filter over the upstream ARRIVAL rate.
     `smoothedArrivalCps` stays null until the first valid sample so the
     opening frame keeps the historical buffer-depth cadence. */
  let smoothedArrivalCps: number | null = null;
  /** `total` at the previous arrival sample, for the per-sample char delta. */
  let sampledTotal = 0;

  function pending(): number {
    return total - played;
  }

  /** Feed one arrival sample into the EMA. Ignores sub-threshold intervals. */
  function sampleArrival(nowMs: number): void {
    const dt = nowMs - lastActiveMs;
    const added = total - sampledTotal;
    sampledTotal = total;
    if (added <= 0) return;
    if (dt < cfg.arrivalSampleMinMs) return;
    const instant = (added * 1000) / dt;
    if (!Number.isFinite(instant) || instant <= 0) return;
    smoothedArrivalCps = smoothedArrivalCps == null
      ? instant
      : smoothedArrivalCps + cfg.arrivalEmaAlpha * (instant - smoothedArrivalCps);
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
      /* Sample the upstream rate before advancing, using the elapsed time
         since the previous arrival, so a burst that arrived between frames
         contributes its real cadence rather than a synthetic one. */
      sampleArrival(nowMs);
      const before = played;
      if (pending() > 0) {
        const cps = computeCps(pending(), cfg, draining, smoothedArrivalCps);
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
      const cps = pending() > 0
        ? computeCps(total - before, cfg, draining, smoothedArrivalCps)
        : 0;
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
