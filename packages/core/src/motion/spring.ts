/**
 * motion/spring — the shared, platform-neutral spring solver.
 *
 * A spring is the one motion primitive that has to feel the same everywhere:
 * the Web sidebar drag, the Web like button and the React Native surfaces
 * must not each grow their own easing approximation of "springy".
 *
 * The solver is **analytic**, not integrated frame by frame. Given the
 * configuration, the current value and the current velocity, the position at
 * any future timestamp follows directly from the damped harmonic oscillator
 *
 *     m·x'' + c·x' + k·x = 0        (x = displacement from the target)
 *
 * Three consequences matter:
 *
 *   - **no drift.** An integrator accumulates error every frame; a dropped
 *     frame in the Web (or a skipped vsync in RN) permanently shifts the
 *     curve. The analytic solution is a pure function of the timestamp, so
 *     evaluating it late gives exactly the value the curve had at that
 *     moment;
 *   - **no fixed step.** The caller drives it with whatever clock it has
 *     (rAF timestamps, a Reanimated frame callback, a test's fake clock);
 *   - **one source of truth.** The damping ratio and the natural frequency
 *     are derived from the same two numbers the designer picks
 *     (`stiffness` / `damping`), so "overdamped, no overshoot" is a property
 *     of the configuration rather than a tuning accident.
 *
 * This module is deliberately free of rAF, DOM, timers and React.
 */

/** The two knobs a designer picks. `mass` defaults to 1. */
export interface SpringConfig {
  /** Spring constant. Higher = faster. */
  stiffness: number;
  /** Viscous damping. Lower = bouncier. */
  damping: number;
  /** Inertia. Defaults to 1. */
  mass?: number;
}

/** Thresholds that decide when a spring is allowed to call itself finished. */
export interface SpringOptions {
  /**
   * Remaining displacement (in the animated unit) below which the spring
   * counts as at rest. Defaults to 0.01.
   */
  restDelta?: number;
  /**
   * Remaining speed (in the animated unit per second) below which the spring
   * counts as at rest. Defaults to `restDelta × ω₀`, so the two thresholds
   * scale together with the spring's own characteristic time.
   */
  restVelocity?: number;
  /**
   * The timestamp the spring is anchored at, in milliseconds. Defaults to 0.
   *
   * The solver is a pure function of the timestamp, so the anchor has to
   * share a clock with the caller: pass the same `performance.now()` the
   * animation frames use, not a fresh `Date.now()`.
   */
  now?: number;
}

export interface Spring {
  /** Move the target. The current value and velocity stay continuous. */
  setTarget(value: number, now?: number): void;
  /**
   * Inject a velocity without moving the target — a "kick". This is how the
   * reaction interactions (a like button that pops in place) are modelled:
   * there is no travel distance, only an initial push.
   */
  setVelocity(velocity: number, now?: number): void;
  /** The analytic value at `now` (milliseconds). */
  valueAt(now: number): number;
  /** The analytic velocity at `now` (milliseconds), in units per second. */
  velocityAt(now: number): number;
  /** Whether the spring has come to rest at `now`. */
  settled(now: number): boolean;
  /** The current target. */
  readonly target: number;
  /** The last explicitly observed value. */
  readonly position: number;
}

/** A sampled point of a spring curve. */
export interface SpringSample {
  /** 0…1 along the animation. */
  offset: number;
  /** The animated value at that offset. */
  value: number;
}

const DEFAULT_MASS = 1;
const DEFAULT_REST_DELTA = 0.01;
/** Below this the critically damped branch is used for both sides. */
const CRITICAL_EPSILON = 1e-6;

interface Dynamics {
  /** Undamped natural frequency, rad/s. */
  omega0: number;
  /** Damping ratio. < 1 underdamped, 1 critical, > 1 overdamped. */
  zeta: number;
}

function dynamics(config: SpringConfig): Dynamics {
  const mass = config.mass ?? DEFAULT_MASS;
  const omega0 = Math.sqrt(config.stiffness / mass);
  const zeta = config.damping / (2 * Math.sqrt(config.stiffness * mass));
  return { omega0, zeta };
}

/**
 * Displacement and velocity of the oscillator `x'' + 2ζω₀x' + ω₀²x = 0`
 * at `t` seconds after the anchor, given `x0` / `v0` at the anchor.
 */
