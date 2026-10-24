/**
 * spring.test.mjs — the shared spring solver's own guarantees.
 *
 * The solver is the one piece of motion logic that the Web app, the
 * Universal app and the tests all share, so its properties are pinned here
 * rather than in any single surface:
 *
 *   1. the two named springs sit on the documented side of critical damping,
 *      so "the drag does not wobble" and "the reaction pops" are properties
 *      of the configuration rather than of a tuning accident;
 *   2. the analytic solution does not drift — a curve evaluated once and a
 *      curve retargeted every frame agree to the last bit;
 *   3. retargeting mid-flight keeps the value and the velocity continuous,
 *      so a moving target never reads as a jump;
 *   4. a velocity kick produces exactly the overshoot it was asked for.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SPRING_PRESETS,
  createSpring,
  sampleSpring,
  springDampingRatio,
  springInitialVelocity,
  springNaturalFrequency,
  springOvershootRatio,
  springSettleTime,
} from '../../packages/core/src/motion/spring.ts';

const DRAG = SPRING_PRESETS.dragRelease;
const LIKE = SPRING_PRESETS.like;

test('the drag spring is overdamped and the reaction spring is not', () => {
  /* 1200 / 80 → ζ = 80 / (2·√1200) = 1.155: past critical, so the panel
     converges without a wobble. */
  assert.equal(DRAG.stiffness, 1200);
  assert.equal(DRAG.damping, 80);
  assert.ok(springDampingRatio(DRAG) > 1, 'the drag spring must not overshoot');
  assert.ok(Math.abs(springNaturalFrequency(DRAG) - Math.sqrt(1200)) < 1e-9);

  /* 380 / 18 → ζ = 18 / (2·√380) = 0.462: underdamped, one visible pop. */
  assert.equal(LIKE.stiffness, 380);
  assert.equal(LIKE.damping, 18);
  assert.ok(springDampingRatio(LIKE) < 1, 'the reaction spring must overshoot');
  assert.ok(Math.abs(springNaturalFrequency(LIKE) - Math.sqrt(380)) < 1e-9);
});

test('the documented overshoot is a property of the configuration', () => {
  /* The step-response overshoot of ζ = 0.462 is 19.5%. */
  assert.ok(Math.abs(springOvershootRatio(LIKE) - 0.1949) < 0.001);
  /* An overdamped spring has none. */
  assert.equal(springOvershootRatio(DRAG), 0);
});

test('an overdamped spring approaches its target without ever passing it', () => {
  const spring = createSpring(DRAG, 0, { now: 0 });
  spring.setTarget(1, 0);
  let highest = -Infinity;
  for (let t = 0; t <= 600; t += 1) highest = Math.max(highest, spring.valueAt(t));
  assert.ok(highest <= 1, `the drag spring overshot to ${highest}`);
  /* …and it gets there. */
  assert.ok(spring.valueAt(400) > 0.999);
});

test('a velocity kick lands on the overshoot it was asked for', () => {
  /* The peak of a velocity release is NOT at π/2 — it sits where
   * tan(ω_d·t) = ω_d / ζω₀. Getting that wrong makes a 19% pop land at
   * 22%, which is exactly the kind of drift the solver exists to prevent. */
  const velocity = springInitialVelocity(LIKE, 0.195);
  const spring = createSpring(LIKE, 0, { now: 0 });
  spring.setTarget(0, 0);
  spring.setVelocity(velocity, 0);
  let peak = 0;
  for (let t = 0; t <= 1000; t += 1) peak = Math.max(peak, spring.valueAt(t));
  assert.ok(Math.abs(peak - 0.195) < 0.002, `the kick peaked at ${peak}, not 0.195`);
});

test('the analytic solution does not drift', () => {
  /* One evaluation at the end … */
  const single = createSpring(DRAG, 0, { now: 0 });
  single.setTarget(1, 0);
  /* … and the same curve retargeted every frame, the way a live drag
   * drives it, have to agree to the last bit. An integrator would not. */
  const stepped = createSpring(DRAG, 0, { now: 0 });
  stepped.setTarget(1, 0);
  for (let t = 0; t <= 200; t += 16) stepped.setTarget(1, t);
  assert.equal(single.valueAt(200), stepped.valueAt(200));
});

test('retargeting mid-flight keeps the value and the velocity continuous', () => {
  const spring = createSpring(DRAG, 0, { now: 0 });
  spring.setTarget(1, 0);
  const value = spring.valueAt(50);
  const velocity = spring.velocityAt(50);
  spring.setTarget(0.5, 50);
  assert.equal(spring.valueAt(50), value);
  assert.equal(spring.velocityAt(50), velocity);
});

test('the spring reports rest once it has come to rest', () => {
  const spring = createSpring(DRAG, 0, { now: 0, restDelta: 0.01 });
  spring.setTarget(1, 0);
  assert.equal(spring.settled(0), false);
  assert.ok(spring.settled(400), 'the drag spring must settle well inside 400ms');
  assert.ok(Math.abs(spring.valueAt(400) - 1) < 0.01);
});

test('the settle times match the documented behaviour', () => {
  /* The drag settles in about a quarter of a second: the motion stops, it
   * does not wobble. */
  const drag = springSettleTime(DRAG);
  assert.ok(drag > 180 && drag < 320, `the drag settles in ${drag}ms`);
  /* The reaction pops for noticeably longer, because it is still ringing
   * down when the eye has already read it. */
  const like = springSettleTime(LIKE);
  assert.ok(like > drag, 'the reaction spring must outlive the drag spring');
});

test('the sampled curve starts at the start and ends on the target', () => {
  const frames = sampleSpring(DRAG, { from: 0, to: 1, duration: 400, samples: 32 });
  assert.equal(frames.length, 32);
  assert.equal(frames[0].offset, 0);
  assert.equal(frames[0].value, 0);
  assert.equal(frames[frames.length - 1].offset, 1);
  /* The curve approaches the target; the last sample is the closest one. */
  assert.ok(frames[frames.length - 1].value > 0.99);
  assert.ok(frames[frames.length - 1].value <= 1);
});
