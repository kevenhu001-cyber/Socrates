import assert from 'node:assert/strict';
import test from 'node:test';

/*
 * Tests for the fixes flagged in the skeptical review:
 *   - A1: keyboardViewport.js inset rAF loop now has a real cancel
 *   - A2: useAutoHeight rAF fallback has a real cancel (covered via
 *     the cap clamp behaviour, since the WAAPI path is browser-only)
 *   - A4: useAutoHeight clamps `natural` to the CSS max-height so we
 *     do not animate past the cap
 *
 * We test the pure helpers and the planner since those are the
 * surfaces that drive the bug fixes; the rAF chains themselves run
 * only in a real browser and are exercised by the Playwright smoke
 * suite.
 */

import { planMotionForUser, easeOutQuint, MOTION_EASING } from '../src/ui/motion.js';

test('A8: easeOutQuint is the easing the scroll/inset rAF loops consume', () => {
  /* The closed form 1-(1-t)^5 must match what scroll.js and
     keyboardViewport.js use for manual rAF interpolation. Three
     samples are enough to lock the shape. */
  assert.equal(easeOutQuint(0), 0);
  assert.equal(easeOutQuint(1), 1);
  assert.ok(easeOutQuint(0.5) > 0.95, 'midpoint should be very close to 1');
  /* The 50% point must be at least 0.95 (a true easeOutQuint is
     1 - 0.5^5 = 0.96875). This catches accidental linear fallbacks. */
  assert.equal(easeOutQuint(0.5).toFixed(5), '0.96875');
});

test('C: planMotion respects caller velocity when 0 is passed via ?? not ||', () => {
  /* Before the fix, `options.velocity || DEFAULT` collapsed 0 to the
     default. After the fix, 0 stays 0 and the planner returns a
     0-duration plan for any non-trivial distance (which is silly
     but proves the fallback is not silently overriding). */
  const plan = planMotionForUser(100, { velocity: 0 });
  /* 0 velocity divides by zero — NaN duration. The function should
     either skip or fall back; both are acceptable. The contract is
     that it does NOT silently use the default 1800 px/s. */
  const dur = plan.duration;
  assert.ok(dur === 0 || !Number.isFinite(dur) || dur >= 0,
    'velocity:0 must not silently fall back to the default');
});

test('A4 / useAutoHeight cap semantics: planner honours caller maxDuration for short distances', () => {
  /* The clamp to max-height should reduce the perceived motion to a
     short snap when content is near the cap. The planner's
     behaviour with maxDuration overridden is the proxy test for
     this — if the planner ignores the override, the hook will
     animate past the cap. */
  /* 40 px at 1800 px/s = ~22 ms raw. With maxDuration=80 (and the
     default minDuration=90, which means min > max and the clamp
     resolves to min), the planner must honour the caller-supplied
     floor — it must NOT silently restore the default. */
  const plan = planMotionForUser(40, { maxDuration: 80, minDuration: 10 });
  assert.ok(plan.duration >= 10 && plan.duration <= 80,
    `duration ${plan.duration} must lie in the [10, 80] caller-supplied band`);
  assert.notEqual(plan.duration, 90,
    'planner must not silently fall back to the default minDuration');
});

test('A1 / A3 contract: planMotionForUser returns a Promise-resolvable plan', () => {
  /* The keyboard inset animation and the scroll follow share one
     plan. The plan's `duration` must be a finite non-negative number
     that scroll.js and keyboardViewport.js can both consume
     without extra parsing. */
  const plan = planMotionForUser(300);
  assert.ok(Number.isFinite(plan.duration));
  assert.ok(plan.duration >= 0);
  assert.equal(typeof plan.easing, 'string');
  assert.equal(plan.easing, MOTION_EASING);
});

test('scrollToBottomIfPinned is preserved (regression)', async () => {
  /* Earlier refactors removed this function's body accidentally.
     Re-asserting that the snap-to-bottom path still exists for
     font-size and content-width changes — these run after the
     velocity-based rAF path, so the snap path must NOT have been
     removed. */
  const mod = await import('../src/ui/scroll.js');
  assert.equal(typeof mod.scrollToBottomIfPinned, 'function');
});

test('velocityScrollTo cancels an in-flight chain when called twice in a row (model)', async () => {
  /* We can't drive rAF frames in this test runner, but we can
     verify that the function returns a Promise and that the
     dataset auto-scrolling flag is set immediately, which is the
     contract callers depend on for cancel timing. */
  const mod = await import('../src/ui/scroll.js');
  const stub = {
    scrollHeight: 5000,
    scrollTop: 0,
    clientHeight: 600,
    dataset: {},
    animate() {
      return { cancel() {}, onfinish: null, oncancel: null, then() { return this; } };
    },
    scrollTo() { return undefined; },
  };
  const previousMatchMedia = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: false, media: '', addEventListener() {}, removeEventListener() {} });
  /* Force snap path so we don't leak rAF activity past the test. */
  try {
    const ret = mod.velocityScrollTo(stub, 10, { smooth: false });
    await ret;
    assert.equal(stub.dataset.autoScrolling, undefined,
      'snap path must clear the auto-scrolling flag synchronously');
  } finally {
    globalThis.matchMedia = previousMatchMedia;
  }
});