function solve(
  { omega0, zeta }: Dynamics,
  x0: number,
  v0: number,
  t: number,
): { x: number; v: number } {
  if (t <= 0) return { x: x0, v: v0 };

  if (zeta < 1 - CRITICAL_EPSILON) {
    /* Underdamped — oscillates around the target. */
    const wd = omega0 * Math.sqrt(1 - zeta * zeta);
    const decay = Math.exp(-zeta * omega0 * t);
    const cos = Math.cos(wd * t);
    const sin = Math.sin(wd * t);
    const b = (v0 + zeta * omega0 * x0) / wd;
    return {
      x: decay * (x0 * cos + b * sin),
      v: decay * (b * wd * cos - (zeta * omega0 * x0 + zeta * omega0 * b * wd) * sin),
    };
  }

  if (zeta > 1 + CRITICAL_EPSILON) {
    /* Overdamped — two real roots, no oscillation. */
    const root = omega0 * Math.sqrt(zeta * zeta - 1);
    const r1 = -zeta * omega0 + root;
    const r2 = -zeta * omega0 - root;
    const a = (v0 - r2 * x0) / (r1 - r2);
    const b = x0 - a;
    const e1 = Math.exp(r1 * t);
    const e2 = Math.exp(r2 * t);
    return { x: a * e1 + b * e2, v: a * r1 * e1 + b * r2 * e2 };
  }

  /* Critically damped — fastest approach without overshoot. */
  const decay = Math.exp(-omega0 * t);
  const b = v0 + omega0 * x0;
  return {
    x: decay * (x0 + b * t),
    v: decay * (b - omega0 * (x0 + b * t)),
  };
}

class AnalyticSpring implements Spring {
  private readonly dyn: Dynamics;
  private readonly restDelta: number;
  private readonly restVelocity: number;
  private currentTarget: number;
  private currentPosition: number;
  private currentVelocity: number;
  private anchorTime: number;

  constructor(config: SpringConfig, initial = 0, options: SpringOptions = {}) {
    this.dyn = dynamics(config);
    this.restDelta = options.restDelta ?? DEFAULT_REST_DELTA;
    this.restVelocity = options.restVelocity ?? this.restDelta * this.dyn.omega0;
    this.currentTarget = initial;
    this.currentPosition = initial;
    this.currentVelocity = 0;
    this.anchorTime = options.now ?? 0;
  }

  get target(): number {
    return this.currentTarget;
  }

  get position(): number {
    return this.currentPosition;
  }

  /**
   * Re-anchor on the current curve: the value and the velocity are carried
   * across the target change, because a spring that snapped its velocity
   * would read as a discontinuity.
   */
  private reanchor(now: number): void {
    const elapsed = (now - this.anchorTime) / 1000;
    const { x, v } = solve(this.dyn, this.currentPosition - this.currentTarget, this.currentVelocity, elapsed);
    this.currentPosition = this.currentTarget + x;
    this.currentVelocity = v;
    this.anchorTime = now;
  }

  setTarget(value: number, now: number = this.anchorTime): void {
    this.reanchor(now);
    this.currentTarget = value;
  }

  setVelocity(velocity: number, now: number = this.anchorTime): void {
    this.reanchor(now);
    /* The caller is replacing the velocity, not adding to it. */
    this.currentVelocity = velocity;
  }

  valueAt(now: number): number {
    const elapsed = (now - this.anchorTime) / 1000;
    if (elapsed <= 0) return this.currentPosition;
    const { x } = solve(this.dyn, this.currentPosition - this.currentTarget, this.currentVelocity, elapsed);
    return this.currentTarget + x;
  }

  velocityAt(now: number): number {
    const elapsed = (now - this.anchorTime) / 1000;
    if (elapsed <= 0) return this.currentVelocity;
    return solve(this.dyn, this.currentPosition - this.currentTarget, this.currentVelocity, elapsed).v;
  }

  settled(now: number): boolean {
    const elapsed = (now - this.anchorTime) / 1000;
    /* `solve` returns the anchor state for a non-positive elapsed time, so
     * the displacement is checked here too: a spring that has just been
     * retargeted is standing still but it is nowhere near its target, and
     * that is not the same thing as being at rest. */
    const { x, v } = solve(this.dyn, this.currentPosition - this.currentTarget, this.currentVelocity, elapsed);
    return Math.abs(x) <= this.restDelta && Math.abs(v) <= this.restVelocity;
  }
}

