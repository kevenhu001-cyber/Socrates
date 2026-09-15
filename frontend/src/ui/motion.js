/*
 * Velocity-based motion planner.
 *
 * Single source of truth for "how long should this animation run?" across
 * every chat surface that needs to move: chat scroll-to-bottom, keyboard
 * inset lift, Tiptap composer height growth, and any future animated
 * layout property.
 *
 * Why a velocity planner instead of fixed CSS transition durations?
 *
 *   - The user perceives motion as "smooth" when each pixel of travel
 *     takes roughly the same amount of time (constant velocity in the
 *     middle, with a small ease-out at the end so the eye doesn't lose
 *     the target). Fixed-duration transitions either feel "snappy" for
 *     small distances and "lazy" for long ones, or vice versa.
 *   - Mobile keyboards vary wildly in height (~250 px on a portrait
 *     phone, ~500 px in landscape, ~340 px on a tablet). A constant
 *     340 ms transition either overshoots on the phone or under-shoots
 *     on the tablet. Velocity normalisation keeps the perceived speed
 *     constant regardless of the keyboard.
 *   - Send-time scroll-to-bottom distances vary from ~50 px (a one-line
 *     answer just below the fold) to ~5 000 px (a long streaming
 *     session). A velocity planner makes the brief case feel responsive
 *     and the long case not draggy.
 *
 * The duration follows a saturating curve:
 *
 *     duration = clamp(distance / VELOCITY, MIN_DUR, MAX_DUR)
 *
 * Below MIN_DISTANCE the motion is snapped (no animation — sub-perceptual
 * distances animated feel "broken" rather than "smooth"). Above
 * MAX_DISTANCE the motion is capped (don't drag the user through a 1.5 s
 * scroll when their finger wants the bottom).
 *
 * The easing curve is the project's standard cubic-bezier(.22,1,.36,1)
 * (a snappy ease-out) — applied to all callers so every motion in the
 * chat surface shares the same character and they stay in lockstep.
 */

/* Tunables. The default velocity, 1 800 px/s, is at the upper end of
 * what the eye reads as "smooth glide" rather than "warp" — research on
 * scrolling perception (Card et al., "Information Visualizations")
 * puts the threshold around 2 000 px/s, so 1 800 leaves a small margin
 * before content starts to blur. Mobile send-to-bottom cases rarely
 * exceed 2 000 px, so the velocity-domain duration stays below MAX_DUR
 * for nearly every realistic input. */
export const MOTION_VELOCITY_PX_PER_S = 1800;
export const MOTION_MIN_DURATION_MS = 90;
export const MOTION_MAX_DURATION_MS = 520;
export const MOTION_SNAP_DISTANCE_PX = 24;
export const MOTION_EASING = 'cubic-bezier(.22,1,.36,1)';

/* Compute a {duration, easing, distance} plan for a motion of the given
 * pixel distance. Pass a non-finite or negative distance to receive a
 * snap plan (duration 0). The function is pure; callers can cache the
 * result for the same input pair, and unit tests cover the curve. */
export function planMotion(distance, opts) {
  if (typeof distance !== 'number' || !isFinite(distance) || distance < 0) {
    return { duration: 0, easing: MOTION_EASING, distance: 0, snap: true };
  }
  const options = opts || {};
  const velocity = options.velocity != null ? options.velocity : MOTION_VELOCITY_PX_PER_S;
  const minDur = options.minDuration != null ? options.minDuration : MOTION_MIN_DURATION_MS;
  const maxDur = options.maxDuration != null ? options.maxDuration : MOTION_MAX_DURATION_MS;
  const snapAt = options.snapDistance != null ? options.snapDistance : MOTION_SNAP_DISTANCE_PX;
  const easing = options.easing || MOTION_EASING;
  if (distance <= snapAt) {
    return { duration: 0, easing, distance, snap: true };
  }
  const rawDur = (distance / velocity) * 1000;
  const duration = Math.max(minDur, Math.min(maxDur, rawDur));
  return { duration, easing, distance, snap: false };
}

/* Honor prefers-reduced-motion by collapsing any motion plan to a snap.
 * Same `globalThis` fallback as scroll.js so the Node test stub works. */
export function prefersReducedMotion() {
  try {
    const hasWindow = typeof window !== 'undefined' && window;
    const host = hasWindow || (typeof globalThis !== 'undefined' ? globalThis : null);
    if (!host || typeof host.matchMedia !== 'function') return false;
    return host.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {
    return false;
  }
}

export function planMotionForUser(distance, opts) {
  const base = planMotion(distance, opts);
  if (prefersReducedMotion()) return { ...base, duration: 0, snap: true };
  return base;
}

/* Interpolate an easing function at progress `t` in [0,1]. The default
 * easing `cubic-bezier(.22,1,.36,1)` is approximated here as an ease-out
 * quint for manual frame loops; Web Animations API consumers should
 * pass the string easing directly to WAAPI rather than calling this. */
export function easeOutQuint(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - Math.pow(1 - t, 5);
}

/* ease-in-out for the keyboard lift (legacy): a gentle start keeps the
 * composer attached to a keyboard that is itself accelerating — a hot
 * ease-out (quint) covers ~40% of the distance in the first 10% of the
 * duration, which reads as a teleport rather than a glide. The curve
 * peaks mid-way and lands soft. */
export function easeInOutQuad(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/* ease-out cubic: kept as a generic primitive — not used by the keyboard
 * lift itself, which uses easeInOutCubic below. */
export function easeOutCubic(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - Math.pow(1 - t, 3);
}

/* ease-in-out cubic for the keyboard lift. The first motion frame
 * (~16ms into the glide) covers ≈0.14% of distance — on a 260px
 * keyboard that's ≈0.4px of inset, which sits inside the chat-input-bar
 * + chat-view resting margins (8 + 6 = 14px) and so lands as zero
 * visible lift. Frame 2 (~33ms) is ≈2.75px visible. The lift stays
 * sub-perceptual for the first 3 frames and then accelerates smoothly,
 * which reads as one continuous start with no first-frame snap. The
 * curve also lands soft at the top, matching the platform IME's own
 * fast-out-slow-in profile. */
export function easeInOutCubic(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}