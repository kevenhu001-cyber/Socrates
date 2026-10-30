/*
 * ui/motion/spring.ts — the Web adapter for the shared spring solver.
 *
 * The Web Animations API cannot evaluate a spring: it plays the keyframes it
 * is handed. So the adapter samples the shared analytic curve and gives the
 * browser a densely sampled set of keyframes with linear interpolation
 * between them. The curve itself still comes from `packages/core`, so the Web
 * app and the Universal app play the same motion from the same two numbers.
 *
 * Three rules the adapter keeps:
 *
 *   - **reduced motion means no motion.** The animation is skipped, not
 *     shortened: a spring that is cut short still moves, and a reader who
 *     asked for less motion gets none.
 *   - **the length is measured on the curve.** A spring approaches its
 *     target asymptotically, so the duration is found by walking the sampled
 *     curve rather than estimated from an envelope.
 *   - **the last keyframe is the target.** The final sample is snapped onto
 *     it. A keyframe that stopped a hair short would leave the element
 *     visibly off once the animation released it.
 */

import { sampleSpring, springInitialVelocity } from '@socrates/core/motion/spring';
import type { SpringConfig } from '@socrates/core/motion/spring';
import { prefersReducedMotion } from '../motion.ts';

export interface SpringAnimationOptions {
  /** The two numbers the designer picks. */
  config: SpringConfig;
  /** The value the curve starts at. */
  from: number;
  /** The value the curve settles at. */
  to: number;
  /** Initial velocity, in units per second. */
  velocity?: number;
  /**
   * The peak overshoot to produce, as a fraction of one unit. Mutually
   * redundant with `velocity`; used for the "pop" interactions, where the
   * spring has no travel distance and is kicked instead.
   */
  overshoot?: number;
  /** The CSS property to animate. */
  property: string;
  /** How a sampled value becomes a keyframe value. */
  format?: (value: number) => string;
  /** Rest threshold, in the animated unit. */
  restDelta?: number;
  /** The longest the animation may run, in milliseconds. */
  maxDuration?: number;
  /** The shortest the animation may run, in milliseconds. */
  minDuration?: number;
}

/** How far ahead the curve is sampled to find its rest point. */
const HORIZON_MS = 900;
/** The resolution of that search. */
const PROBE_SAMPLES = 180;
/** The resolution of the keyframes the browser actually plays. */
const KEYFRAME_SAMPLES = 48;

/**
 * Play a spring on a DOM property.
 *
 * Returns the running `Animation`, or `null` when the motion was skipped
 * (reduced motion) or the element cannot animate.
 */
export function animateSpring(
  element: Element,
  options: SpringAnimationOptions,
): Animation | null {
  const {
    config,
    from,
    to,
    property,
    velocity = options.overshoot ? springInitialVelocity(config, options.overshoot) : 0,
    format = (value: number) => String(value),
    restDelta = 0.01,
    maxDuration = 800,
    minDuration = 80,
  } = options;

  /* Reduced motion: no animation at all. The element keeps its own value,
   * which for every caller is the value the curve would have settled on. */
  if (prefersReducedMotion()) return null;
  if (typeof element.animate !== 'function') return null;

  /* Where does the curve come to rest? The spring only approaches its
   * target asymptotically, so the length is read off the curve itself. */
  const probe = sampleSpring(config, {
    from,
    to,
    velocity,
    duration: HORIZON_MS,
    samples: PROBE_SAMPLES,
    restDelta,
  });
  let lastMoving = 0;
  for (let i = 0; i < probe.length; i += 1) {
    if (Math.abs(probe[i].value - to) > restDelta) lastMoving = i;
  }
  const duration = Math.round(Math.min(
    maxDuration,
    Math.max(minDuration, (lastMoving / (PROBE_SAMPLES - 1)) * HORIZON_MS),
  ));

  const frames = sampleSpring(config, {
    from,
    to,
    velocity,
    duration,
    samples: KEYFRAME_SAMPLES,
    restDelta,
  });
  const keyframes: Keyframe[] = frames.map((frame) => {
    const keyframe: Keyframe = { offset: frame.offset };
    keyframe[property] = format(frame.value);
    return keyframe;
  });
  /* The curve approaches the target; the animation has to land on it. */
  const last: Keyframe = { offset: 1 };
  last[property] = format(to);
  keyframes[keyframes.length - 1] = last;

  return element.animate(keyframes, { duration, easing: 'linear', fill: 'none' });
}

/**
 * The rendered `scale` of an element, as a number.
 *
 * `scale: none` computes to "none"; the identity is 1. Reading it while an
 * animation is running gives the animated value, which is how a repeated
 * pop can start from wherever the icon currently is.
 */
export function readScale(element: Element): number {
  const value = getComputedStyle(element).scale;
  if (!value || value === 'none') return 1;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 1;
}