/** Create a spring that starts at `initial` and rests there. */
export function createSpring(config: SpringConfig, initial = 0, options?: SpringOptions): Spring {
  return new AnalyticSpring(config, initial, options);
}

/**
 * The two named springs the product uses.
 *
 * `dragRelease` is deliberately **overdamped** (ζ = 1.16): the panel settles
 * without any bounce, which is what a release should feel like — the motion
 * stops, it does not wobble.
 *
 * `like` is **underdamped** (ζ = 0.46): a single visible pop of roughly 19%
 * that settles back, which is what a reaction should feel like.
 */
export const SPRING_PRESETS = {
  dragRelease: { stiffness: 1200, damping: 80 },
  like: { stiffness: 380, damping: 18 },
} as const;

/** The damping ratio of a configuration. < 1 bouncy, 1 critical, > 1 dead. */
export function springDampingRatio(config: SpringConfig): number {
  return dynamics(config).zeta;
}

/** The undamped natural frequency of a configuration, in rad/s. */
export function springNaturalFrequency(config: SpringConfig): number {
  return dynamics(config).omega0;
}

/**
 * The peak overshoot of a configuration, as a fraction of the travel
 * distance. `0` for critically damped and overdamped springs.
 */
export function springOvershootRatio(config: SpringConfig): number {
  const { zeta } = dynamics(config);
  if (zeta >= 1) return 0;
  return Math.exp((-zeta * Math.PI) / Math.sqrt(1 - zeta * zeta));
}

/**
 * The initial velocity (units per second) that produces a given overshoot
 * when a spring starts at its target. Used by the "pop" interactions, where
 * the spring has no travel distance but is given a kick instead.
 *
 * A velocity release displaces as `x(t) = (v₀/ω_d)·e^(-ζω₀t)·sin(ω_d t)`,
 * whose maximum sits at `ω_d·t* = atan(ω_d / ζω₀)` — *not* at the `π/2` the
 * step response uses. Using the wrong peak time is what makes a requested
 * 19% pop land at 22%.
 */
export function springInitialVelocity(config: SpringConfig, overshoot: number): number {
  const { omega0, zeta } = dynamics(config);
  if (zeta >= 1 || overshoot <= 0) return 0;
  const wd = omega0 * Math.sqrt(1 - zeta * zeta);
  const theta = Math.atan(wd / (zeta * omega0));
  return (overshoot * wd * Math.exp((zeta * omega0 * theta) / wd)) / Math.sin(theta);
}

/**
 * How long the spring needs to come to rest, in milliseconds.
 *
 * Measured by walking the analytic solution, so it is the real settle time
 * for the configuration rather than an estimate from the envelope. The
 * excursion is `amplitude` units — the travel for a move, the peak of the
 * pop for a kick.
 */
export function springSettleTime(
  config: SpringConfig,
  restDelta = DEFAULT_REST_DELTA,
  amplitude = 1,
): number {
  const spring = createSpring(config, 0, { restDelta });
  spring.setTarget(amplitude, 0);
  const step = 8;
  for (let t = step; t <= 20_000; t += step) {
    if (spring.settled(t)) return t;
  }
  return 20_000;
}

/**
 * Sample a spring curve for a platform that can only play keyframes.
 *
 * Web Animations cannot evaluate a spring, so the Web adapter plays a
 * densely sampled curve with linear interpolation between the samples. The
 * curve itself still comes from the shared analytic solution.
 */
export function sampleSpring(
  config: SpringConfig,
  options: {
    from?: number;
    to?: number;
    /** Initial velocity in units per second. */
    velocity?: number;
    /** Length of the sampled curve, in milliseconds. */
    duration: number;
    samples?: number;
    restDelta?: number;
  },
): SpringSample[] {
  const from = options.from ?? 0;
  const to = options.to ?? 0;
  const duration = Math.max(0, options.duration);
  const samples = Math.max(2, options.samples ?? 48);
  const spring = createSpring(config, from, { restDelta: options.restDelta });
  spring.setTarget(to, 0);
  if (options.velocity) spring.setVelocity(options.velocity, 0);
  const frames: SpringSample[] = [];
  for (let i = 0; i < samples; i += 1) {
    const offset = i / (samples - 1);
    frames.push({ offset, value: spring.valueAt(offset * duration) });
  }
  return frames;
}
