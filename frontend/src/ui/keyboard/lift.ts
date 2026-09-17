/**
 * ui/keyboard/lift.ts — the keyboard lift animator.
 *
 * One motion law for every geometry source: the measured keyboard travel
 * is only ever a *target*; a critically-damped spring (smoothDampStep,
 * ui/motion.js) integrates the painted value once per frame. Position and
 * velocity are continuous under every retarget — per-frame streams,
 * skipped samples, and mid-flight reversals all share the same motion —
 * so the composer never teleports and never restarts a tween mid-air.
 *
 * Two regimes share the spring:
 *
 *   - stream: while progressive geometry samples keep arriving, the
 *     measured travel IS the keyboard's live leading edge. The chase must
 *     track it within a couple of frames or the composer spends the lift
 *     below the keyboard's top edge and reads as "teleported" at the end.
 *   - discrete: a lone jump report (first sample after silence, a
 *     direction flip, or a platform that emits only the final geometry)
 *     gets the looser ~100ms arc, which lands a ~300px keyboard inside
 *     the platform's own ~220–300ms IME window as a visible ease.
 *
 * prefers-reduced-motion replaces the spring with a fixed 80ms ease-out
 * ramp — short enough to read as a state change rather than motion, long
 * enough that the lift does not snap in a single frame.
 */

import { smoothDampStep } from '../motion.js';

/* Chase dynamics. The previous looser values (~0.24s) landed a 300px
 * keyboard ~800ms after focus while the platform IME animation finishes
 * in 220–300ms, so the composer visibly trailed. These constants keep the
 * lift in lockstep with the platform window. */
export const LIFT_SMOOTH_S = 0.11;
export const LIFT_STREAM_S = 0.05;

/* Arrival envelope: do not let the spring consume the whole remaining gap
 * in one frame. Tracking stays tight through the middle of the lift, then
 * the last few frames decelerate continuously instead of being clamped to
 * a dead stop with residual velocity. */
export const LIFT_ARRIVAL_S = 0.05;
export const LIFT_ARRIVAL_STREAM_S = 0.035;

/* A retarget that arrives inside this window in the same direction as the
 * previous one is stream evidence — the platform is reporting the
 * keyboard's leading edge frame by frame, so the chase runs hotter. */
export const STREAM_SAMPLE_MS = 120;

/* Settle hysteresis: close enough to the target that the difference is
 * sub-pixel and the remaining velocity could not move it visibly. */
const SETTLE_GAP_PX = 0.5;
const SETTLE_VELOCITY_PX_S = 15;

const REDUCED_RAMP_S = 0.08;

export interface LiftStep {
  /** Painted value after this step — feed to projectTravel(). */
  value: number;
  /** True once the value rests at the target (settled exactly). */
  settled: boolean;
}

export class LiftAnimator {
  /** Current interpolated position in screen-space px. */
  value = 0;
  /** Latest measured target in screen-space px. */
  target = 0;
  /** Spring velocity carried between frames. */
  velocity = 0;

  private lastRetargetAt = 0;
  private lastDirection = 0;
  private streaming = false;
  private lastStepAt = 0;
  private reducedFrom = 0;
  private reducedAt = 0;
  private reduced = false;

  /** Point the chase at a new measured target. No-op when unchanged. */
  retarget(nextTarget: number, now: number, reducedMotion: boolean): void {
    const next = Number.isFinite(nextTarget) ? Math.max(0, nextTarget) : 0;
    if (next === this.target) {
      /* A same-target retarget that flips reduced-motion on mid-flight
         still needs a fresh ramp origin, or the stale eased fraction
         would snap the value to the target. */
      if (reducedMotion && !this.reduced) {
        this.reducedFrom = this.value;
        this.reducedAt = now;
      }
      this.reduced = reducedMotion;
      return;
    }
    const direction = Math.sign(next - this.target);
    const continued = direction !== 0
      && direction === this.lastDirection
      && this.lastRetargetAt > 0
      && now - this.lastRetargetAt <= STREAM_SAMPLE_MS;
    this.streaming = continued;
    if (direction !== 0) this.lastDirection = direction;
    this.target = next;
    this.lastRetargetAt = now;
    this.reduced = reducedMotion;
    if (reducedMotion) {
      /* A fresh 80ms ramp starts from wherever the value currently is. */
      this.reducedFrom = this.value;
      this.reducedAt = now;
    }
  }

  /** Advance the motion one frame. `now` is performance.now() ms. */
  step(now: number): LiftStep {
    const dt = this.lastStepAt > 0
      ? Math.min(0.064, Math.max(0.001, (now - this.lastStepAt) / 1000))
      : 1 / 60;
    this.lastStepAt = now;

    if (this.reduced) {
      const t = Math.min(1, Math.max(0, (now - this.reducedAt) / 1000) / REDUCED_RAMP_S);
      const eased = 1 - (1 - t) * (1 - t); /* easeOutQuad */
      this.value = this.reducedFrom + (this.target - this.reducedFrom) * eased;
      if (t >= 1) return this.arrive();
      return { value: this.value, settled: false };
    }

    /* While samples keep arriving the target is the keyboard's leading
     * edge — chase it tightly. Once the stream goes stale the same target
     * is final and gets the looser landing arc. */
    const streamAlive = this.streaming
      && this.lastRetargetAt > 0
      && now - this.lastRetargetAt <= STREAM_SAMPLE_MS;
    const smoothTime = streamAlive ? LIFT_STREAM_S : LIFT_SMOOTH_S;

    const next = smoothDampStep(this.value, this.target, this.velocity, smoothTime, dt);
    this.velocity = next.velocity;

    /* Arrival cap: preserve tracking through the middle of the lift, then
     * bound the last frames' consumption of the gap for a continuous stop. */
    const arrivalS = streamAlive ? LIFT_ARRIVAL_STREAM_S : LIFT_ARRIVAL_S;
    const gap = this.target - this.value;
    const stepDelta = next.value - this.value;
    let landed = next.value;
    if (gap !== 0 && stepDelta !== 0 && Math.sign(stepDelta) === Math.sign(gap)) {
      const maxFraction = 1 - Math.exp(-dt / arrivalS);
      if (Math.abs(stepDelta) > Math.abs(gap) * maxFraction) {
        landed = this.value + gap * maxFraction;
      }
    }
    this.value = landed;

    if (Math.abs(this.target - this.value) < SETTLE_GAP_PX && Math.abs(this.velocity) < SETTLE_VELOCITY_PX_S) {
      return this.arrive();
    }
    return { value: this.value, settled: false };
  }

  /** Snap the painted value to the target — no visible step remains. */
  private arrive(): LiftStep {
    this.value = this.target;
    this.velocity = 0;
    return { value: this.value, settled: true };
  }

  /** Stop integrating immediately (teardown). */
  reset(): void {
    this.value = 0;
    this.target = 0;
    this.velocity = 0;
    this.streaming = false;
    this.lastRetargetAt = 0;
    this.lastStepAt = 0;
    this.lastDirection = 0;
    this.reduced = false;
  }
}
